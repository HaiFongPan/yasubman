import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { backfillLedger, initDb } from './db';
import { refreshRates } from './fx';
import { createMcpServer } from './mcp';
import { startBillingScheduler } from './billing';
import { api, errorHandler } from './routes';

initDb();

// 先同步汇率再补历史流水，避免用内置参考汇率记账
try {
  await refreshRates();
} catch (error) {
  console.error('[fx]', error);
}
try {
  backfillLedger();
} catch (error) {
  console.error('[db] ledger backfill failed', error);
}

if ((process.env.FX_PROVIDER ?? 'auto').toLowerCase() !== 'off') {
  setInterval(() => {
    void refreshRates().catch(() => {});
  }, 6 * 60 * 60 * 1000).unref();
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

// 可选的 HTTP 基础认证；未设置环境变量时完全关闭（默认依赖 Tailscale 网络隔离）
const authUser = process.env.APP_USER;
const authPassword = process.env.APP_PASSWORD;

function safeEqual(input: string, expected: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

if (authUser && authPassword) {
  app.use((req, res, next) => {
    if (req.path === '/api/health') {
      next();
      return;
    }
    const header = req.headers.authorization ?? '';
    const [scheme, encoded] = header.split(' ');
    if (scheme === 'Basic' && encoded) {
      const [user, password] = Buffer.from(encoded, 'base64').toString('utf8').split(':');
      if (safeEqual(user ?? '', authUser) && safeEqual(password ?? '', authPassword)) {
        next();
        return;
      }
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="Ledger", charset="UTF-8"');
    res.status(401).send('需要登录');
  });
}

// 收据导出图片时用同源代理，避免 mzstatic 图片的跨域限制
const iconCache = new Map<string, { body: Buffer; type: string; at: number }>();

app.get('/api/icon', async (req, res) => {
  const raw = String(req.query.url ?? '');
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    res.status(400).json({ error: '图片地址不合法' });
    return;
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.mzstatic.com')) {
    res.status(400).json({ error: '只代理 mzstatic 图片' });
    return;
  }
  const cached = iconCache.get(raw);
  if (cached && Date.now() - cached.at < 86_400_000) {
    res.setHeader('Content-Type', cached.type);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(cached.body);
    return;
  }
  try {
    const upstream = await fetch(raw, { signal: AbortSignal.timeout(8000) });
    if (!upstream.ok) {
      res.status(502).json({ error: '图片获取失败' });
      return;
    }
    if (!new URL(upstream.url).hostname.endsWith('.mzstatic.com')) {
      res.status(400).json({ error: '图片地址不合法' });
      return;
    }
    const type = upstream.headers.get('content-type') ?? 'image/jpeg';
    if (!type.startsWith('image/')) {
      res.status(400).json({ error: '不是图片' });
      return;
    }
    const body = Buffer.from(await upstream.arrayBuffer());
    if (body.byteLength > 2_000_000) {
      res.status(413).json({ error: '图片过大' });
      return;
    }
    iconCache.set(raw, { body, type, at: Date.now() });
    if (iconCache.size > 300) {
      const oldest = [...iconCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) iconCache.delete(oldest[0]);
    }
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(body);
  } catch {
    res.status(502).json({ error: '图片获取失败' });
  }
});

app.use('/api', api);

// MCP：无状态 Streamable HTTP，每个请求独立生命周期
app.post('/mcp', async (req, res) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('[mcp]', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'MCP 请求处理失败' },
        id: null,
      });
    }
  }
});

app.get('/mcp', (_req, res) => {
  res.setHeader('Allow', 'POST');
  res.status(405).json({ error: '请使用 POST 调用 MCP' });
});

app.delete('/mcp', (_req, res) => {
  res.setHeader('Allow', 'POST');
  res.status(405).json({ error: '请使用 POST 调用 MCP' });
});

const isProd = process.env.NODE_ENV === 'production';
const clientDir = resolve(process.env.CLIENT_DIR ?? 'dist');
const serveClient = existsSync(clientDir);

// 只要构建产物存在就托管前端，npm start 不再依赖 NODE_ENV
if (serveClient) {
  app.use(
    express.static(clientDir, {
      index: false,
      setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        } else if (/\/assets\//.test(path)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );
  app.use((req, res) => {
    if (req.method !== 'GET') {
      res.status(404).json({ error: '接口不存在' });
      return;
    }
    res.sendFile(resolve(clientDir, 'index.html'));
  });
}

app.use(errorHandler);

startBillingScheduler();

const port = Number(process.env.PORT ?? (isProd ? 3000 : 3001));
const host = process.env.HOST ?? '0.0.0.0';

app.listen(port, host, () => {
  console.log(
    `[yasubman] api listening on http://${host}:${port} (${serveClient ? 'static' : 'api-only'}${isProd ? ', production' : ''})`,
  );
});

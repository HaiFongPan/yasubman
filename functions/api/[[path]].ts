import snapshot from '../../demo/snapshot.json';

/**
 * Cloudflare Pages demo 的只读 API 层。
 *
 * 数据来自构建时生成的 demo/snapshot.json（脱敏示例数据），运行时没有任何
 * 存储：GET 读快照，写操作一律 403。
 */

interface Env {
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
}

interface Ctx {
  request: Request;
  params: Record<string, string | string[] | undefined>;
  env: Env;
}

const DEMO_WRITE_ERROR = '演示模式：数据只读，请自建实例（README → 部署到 Ubuntu）';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  // demo 数据是构建时快照，缓存久一点，减少 Functions 调用
  'Cache-Control': 'public, max-age=300',
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

type Sub = (typeof snapshot.subscriptions)[number];

function filterSubscriptions(items: Sub[], params: URLSearchParams): Sub[] {
  const status = params.get('status');
  const category = params.get('category');
  const q = params.get('q');
  const sort = params.get('sort') ?? 'due';

  let list = [...items];
  if (status && status !== 'all') list = list.filter((s) => s.status === status);
  if (category && category !== 'all') list = list.filter((s) => s.category === category);
  if (q) {
    const needle = q.trim().toLowerCase();
    list = list.filter((s) =>
      [s.name, s.serviceName ?? '', s.accountLabel ?? '', s.notes ?? '']
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }

  list.sort((a, b) => {
    switch (sort) {
      case 'amount':
        return b.amountBaseMinor - a.amountBaseMinor;
      case 'name':
        return a.name.localeCompare(b.name, 'zh-CN');
      case 'added':
        return b.id - a.id;
      default: {
        if (!a.nextDue && !b.nextDue) return a.name.localeCompare(b.name, 'zh-CN');
        if (!a.nextDue) return 1;
        if (!b.nextDue) return -1;
        return a.nextDue.localeCompare(b.nextDue);
      }
    }
  });
  return list;
}

async function proxyIcon(url: URL): Promise<Response> {
  const raw = url.searchParams.get('url');
  if (!raw) return json({ error: '缺少 url 参数' }, 400);

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return json({ error: 'url 不合法' }, 400);
  }
  if (target.protocol !== 'https:' || !target.hostname.endsWith('.mzstatic.com')) {
    return json({ error: '仅支持 App Store 图标（*.mzstatic.com）' }, 400);
  }

  const upstream = await fetch(target.toString(), { cf: { cacheTtl: 86_400 } });
  if (!upstream.ok) return json({ error: `图标获取失败 (${upstream.status})` }, 502);

  return new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}

function exportResponse(url: URL): Response {
  const format = (url.searchParams.get('format') ?? 'json').toLowerCase();
  const bundle = snapshot.exports;

  if (format === 'csv') {
    return new Response(bundle.csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="yasubman-demo.csv"',
      },
    });
  }
  if (format === 'payments-csv') {
    return new Response(bundle.paymentsCsv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="yasubman-demo-payments.csv"',
      },
    });
  }
  return new Response(bundle.json, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="yasubman-demo.json"',
    },
  });
}

export const onRequest = async (ctx: Ctx): Promise<Response> => {
  const url = new URL(ctx.request.url);
  const raw = ctx.params.path;
  const segments = (Array.isArray(raw) ? raw : String(raw ?? '').split('/')).filter(Boolean);
  const path = `/${segments.join('/')}`;

  if (ctx.request.method !== 'GET' && ctx.request.method !== 'HEAD') {
    return json({ error: DEMO_WRITE_ERROR }, 403);
  }

  if (path === '/health') return json({ ok: true, demo: true, time: new Date().toISOString() });
  if (path === '/settings') return json(snapshot.settings);
  if (path === '/catalog') return json(snapshot.catalog);
  if (path === '/categories') return json(snapshot.categories);
  if (path === '/stats') return json(snapshot.stats);
  if (path === '/stats/months') return json(snapshot.months);
  if (path === '/export') return exportResponse(url);
  if (path === '/icon') return proxyIcon(url);

  if (path === '/appstore/search') {
    return json({ error: '演示模式不提供 App Store 实时搜索' }, 400);
  }

  if (path === '/subscriptions') {
    return json(filterSubscriptions(snapshot.subscriptions, url.searchParams));
  }

  const monthMatch = /^\/stats\/month\/(\d{4}-\d{2})$/.exec(path);
  if (monthMatch) {
    const detail = (snapshot.monthDetails as Record<string, unknown>)[monthMatch[1]];
    return detail ? json(detail) : json({ error: '没有该月份的数据' }, 404);
  }

  const paymentsMatch = /^\/subscriptions\/(\d+)\/payments$/.exec(path);
  if (paymentsMatch) {
    const list = (snapshot.paymentsBySubscription as Record<string, unknown>)[paymentsMatch[1]];
    return json(list ?? []);
  }

  const subMatch = /^\/subscriptions\/(\d+)$/.exec(path);
  if (subMatch) {
    const id = Number(subMatch[1]);
    const found = snapshot.subscriptions.find((item) => item.id === id);
    return found ? json(found) : json({ error: '订阅不存在' }, 404);
  }

  return json({ error: `演示模式没有实现该接口：${path}` }, 404);
};

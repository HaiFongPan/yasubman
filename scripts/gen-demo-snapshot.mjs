#!/usr/bin/env node
/**
 * 生成 Cloudflare Pages demo 用的只读数据快照。
 *
 * 流程：临时 SQLite 库（脱敏示例数据）→ 补 12 个月历史流水 → 走 HTTP 抓取所有
 * 只读接口的响应 → 写入 demo/snapshot.json 与 demo/exports/*。
 *
 * 用法：npm run demo:snapshot
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const ROOT = resolve(import.meta.dirname, '..');
const DEMO_DIR = join(ROOT, 'demo');
const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}/api`;
const HISTORY_MONTHS = 12;

const workDir = mkdtempSync(join(tmpdir(), 'yasubman-demo-'));
const dbPath = join(workDir, 'yasubman.db');

function log(message) {
  console.log(`[demo] ${message}`);
}

async function waitForHealth(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      /* 服务还没起来 */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('服务在超时时间内没有就绪');
}

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} 失败: ${res.status}`);
  return res.json();
}

async function getText(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} 失败: ${res.status}`);
  return res.text();
}

/** 把每个订阅的起始日往前推 N 个月，让 billing 能补出历史流水 */
function backdateSubscriptions() {
  const db = new Database(dbPath);
  try {
    const rows = db
      .prepare(
        `SELECT id, COALESCE(next_due, anchor_date) AS due FROM subscriptions WHERE status = 'active'`,
      )
      .all();
    const update = db.prepare(
      `UPDATE subscriptions
         SET anchor_date = date(anchor_date, ?),
             next_due    = date(COALESCE(next_due, anchor_date), ?)
       WHERE id = ?`,
    );
    const shift = `-${HISTORY_MONTHS} months`;
    const tx = db.transaction(() => {
      for (const row of rows) update.run(shift, shift, row.id);
    });
    tx();
    log(`已把 ${rows.length} 条活跃订阅的起始日回拨 ${HISTORY_MONTHS} 个月`);
  } finally {
    db.close();
  }
}

async function main() {
  const server = spawn('npx', ['tsx', 'server/index.ts'], {
    cwd: ROOT,
    env: {
      ...process.env,
      SQLITE_PATH: dbPath,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      NODE_ENV: 'production',
      // 演示快照要可复现：关掉联网汇率同步，用种子里的汇率
      FX_PROVIDER: 'off',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  server.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  server.stdout.on('data', (chunk) => {
    const line = chunk.toString().trim();
    if (line) log(`server: ${line}`);
  });

  try {
    await waitForHealth();
    log('服务已就绪');

    backdateSubscriptions();
    const billing = await postJson('/billing/run');
    log(`补出历史流水 ${billing.generated} 条`);

    const [settings, subscriptions, catalog, categories, stats, months, exportJson] =
      await Promise.all([
        getJson('/settings'),
        getJson('/subscriptions'),
        getJson('/catalog'),
        getJson('/categories'),
        getJson('/stats'),
        getJson('/stats/months?limit=24'),
        getJson('/export?format=json'),
      ]);

    const monthDetails = {};
    for (const item of months) {
      monthDetails[item.month] = await getJson(`/stats/month/${item.month}`);
    }

    const paymentsBySubscription = {};
    for (const payment of exportJson.payments ?? []) {
      const key = String(payment.subscriptionId);
      (paymentsBySubscription[key] ??= []).push(payment);
    }

    const snapshot = {
      generatedAt: new Date().toISOString(),
      demo: true,
      settings,
      subscriptions,
      catalog,
      categories,
      stats,
      months,
      monthDetails,
      paymentsBySubscription,
    };

    mkdirSync(join(DEMO_DIR, 'exports'), { recursive: true });

    const formats = [
      ['csv', 'subscriptions.csv', 'csv'],
      ['payments-csv', 'payments.csv', 'paymentsCsv'],
      ['json', 'export.json', 'json'],
    ];
    const exportsBundle = {};
    for (const [format, file, key] of formats) {
      const text = await getText(`/export?format=${format}`);
      writeFileSync(join(DEMO_DIR, 'exports', file), text);
      exportsBundle[key] = text;
    }

    // 导出文本内联进快照，前端「导出」按钮在静态 demo 里也能直接下载
    snapshot.exports = exportsBundle;
    writeFileSync(join(DEMO_DIR, 'snapshot.json'), `${JSON.stringify(snapshot, null, 2)}\n`);

    const size = JSON.stringify(snapshot).length;
    log(
      `快照完成：订阅 ${subscriptions.length} 条、服务 ${catalog.length} 个、` +
        `流水 ${(exportJson.payments ?? []).length} 条、月份 ${months.length} 个，` +
        `snapshot.json ≈ ${(size / 1024).toFixed(0)} KB`,
    );
  } finally {
    server.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 500));
    rmSync(workDir, { recursive: true, force: true });
    if (stderr.trim()) log(`server stderr: ${stderr.trim().split('\n').slice(-5).join(' | ')}`);
  }
}

async function postJson(path) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST' });
  if (!res.ok) throw new Error(`POST ${path} 失败: ${res.status}`);
  return res.json();
}

main().catch((error) => {
  console.error('[demo] 生成失败:', error);
  process.exit(1);
});

import Database from 'better-sqlite3';
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { subDays, format } from 'date-fns';
import { CATALOG_SEED } from './catalog-seed';
import { DEFAULT_CATEGORIES, type CycleId } from '../shared/types';
import { cycleDateAt, todayISO } from '../shared/cycle';
import { convertMinor } from '../shared/money';

export const DB_PATH = resolve(process.env.SQLITE_PATH ?? 'data/yasubman.db');

// 兼容旧版本：首次启动时把 subledger.db 原地改名
const LEGACY_DB_PATH = resolve(dirname(DB_PATH), 'subledger.db');
if (!existsSync(DB_PATH) && existsSync(LEGACY_DB_PATH)) {
  for (const suffix of ['', '-wal', '-shm']) {
    if (existsSync(`${LEGACY_DB_PATH}${suffix}`)) {
      renameSync(`${LEGACY_DB_PATH}${suffix}`, `${DB_PATH}${suffix}`);
    }
  }
  console.log('[db] migrated legacy subledger.db → yasubman.db');
}

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

const now = () => new Date().toISOString();

function migrate() {
  const version = db.pragma('user_version', { simple: true }) as number;

  if (version < 1) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS currencies (
      code          TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      symbol        TEXT NOT NULL,
      exponent      INTEGER NOT NULL DEFAULT 2,
      units_per_usd REAL NOT NULL,
      sort          INTEGER NOT NULL DEFAULT 100
    );

    CREATE TABLE IF NOT EXISTS service_catalog (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      slug       TEXT UNIQUE,
      category   TEXT NOT NULL DEFAULT 'other',
      icon_kind  TEXT NOT NULL DEFAULT 'initials',
      icon_data  TEXT,
      color      TEXT NOT NULL DEFAULT '#6B7280',
      website    TEXT,
      is_builtin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT NOT NULL,
      service_id     INTEGER REFERENCES service_catalog(id) ON DELETE SET NULL,
      category       TEXT NOT NULL DEFAULT 'other',
      amount_minor   INTEGER NOT NULL,
      currency       TEXT NOT NULL REFERENCES currencies(code),
      cycle          TEXT NOT NULL DEFAULT 'monthly',
      cycle_days     INTEGER,
      anchor_date    TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'active',
      auto_renew     INTEGER NOT NULL DEFAULT 1,
      payment_method TEXT,
      account_label  TEXT,
      website        TEXT,
      notes          TEXT,
      remind_days    INTEGER NOT NULL DEFAULT 3,
      created_at     TEXT NOT NULL,
      updated_at     TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_service ON subscriptions(service_id);

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

    db.pragma('user_version = 1');
  }

  if (version < 2) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        slug       TEXT NOT NULL UNIQUE,
        label      TEXT NOT NULL UNIQUE,
        color      TEXT NOT NULL DEFAULT '#8A8578',
        sort       INTEGER NOT NULL DEFAULT 100,
        is_builtin INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `);
    db.pragma('user_version = 2');
  }

  if (version < 3) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS payments (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
        paid_on         TEXT NOT NULL,
        amount_minor    INTEGER NOT NULL,
        currency        TEXT NOT NULL REFERENCES currencies(code),
        rate_units_per_usd REAL NOT NULL,
        base_minor      INTEGER NOT NULL,
        base_currency   TEXT NOT NULL,
        source          TEXT NOT NULL DEFAULT 'auto',
        note            TEXT,
        created_at      TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_payments_sub ON payments(subscription_id, paid_on);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_unique
        ON payments(subscription_id, paid_on);
    `);
    const columns = db.prepare('PRAGMA table_info(subscriptions)').all() as { name: string }[];
    if (!columns.some((column) => column.name === 'next_due')) {
      db.exec('ALTER TABLE subscriptions ADD COLUMN next_due TEXT');
    }
    if (!columns.some((column) => column.name === 'paused_at')) {
      db.exec('ALTER TABLE subscriptions ADD COLUMN paused_at TEXT');
    }
    db.pragma('user_version = 3');
  }
}

const CURRENCIES = [
  ['CNY', '人民币', '¥', 2, 7.15, 1],
  ['USD', '美元', '$', 2, 1, 2],
  ['EUR', '欧元', '€', 2, 0.92, 3],
  ['GBP', '英镑', '£', 2, 0.79, 4],
  ['JPY', '日元', '¥', 0, 152, 5],
  ['HKD', '港币', 'HK$', 2, 7.8, 6],
  ['TWD', '新台币', 'NT$', 0, 32.4, 7],
  ['SGD', '新加坡元', 'S$', 2, 1.34, 8],
  ['KRW', '韩元', '₩', 0, 1370, 9],
  ['CAD', '加元', 'C$', 2, 1.38, 10],
  ['AUD', '澳元', 'A$', 2, 1.52, 11],
  ['INR', '印度卢比', '₹', 2, 84, 12],
  ['CHF', '瑞士法郎', 'CHF', 2, 0.88, 13],
] as const;

function seedCurrencies() {
  const insert = db.prepare(`
    INSERT INTO currencies (code, name, symbol, exponent, units_per_usd, sort)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(code) DO NOTHING
  `);
  const tx = db.transaction(() => {
    for (const row of CURRENCIES) insert.run(...row);
  });
  tx();
}

function seedCatalog() {
  const upsert = db.prepare(`
    INSERT INTO service_catalog
      (name, slug, category, icon_kind, icon_data, color, website, is_builtin, created_at, updated_at)
    VALUES (@name, @slug, @category, @iconKind, @iconData, @color, @website, 1, @ts, @ts)
    ON CONFLICT(slug) DO UPDATE SET
      name = excluded.name,
      category = excluded.category,
      icon_kind = excluded.icon_kind,
      icon_data = excluded.icon_data,
      color = excluded.color,
      website = excluded.website,
      updated_at = excluded.updated_at
    WHERE service_catalog.is_builtin = 1
  `);
  const tx = db.transaction(() => {
    const ts = now();
    for (const item of CATALOG_SEED) upsert.run({ ...item, ts });
  });
  tx();
}

function seedCategories() {
  const upsert = db.prepare(`
    INSERT INTO categories (slug, label, color, sort, is_builtin, created_at)
    VALUES (@slug, @label, @color, @sort, 1, @ts)
    ON CONFLICT(slug) DO UPDATE SET
      label = excluded.label,
      color = excluded.color
    WHERE categories.is_builtin = 1
  `);
  const tx = db.transaction(() => {
    const ts = now();
    DEFAULT_CATEGORIES.forEach((item, index) => {
      upsert.run({ ...item, sort: index + 1, ts });
    });
  });
  tx();
}

function seedSettings() {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('base_currency', 'CNY') ON CONFLICT(key) DO NOTHING`,
  ).run();
}

// 全部为虚构示例数据，仅用于首次启动时演示界面，可随时在界面删除。
const DEMO = [
  { name: 'ChatGPT Plus', slug: 'openai', amount: 20, currency: 'USD', cycle: 'monthly', dayOffset: 13, method: '示例银行 Visa', account: 'user@example.com', notes: '主力模型入口' },
  { name: 'Claude Pro', slug: 'anthropic', amount: 20, currency: 'USD', cycle: 'monthly', dayOffset: 24, method: 'Apple Pay', account: 'user@example.com', notes: '' },
  { name: 'Cursor Pro', slug: 'cursor', amount: 20, currency: 'USD', cycle: 'monthly', dayOffset: 8, method: '示例银行 Visa', account: 'user@example.com', notes: '年付更划算，待观察' },
  { name: 'Gemini Advanced', slug: 'google-gemini', amount: 19.99, currency: 'USD', cycle: 'monthly', dayOffset: 30, method: 'Google Play', account: 'user@example.com', notes: '' },
  { name: 'Vercel Pro', slug: 'vercel', amount: 20, currency: 'USD', cycle: 'monthly', dayOffset: 16, method: '示例银行 Visa', account: 'team: demo', notes: '个人项目托管' },
  { name: 'Netflix 高级家庭版', slug: 'netflix', amount: 15.49, currency: 'USD', cycle: 'monthly', dayOffset: 21, method: 'PayPal', account: 'family@example.com', notes: '' },
  { name: 'Spotify Premium', slug: 'spotify', amount: 11.99, currency: 'USD', cycle: 'monthly', dayOffset: 5, method: 'Apple Pay', account: 'user@example.com', notes: '' },
  { name: 'JetBrains 全家桶', slug: 'jetbrains', amount: 289, currency: 'USD', cycle: 'yearly', dayOffset: 120, method: '示例银行 Visa', account: 'user@example.com', notes: '每年 7 月扣费' },
  { name: '阿里云 ECS', slug: 'aliyun', amount: 99, currency: 'CNY', cycle: 'yearly', dayOffset: 200, method: '支付宝', account: 'aliyun: demo', notes: '轻量应用服务器' },
  { name: 'iCloud+ 200GB', slug: 'icloud', amount: 21, currency: 'CNY', cycle: 'monthly', dayOffset: 11, method: 'Apple ID 余额', account: 'user@example.com', notes: '' },
] as const;

function seedDemo() {
  const seeded = db.prepare(`SELECT value FROM settings WHERE key = 'demo_seeded'`).get();
  const count = db.prepare('SELECT COUNT(*) AS n FROM subscriptions').get() as { n: number };
  if (seeded || count.n > 0) return;

  const findService = db.prepare('SELECT id, category FROM service_catalog WHERE slug = ?');
  const findCurrency = db.prepare('SELECT exponent FROM currencies WHERE code = ?');
  const insert = db.prepare(`
    INSERT INTO subscriptions
      (name, service_id, category, amount_minor, currency, cycle, cycle_days, anchor_date,
       status, auto_renew, payment_method, account_label, website, notes, remind_days, created_at, updated_at)
    VALUES (@name, @serviceId, @category, @amountMinor, @currency, @cycle, NULL, @anchorDate,
       'active', 1, @method, @account, NULL, @notes, 3, @ts, @ts)
  `);

  const tx = db.transaction(() => {
    const ts = now();
    for (const item of DEMO) {
      const service = findService.get(item.slug) as { id: number; category: string } | undefined;
      const currency = findCurrency.get(item.currency) as { exponent: number } | undefined;
      if (!service || !currency) continue;
      insert.run({
        name: item.name,
        serviceId: service.id,
        category: service.category,
        amountMinor: Math.round(item.amount * 10 ** currency.exponent),
        currency: item.currency,
        cycle: item.cycle,
        anchorDate: format(subDays(new Date(), item.dayOffset), 'yyyy-MM-dd'),
        method: item.method,
        account: item.account,
        notes: item.notes || null,
        ts,
      });
    }
    db.prepare(`INSERT INTO settings (key, value) VALUES ('demo_seeded', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(ts);
  });
  tx();
}

/** 首次升级到流水模型：按锚点补齐历史，并给活跃订阅算出下次扣费日 */
const LEDGER_INIT_FLAG = 'ledger_ready_v3';

export function backfillLedger() {
  const done = db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(LEDGER_INIT_FLAG);
  if (done) return;

  const currencyRows = db.prepare('SELECT * FROM currencies').all() as {
    code: string;
    exponent: number;
    units_per_usd: number;
  }[];
  const currencies = new Map(currencyRows.map((row) => [row.code, row]));
  const baseRow = db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get('base_currency') as { value: string } | undefined;
  const base = currencies.get(baseRow?.value ?? 'CNY') ?? currencyRows[0];

  const subs = db.prepare('SELECT * FROM subscriptions').all() as {
    id: number;
    status: string;
    amount_minor: number;
    currency: string;
    cycle: string;
    cycle_days: number | null;
    anchor_date: string;
  }[];
  const insert = db.prepare(`
    INSERT OR IGNORE INTO payments
      (subscription_id, paid_on, amount_minor, currency, rate_units_per_usd,
       base_minor, base_currency, source, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'backfill', NULL, ?)
  `);
  const setNext = db.prepare('UPDATE subscriptions SET next_due = ? WHERE id = ?');
  const markDone = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  const now = new Date().toISOString();
  const today = todayISO();

  const tx = db.transaction(() => {
    for (const sub of subs) {
      if (sub.status !== 'active') {
        setNext.run(null, sub.id);
        continue;
      }
      const meta = currencies.get(sub.currency) ?? base;
      if (!meta) {
        setNext.run(null, sub.id);
        continue;
      }
      const baseMinor = convertMinor(
        sub.amount_minor,
        { exponent: meta.exponent, unitsPerUsd: meta.units_per_usd },
        { exponent: base.exponent, unitsPerUsd: base.units_per_usd },
      );
      let step = 0;
      let due = cycleDateAt(sub.anchor_date, sub.cycle as CycleId, sub.cycle_days, step);
      while (due <= today && step < 1000) {
        insert.run(
          sub.id,
          due,
          sub.amount_minor,
          sub.currency,
          meta.units_per_usd,
          baseMinor,
          base.code,
          now,
        );
        step += 1;
        due = cycleDateAt(sub.anchor_date, sub.cycle as CycleId, sub.cycle_days, step);
      }
      setNext.run(due > today ? due : null, sub.id);
    }
    markDone.run(LEDGER_INIT_FLAG, now);
  });
  tx();
}

export function initDb() {
  migrate();
  seedCurrencies();
  seedCategories();
  seedCatalog();
  seedSettings();
  seedDemo();
}

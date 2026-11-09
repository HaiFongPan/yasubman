import { db } from './db';
import type { RateMeta } from '../shared/types';

const DAY = 86_400_000;

function readSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function writeSetting(key: string, value: string | null) {
  if (value === null) {
    db.prepare('DELETE FROM settings WHERE key = ?').run(key);
    return;
  }
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

interface ProviderResult {
  rates: Record<string, number>;
  source: string;
  sourceUrl: string;
  nextUpdateAt: string | null;
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: { accept: 'application/json', 'user-agent': 'yasubman/0.1' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

async function fromOpenErApi(): Promise<ProviderResult> {
  const data = await fetchJson('https://open.er-api.com/v6/latest/USD');
  if (data.result !== 'success' || typeof data.rates !== 'object' || data.rates === null) {
    throw new Error('返回结构异常');
  }
  return {
    rates: data.rates as Record<string, number>,
    source: 'open.er-api',
    sourceUrl: 'https://www.exchangerate-api.com',
    nextUpdateAt:
      typeof data.time_next_update_unix === 'number'
        ? new Date(data.time_next_update_unix * 1000).toISOString()
        : null,
  };
}

async function fromFrankfurter(): Promise<ProviderResult> {
  const data = await fetchJson('https://api.frankfurter.dev/v1/latest?base=USD');
  if (typeof data.rates !== 'object' || data.rates === null) throw new Error('返回结构异常');
  return {
    rates: { USD: 1, ...(data.rates as Record<string, number>) },
    source: 'frankfurter',
    sourceUrl: 'https://frankfurter.dev',
    nextUpdateAt: null,
  };
}

const PROVIDERS = {
  'open-er-api': fromOpenErApi,
  frankfurter: fromFrankfurter,
} as const;

function providerChain(): Array<() => Promise<ProviderResult>> {
  const mode = (process.env.FX_PROVIDER ?? 'auto').toLowerCase();
  if (mode === 'off' || mode === 'manual') return [];
  if (mode === 'open-er-api') return [fromOpenErApi];
  if (mode === 'frankfurter') return [fromFrankfurter];
  return [fromOpenErApi, fromFrankfurter];
}

/** 只更新已配置币种；至少命中 5 个才认为数据可信 */
function applyRates(rates: Record<string, number>) {
  const codes = db.prepare('SELECT code FROM currencies').all() as { code: string }[];
  const update = db.prepare('UPDATE currencies SET units_per_usd = ? WHERE code = ?');
  let applied = 0;
  const tx = db.transaction(() => {
    for (const { code } of codes) {
      const value = code === 'USD' ? 1 : Number(rates[code]);
      if (!Number.isFinite(value) || value <= 0) continue;
      update.run(value, code);
      applied += 1;
    }
  });
  tx();
  if (applied < 5) throw new Error('可用汇率过少，已放弃本次同步');
  return applied;
}

export function ratesMeta(): RateMeta {
  const updatedAt = readSetting('rates_updated_at');
  let status = (readSetting('rates_status') ?? 'never') as RateMeta['status'];
  if (status === 'ok' && updatedAt && Date.now() - Date.parse(updatedAt) > 2 * DAY) {
    status = 'stale';
  }
  return {
    provider: readSetting('rates_source') ?? 'seed',
    providerUrl: readSetting('rates_source_url'),
    updatedAt,
    nextUpdateAt: readSetting('rates_next_update'),
    status,
    error: readSetting('rates_error'),
  };
}

let inFlight: Promise<RateMeta> | null = null;

async function doRefresh(force: boolean): Promise<RateMeta> {
  const chain = providerChain();
  if (chain.length === 0) {
    writeSetting('rates_status', 'disabled');
    writeSetting('rates_error', null);
    return ratesMeta();
  }

  if (!force) {
    const updatedAt = readSetting('rates_updated_at');
    if (updatedAt && Date.now() - Date.parse(updatedAt) < DAY) return ratesMeta();
  }

  const errors: string[] = [];
  for (const provider of chain) {
    try {
      const result = await provider();
      applyRates(result.rates);
      const now = new Date();
      writeSetting('rates_source', result.source);
      writeSetting('rates_source_url', result.sourceUrl);
      writeSetting('rates_updated_at', now.toISOString());
      writeSetting(
        'rates_next_update',
        result.nextUpdateAt ?? new Date(now.getTime() + DAY).toISOString(),
      );
      writeSetting('rates_status', 'ok');
      writeSetting('rates_error', null);
      return ratesMeta();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  writeSetting('rates_status', 'error');
  writeSetting('rates_error', errors.join('；').slice(0, 300) || '未知错误');
  return ratesMeta();
}

/** 每日自动同步；失败时保留旧值，不阻断应用 */
export function refreshRates(force = false): Promise<RateMeta> {
  if (inFlight) return inFlight;
  inFlight = doRefresh(force).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

import { db } from './db';
import { nextCycleAfter, todayISO } from '../shared/cycle';
import { convertMinor } from '../shared/money';
import { baseCurrency, currencyMap } from './domain';
import type { CycleId } from '../shared/types';

/** 把所有已到期（next_due <= 今天）的活跃订阅结算成流水，并推进下次扣费日 */
export function runBilling(now = new Date()): { generated: number; subscriptions: number } {
  const today = todayISO(now);
  const rows = db
    .prepare(
      `SELECT id, cycle, cycle_days, amount_minor, currency, next_due, anchor_date
       FROM subscriptions
       WHERE status = 'active' AND next_due IS NOT NULL AND next_due <= ?`,
    )
    .all(today) as {
    id: number;
    cycle: CycleId;
    cycle_days: number | null;
    amount_minor: number;
    currency: string;
    next_due: string;
    anchor_date: string;
  }[];

  if (rows.length === 0) return { generated: 0, subscriptions: 0 };

  const currencies = currencyMap();
  const base = baseCurrency();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO payments
      (subscription_id, paid_on, amount_minor, currency, rate_units_per_usd,
       base_minor, base_currency, source, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'auto', NULL, ?)
  `);
  const setNext = db.prepare('UPDATE subscriptions SET next_due = ? WHERE id = ?');
  const ts = now.toISOString();
  let generated = 0;
  const touched = new Set<number>();

  const tx = db.transaction(() => {
    for (const row of rows) {
      const currency = currencies.get(row.currency);
      if (!currency) continue;
      const baseMinor = convertMinor(row.amount_minor, currency, base);
      let due: string | null = row.next_due;
      let guard = 0;
      while (due && due <= today && guard < 500) {
        const result = insert.run(
          row.id,
          due,
          row.amount_minor,
          row.currency,
          currency.unitsPerUsd,
          baseMinor,
          base.code,
          ts,
        );
        if (result.changes > 0) generated += 1;
        due = nextCycleAfter(row.anchor_date, row.cycle, row.cycle_days, due);
        if (!due) break;
        guard += 1;
      }
      setNext.run(due, row.id);
      touched.add(row.id);
    }
  });
  tx();

  return { generated, subscriptions: touched.size };
}

/** 启动时补跑一次，之后每天 00:05 结算 */
export function startBillingScheduler() {
  const run = () => {
    try {
      const result = runBilling();
      if (result.generated > 0) {
        console.log(`[billing] generated ${result.generated} payments`);
      }
    } catch (error) {
      console.error('[billing]', error);
    }
  };

  run();

  const scheduleNext = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(0, 5, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    setTimeout(() => {
      run();
      scheduleNext();
    }, next.getTime() - now.getTime()).unref();
  };
  scheduleNext();
}

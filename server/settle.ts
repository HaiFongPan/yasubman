import { db } from './db';
import { nextCycleAfter, todayISO } from '../shared/cycle';
import { convertMinor } from '../shared/money';
import type { Currency, CycleId } from '../shared/types';

interface DueRow {
  id: number;
  cycle: CycleId;
  cycle_days: number | null;
  amount_minor: number;
  currency: string;
  next_due: string;
  anchor_date: string;
}

/**
 * 把到期（next_due <= 今天）的活跃订阅结算成流水并顺延下次扣费日。
 *
 * 每日定时结算（billing.ts）与新增订阅后的首次结算共用这一份实现：
 * 传入 subscriptionId 时只结算这一条，避免新增一条就全表重算。
 */
export function settleDue(opts: {
  currencies: Map<string, Currency>;
  base: Currency;
  now?: Date;
  subscriptionId?: number;
}): { generated: number; subscriptions: number } {
  const now = opts.now ?? new Date();
  const today = todayISO(now);
  const onlyId = opts.subscriptionId ?? null;

  const rows = db
    .prepare(
      `SELECT id, cycle, cycle_days, amount_minor, currency, next_due, anchor_date
       FROM subscriptions
       WHERE status = 'active' AND next_due IS NOT NULL AND next_due <= ?
         AND (? IS NULL OR id = ?)`,
    )
    .all(today, onlyId, onlyId) as DueRow[];

  if (rows.length === 0) return { generated: 0, subscriptions: 0 };

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
      const currency = opts.currencies.get(row.currency);
      if (!currency) continue;
      const baseMinor = convertMinor(row.amount_minor, currency, opts.base);
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
          opts.base.code,
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

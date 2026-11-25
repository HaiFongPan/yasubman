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

interface FirstDueRow {
  id: number;
  status: string;
  cycle: CycleId;
  cycle_days: number | null;
  amount_minor: number;
  currency: string;
  next_due: string | null;
  anchor_date: string;
}

// 建表在 initDb() 里完成，所以语句必须等到实际调用时再 prepare
function writeAutoPayment(input: {
  subscriptionId: number;
  paidOn: string;
  amountMinor: number;
  currency: Currency;
  base: Currency;
  ts: string;
}): boolean {
  const changes = db
    .prepare(
      `INSERT OR IGNORE INTO payments
         (subscription_id, paid_on, amount_minor, currency, rate_units_per_usd,
          base_minor, base_currency, source, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'auto', NULL, ?)`,
    )
    .run(
      input.subscriptionId,
      input.paidOn,
      input.amountMinor,
      input.currency.code,
      input.currency.unitsPerUsd,
      convertMinor(input.amountMinor, input.currency, input.base),
      input.base.code,
      input.ts,
    ).changes;
  return changes > 0;
}

function advanceNextDue(subscriptionId: number, nextDue: string | null) {
  db.prepare('UPDATE subscriptions SET next_due = ? WHERE id = ?').run(nextDue, subscriptionId);
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

  const ts = now.toISOString();
  let generated = 0;
  const touched = new Set<number>();

  const tx = db.transaction(() => {
    for (const row of rows) {
      const currency = opts.currencies.get(row.currency);
      if (!currency) continue;
      let due: string | null = row.next_due;
      let guard = 0;
      while (due && due <= today && guard < 500) {
        if (
          writeAutoPayment({
            subscriptionId: row.id,
            paidOn: due,
            amountMinor: row.amount_minor,
            currency,
            base: opts.base,
            ts,
          })
        ) {
          generated += 1;
        }
        due = nextCycleAfter(row.anchor_date, row.cycle, row.cycle_days, due);
        if (!due) break;
        guard += 1;
      }
      advanceNextDue(row.id, due);
      touched.add(row.id);
    }
  });
  tx();

  return { generated, subscriptions: touched.size };
}

/**
 * 新增订阅后的首期流水：该订阅还没有流水，且起始日不晚于今天时，
 * 补最近一个已到的计费日（只补一期，更早的历史用补录），并把下次扣费日顺延到下一期。
 *
 * 只补最近一期是刻意的：一次录入一条跑了几个月的订阅时，
 * 不应该凭空改写前几个月的「实际支出」。
 */
export function settleFirstDue(opts: {
  currencies: Map<string, Currency>;
  base: Currency;
  subscriptionId: number;
  now?: Date;
}): { generated: number; paidOn: string | null } {
  const now = opts.now ?? new Date();
  const today = todayISO(now);

  const row = db
    .prepare(
      `SELECT id, status, cycle, cycle_days, amount_minor, currency, next_due, anchor_date
       FROM subscriptions WHERE id = ?`,
    )
    .get(opts.subscriptionId) as FirstDueRow | undefined;
  if (!row || row.status !== 'active') return { generated: 0, paidOn: null };
  if (row.anchor_date > today) return { generated: 0, paidOn: null };
  const paid = db.prepare('SELECT 1 FROM payments WHERE subscription_id = ? LIMIT 1').get(row.id);
  if (paid) return { generated: 0, paidOn: null };

  const currency = opts.currencies.get(row.currency);
  if (!currency) return { generated: 0, paidOn: null };

  // 从 next_due（已收敛到今天及以后）或起始日出发，推进到最后一个不晚于今天的计费日
  let due = row.next_due && row.next_due <= today ? row.next_due : row.anchor_date;
  let guard = 0;
  for (;;) {
    const next = nextCycleAfter(row.anchor_date, row.cycle, row.cycle_days, due);
    if (!next || next > today || guard >= 500) break;
    due = next;
    guard += 1;
  }

  const ts = now.toISOString();
  let generated = 0;
  const tx = db.transaction(() => {
    if (
      writeAutoPayment({
        subscriptionId: row.id,
        paidOn: due,
        amountMinor: row.amount_minor,
        currency,
        base: opts.base,
        ts,
      })
    ) {
      generated += 1;
    }
    advanceNextDue(row.id, nextCycleAfter(row.anchor_date, row.cycle, row.cycle_days, due));
  });
  tx();

  return { generated, paidOn: generated > 0 ? due : null };
}

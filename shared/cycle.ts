import { addDays, addMonths, addWeeks, differenceInCalendarDays, format, parseISO, startOfDay } from 'date-fns';
import type { CycleId } from './types';

const TIMES_PER_YEAR: Record<Exclude<CycleId, 'custom'>, number> = {
  weekly: 365.25 / 7,
  biweekly: 365.25 / 14,
  monthly: 12,
  quarterly: 4,
  semiannual: 2,
  yearly: 1,
};

/** 每年计费次数，用于年化归一化 */
export function timesPerYear(cycle: CycleId, cycleDays: number | null): number {
  if (cycle === 'custom') {
    return cycleDays && cycleDays > 0 ? 365.25 / cycleDays : 0;
  }
  return TIMES_PER_YEAR[cycle];
}

/** 单期金额 → 月均金额（最小单位） */
export function monthlyEquivalent(
  amountMinor: number,
  cycle: CycleId,
  cycleDays: number | null,
): number {
  return Math.round((amountMinor * timesPerYear(cycle, cycleDays)) / 12);
}

/** 从起始日推第 steps 个计费日；月度类按起始日对齐，避免月末漂移 */
function shift(anchor: Date, cycle: CycleId, cycleDays: number | null, steps: number): Date {
  switch (cycle) {
    case 'weekly':
      return addWeeks(anchor, steps);
    case 'biweekly':
      return addWeeks(anchor, steps * 2);
    case 'monthly':
      return addMonths(anchor, steps);
    case 'quarterly':
      return addMonths(anchor, steps * 3);
    case 'semiannual':
      return addMonths(anchor, steps * 6);
    case 'yearly':
      return addMonths(anchor, steps * 12);
    case 'custom':
      return addDays(anchor, steps * Math.max(1, cycleDays ?? 1));
  }
}

const ISO = 'yyyy-MM-dd';

/** 下一个扣费日（含当天）；已取消 / 日期非法返回 null */
export function nextDueDate(
  anchor: string,
  cycle: CycleId,
  cycleDays: number | null,
  from: Date = new Date(),
): string | null {
  if (cycle === 'custom' && (!cycleDays || cycleDays < 1)) return null;
  const start = startOfDay(parseISO(anchor));
  if (Number.isNaN(start.getTime())) return null;
  const today = startOfDay(from);
  if (start.getTime() >= today.getTime()) return format(start, ISO);

  for (let step = 1; step <= 7400; step += 1) {
    const candidate = shift(start, cycle, cycleDays, step);
    if (candidate.getTime() >= today.getTime()) return format(candidate, ISO);
  }
  return null;
}

/** 以锚点为基准取第 steps 个周期日（月末自动夹到当月最后一天，不漂移） */
export function cycleDateAt(
  anchorISO: string,
  cycle: CycleId,
  cycleDays: number | null,
  steps: number,
): string {
  return format(shift(parseISO(anchorISO), cycle, cycleDays, steps), ISO);
}

/** 锚点对齐的下一个周期日（严格晚于 afterISO） */
export function nextCycleAfter(
  anchorISO: string,
  cycle: CycleId,
  cycleDays: number | null,
  afterISO: string,
): string | null {
  return nextDueDate(anchorISO, cycle, cycleDays, addDays(parseISO(afterISO), 1));
}

/** 从指定日期推进 steps 个周期 */
export function advanceCycleDate(
  iso: string,
  cycle: CycleId,
  cycleDays: number | null,
  steps = 1,
): string {
  return format(shift(parseISO(iso), cycle, cycleDays, steps), ISO);
}

export function daysUntil(iso: string | null, from: Date = new Date()): number | null {
  if (!iso) return null;
  const target = startOfDay(parseISO(iso));
  if (Number.isNaN(target.getTime())) return null;
  return differenceInCalendarDays(target, startOfDay(from));
}

export function todayISO(now: Date = new Date()): string {
  return format(now, ISO);
}

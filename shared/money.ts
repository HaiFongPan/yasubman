import type { Currency } from './types';

/** 主单位 → 最小单位（分），按币种小数位换算 */
export function toMinor(amount: number, exponent: number): number {
  return Math.round(amount * 10 ** exponent);
}

/** 最小单位 → 主单位 */
export function fromMinor(minor: number, exponent: number): number {
  return minor / 10 ** exponent;
}

/** 按 1 USD = unitsPerUsd 的汇率在两种币种的最小单位之间换算 */
export function convertMinor(
  amountMinor: number,
  from: Pick<Currency, 'exponent' | 'unitsPerUsd'>,
  to: Pick<Currency, 'exponent' | 'unitsPerUsd'>,
): number {
  if (from.unitsPerUsd <= 0 || to.unitsPerUsd <= 0) return amountMinor;
  const value = amountMinor * (to.unitsPerUsd / from.unitsPerUsd);
  return Math.round(value * 10 ** (to.exponent - from.exponent));
}

export function formatMoney(
  minor: number,
  currency: Pick<Currency, 'code' | 'exponent'>,
  options: { compact?: boolean; sign?: boolean } = {},
): string {
  const value = fromMinor(minor, currency.exponent);
  const fmt = new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: currency.code,
    minimumFractionDigits: options.compact ? 0 : currency.exponent,
    maximumFractionDigits: currency.exponent,
    notation: options.compact ? 'compact' : 'standard',
  });
  return fmt.format(value);
}

export function formatNumber(minor: number, exponent: number): string {
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(fromMinor(minor, exponent));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(d)
    .replace(/\//g, '-');
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
  }).format(d);
}

export function formatMonthDay(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function relativeDays(days: number | null): string {
  if (days === null) return '—';
  if (days < 0) return `已逾期 ${Math.abs(days)} 天`;
  if (days === 0) return '今天';
  if (days === 1) return '明天';
  if (days < 30) return `${days} 天后`;
  if (days < 365) return `${Math.round(days / 30)} 个月后`;
  return `${(days / 365).toFixed(1)} 年后`;
}

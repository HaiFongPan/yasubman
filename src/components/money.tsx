import { useMemo } from 'react';
import { useSettings } from '@/lib/queries';
import { formatMoney, relativeDays } from '@shared/money';
import type { Currency } from '@shared/types';
import { cn } from '@/lib/utils';

export const FALLBACK_CURRENCY: Pick<Currency, 'code' | 'name' | 'symbol' | 'exponent' | 'unitsPerUsd'> = {
  code: 'CNY',
  name: '人民币',
  symbol: '¥',
  exponent: 2,
  unitsPerUsd: 7.15,
};

export function useCurrencies(): Map<string, Currency> {
  const { data } = useSettings();
  return useMemo(
    () => new Map((data?.currencies ?? []).map((c) => [c.code, c])),
    [data?.currencies],
  );
}

export function useCurrency(code: string): Currency {
  const map = useCurrencies();
  return map.get(code) ?? { ...FALLBACK_CURRENCY, code };
}

export function useBaseCurrency(): Currency {
  const { data } = useSettings();
  const map = useCurrencies();
  const code = data?.baseCurrency ?? FALLBACK_CURRENCY.code;
  return map.get(code) ?? FALLBACK_CURRENCY;
}

export function Money({
  minor,
  code,
  className,
  compact,
}: {
  minor: number;
  code: string;
  className?: string;
  compact?: boolean;
}) {
  const currency = useCurrency(code);
  return (
    <span className={cn('font-mono tabular', className)}>
      {formatMoney(minor, currency, { compact })}
    </span>
  );
}

export function DueLabel({ days }: { days: number | null }) {
  if (days === null) return <span className="text-muted-foreground">—</span>;
  const tone =
    days < 0 ? 'text-destructive' : days <= 3 ? 'text-foreground' : 'text-muted-foreground';
  return <span className={cn('text-[11.5px]', tone)}>{relativeDays(days)}</span>;
}

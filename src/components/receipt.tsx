import type { Ref } from 'react';
import type { MonthDetail, Subscription } from '@shared/types';
import { useBaseCurrency, useCurrencies } from '@/components/money';
import { formatMoney } from '@shared/money';

function ReceiptIcon({ icon }: { icon: Subscription['icon'] }) {
  if (icon.kind === 'image' && icon.data) {
    const src = `/api/icon?url=${encodeURIComponent(icon.data)}`;
    return <img src={src} alt="" className="receipt-icon" crossOrigin="anonymous" />;
  }
  if (icon.kind === 'brand' && icon.data) {
    return (
      <svg viewBox="0 0 24 24" className="receipt-icon" fill="currentColor" aria-hidden="true">
        <path d={icon.data} />
      </svg>
    );
  }
  return <span className="receipt-initials">{icon.data?.slice(0, 2) ?? '?'}</span>;
}

function monthLabel(month: string): string {
  const date = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return month;
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' })
    .format(date)
    .toUpperCase();
}

function barcode(seed: string): { width: number; gap: number }[] {
  const text = `${seed}${seed.length}`;
  return Array.from({ length: 52 }, (_, index) => {
    const code = text.charCodeAt(index % text.length) + index * 13;
    return { width: (code % 3) + 1, gap: ((code >> 2) % 2) + 1 };
  });
}

export function Receipt({
  detail,
  innerRef,
}: {
  detail: MonthDetail;
  innerRef?: Ref<HTMLDivElement>;
}) {
  const currencies = useCurrencies();
  const base = useBaseCurrency();
  const bars = barcode(detail.month);
  const meta = (code: string) =>
    currencies.get(code) ?? {
      code,
      name: code,
      symbol: '',
      exponent: 2,
      unitsPerUsd: 1,
    };

  return (
    <div className="receipt-sheet" ref={innerRef}>
      <div className="receipt-head">
        <div className="receipt-brand">YASUBMAN</div>
        <div className="receipt-kind">SUBSCRIPTION RECEIPT</div>
        <div className="receipt-month">{monthLabel(detail.month)}</div>
      </div>

      <div className="receipt-divider" />

      <div className="receipt-meta">
        <span>{String(detail.count).padStart(2, '0')} ITEMS</span>
        <span>{detail.baseCurrency}</span>
      </div>

      <div className="receipt-divider dashed" />

      {detail.items.length === 0 ? (
        <div className="receipt-empty">NO CHARGES THIS MONTH</div>
      ) : (
        <ul className="receipt-items">
          {detail.items.map((item) => (
            <li key={item.id} className="receipt-item">
              <span className="receipt-date">{item.paidOn.slice(5).replace('-', '/')}</span>
              <ReceiptIcon icon={item.icon} />
              <span className="receipt-name">{item.name}</span>
              <span className="receipt-amount">
                {formatMoney(item.amountMinor, meta(item.currency))}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="receipt-divider dashed" />

      <div className="receipt-total">
        <span>TOTAL</span>
        <span>{formatMoney(detail.totalMinor, base)}</span>
      </div>

      <div className="receipt-divider" />

      <div className="receipt-foot">
        <div>THANK YOU</div>
        <div className="receipt-barcode" aria-hidden="true">
          {bars.map((bar, index) => (
            <span
              key={index}
              style={{ width: `${bar.width}px`, marginRight: `${bar.gap}px` }}
            />
          ))}
        </div>
        <div>{detail.month} · YASUBMAN</div>
      </div>
    </div>
  );
}

import { useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, CreditCard } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { useSubscriptions } from '@/lib/queries';
import { COMMON_PAYMENT_METHODS } from '@shared/types';

/**
 * 支付方式选择：下拉里给出「本库已用过」与「常用」两组提示，
 * 但允许直接输入任意文本，存储值不做枚举约束。
 */
export function PaymentMethodPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { data: subscriptions = [] } = useSubscriptions();
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const query = value.trim().toLowerCase();

  const used = useMemo(() => {
    const set = new Set<string>();
    for (const item of subscriptions) {
      const method = item.paymentMethod?.trim();
      if (method) set.add(method);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  }, [subscriptions]);

  const match = (candidate: string) =>
    !query || candidate.toLowerCase().includes(query);

  const usedMatches = used.filter(match);
  const commonMatches = COMMON_PAYMENT_METHODS.filter(
    (method) => !used.includes(method) && match(method),
  );
  const hasResults = usedMatches.length > 0 || commonMatches.length > 0;

  const close = () => {
    setOpen(false);
    inputRef.current?.blur();
  };

  const pick = (method: string) => {
    onChange(method);
    close();
  };

  const option = (method: string) => (
    <button
      key={method}
      type="button"
      onClick={() => pick(method)}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted"
    >
      <span className="min-w-0 flex-1 truncate">{method}</span>
      {method === value && <Check className="size-3.5 shrink-0" />}
    </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative">
          <CreditCard className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={value}
            disabled={disabled}
            onChange={(event) => {
              onChange(event.target.value);
              setOpen(true);
            }}
            onClick={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                close();
              }
            }}
            placeholder="支付宝 / Apple Pay / Visa…"
            className="pl-8 pr-8"
            autoComplete="off"
          />
          <ChevronsUpDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 opacity-50" />
        </div>
      </PopoverAnchor>

      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-1"
        align="start"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="max-h-[248px] overflow-y-auto">
          {usedMatches.length > 0 && (
            <section>
              <header className="px-2 pt-1 pb-1 text-[10px] font-medium tracking-[0.1em] text-muted-foreground/80 uppercase">
                已用过
              </header>
              {usedMatches.map(option)}
            </section>
          )}
          {commonMatches.length > 0 && (
            <section className={usedMatches.length > 0 ? 'mt-1 border-t border-border/70 pt-1' : ''}>
              <header className="px-2 pt-1 pb-1 text-[10px] font-medium tracking-[0.1em] text-muted-foreground/80 uppercase">
                常用
              </header>
              {commonMatches.map(option)}
            </section>
          )}
          {!hasResults && (
            <button
              type="button"
              onClick={close}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-muted-foreground hover:bg-muted"
            >
              <span className="min-w-0 flex-1 truncate">
                {value.trim() ? `使用「${value.trim()}」` : '直接输入自定义支付方式'}
              </span>
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function EmptyState({
  kicker,
  title,
  description,
  action,
  className,
}: {
  kicker?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-16 text-center',
        className,
      )}
    >
      {kicker && (
        <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
          {kicker}
        </p>
      )}
      <p className="mt-2.5 text-[15px] font-medium">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

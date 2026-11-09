import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
            {eyebrow}
          </p>
          <h1 className="mt-2 text-[23px] leading-tight font-semibold tracking-[-0.025em] sm:text-[26px]">
            {title}
          </h1>
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2 pt-4 sm:pt-5">{actions}</div>
        )}
      </div>
      {description && (
        <p className="max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
    </header>
  );
}

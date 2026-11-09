import { STATUS_COLORS } from '@/lib/category-colors';
import { useCategories } from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { CategoryId, StatusId } from '@shared/types';

const STATUS_LABELS: Record<StatusId, string> = {
  active: '活跃',
  paused: '暂停',
  cancelled: '已取消',
};

export function StatusDot({
  status,
  showLabel = true,
  className,
}: {
  status: StatusId;
  showLabel?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground',
        className,
      )}
    >
      <span
        className="size-[6px] shrink-0 rounded-full"
        style={{ backgroundColor: STATUS_COLORS[status] }}
      />
      {showLabel && STATUS_LABELS[status]}
    </span>
  );
}

export function CategoryLabel({
  category,
  dot = true,
  className,
}: {
  category: CategoryId;
  dot?: boolean;
  className?: string;
}) {
  const { data } = useCategories();
  const item = data?.find((entry) => entry.slug === category);
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground', className)}
    >
      {dot && (
        <span
          className="size-[6px] shrink-0 rounded-full"
          style={{ backgroundColor: item?.color ?? '#8A8578' }}
        />
      )}
      {item?.label ?? category}
    </span>
  );
}

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreHorizontal, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Money, useBaseCurrency, useCurrencies } from '@/components/money';
import { ServiceIcon } from '@/components/service-icon';
import { CategoryLabel, StatusDot } from '@/components/status';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useSubscriptionDialog } from '@/components/subscription-dialog';
import { useCategories, useSubscriptionMutations, useSubscriptions } from '@/lib/queries';
import { subscriptionPayload } from '@/lib/subscription-payload';
import { cn, initialsOf } from '@/lib/utils';
import {
  cycleLabel,
  type CategoryId,
  type StatusId,
  type Subscription,
} from '@shared/types';
import { convertMinor, formatMonthDay, relativeDays } from '@shared/money';

type StatusFilter = 'all' | StatusId;

const SORTS = [
  { id: 'due', label: '按续费日' },
  { id: 'amount', label: '按金额' },
  { id: 'name', label: '按名称' },
  { id: 'added', label: '按添加时间' },
];

function RowMenu({
  sub,
  onEdit,
  onToggle,
  onDelete,
}: {
  sub: Subscription;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground opacity-70 transition-opacity hover:opacity-100"
          onClick={(event) => event.stopPropagation()}
          aria-label="更多操作"
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            onEdit();
          }}
        >
          <Pencil className="size-3.5" /> 编辑
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            onToggle();
          }}
        >
          {sub.status === 'active' ? '暂停订阅' : '恢复为活跃'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          destructive
          onSelect={(event) => {
            event.preventDefault();
            onDelete();
          }}
        >
          <Trash2 className="size-3.5" /> 删除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SubscriptionsPage() {
  const { data: all = [], isLoading } = useSubscriptions({});
  const { data: categories = [] } = useCategories();
  const base = useBaseCurrency();
  const currencies = useCurrencies();
  const { openCreate, openEdit } = useSubscriptionDialog();
  const navigate = useNavigate();
  const { update, remove } = useSubscriptionMutations();

  const [status, setStatus] = useState<StatusFilter>('all');
  const [category, setCategory] = useState<'all' | CategoryId>('all');
  const [sort, setSort] = useState('due');
  const [query, setQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Subscription | null>(null);

  const counts = useMemo(
    () => ({
      all: all.length,
      active: all.filter((s) => s.status === 'active').length,
      paused: all.filter((s) => s.status === 'paused').length,
      cancelled: all.filter((s) => s.status === 'cancelled').length,
    }),
    [all],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items = all.filter((sub) => {
      if (status !== 'all' && sub.status !== status) return false;
      if (category !== 'all' && sub.category !== category) return false;
      if (!q) return true;
      return [sub.name, sub.serviceName ?? '', sub.accountLabel ?? '', sub.notes ?? '']
        .join(' ')
        .toLowerCase()
        .includes(q);
    });

    items.sort((a, b) => {
      switch (sort) {
        case 'amount':
          return b.amountBaseMinor - a.amountBaseMinor;
        case 'name':
          return a.name.localeCompare(b.name, 'zh-CN');
        case 'added':
          return b.id - a.id;
        default: {
          if (!a.nextDue && !b.nextDue) return a.name.localeCompare(b.name, 'zh-CN');
          if (!a.nextDue) return 1;
          if (!b.nextDue) return -1;
          return a.nextDue.localeCompare(b.nextDue);
        }
      }
    });
    return items;
  }, [all, status, category, sort, query]);

  const dueSoonTotal = filtered
    .filter(
      (sub) =>
        sub.status === 'active' && sub.daysUntil !== null && sub.daysUntil >= 0 && sub.daysUntil <= 30,
    )
    .reduce(
      (sum, sub) => sum + convertMinor(sub.amountMinor, currencies.get(sub.currency) ?? base, base),
      0,
    );

  const toggleStatus = (sub: Subscription) => {
    update.mutate({
      id: sub.id,
      input: subscriptionPayload(sub, currencies, {
        status: sub.status === 'active' ? 'paused' : 'active',
      }),
    });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    remove.mutate(deleteTarget.id, { onSettled: () => setDeleteTarget(null) });
  };

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Subscriptions"
        title="订阅管理"
        description="维护每一项周期性支出；点击条目查看详情与真实扣费流水。"
        actions={
          <Button onClick={() => openCreate()} className="gap-1.5">
            <Plus className="size-4" />
            <span className="hidden sm:inline">新增订阅</span>
            <span className="sm:hidden">新增</span>
          </Button>
        }
      />

      <div className="mt-6 space-y-3.5">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索名称、账户或备注"
              className="pl-8"
              aria-label="搜索订阅"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="清空搜索"
                className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:flex sm:w-auto">
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as 'all' | CategoryId)}
            >
              <SelectTrigger className="sm:w-[132px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部分类</SelectItem>
                {categories.map((item) => (
                  <SelectItem key={item.slug} value={item.slug}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="sm:w-[132px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="scrollbar-none -mx-0.5 inline-flex items-center gap-0.5 overflow-x-auto rounded-md border border-border bg-card p-0.5">
            {(
              [
                ['all', '全部', counts.all],
                ['active', '活跃', counts.active],
                ['paused', '暂停', counts.paused],
                ['cancelled', '已取消', counts.cancelled],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                onClick={() => setStatus(id)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-[12px] transition-colors',
                  status === id
                    ? 'bg-secondary font-medium text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
                <span className="font-mono text-[10px] text-muted-foreground">{count}</span>
              </button>
            ))}
          </div>
          <p className="text-[11.5px] text-muted-foreground">
            {filtered.length} 项 · 30 天内待扣{' '}
            <Money minor={dueSoonTotal} code={base.code} className="text-foreground" />
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-5 space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse rounded-lg bg-muted/60" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          className="mt-6"
          kicker={all.length === 0 ? 'Empty' : 'No match'}
          title={all.length === 0 ? '还没有订阅记录' : '没有符合条件的订阅'}
          description={
            all.length === 0
              ? '添加第一项订阅，或从服务库中挑选常见服务。'
              : '试试调整状态、分类或搜索关键词。'
          }
          action={
            all.length === 0 ? (
              <Button onClick={() => openCreate()} className="gap-1.5">
                <Plus className="size-4" /> 新增订阅
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  setStatus('all');
                  setCategory('all');
                  setQuery('');
                }}
              >
                重置筛选
              </Button>
            )
          }
        />
      ) : (
        <>
          {/* 桌面表格 */}
          <div className="mt-5 hidden overflow-hidden rounded-lg border border-border bg-card xl:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {[
                    ['服务', ''],
                    ['分类', ''],
                    ['周期', ''],
                    ['下次续费', ''],
                    ['金额', 'text-right'],
                    ['上次扣费', 'text-right'],
                    ['状态', ''],
                    ['', 'text-right'],
                  ].map(([label, align], index) => (
                    <th
                      key={`${label}-${index}`}
                      className={cn(
                        'px-3 py-2.5 font-mono text-[9.5px] font-normal tracking-[0.14em] whitespace-nowrap text-muted-foreground uppercase first:pl-4',
                        align,
                      )}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((sub) => (
                  <tr
                    key={sub.id}
                    onClick={() => navigate(`/subscriptions/${sub.id}`)}
                    className="group cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-3 py-2.5 pl-4">
                      <div className="flex items-center gap-2.5">
                        <ServiceIcon
                          icon={sub.icon}
                          size={30}
                          fallbackLabel={initialsOf(sub.name)}
                        />
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-medium">{sub.name}</div>
                          <div className="mt-0.5 max-w-[240px] truncate text-[10.5px] text-muted-foreground">
                            {sub.serviceName ??
                              categories.find((entry) => entry.slug === sub.category)?.label ??
                              sub.category}
                            {sub.accountLabel ? ` · ${sub.accountLabel}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <CategoryLabel category={sub.category} />
                    </td>
                    <td className="px-3 py-2.5 text-[12px] whitespace-nowrap text-muted-foreground">
                      {cycleLabel(sub.cycle, sub.cycleDays)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="font-mono text-[12px]">
                        {formatMonthDay(sub.nextDue)}
                      </div>
                      <div className="mt-0.5 text-[10.5px] text-muted-foreground">
                        {relativeDays(sub.daysUntil)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <Money minor={sub.amountMinor} code={sub.currency} className="text-[12.5px]" />
                      <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                        {sub.currency}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <div className="font-mono text-[12px] text-foreground/80">
                        {formatMonthDay(sub.lastPaidOn)}
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {sub.lastPaidOn ? '已入账' : '无流水'}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <StatusDot status={sub.status} />
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <RowMenu
                        sub={sub}
                        onEdit={() => openEdit(sub)}
                        onToggle={() => toggleStatus(sub)}
                        onDelete={() => setDeleteTarget(sub)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 移动 / 平板卡片 */}
          <div className="mt-5 grid gap-2.5 sm:grid-cols-2 xl:hidden">
            {filtered.map((sub) => (
              <div
                key={sub.id}
                onClick={() => navigate(`/subscriptions/${sub.id}`)}
                className="group cursor-pointer rounded-lg border border-border bg-card p-3.5 transition-colors hover:bg-muted/30 active:bg-muted/50"
              >
                <div className="flex items-start gap-3">
                  <ServiceIcon icon={sub.icon} size={34} fallbackLabel={initialsOf(sub.name)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13.5px] font-medium">{sub.name}</span>
                      <Money
                        minor={sub.amountMinor}
                        code={sub.currency}
                        className="shrink-0 text-[13px]"
                      />
                    </div>
                    <div className="mt-1 flex items-baseline justify-between gap-2 text-[10.5px] text-muted-foreground">
                      <span className="truncate">
                        {sub.serviceName ??
                          categories.find((entry) => entry.slug === sub.category)?.label ??
                          sub.category}{' '}
                        ·{' '}
                        {cycleLabel(sub.cycle, sub.cycleDays)}
                      </span>
                      <span className="shrink-0 font-mono">{sub.currency}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5">
                  <div className="flex items-center gap-2.5">
                    <StatusDot status={sub.status} />
                    <span className="h-2.5 w-px bg-border" />
                    <span className="text-[10.5px] text-muted-foreground">
                      下次 {formatMonthDay(sub.nextDue)} · {relativeDays(sub.daysUntil)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-[10.5px] text-muted-foreground">
                      上次 {formatMonthDay(sub.lastPaidOn)}
                    </span>
                    <RowMenu
                      sub={sub}
                      onEdit={() => openEdit(sub)}
                      onToggle={() => toggleStatus(sub)}
                      onDelete={() => setDeleteTarget(sub)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除「{deleteTarget?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              该记录会从统计中移除，操作不可撤销。如需暂时剔除，可改为「暂停」。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default SubscriptionsPage;

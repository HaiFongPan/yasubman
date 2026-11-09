import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Plus } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Money, useBaseCurrency } from '@/components/money';
import { ServiceIcon } from '@/components/service-icon';
import { CategoryLabel } from '@/components/status';
import { Button } from '@/components/ui/button';
import { useSubscriptionDialog } from '@/components/subscription-dialog';
import { useStats } from '@/lib/queries';
import { type UpcomingItem } from '@shared/types';
import { formatMoney, formatMonthDay, relativeDays } from '@shared/money';
import { initialsOf } from '@/lib/utils';

function SectionHead({
  title,
  meta,
  action,
}: {
  title: string;
  meta?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="flex items-baseline gap-2.5">
        <h2 className="text-[13.5px] font-semibold tracking-[-0.01em]">{title}</h2>
        {meta && (
          <span className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            {meta}
          </span>
        )}
      </div>
      {action}
    </div>
  );
}

function UpcomingRow({
  item,
  base,
  onClick,
}: {
  item: UpcomingItem;
  base: string;
  onClick?: () => void;
}) {
  return (
    <li
      onClick={onClick}
      className={
        onClick
          ? 'flex cursor-pointer items-center gap-3 py-2.5 transition-colors hover:bg-muted/40'
          : 'flex items-center gap-3 py-2.5'
      }
    >
      <div className="w-[46px] shrink-0">
        <div className="font-mono text-[11.5px] leading-none text-foreground/80">
          {formatMonthDay(item.date)}
        </div>
        <div className="mt-1 font-mono text-[9.5px] text-muted-foreground">
          {relativeDays(item.daysUntil)}
        </div>
      </div>
      <ServiceIcon icon={item.icon} size={30} fallbackLabel={initialsOf(item.name)} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium">{item.name}</div>
        <div className="mt-0.5">
          <CategoryLabel category={item.category} className="text-[10.5px]" />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <Money minor={item.amountMinor} code={item.currency} className="text-[13px]" />
        {item.currency !== base && (
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            <Money minor={item.amountBaseMinor} code={base} />
          </div>
        )}
      </div>
    </li>
  );
}

function BreakdownBar({
  label,
  color,
  amountMinor,
  share,
  base,
}: {
  label: string;
  color: string;
  amountMinor: number;
  share: number;
  base: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <span className="size-[6px] shrink-0 rounded-full" style={{ backgroundColor: color }} />
          {label}
        </span>
        <div className="flex items-baseline gap-2">
          <Money minor={amountMinor} code={base} className="text-[12px] text-foreground/85" />
          <span className="w-8 text-right font-mono text-[10px] text-muted-foreground">
            {Math.round(share * 100)}%
          </span>
        </div>
      </div>
      <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-muted">
        <div
          className="h-full origin-left rounded-full"
          style={{
            width: `${Math.max(share * 100, amountMinor > 0 ? 2 : 0)}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-8">
      <div className="space-y-3">
        <div className="h-3 w-28 rounded bg-muted" />
        <div className="h-12 w-64 rounded bg-muted" />
        <div className="h-3 w-40 rounded bg-muted" />
      </div>
      <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3">
              <div className="h-7 w-11 rounded bg-muted" />
              <div className="size-[30px] rounded-[10px] bg-muted" />
              <div className="h-3 flex-1 rounded bg-muted" />
            </div>
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <div className="h-3 w-24 rounded bg-muted" />
              <div className="h-1 w-full rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function OverviewPage() {
  const { data: stats, isLoading, isError, refetch } = useStats();
  const base = useBaseCurrency();
  const { openCreate } = useSubscriptionDialog();
  const navigate = useNavigate();

  if (isLoading) return <Skeleton />;

  if (isError || !stats) {
    return (
      <EmptyState
        kicker="Error"
        title="统计数据加载失败"
        description="请确认服务已启动，然后重试。"
        action={<Button onClick={() => refetch()}>重新加载</Button>}
      />
    );
  }

  const hasSubscriptions = stats.activeCount > 0 || stats.pausedCount > 0;
  const hasPayments = stats.monthActualCount > 0;
  const categories = stats.byCategory.filter((row) => row.amountMinor > 0);

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Overview"
        title="订阅总览"
        actions={
          <Button onClick={() => openCreate()} className="gap-1.5">
            <Plus className="size-4" />
            <span className="hidden sm:inline">新增订阅</span>
            <span className="sm:hidden">新增</span>
          </Button>
        }
      />

      <section className="mt-7 border-b border-border pb-7">
        <div className="flex flex-col gap-7 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-[9.5px] tracking-[0.18em] text-muted-foreground uppercase">
              本月实际 · {stats.month}
            </p>
            <div className="mt-2.5 flex items-baseline">
              <span className="font-mono text-[38px] leading-none font-medium tracking-[-0.045em] tabular sm:text-[52px]">
                {formatMoney(stats.monthActualMinor, base)}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
              <span>{stats.monthActualCount} 笔已扣</span>
              <span className="h-3 w-px bg-border" />
              <span>
                {stats.activeCount} 项活跃
                {stats.pausedCount > 0 ? ` · ${stats.pausedCount} 项暂停` : ''}
                {stats.cancelledCount > 0 ? ` · ${stats.cancelledCount} 项已取消` : ''}
              </span>
            </div>
          </div>

          <div className="flex gap-8 sm:gap-10">
            <div>
              <p className="font-mono text-[9.5px] tracking-[0.16em] text-muted-foreground uppercase">
                下月预估
              </p>
              <p className="mt-1.5 font-mono text-[15px] tabular">
                {formatMoney(stats.nextMonthForecastMinor, base)}
              </p>
              <p className="mt-1 text-[10.5px] text-muted-foreground">
                {stats.nextMonthForecastCount} 笔待扣
              </p>
            </div>
            <div className="min-w-0">
              <p className="font-mono text-[9.5px] tracking-[0.16em] text-muted-foreground uppercase">
                下次扣费
              </p>
              <p className="mt-1.5 font-mono text-[15px] tabular">
                {stats.nextDue ? relativeDays(stats.nextDue.daysUntil) : '—'}
              </p>
              <p className="mt-1 max-w-[140px] truncate text-[10.5px] text-muted-foreground">
                {stats.nextDue ? stats.nextDue.name : '暂无安排'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {!hasSubscriptions ? (
        <EmptyState
          className="mt-10"
          kicker="Start here"
          title="还没有记录任何订阅"
          description="从内置的 AI、云服务、影音服务库一键添加，或手动录入任意周期性支出。每天凌晨会自动生成到期的扣费流水。"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => openCreate()} className="gap-1.5">
                <Plus className="size-4" /> 新增订阅
              </Button>
              <Button asChild variant="outline">
                <Link to="/catalog">浏览服务库</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <div className="mt-8 grid gap-9 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:gap-12">
          <section>
            <SectionHead
              title="近期扣费"
              meta="60 天内"
              action={
                <Link
                  to="/subscriptions"
                  className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  全部订阅 <ArrowRight className="size-3" />
                </Link>
              }
            />
            {stats.upcoming.length === 0 ? (
              <p className="mt-4 border-y border-border py-6 text-[12.5px] text-muted-foreground">
                未来 60 天内没有需要扣费的项目。
              </p>
            ) : (
              <>
                <ul className="mt-3 divide-y divide-border/70 border-y border-border">
                  {stats.upcoming.slice(0, 7).map((item) => (
                    <UpcomingRow
                      key={`${item.subscriptionId}-${item.date}`}
                      item={item}
                      base={base.code}
                      onClick={() => navigate(`/subscriptions/${item.subscriptionId}`)}
                    />
                  ))}
                </ul>
                {stats.upcoming.length > 7 && (
                  <Link
                    to="/subscriptions"
                    className="mt-3 inline-block text-[11.5px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    另有 {stats.upcoming.length - 7} 笔扣费
                  </Link>
                )}
              </>
            )}
            <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
              每天凌晨自动结算到期扣费并写入流水；实际未扣可在订阅详情里删除该笔。
            </p>
          </section>

          <div className="space-y-8">
            <section>
              <SectionHead title="分类构成" meta="本月实际" />
              {hasPayments && categories.length > 0 ? (
                <div className="mt-4 space-y-3.5">
                  {categories.map((row) => (
                    <BreakdownBar
                      key={row.category}
                      label={row.label}
                      color={row.color}
                      amountMinor={row.amountMinor}
                      share={stats.monthActualMinor ? row.amountMinor / stats.monthActualMinor : 0}
                      base={base.code}
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-4 border-y border-border py-5 text-[11.5px] text-muted-foreground">
                  本月还没有流水。可在订阅详情里补录历史扣费，或等下次自动结算。
                </p>
              )}
            </section>

            {stats.byCurrency.length > 0 && (
              <section>
                <SectionHead title="币种" meta="本月实际" />
                <ul className="mt-3 divide-y divide-border/70 border-y border-border">
                  {stats.byCurrency.map((row) => (
                    <li key={row.code} className="flex items-baseline justify-between gap-3 py-2.5">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-[12px]">{row.code}</span>
                        <span className="text-[10.5px] text-muted-foreground">
                          {row.count} 笔
                        </span>
                      </div>
                      <div className="text-right">
                        <Money
                          minor={row.nativeMinor}
                          code={row.code}
                          className="text-[12px]"
                        />
                        {row.code !== base.code && (
                          <div className="mt-0.5 text-[10px] text-muted-foreground">
                            折合 <Money minor={row.baseMinor} code={base.code} />
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/settings"
                  className="mt-3 inline-block text-[11px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  调整汇率锚点（1 USD 基准）
                </Link>
              </section>
            )}
          </div>
        </div>
      )}

      <footer className="mt-12 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-[10.5px] text-muted-foreground">
        <span>基准币种 {base.code} · 数据存储在本地 SQLite</span>
        <span className="font-mono">流水 {stats.monthActualCount} 笔 · 活跃 {stats.activeCount}</span>
      </footer>
    </div>
  );
}

export default OverviewPage;

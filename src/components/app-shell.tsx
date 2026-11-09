import { NavLink, Outlet } from 'react-router-dom';
import {
  ChartColumn,
  LayoutDashboard,
  Plus,
  ReceiptText,
  Settings2,
  Shapes,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/money';
import { ThemeToggle } from '@/components/theme-toggle';
import { useStats } from '@/lib/queries';
import { useSubscriptionDialog } from '@/components/subscription-dialog';
import { useDemoMode } from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

const NAV: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/', label: '总览', icon: LayoutDashboard },
  { to: '/subscriptions', label: '订阅', icon: ReceiptText },
  { to: '/stats', label: '统计', icon: ChartColumn },
  { to: '/catalog', label: '服务库', icon: Shapes },
  { to: '/settings', label: '设置', icon: Settings2 },
];

function DemoBadge() {
  if (!useDemoMode()) return null;
  return (
    <span
      title="演示部署：数据为只读示例，写操作已禁用"
      className="ml-1 rounded-[4px] border border-border bg-muted px-1.5 py-0.5 font-mono text-[9px] tracking-[0.1em] text-muted-foreground uppercase"
    >
      demo
    </span>
  );
}

function Brand({ variant = 'full' }: { variant?: 'full' | 'mark' }) {
  const mark = (
    <span className="grid size-7 shrink-0 place-items-center rounded-[8px] bg-foreground text-background">
      <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path
          d="M2.25 4.1h9.5M2.25 7h9.5M2.25 9.9h5.5"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );

  if (variant === 'mark') return mark;

  return (
    <div className="flex items-center gap-2.5">
      {mark}
      <div className="min-w-0">
        <div className="text-[13.5px] leading-none font-semibold tracking-[-0.01em]">
          yasubman
        </div>
        <div className="mt-1 font-mono text-[9px] tracking-[0.18em] text-muted-foreground uppercase">
          订阅台账
        </div>
      </div>
      <DemoBadge />
    </div>
  );
}

function SidebarFooter() {
  const { data } = useStats();
  return (
    <div className="px-2 pb-3 xl:px-3.5">
      <div className="hidden rounded-lg border border-border bg-card/70 p-3 xl:block">
        <div className="font-mono text-[9.5px] tracking-[0.16em] text-muted-foreground uppercase">
          本月实际
        </div>
        <div className="mt-1.5 text-[15px] leading-none font-medium">
          {data ? (
            <Money minor={data.monthActualMinor} code={data.baseCurrency} className="text-[15px]" />
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
        <div className="mt-1.5 text-[11px] text-muted-foreground">
          {data ? `${data.monthActualCount} 笔流水 · ${data.activeCount} 项活跃` : '加载中'}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-center xl:justify-between xl:px-0.5">
        <span className="hidden font-mono text-[9.5px] tracking-[0.12em] text-muted-foreground uppercase xl:inline">
          {data?.baseCurrency ?? 'CNY'} 基准
        </span>
        <ThemeToggle />
      </div>
    </div>
  );
}

export function AppShell() {
  const { openCreate } = useSubscriptionDialog();

  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[76px] flex-col border-r border-border bg-background md:flex xl:w-[244px]">
        <div className="flex h-16 items-center justify-center xl:justify-start xl:px-4">
          <span className="xl:hidden">
            <Brand variant="mark" />
          </span>
          <span className="hidden xl:block">
            <Brand />
          </span>
        </div>

        <nav className="mt-1 flex flex-col gap-0.5 px-2 xl:px-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              title={item.label}
              className={({ isActive }) =>
                cn(
                  'relative flex h-9 items-center justify-center gap-2.5 rounded-md px-2.5 text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground xl:justify-start',
                  isActive && 'bg-secondary font-medium text-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className="size-[17px] shrink-0" strokeWidth={1.75} />
                  <span className="hidden xl:inline">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-4 px-2 xl:px-3">
          <Button
            onClick={() => openCreate()}
            variant="outline"
            className="w-full justify-center gap-1.5 border-dashed text-muted-foreground hover:text-foreground xl:justify-start"
            title="新增订阅"
          >
            <Plus className="size-4" />
            <span className="hidden xl:inline">新增订阅</span>
          </Button>
        </div>

        <div className="mt-auto">
          <SidebarFooter />
        </div>
      </aside>

      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur-md md:hidden">
        <Brand />
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="新增订阅"
            onClick={() => openCreate()}
            className="text-muted-foreground"
          >
            <Plus className="size-[18px]" />
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <div className="md:pl-[76px] xl:pl-[244px]">
        <main className="mx-auto w-full max-w-[1140px] px-4 pt-5 pb-28 sm:px-6 md:px-8 md:pt-8 md:pb-16 lg:px-10 xl:pt-10">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="grid grid-cols-5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'relative flex flex-col items-center gap-1 py-2.5 text-[10px] transition-colors',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'absolute top-0 h-[2px] w-8 rounded-full bg-foreground transition-opacity',
                      isActive ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <item.icon className="size-[19px]" strokeWidth={1.7} />
                  <span className={cn(isActive && 'font-medium')}>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

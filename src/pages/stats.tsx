import { useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { Download, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Money, useBaseCurrency } from '@/components/money';
import { Receipt } from '@/components/receipt';
import { Button } from '@/components/ui/button';
import { useMonthStats, useMonthlyStats } from '@/lib/queries';
import { cn } from '@/lib/utils';

function lastMonths(count: number): string[] {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1) + index, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  });
}

export function StatsPage() {
  const { data: months = [], isLoading } = useMonthlyStats(12);
  const base = useBaseCurrency();
  const [selected, setSelected] = useState<string | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const keys = lastMonths(12);
  const series = keys.map((month) => {
    const row = months.find((item) => item.month === month);
    return { month, totalMinor: row?.totalMinor ?? 0, count: row?.count ?? 0 };
  });
  const latestWithData = [...series].reverse().find((row) => row.count > 0);
  const activeMonth = selected ?? latestWithData?.month ?? keys[keys.length - 1];
  const active = series.find((row) => row.month === activeMonth) ?? series[series.length - 1];
  const max = Math.max(...series.map((row) => row.totalMinor), 1);
  const total = series.reduce((sum, row) => sum + row.totalMinor, 0);

  const { data: detail, isLoading: detailLoading } = useMonthStats(activeMonth);

  const exportPng = async () => {
    if (!receiptRef.current) return;
    setExporting(true);
    try {
      await document.fonts.ready;
      const dataUrl = await toPng(receiptRef.current, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        cacheBust: true,
      });
      const link = document.createElement('a');
      link.download = `yasubman-${activeMonth}.png`;
      link.href = dataUrl;
      link.click();
      toast.success('收据图片已保存');
    } catch {
      toast.error('图片导出失败，可以改用打印');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Statistics"
        title="月度统计"
        description="按实际流水汇总每月支出；右侧可生成黑白收据，支持打印或保存为图片。"
      />

      {isLoading ? (
        <div className="mt-8 h-64 animate-pulse rounded-lg bg-muted/50" />
      ) : months.length === 0 ? (
        <EmptyState
          className="mt-10"
          kicker="No payments"
          title="还没有流水"
          description="订阅到期结算后会自动写入流水，也可以先在订阅详情里补录。"
        />
      ) : (
        <div className="mt-7 grid gap-9 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-12">
          <section>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[13.5px] font-semibold tracking-[-0.01em]">近 12 个月</h2>
              <span className="text-[11.5px] text-muted-foreground">
                合计 <Money minor={total} code={base.code} className="text-foreground" />
              </span>
            </div>

            <div className="mt-3 divide-y divide-border/70 border-y border-border">
              {series.map((row) => (
                <button
                  key={row.month}
                  type="button"
                  onClick={() => setSelected(row.month)}
                  className={cn(
                    'grid w-full grid-cols-[62px_minmax(0,1fr)_84px_46px] items-center gap-3 py-2.5 text-left transition-colors hover:bg-muted/40',
                    row.month === activeMonth && 'bg-muted/50',
                  )}
                >
                  <span
                    className={cn(
                      'font-mono text-[11.5px]',
                      row.month === activeMonth ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {row.month}
                  </span>
                  <span className="h-[3px] overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full origin-left rounded-full"
                      style={{
                        width: `${(row.totalMinor / max) * 100}%`,
                        backgroundColor:
                          row.month === activeMonth ? 'var(--foreground)' : 'var(--ring)',
                      }}
                    />
                  </span>
                  <Money
                    minor={row.totalMinor}
                    code={base.code}
                    className={cn(
                      'text-right text-[12px]',
                      row.month === activeMonth ? 'text-foreground' : 'text-foreground/70',
                    )}
                  />
                  <span className="text-right font-mono text-[10px] text-muted-foreground">
                    {row.count} 笔
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
              <span className="font-mono">{active.month}</span>
              <span className="h-3 w-px bg-border" />
              <span>
                {active.count} 笔 · 合计{' '}
                <Money minor={active.totalMinor} code={base.code} className="text-foreground" />
              </span>
            </div>
          </section>

          <section className="lg:w-[372px]">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[13.5px] font-semibold tracking-[-0.01em]">收据</h2>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => window.print()}
                  disabled={!detail}
                >
                  <Printer className="size-3.5" /> 打印
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={exportPng}
                  disabled={!detail || exporting}
                >
                  <Download className="size-3.5" />
                  {exporting ? '导出中…' : '保存图片'}
                </Button>
              </div>
            </div>

            <div className="mt-3 flex justify-center lg:justify-end">
              {detail && !detailLoading ? (
                <Receipt detail={detail} innerRef={receiptRef} />
              ) : (
                <div className="h-[420px] w-[372px] animate-pulse rounded-sm bg-muted/50" />
              )}
            </div>

            <p className="mt-3 text-right text-[10.5px] text-muted-foreground">
              收据按流水生成，金额为当时记账口径
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

export default StatsPage;

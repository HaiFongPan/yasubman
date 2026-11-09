import { useState } from 'react';
import {
  Download,
  Monitor,
  Moon,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Sun,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import {
  useCatalog,
  useCategories,
  useCategoryMutations,
  useSettings,
  useSettingsMutations,
  useSubscriptionMutations,
  useSubscriptions,
} from '@/lib/queries';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import type { Category, Currency } from '@shared/types';

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 border-b border-border py-7 first:pt-0 md:grid-cols-[220px_minmax(0,1fr)] md:gap-10">
      <div>
        <h2 className="text-[13.5px] font-semibold tracking-[-0.01em]">{title}</h2>
        {description && (
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

const PROVIDER_LABELS: Record<string, string> = {
  'open.er-api': 'ExchangeRate-API',
  frankfurter: 'Frankfurter（欧洲央行）',
  seed: '内置参考值',
  manual: '手动维护',
};

function formatRate(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: value >= 10 ? 3 : 4,
  }).format(value);
}

function formatMoment(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function RateRow({ currency, isBase }: { currency: Currency; isBase: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2.5 last:border-0">
      <div className="flex min-w-0 items-baseline gap-2.5">
        <span className="w-11 shrink-0 font-mono text-[12px]">{currency.code}</span>
        <span className="truncate text-[11.5px] text-muted-foreground">{currency.name}</span>
        {isBase && (
          <span className="shrink-0 rounded-full bg-brand-soft px-1.5 py-0.5 text-[9.5px] font-medium text-brand">
            基准
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-baseline gap-2 font-mono text-[12px]">
        <span className="tabular">{formatRate(currency.unitsPerUsd)}</span>
        <span className="w-9 text-[10.5px] text-muted-foreground">{currency.code}</span>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { data: settings } = useSettings();
  const { data: subscriptions = [] } = useSubscriptions({});
  const { data: catalog = [] } = useCatalog();
  const { data: categories = [] } = useCategories();
  const { setBase, syncRates } = useSettingsMutations();
  const { clear } = useSubscriptionMutations();
  const categoryMutations = useCategoryMutations();
  const { theme, setTheme } = useTheme();
  const [clearOpen, setClearOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryEditing, setCategoryEditing] = useState<Category | null>(null);
  const [categoryLabel, setCategoryLabel] = useState('');
  const [categoryColor, setCategoryColor] = useState('#8A8578');
  const [categoryDelete, setCategoryDelete] = useState<Category | null>(null);

  const openCategory = (category?: Category) => {
    setCategoryEditing(category ?? null);
    setCategoryLabel(category?.label ?? '');
    setCategoryColor(category?.color ?? '#8A8578');
    setCategoryOpen(true);
  };

  const saveCategory = () => {
    const payload = { label: categoryLabel.trim(), color: categoryColor };
    if (categoryEditing) {
      categoryMutations.update.mutate(
        { id: categoryEditing.id, input: payload },
        { onSuccess: () => setCategoryOpen(false) },
      );
    } else {
      categoryMutations.create.mutate(payload, {
        onSuccess: () => setCategoryOpen(false),
      });
    }
  };

  const currencies = settings?.currencies ?? [];
  const base = settings?.baseCurrency ?? 'CNY';
  const rates = settings?.rates;
  const rateStatus = rates?.status ?? 'never';
  const rateStatusLabel =
    rateStatus === 'ok'
      ? `已同步 ${formatMoment(rates?.updatedAt)}`
      : rateStatus === 'stale'
        ? `已过期 ${formatMoment(rates?.updatedAt)}`
        : rateStatus === 'error'
          ? `同步失败，沿用 ${formatMoment(rates?.updatedAt)}`
          : rateStatus === 'disabled'
            ? '自动同步已关闭'
            : '尚未同步，当前为内置参考汇率';
  const rateDotClass =
    rateStatus === 'ok'
      ? 'bg-brand'
      : rateStatus === 'error'
        ? 'bg-destructive'
        : rateStatus === 'stale'
          ? 'bg-[#C08A2E]'
          : 'bg-muted-foreground';

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Settings"
        title="设置"
        description="汇率自动同步、数据导出与本地存储。所有改动即时生效。"
      />

      <div className="mt-7">
        <Section
          title="基准币种"
          description="统计口径。所有订阅按汇率表折算为基准币种后汇总，不改变原始记录金额。"
        >
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={base}
              onValueChange={(value) => setBase.mutate(value)}
              disabled={setBase.isPending}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((currency) => (
                  <SelectItem key={currency.code} value={currency.code}>
                    {currency.code} · {currency.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-[11.5px] text-muted-foreground">
              当前 {subscriptions.length} 条订阅将按新基准重新折算
            </span>
          </div>
        </Section>

        <Section
          title="汇率"
          description="以 1 USD 为锚点，每日自动同步一次；失败时保留上一次结果，不影响统计可用性。"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
              <span className={cn('size-1.5 rounded-full', rateDotClass)} />
              <span className={rateStatus === 'error' ? 'text-destructive' : undefined}>
                {rateStatusLabel}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => syncRates.mutate()}
              disabled={syncRates.isPending || rateStatus === 'disabled'}
            >
              <RefreshCw className={cn('size-3.5', syncRates.isPending && 'animate-spin')} />
              {syncRates.isPending ? '同步中…' : '立即同步'}
            </Button>
          </div>

          {rateStatus === 'error' && rates?.error && (
            <p className="mt-2 rounded-md border border-destructive/25 bg-destructive/[0.04] px-3 py-2 text-[11px] leading-relaxed text-destructive">
              {rates.error}
            </p>
          )}

          <div className="mt-3 flex items-center justify-between border-b border-border pb-1.5 font-mono text-[9.5px] tracking-[0.12em] text-muted-foreground uppercase">
            <span>币种</span>
            <span>1 USD =</span>
          </div>
          <div className="-mb-2.5">
            {currencies.map((currency) => (
              <RateRow key={currency.code} currency={currency} isBase={currency.code === base} />
            ))}
          </div>

          <p className="mt-3 text-[10.5px] leading-relaxed text-muted-foreground">
            数据来源{' '}
            <a
              href={rates?.providerUrl ?? 'https://www.exchangerate-api.com'}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              {PROVIDER_LABELS[rates?.provider ?? 'seed'] ?? rates?.provider}
            </a>
            {rateStatus === 'ok' && rates?.nextUpdateAt
              ? `，下次更新 ${formatMoment(rates.nextUpdateAt)}`
              : ''}
            。离线部署可设置 <code className="font-mono">FX_PROVIDER=off</code> 保留当前值。
          </p>
        </Section>

        <Section
          title="分类"
          description="订阅与服务按分类归档；内置分类固定，自定义分类可改名、换色和删除。"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11.5px] text-muted-foreground">
              {categories.length} 个分类
            </span>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => openCategory()}
            >
              <Plus className="size-3.5" /> 新增分类
            </Button>
          </div>

          <div className="mt-1">
            {categories.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center justify-between gap-3 border-b border-border/60 py-2.5 last:border-0"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    <span className="truncate text-[12.5px]">{category.label}</span>
                    {category.isBuiltin && (
                      <span className="font-mono text-[9px] tracking-[0.1em] text-muted-foreground/70 uppercase">
                        内置
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-[10.5px] whitespace-nowrap text-muted-foreground">
                      {category.subscriptionCount} 订阅 · {category.serviceCount} 服务
                    </span>
                    {!category.isBuiltin && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="分类操作"
                            className="text-muted-foreground"
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => openCategory(category)}>
                            <Pencil className="size-3.5" /> 编辑
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            destructive
                            onSelect={() => setCategoryDelete(category)}
                          >
                            <Trash2 className="size-3.5" /> 删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
            ))}
          </div>
          {categories.length === 0 && (
            <p className="mt-2 text-[11.5px] text-muted-foreground">暂无分类</p>
          )}
        </Section>

        <Section
          title="数据导出"
          description="SQLite 为唯一数据源，导出文件可直接用于表格分析或备份。"
        >
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="gap-1.5">
              <a href="/api/export?format=csv" download>
                <Download className="size-3.5" /> 导出 CSV
              </a>
            </Button>
            <Button asChild variant="outline" className="gap-1.5">
              <a href="/api/export?format=payments-csv" download>
                <Download className="size-3.5" /> 导出流水 CSV
              </a>
            </Button>
            <Button asChild variant="outline" className="gap-1.5">
              <a href="/api/export?format=json" download>
                <Download className="size-3.5" /> 导出 JSON
              </a>
            </Button>
          </div>
          <ul className="mt-4 space-y-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
            <li>
              订阅 CSV：原始金额 + 下次扣费 / 上次扣费 + 单期折合（{base}）。
            </li>
            <li>流水 CSV：每笔实际扣费的日期、金额、折合基准币种与来源，适合做现金流透视。</li>
            <li>JSON：包含订阅、流水、服务目录、币种汇率与导出时间，适合完整备份。</li>
            <li className="font-mono">
              当前数据：{subscriptions.length} 条订阅 · {catalog.length} 个服务 ·{' '}
              {currencies.length} 种币种
            </li>
          </ul>
        </Section>

        <Section title="外观" description="跟随系统或手动固定。">
          <div className="inline-flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5">
            {(
              [
                ['light', '浅色', Sun],
                ['dark', '深色', Moon],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                className={cn(
                  'flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[12px] transition-colors',
                  theme === value
                    ? 'bg-secondary font-medium text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" /> {label}
              </button>
            ))}
            <span className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-muted-foreground">
              <Monitor className="size-3.5" /> 首次访问跟随系统
            </span>
          </div>
        </Section>

        <Section
          title="数据存储"
          description="数据保存在容器内的 SQLite 文件；部署时请挂载持久化卷。"
        >
          <dl className="space-y-2 text-[12px]">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <dt className="w-16 text-muted-foreground">数据文件</dt>
              <dd className="font-mono text-[11.5px] break-all">
                {settings?.storage?.path ?? 'data/yasubman.db'}
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3">
              <dt className="w-16 text-muted-foreground">备份建议</dt>
              <dd className="text-[11.5px] text-muted-foreground">
                复制该目录下的 .db 与 -wal 文件，或直接使用上方 JSON 导出。
              </dd>
            </div>
          </dl>
        </Section>

        <Section
          title="Agent 接入"
          description="内置 MCP 端点（Streamable HTTP，仅 POST），Agent 可查询、新增、修改、暂停与删除订阅。"
        >
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-md border border-border bg-muted/40 px-2.5 py-1.5 font-mono text-[11.5px]">
              {typeof window === 'undefined' ? '' : window.location.origin}/mcp
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard
                  .writeText(`${window.location.origin}/mcp`)
                  .then(() => toast.success('已复制 MCP 地址'))
                  .catch(() => toast.error('复制失败'));
              }}
            >
              复制
            </Button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            开启基础认证时需在请求头带 <code className="font-mono">Authorization: Basic …</code>
            ；工具清单见 README。
          </p>
        </Section>

        <Section title="危险操作">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/[0.03] px-4 py-3.5">
            <div>
              <div className="text-[12.5px] font-medium">清空所有订阅</div>
              <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                保留服务库与汇率设置，删除 {subscriptions.length} 条订阅记录。
              </div>
            </div>
            <Button variant="destructive" onClick={() => setClearOpen(true)}>
              清空数据
            </Button>
          </div>
        </Section>

        <footer className="flex flex-wrap items-center justify-between gap-2 py-6 text-[10.5px] text-muted-foreground">
          <span>yasubman · 订阅台账 v0.1.0</span>
          <span className="font-mono">SQLite · better-sqlite3</span>
        </footer>
      </div>

      <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{categoryEditing ? '编辑分类' : '新增分类'}</DialogTitle>
            <DialogDescription>分类用于订阅筛选与总览的分类构成统计。</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <span className="text-[12px] font-medium text-muted-foreground">名称</span>
              <Input
                value={categoryLabel}
                onChange={(event) => setCategoryLabel(event.target.value)}
                placeholder="例如 设计工具"
                maxLength={20}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <span className="text-[12px] font-medium text-muted-foreground">颜色</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={categoryColor}
                  onChange={(event) => setCategoryColor(event.target.value)}
                  className="size-9 cursor-pointer rounded-md border border-input bg-card p-1"
                  aria-label="选择颜色"
                />
                <Input
                  value={categoryColor}
                  onChange={(event) => setCategoryColor(event.target.value)}
                  className="w-28 font-mono uppercase"
                  maxLength={7}
                />
                <div className="flex gap-1.5">
                  {['#6C63C7', '#3D7EA6', '#C2553F', '#B08A2E', '#4B7F6B', '#8A8578'].map(
                    (preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setCategoryColor(preset)}
                        aria-label={`使用颜色 ${preset}`}
                        className="size-5 rounded-full ring-1 ring-black/10 transition-transform hover:scale-110"
                        style={{ backgroundColor: preset }}
                      />
                    ),
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/25 px-3 py-2">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: categoryColor }}
              />
              <span className="text-[12.5px]">{categoryLabel.trim() || '分类预览'}</span>
            </div>
          </DialogBody>
          <DialogFooter>
            <div />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCategoryOpen(false)}>
                取消
              </Button>
              <Button
                onClick={saveCategory}
                disabled={
                  !categoryLabel.trim() ||
                  categoryMutations.create.isPending ||
                  categoryMutations.update.isPending
                }
              >
                {categoryMutations.create.isPending || categoryMutations.update.isPending
                  ? '保存中…'
                  : '保存'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={categoryDelete !== null}
        onOpenChange={(open) => !open && setCategoryDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除分类「{categoryDelete?.label}」？</AlertDialogTitle>
            <AlertDialogDescription>
              {categoryDelete &&
              categoryDelete.subscriptionCount + categoryDelete.serviceCount > 0
                ? `该分类下有 ${categoryDelete.subscriptionCount} 条订阅、${categoryDelete.serviceCount} 个服务，删除后会归入「其他」。`
                : '该分类未被使用，删除后不可恢复。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!categoryDelete) return;
                const used =
                  categoryDelete.subscriptionCount + categoryDelete.serviceCount > 0;
                categoryMutations.remove.mutate(
                  { id: categoryDelete.id, reassign: used ? 'other' : undefined },
                  { onSettled: () => setCategoryDelete(null) },
                );
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清空全部订阅？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除 {subscriptions.length} 条订阅记录，服务库与汇率设置保留。建议先导出 JSON
              备份，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clear.mutate(undefined, { onSettled: () => setClearOpen(false) });
              }}
            >
              确认清空
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default SettingsPage;

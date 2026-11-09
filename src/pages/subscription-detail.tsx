import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { Money, useBaseCurrency, useCurrencies } from '@/components/money';
import { ServiceIcon } from '@/components/service-icon';
import { CategoryLabel, StatusDot } from '@/components/status';
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
import {
  usePaymentMutations,
  usePayments,
  useSubscription,
  useSubscriptionMutations,
} from '@/lib/queries';
import { subscriptionPayload } from '@/lib/subscription-payload';
import { cn, initialsOf } from '@/lib/utils';
import {
  cycleLabel,
  type Payment,
  type StatusId,
} from '@shared/types';
import { formatDate, formatShortDate, fromMinor, relativeDays } from '@shared/money';
import { todayISO } from '@shared/cycle';

const SOURCE_LABEL: Record<Payment['source'], string> = {
  auto: '自动',
  manual: '手动',
  backfill: '补录',
};

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[9.5px] tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1.5 truncate text-[13px]">{children}</dd>
    </div>
  );
}

export function SubscriptionDetailPage() {
  const { id } = useParams();
  const subscriptionId = Number(id);
  const navigate = useNavigate();
  const { data: sub, isLoading, isError } = useSubscription(subscriptionId);
  const { data: payments = [] } = usePayments(subscriptionId);
  const base = useBaseCurrency();
  const currencies = useCurrencies();
  const { openEdit } = useSubscriptionDialog();
  const { update, remove } = useSubscriptionMutations();
  const paymentMutations = usePaymentMutations(subscriptionId);

  const [addOpen, setAddOpen] = useState(false);
  const [paidOn, setPaidOn] = useState(todayISO());
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [deleteSubOpen, setDeleteSubOpen] = useState(false);
  const [deletePaymentTarget, setDeletePaymentTarget] = useState<Payment | null>(null);

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-lg bg-muted/50" />;
  }

  if (isError || !sub) {
    return (
      <EmptyState
        kicker="404"
        title="订阅不存在"
        description="可能已被删除。"
        action={
          <Button asChild variant="outline">
            <Link to="/subscriptions">返回订阅列表</Link>
          </Button>
        }
      />
    );
  }

  const exponent = currencies.get(sub.currency)?.exponent ?? 2;
  const toggleStatus = () => {
    const nextStatus: StatusId = sub.status === 'active' ? 'paused' : 'active';
    update.mutate({
      id: sub.id,
      input: subscriptionPayload(sub, currencies, { status: nextStatus }),
    });
  };

  const openAdd = () => {
    setPaidOn(todayISO());
    setAmount(String(fromMinor(sub.amountMinor, exponent)));
    setNote('');
    setAddOpen(true);
  };

  const submitPayment = () => {
    const value = Number(amount);
    if (!paidOn || !Number.isFinite(value) || value < 0) return;
    paymentMutations.add.mutate(
      { paidOn, amount: value, note: note.trim() || null },
      { onSuccess: () => setAddOpen(false) },
    );
  };

  const totalBase = payments.reduce((sum, payment) => sum + payment.amountBaseMinor, 0);

  return (
    <div className="animate-rise">
      <Link
        to="/subscriptions"
        className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> 订阅
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3.5">
          <ServiceIcon icon={sub.icon} size={52} fallbackLabel={initialsOf(sub.name)} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[22px] leading-tight font-semibold tracking-[-0.02em]">
                {sub.name}
              </h1>
              <StatusDot status={sub.status} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted-foreground">
              <span>{sub.serviceName ?? '自定义服务'}</span>
              <span className="h-2.5 w-px bg-border" />
              <CategoryLabel category={sub.category} />
              <span className="h-2.5 w-px bg-border" />
              <span className="font-mono">{sub.currency}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openEdit(sub)}>
            <Pencil className="size-3.5" /> 编辑
          </Button>
          <Button variant="outline" size="sm" onClick={toggleStatus}>
            {sub.status === 'active' ? '暂停' : '恢复'}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
            aria-label="删除订阅"
            onClick={() => setDeleteSubOpen(true)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-border py-5 sm:grid-cols-4">
        <Fact label="金额">
          <span className="font-mono">
            <Money minor={sub.amountMinor} code={sub.currency} />
          </span>
        </Fact>
        <Fact label="周期">{cycleLabel(sub.cycle, sub.cycleDays)}</Fact>
        <Fact label="下次扣费">
          {sub.nextDue ? (
            <span>
              <span className="font-mono">{formatShortDate(sub.nextDue)}</span>
              <span className="ml-2 text-[11px] text-muted-foreground">
                {relativeDays(sub.daysUntil)}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </Fact>
        <Fact label="上次扣费">
          {sub.lastPaidOn ? (
            <span className="font-mono">{formatShortDate(sub.lastPaidOn)}</span>
          ) : (
            <span className="text-muted-foreground">无流水</span>
          )}
        </Fact>
        <Fact label="首次扣费">
          <span className="font-mono">{formatDate(sub.anchorDate)}</span>
        </Fact>
        <Fact label="支付方式">{sub.paymentMethod ?? '—'}</Fact>
        <Fact label="账户">{sub.accountLabel ?? '—'}</Fact>
        <Fact label="提前提醒">{sub.remindDays} 天</Fact>
        {sub.website && (
          <div className="col-span-2 min-w-0 sm:col-span-4">
            <dt className="font-mono text-[9.5px] tracking-[0.14em] text-muted-foreground uppercase">
              网站
            </dt>
            <dd className="mt-1.5 truncate text-[12.5px]">
              <a
                href={sub.website}
                target="_blank"
                rel="noreferrer"
                className="underline-offset-4 hover:underline"
              >
                {sub.website}
              </a>
            </dd>
          </div>
        )}
        {sub.notes && (
          <div className="col-span-2 sm:col-span-4">
            <dt className="font-mono text-[9.5px] tracking-[0.14em] text-muted-foreground uppercase">
              备注
            </dt>
            <dd className="mt-1.5 text-[12.5px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
              {sub.notes}
            </dd>
          </div>
        )}
      </dl>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[13.5px] font-semibold tracking-[-0.01em]">扣费流水</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              共 {payments.length} 笔 · 合计{' '}
              <Money minor={totalBase} code={base.code} className="text-foreground" />
            </p>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={openAdd}>
            <Plus className="size-3.5" /> 补录流水
          </Button>
        </div>

        {payments.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-border px-4 py-10 text-center">
            <p className="text-[12.5px] font-medium">还没有流水</p>
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              每天凌晨会自动结算到期扣费；历史记录可以手动补录。
            </p>
          </div>
        ) : (
          <>
            <div className="mt-3 hidden overflow-hidden rounded-lg border border-border bg-card sm:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {['日期', '金额', '来源', '备注', ''].map((label, index) => (
                      <th
                        key={`${label}-${index}`}
                        className={cn(
                          'px-3 py-2 font-mono text-[9.5px] font-normal tracking-[0.14em] whitespace-nowrap text-muted-foreground uppercase first:pl-4',
                          (label === '金额' || index === 4) && 'text-right',
                        )}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr
                      key={payment.id}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="px-3 py-2.5 pl-4 font-mono text-[12px] whitespace-nowrap">
                        {formatDate(payment.paidOn)}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <Money
                          minor={payment.amountMinor}
                          code={payment.currency}
                          className="text-[12.5px]"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-[11.5px] whitespace-nowrap text-muted-foreground">
                        {SOURCE_LABEL[payment.source]}
                      </td>
                      <td className="max-w-[280px] truncate px-3 py-2.5 text-[11.5px] text-muted-foreground">
                        {payment.note ?? '—'}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="删除流水"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setDeletePaymentTarget(payment)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 space-y-2 sm:hidden">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[12px]">{formatDate(payment.paidOn)}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {SOURCE_LABEL[payment.source]}
                      </span>
                    </div>
                    {payment.note && (
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {payment.note}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Money minor={payment.amountMinor} code={payment.currency} className="text-[12.5px]" />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="删除流水"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setDeletePaymentTarget(payment)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>补录流水</DialogTitle>
            <DialogDescription>
              记录一笔已经发生的扣费；如晚于下次扣费日，排期会自动顺延。
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3.5">
            <div className="space-y-1.5">
              <span className="text-[12px] font-medium text-muted-foreground">日期</span>
              <Input
                type="date"
                value={paidOn}
                max={todayISO()}
                onChange={(event) => setPaidOn(event.target.value)}
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <span className="text-[12px] font-medium text-muted-foreground">金额</span>
              <div className="flex items-center gap-2">
                <Input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                  className="font-mono tabular"
                />
                <span className="w-10 font-mono text-[12px] text-muted-foreground">
                  {sub.currency}
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="text-[12px] font-medium text-muted-foreground">备注（可选）</span>
              <Input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="例如 首月优惠、补录 8 月账单"
                maxLength={200}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <div />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setAddOpen(false)}>
                取消
              </Button>
              <Button onClick={submitPayment} disabled={paymentMutations.add.isPending}>
                {paymentMutations.add.isPending ? '保存中…' : '保存'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deletePaymentTarget !== null}
        onOpenChange={(open) => !open && setDeletePaymentTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这笔流水？</AlertDialogTitle>
            <AlertDialogDescription>
              {deletePaymentTarget
                ? `${formatDate(deletePaymentTarget.paidOn)} 的这笔记录将被移除，统计随之更新；下次扣费日不变。`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deletePaymentTarget) return;
                paymentMutations.remove.mutate(deletePaymentTarget.id, {
                  onSettled: () => setDeletePaymentTarget(null),
                });
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteSubOpen} onOpenChange={setDeleteSubOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除「{sub.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              订阅和它的全部流水都会删除，不可撤销。只想停止扣费请改用「暂停」。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                remove.mutate(sub.id, { onSuccess: () => navigate('/subscriptions') })
              }
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default SubscriptionDetailPage;

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ServiceNamePicker } from '@/components/service-name-picker';
import { PaymentMethodPicker } from '@/components/payment-method-picker';
import { useBaseCurrency, useCurrencies } from '@/components/money';
import { useCatalog, useCategories, useSubscriptionMutations } from '@/lib/queries';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  CYCLE_IDS,
  CYCLES,
  type AppStoreResult,
  type CatalogItem,
  type CategoryId,
  type StatusId,
  type Subscription,
} from '@shared/types';
import { formatMoney, formatShortDate, fromMinor, relativeDays } from '@shared/money';
import { cycleLabel } from '@shared/types';
import { daysUntil, nextDueDate, todayISO } from '@shared/cycle';

const formSchema = z
  .object({
    name: z.string().trim().min(1, '请填写名称'),
    serviceId: z.number().int().positive().nullable(),
    category: z.string().min(1),
    amount: z
      .string()
      .trim()
      .min(1, '请填写金额')
      .refine((v) => !Number.isNaN(Number(v)) && Number(v) >= 0, '请输入有效金额'),
    currency: z.string().min(3),
    cycle: z.enum(CYCLE_IDS),
    cycleDays: z.string(),
    anchorDate: z.string().min(1, '请选择日期'),
    status: z.enum(['active', 'paused', 'cancelled']),
    autoRenew: z.boolean(),
    paymentMethod: z.string(),
    accountLabel: z.string(),
    website: z.string(),
    notes: z.string(),
    remindDays: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.cycle === 'custom') {
      const days = Number(value.cycleDays);
      if (!value.cycleDays || Number.isNaN(days) || days < 1) {
        ctx.addIssue({ code: 'custom', path: ['cycleDays'], message: '请填写间隔天数' });
      }
    }
    if (value.remindDays !== '') {
      const days = Number(value.remindDays);
      if (Number.isNaN(days) || days < 0) {
        ctx.addIssue({ code: 'custom', path: ['remindDays'], message: '需为不小于 0 的整数' });
      }
    }
  });

type FormValues = z.infer<typeof formSchema>;

export interface DialogPreset {
  serviceId?: number;
  name?: string;
  category?: CategoryId;
  website?: string | null;
}

interface DialogContextValue {
  openCreate: (preset?: DialogPreset) => void;
  openEdit: (subscription: Subscription) => void;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export function SubscriptionDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [preset, setPreset] = useState<DialogPreset | null>(null);

  const openCreate = useCallback((next?: DialogPreset) => {
    setEditing(null);
    setPreset(next ?? null);
    setOpen(true);
  }, []);

  const openEdit = useCallback((subscription: Subscription) => {
    setEditing(subscription);
    setPreset(null);
    setOpen(true);
  }, []);

  const value = useMemo(() => ({ openCreate, openEdit }), [openCreate, openEdit]);

  return (
    <DialogContext.Provider value={value}>
      {children}
      <SubscriptionDialog
        open={open}
        onOpenChange={setOpen}
        subscription={editing}
        preset={preset}
      />
    </DialogContext.Provider>
  );
}

export function useSubscriptionDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useSubscriptionDialog 必须在 SubscriptionDialogProvider 内使用');
  return ctx;
}

function defaultsFor(
  subscription: Subscription | null,
  preset: DialogPreset | null,
  currencies: Map<string, { exponent: number }>,
  baseCode: string,
): FormValues {
  if (subscription) {
    const exponent = currencies.get(subscription.currency)?.exponent ?? 2;
    return {
      name: subscription.name,
      serviceId: subscription.serviceId,
      category: subscription.category,
      amount: String(fromMinor(subscription.amountMinor, exponent)),
      currency: subscription.currency,
      cycle: subscription.cycle,
      cycleDays: subscription.cycleDays ? String(subscription.cycleDays) : '30',
      anchorDate: subscription.anchorDate,
      status: subscription.status,
      autoRenew: subscription.autoRenew,
      paymentMethod: subscription.paymentMethod ?? '',
      accountLabel: subscription.accountLabel ?? '',
      website: subscription.website ?? '',
      notes: subscription.notes ?? '',
      remindDays: String(subscription.remindDays),
    };
  }
  return {
    name: preset?.name ?? '',
    serviceId: preset?.serviceId ?? null,
    category: preset?.category ?? 'other',
    amount: '',
    currency: baseCode,
    cycle: 'monthly',
    cycleDays: '30',
    anchorDate: todayISO(),
    status: 'active',
    autoRenew: true,
    paymentMethod: '',
    accountLabel: '',
    website: preset?.website ?? '',
    notes: '',
    remindDays: '3',
  };
}

function Field({
  label,
  error,
  children,
  className,
  hint,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  className?: string;
  hint?: string;
}) {
  return (
    <div className={cn('min-w-0 space-y-1.5', className)}>
      <Label>{label}</Label>
      {children}
      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-muted-foreground/80">{hint}</p>
      ) : null}
    </div>
  );
}

function SubscriptionDialog({
  open,
  onOpenChange,
  subscription,
  preset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription: Subscription | null;
  preset: DialogPreset | null;
}) {
  const currencies = useCurrencies();
  const base = useBaseCurrency();
  const { data: catalog } = useCatalog();
  const { data: categories = [] } = useCategories();
  const { create, update } = useSubscriptionMutations();
  const queryClient = useQueryClient();
  const [pendingApp, setPendingApp] = useState<AppStoreResult | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultsFor(null, null, currencies, base.code),
  });
  const { register, handleSubmit, reset, watch, setValue, formState } = form;

  useEffect(() => {
    if (!open) return;
    // 只在打开或编辑目标变化时重置，避免后台刷新汇率打断输入
    reset(defaultsFor(subscription, preset, currencies, base.code));
    setPendingApp(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subscription, preset, reset]);

  const values = watch();
  const currencyMeta = currencies.get(values.currency) ?? base;
  const amountNumber = Number(values.amount);
  const singleAmountMinor = Math.round(
    (Number.isFinite(amountNumber) ? amountNumber : 0) * 10 ** currencyMeta.exponent,
  );
  const due = nextDueDate(
    values.anchorDate || todayISO(),
    values.cycle,
    values.cycle === 'custom' ? Number(values.cycleDays) || null : null,
  );

  const applyApp = (app: AppStoreResult) => {
    const existing = catalog?.find((item) => item.website === app.storeUrl);
    setPendingApp(app);
    setValue('serviceId', existing?.id ?? null);
    setValue('name', app.name);
    setValue('category', app.category);
    setValue('website', app.storeUrl);
  };

  const applyService = (item: CatalogItem) => {
    setPendingApp(null);
    setValue('serviceId', item.id);
    setValue('name', item.name);
    setValue('category', item.category);
    setValue('website', item.website ?? '');
  };

  /** 断开关联，只保留名称文本 */
  const clearLink = () => {
    setPendingApp(null);
    setValue('serviceId', null);
  };

  const onSubmit = handleSubmit(async (data) => {
    let serviceId = data.serviceId;
    if (pendingApp && !serviceId) {
      try {
        const created = await api.createCatalog({
          name: pendingApp.name,
          category: pendingApp.category,
          iconKind: 'image',
          iconData: pendingApp.iconUrl,
          color: '#6B7280',
          website: pendingApp.storeUrl,
        });
        serviceId = created.id;
        queryClient.invalidateQueries({ queryKey: ['catalog'] });
      } catch (error) {
        toast.error(
          `服务库保存失败：${error instanceof Error ? error.message : '未知错误'}`,
        );
        return;
      }
    }

    const payload = {
      name: data.name,
      serviceId,
      category: data.category,
      amount: Number(data.amount),
      currency: data.currency,
      cycle: data.cycle,
      cycleDays: data.cycle === 'custom' ? Number(data.cycleDays) : null,
      anchorDate: data.anchorDate,
      status: data.status,
      autoRenew: data.autoRenew,
      paymentMethod: data.paymentMethod || null,
      accountLabel: data.accountLabel || null,
      website: data.website || null,
      notes: data.notes || null,
      remindDays: Number(data.remindDays || 0),
    };

    try {
      if (subscription) {
        await update.mutateAsync({ id: subscription.id, input: payload });
      } else {
        await create.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch {
      /* 错误提示由 mutation 统一处理 */
    }
  });

  const pending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92dvh,880px)] flex-col gap-0 overflow-hidden sm:max-w-[600px]">
        <DialogHeader className="shrink-0">
          <DialogTitle>{subscription ? '编辑订阅' : '新增订阅'}</DialogTitle>
          <DialogDescription>
            {subscription ? '修改后将立即计入统计。' : '记录一项周期性支出，金额会自动折算为月均。'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid min-h-0 flex-1 grid-cols-1 gap-3.5 overflow-y-auto sm:grid-cols-2">
            <Field
              label="服务 / 名称"
              error={formState.errors.name?.message}
              className="sm:col-span-2"
            >
              <ServiceNamePicker
                name={values.name}
                serviceId={values.serviceId}
                app={pendingApp}
                onNameChange={(value) => setValue('name', value)}
                onPickService={applyService}
                onPickApp={applyApp}
                onClearLink={clearLink}
              />
            </Field>

            <Field label="金额" error={formState.errors.amount?.message}>
              <div className="flex">
                <Input
                  {...register('amount')}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="rounded-r-none border-r-0 font-mono tabular"
                />
                <Select
                  value={values.currency}
                  onValueChange={(value) => setValue('currency', value)}
                >
                  <SelectTrigger className="w-[108px] shrink-0 rounded-l-none bg-muted/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[...currencies.values()].map((currency) => (
                      <SelectItem key={currency.code} value={currency.code}>
                        {currency.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Field>

            <Field label="计费周期">
              <Select
                value={values.cycle}
                onValueChange={(value) => setValue('cycle', value as FormValues['cycle'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CYCLES.map((cycle) => (
                    <SelectItem key={cycle.id} value={cycle.id}>
                      {cycle.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {values.cycle === 'custom' && (
              <Field label="间隔天数" error={formState.errors.cycleDays?.message}>
                <Input
                  {...register('cycleDays')}
                  inputMode="numeric"
                  placeholder="30"
                  className="font-mono tabular"
                />
              </Field>
            )}

            <Field label="首次扣费日" error={formState.errors.anchorDate?.message}>
              <Input {...register('anchorDate')} type="date" className="font-mono" />
            </Field>

            <Field label="状态">
              <Select
                value={values.status}
                onValueChange={(value) => setValue('status', value as StatusId)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">活跃</SelectItem>
                  <SelectItem value="paused">暂停</SelectItem>
                  <SelectItem value="cancelled">已取消</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="分类">
              <Select
                value={values.category}
                onValueChange={(value) => setValue('category', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((item) => (
                    <SelectItem key={item.slug} value={item.slug}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="提前提醒"
              hint="仅作为记录字段，配合续费日历人工核对。"
              error={formState.errors.remindDays?.message}
            >
              <div className="relative">
                <Input
                  {...register('remindDays')}
                  inputMode="numeric"
                  className="pr-9 font-mono tabular"
                />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[11px] text-muted-foreground">
                  天
                </span>
              </div>
            </Field>

            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/25 px-3 py-2.5 sm:col-span-2">
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium">自动续费</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  关闭后仍会计入统计，仅作为标记。
                </div>
              </div>
              <Switch
                checked={values.autoRenew}
                onCheckedChange={(checked) => setValue('autoRenew', checked)}
              />
            </div>

            <Field label="支付方式">
              <PaymentMethodPicker
                value={values.paymentMethod}
                onChange={(value) => setValue('paymentMethod', value)}
              />
            </Field>

            <Field label="账户">
              <Input {...register('accountLabel')} placeholder="邮箱或账号备注" />
            </Field>

            <Field label="网站" className="sm:col-span-2">
              <Input {...register('website')} placeholder="https://" inputMode="url" />
            </Field>

            <Field label="备注" className="sm:col-span-2">
              <Textarea {...register('notes')} rows={2} placeholder="计划、发票、取消方式…" />
            </Field>
          </DialogBody>

          <DialogFooter className="flex shrink-0 flex-col gap-3 bg-popover sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-[11.5px] text-muted-foreground">
              <div className="font-mono tabular">
                <span className="text-foreground">
                  {formatMoney(singleAmountMinor, currencyMeta)}
                </span>
                <span className="ml-1.5">/ {cycleLabel(values.cycle, Number(values.cycleDays))}</span>
              </div>
              <div className="mt-0.5">
                下次扣费 {due ? `${formatShortDate(due)}（${relativeDays(daysUntil(due))}）` : '—'}
              </div>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? '保存中…' : subscription ? '保存修改' : '添加订阅'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

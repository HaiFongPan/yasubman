import { z } from 'zod';
import { CYCLE_IDS } from './types';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional();

export const subscriptionInputSchema = z
  .object({
    name: z.string().trim().min(1, '请填写名称').max(80, '名称过长'),
    serviceId: z.number().int().positive().nullable().optional(),
    category: z.string().trim().min(1).max(40),
    /** 主单位金额，服务端按币种小数位换算为最小单位 */
    amount: z.number().min(0, '金额不能为负').max(100_000_000),
    currency: z.string().trim().length(3, '币种格式不正确').toUpperCase(),
    cycle: z.enum(CYCLE_IDS),
    cycleDays: z.number().int().min(1).max(3650).nullable().optional(),
    anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD'),
    status: z.enum(['active', 'paused', 'cancelled']),
    autoRenew: z.boolean().default(true),
    paymentMethod: optionalText(60),
    accountLabel: optionalText(120),
    website: optionalText(300),
    notes: optionalText(2000),
    remindDays: z.number().int().min(0).max(365).default(3),
  })
  .refine(
    (v) => v.cycle !== 'custom' || (v.cycleDays !== null && v.cycleDays !== undefined),
    { message: '自定义周期需要填写间隔天数', path: ['cycleDays'] },
  );

export type SubscriptionInput = z.infer<typeof subscriptionInputSchema>;

export const catalogInputSchema = z
  .object({
    name: z.string().trim().min(1, '请填写名称').max(60, '名称过长'),
    category: z.string().trim().min(1).max(40),
    iconKind: z.enum(['brand', 'initials', 'image']).default('initials'),
    iconData: z.string().trim().max(4000).nullable().optional(),
    color: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, '颜色需为 #RRGGBB')
      .default('#6B7280'),
    website: optionalText(300),
  })
  .superRefine((value, ctx) => {
    if (value.iconKind !== 'initials' && !value.iconData) {
      ctx.addIssue({ code: 'custom', path: ['iconData'], message: '缺少图标数据' });
    }
    if (value.iconKind === 'image' && value.iconData && !/^https:\/\//.test(value.iconData)) {
      ctx.addIssue({ code: 'custom', path: ['iconData'], message: '图片图标必须是 https 地址' });
    }
  });

export type CatalogInput = z.infer<typeof catalogInputSchema>;

export const paymentInputSchema = z.object({
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD'),
  /** 主单位金额；省略时使用订阅当前金额 */
  amount: z.number().min(0).max(100_000_000).optional(),
  currency: z.string().trim().length(3).toUpperCase().optional(),
  note: optionalText(200),
});

export type PaymentInput = z.infer<typeof paymentInputSchema>;

export const categoryInputSchema = z.object({
  label: z.string().trim().min(1, '请填写分类名称').max(20, '名称过长'),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, '颜色需为 #RRGGBB')
    .default('#8A8578'),
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const categoryUpdateSchema = z.object({
  label: z.string().trim().min(1).max(20).optional(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, '颜色需为 #RRGGBB')
    .optional(),
});

export const baseCurrencySchema = z.object({
  baseCurrency: z.string().trim().length(3).toUpperCase(),
});

export const currencyRateSchema = z.object({
  unitsPerUsd: z.number().positive('汇率必须大于 0').max(1_000_000),
});

export function zodMessage(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '参数'}: ${issue.message}`)
    .join('；');
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  HttpError,
  baseCurrency,
  createCatalog,
  createCategory,
  createSubscription,
  deleteCategory,
  deleteCatalog,
  deleteSubscription,
  addPayment,
  deletePayment,
  getStats,
  getSubscription,
  listCatalog,
  listCategories,
  listPayments,
  currencyMap,
  listSubscriptions,
  updateSubscription,
} from './domain';
import { searchAppStore } from './appstore';
import { ratesMeta, refreshRates } from './fx';
import { COMMON_PAYMENT_METHODS, CYCLE_IDS } from '../shared/types';
import type { Subscription } from '../shared/types';
import {
  catalogInputSchema,
  subscriptionInputSchema,
  zodMessage,
  type SubscriptionInput,
} from '../shared/validation';
import { fromMinor } from '../shared/money';
import { todayISO } from '../shared/cycle';

const VERSION = '0.1.0';

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(error: unknown) {
  const message =
    error instanceof HttpError || error instanceof Error ? error.message : '未知错误';
  const text =
    error && typeof error === 'object' && 'issues' in error
      ? zodMessage(error as never)
      : message;
  return { content: [{ type: 'text' as const, text: `Error: ${text}` }], isError: true };
}

function currencyExponent(code: string): number {
  return currencyMap().get(code)?.exponent ?? 2;
}

function presentSubscription(sub: Subscription) {
  const base = baseCurrency();
  return {
    id: sub.id,
    name: sub.name,
    service: sub.serviceName,
    serviceId: sub.serviceId,
    category: sub.category,
    status: sub.status,
    amount: fromMinor(sub.amountMinor, currencyExponent(sub.currency)),
    currency: sub.currency,
    cycle: sub.cycle,
    cycleDays: sub.cycleDays,
    anchorDate: sub.anchorDate,
    nextDue: sub.nextDue,
    daysUntil: sub.daysUntil,
    lastPaidOn: sub.lastPaidOn,
    amountBase: fromMinor(sub.amountBaseMinor, base.exponent),
    baseCurrency: base.code,
    autoRenew: sub.autoRenew,
    paymentMethod: sub.paymentMethod,
    account: sub.accountLabel,
    website: sub.website,
    notes: sub.notes,
    remindDays: sub.remindDays,
  };
}

function presentStats() {
  const stats = getStats();
  const base = baseCurrency();
  return {
    baseCurrency: base.code,
    month: stats.month,
    nextMonth: stats.nextMonth,
    monthActual: fromMinor(stats.monthActualMinor, base.exponent),
    monthActualCount: stats.monthActualCount,
    nextMonthForecast: fromMinor(stats.nextMonthForecastMinor, base.exponent),
    nextMonthForecastCount: stats.nextMonthForecastCount,
    activeCount: stats.activeCount,
    pausedCount: stats.pausedCount,
    cancelledCount: stats.cancelledCount,
    byCategory: stats.byCategory.map((row) => ({
      category: row.category,
      label: row.label,
      color: row.color,
      count: row.count,
      amount: fromMinor(row.amountMinor, base.exponent),
      share: stats.monthActualMinor
        ? Math.round((row.amountMinor / stats.monthActualMinor) * 1000) / 1000
        : 0,
    })),
    byCurrency: stats.byCurrency.map((row) => ({
      currency: row.code,
      count: row.count,
      nativeAmount: fromMinor(row.nativeMinor, currencyExponent(row.code)),
      baseAmount: fromMinor(row.baseMinor, base.exponent),
    })),
    upcoming: stats.upcoming.map((item) => ({
      subscriptionId: item.subscriptionId,
      name: item.name,
      date: item.date,
      daysUntil: item.daysUntil,
      amount: fromMinor(item.amountMinor, currencyExponent(item.currency)),
      currency: item.currency,
      amountBase: fromMinor(item.amountBaseMinor, base.exponent),
    })),
  };
}

function toInput(sub: Subscription): SubscriptionInput {
  return {
    name: sub.name,
    serviceId: sub.serviceId,
    category: sub.category,
    amount: fromMinor(sub.amountMinor, currencyExponent(sub.currency)),
    currency: sub.currency,
    cycle: sub.cycle,
    cycleDays: sub.cycleDays,
    anchorDate: sub.anchorDate,
    status: sub.status,
    autoRenew: sub.autoRenew,
    paymentMethod: sub.paymentMethod,
    accountLabel: sub.accountLabel,
    website: sub.website,
    notes: sub.notes,
    remindDays: sub.remindDays,
  };
}

const amountField = z
  .number()
  .min(0)
  .describe('金额，使用主单位（20 表示 US$20.00；JPY/KRW 等零小数位币种直接用整数）');
const dateField = z.string().describe('日期 YYYY-MM-DD，例如 2026-11-09');
const currencyField = z
  .string()
  .length(3)
  .describe('ISO 4217 币种代码，例如 USD / CNY / JPY；省略时使用基准币种');

const createInput = {
  name: z.string().min(1).describe('订阅名称，例如 "ChatGPT Plus"'),
  amount: amountField,
  currency: currencyField.optional(),
  cycle: z.enum(CYCLE_IDS).optional().describe('计费周期，默认 monthly'),
  cycleDays: z.number().int().min(1).optional().describe('cycle=custom 时的间隔天数'),
  anchorDate: dateField.optional().describe('首次扣费日；省略则使用今天'),
  category: z
    .string()
    .optional()
    .describe('分类 slug（见 list_categories），省略为 other'),
  status: z.enum(['active', 'paused', 'cancelled']).optional().describe('默认 active'),
  serviceId: z.number().int().positive().optional().describe('关联服务库中的服务 ID'),
  autoRenew: z.boolean().optional().describe('默认 true'),
  paymentMethod: z
    .string()
    .optional()
    .describe(`支付方式，常见值：${COMMON_PAYMENT_METHODS.join(' / ')}`),
  accountLabel: z.string().optional().describe('账户或邮箱备注'),
  website: z.string().optional(),
  notes: z.string().optional(),
  remindDays: z.number().int().min(0).optional().describe('提前提醒天数，默认 3'),
};

export function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: 'yasubman', version: VERSION },
    {
      instructions:
        'yasubman（yet another subscription manager，订阅台账）。金额以主单位表示，统计按基准币种折算。修改前先用 list_subscriptions / list_services 查询 ID；删除不可撤销。App Store 图标流程：search_app_store → create_service(iconKind="image", iconData=iconUrl, website=storeUrl) → create_subscription(serviceId=新建服务 ID)。',
    },
  );

  server.registerTool(
    'list_subscriptions',
    {
      title: '列出订阅',
      description:
        '列出订阅记录，可按状态、分类、关键词筛选并排序。返回金额、周期、下次续费与折合基准币种的月均/年化。',
      inputSchema: {
        status: z.enum(['all', 'active', 'paused', 'cancelled']).optional(),
        category: z.string().optional().describe('分类 slug'),
        q: z.string().optional().describe('匹配名称、服务、账户、备注'),
        sort: z.enum(['due', 'amount', 'name', 'added']).optional().describe('默认 due'),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      try {
        const items = listSubscriptions({
          status: args.status,
          category: args.category,
          q: args.q,
          sort: args.sort,
        });
        return ok(items.map(presentSubscription));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'get_subscription',
    {
      title: '读取单条订阅',
      description: '按 ID 读取一条订阅的完整字段。',
      inputSchema: { id: z.number().int().positive() },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      try {
        return ok(presentSubscription(getSubscription(id)));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'create_subscription',
    {
      title: '新增订阅',
      description:
        '创建一条订阅。金额用主单位；日期用 YYYY-MM-DD；未提供币种时使用基准币种，未提供周期时为 monthly。',
      inputSchema: createInput,
    },
    async (args) => {
      try {
        const input = subscriptionInputSchema.parse({
          name: args.name,
          amount: args.amount,
          currency: (args.currency ?? baseCurrency().code).toUpperCase(),
          cycle: args.cycle ?? 'monthly',
          cycleDays: args.cycleDays ?? null,
          anchorDate: args.anchorDate ?? todayISO(),
          category: args.category ?? 'other',
          status: args.status ?? 'active',
          serviceId: args.serviceId ?? null,
          autoRenew: args.autoRenew ?? true,
          paymentMethod: args.paymentMethod ?? null,
          accountLabel: args.accountLabel ?? null,
          website: args.website ?? null,
          notes: args.notes ?? null,
          remindDays: args.remindDays ?? 3,
        });
        return ok(presentSubscription(createSubscription(input)));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'update_subscription',
    {
      title: '修改订阅',
      description:
        '局部更新订阅：只传需要修改的字段，其余保持原值。金额用主单位，日期用 YYYY-MM-DD。',
      inputSchema: {
        id: z.number().int().positive(),
        name: z.string().min(1).optional(),
        amount: amountField.optional(),
        currency: currencyField.optional(),
        cycle: z.enum(CYCLE_IDS).optional(),
        cycleDays: z.number().int().min(1).nullable().optional(),
        anchorDate: dateField.optional(),
        category: z.string().optional().describe('分类 slug'),
        status: z.enum(['active', 'paused', 'cancelled']).optional(),
        serviceId: z.number().int().positive().nullable().optional(),
        autoRenew: z.boolean().optional(),
        paymentMethod: z
          .string()
          .nullable()
          .optional()
          .describe(`常见值：${COMMON_PAYMENT_METHODS.join(' / ')}`),
        accountLabel: z.string().nullable().optional(),
        website: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        remindDays: z.number().int().min(0).optional(),
      },
    },
    async (args) => {
      try {
        const { id, ...overrides } = args;
        const current = getSubscription(id);
        const provided = Object.fromEntries(
          Object.entries(overrides).filter(([, value]) => value !== undefined),
        );
        const input = subscriptionInputSchema.parse({ ...toInput(current), ...provided });
        return ok(presentSubscription(updateSubscription(id, input)));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'set_subscription_status',
    {
      title: '切换订阅状态',
      description: '快捷修改状态：active 活跃（计入统计与续费）、paused 暂停、cancelled 已取消。',
      inputSchema: {
        id: z.number().int().positive(),
        status: z.enum(['active', 'paused', 'cancelled']),
      },
    },
    async ({ id, status }) => {
      try {
        const current = getSubscription(id);
        const input = subscriptionInputSchema.parse({ ...toInput(current), status });
        return ok(presentSubscription(updateSubscription(id, input)));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'delete_subscription',
    {
      title: '删除订阅',
      description: '按 ID 永久删除一条订阅，不可撤销。需要暂时剔除请改用 set_subscription_status(paused)。',
      inputSchema: { id: z.number().int().positive() },
      annotations: { destructiveHint: true },
    },
    async ({ id }) => {
      try {
        deleteSubscription(id);
        return ok({ deleted: true, id });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'list_payments',
    {
      title: '查询流水',
      description:
        '查询扣费流水（按日期倒序）。可按订阅 ID 过滤，返回金额、币种、记账时折合的基准币种金额与来源（auto/manual/backfill）。',
      inputSchema: {
        subscriptionId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(200).optional().describe('默认 50'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ subscriptionId, limit }) => {
      try {
        const base = baseCurrency();
        const rows = listPayments(subscriptionId)
          .slice(0, limit ?? 50)
          .map((payment) => ({
            id: payment.id,
            subscriptionId: payment.subscriptionId,
            paidOn: payment.paidOn,
            amount: fromMinor(payment.amountMinor, currencyExponent(payment.currency)),
            currency: payment.currency,
            amountBase: fromMinor(payment.amountBaseMinor, base.exponent),
            baseCurrency: payment.baseCurrency,
            source: payment.source,
            note: payment.note,
          }));
        return ok(rows);
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'add_payment',
    {
      title: '补录流水',
      description:
        '为订阅补录一笔历史扣费（日期不能晚于今天）。金额省略时使用订阅当前金额与币种；补录后下次扣费日会自动顺延。',
      inputSchema: {
        subscriptionId: z.number().int().positive(),
        paidOn: dateField,
        amount: amountField.optional(),
        currency: currencyField.optional(),
        note: z.string().max(200).optional(),
      },
    },
    async ({ subscriptionId, paidOn, amount, currency, note }) => {
      try {
        const payment = addPayment(subscriptionId, {
          paidOn,
          amount,
          currency,
          note: note ?? null,
        });
        return ok({
          id: payment.id,
          subscriptionId: payment.subscriptionId,
          paidOn: payment.paidOn,
          amount: fromMinor(payment.amountMinor, currencyExponent(payment.currency)),
          currency: payment.currency,
        });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'delete_payment',
    {
      title: '删除流水',
      description: '删除一笔流水（不影响下次扣费日）。',
      inputSchema: { id: z.number().int().positive() },
      annotations: { destructiveHint: true },
    },
    async ({ id }) => {
      try {
        deletePayment(id);
        return ok({ deleted: true, id });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'list_categories',
    {
      title: '列出分类',
      description: '返回全部分类（内置 + 自定义）及其使用数量，订阅的 category 字段使用 slug。',
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        return ok(
          listCategories().map((item) => ({
            id: item.id,
            slug: item.slug,
            label: item.label,
            color: item.color,
            isBuiltin: item.isBuiltin,
            subscriptionCount: item.subscriptionCount,
            serviceCount: item.serviceCount,
          })),
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'create_category',
    {
      title: '新增分类',
      description: '创建自定义分类，返回 slug；随后可在订阅或服务中引用。内置分类不可修改或删除。',
      inputSchema: {
        label: z.string().min(1).max(20).describe('分类名称，例如 "设计工具"'),
        color: z.string().optional().describe('#RRGGBB，默认 #8A8578'),
      },
    },
    async ({ label, color }) => {
      try {
        const item = createCategory({ label, color: color ?? '#8A8578' });
        return ok({ slug: item.slug, label: item.label, color: item.color });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'delete_category',
    {
      title: '删除自定义分类',
      description: '删除自定义分类（内置分类不可删除）。有订阅或服务使用时必须指定 reassign 目标 slug，默认建议 other。',
      inputSchema: {
        id: z.number().int().positive(),
        reassign: z.string().optional().describe('关联项转移到的分类 slug，例如 other'),
      },
      annotations: { destructiveHint: true },
    },
    async ({ id, reassign }) => {
      try {
        return ok(deleteCategory(id, reassign));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'list_services',
    {
      title: '列出服务库',
      description:
        '列出内置与自定义服务（含图标、分类、官网）。可按关键词或分类筛选，用于给订阅选择 serviceId。',
      inputSchema: {
        q: z.string().optional(),
        category: z.string().optional().describe('分类 slug'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ q, category }) => {
      try {
        let items = listCatalog();
        if (category) items = items.filter((item) => item.category === category);
        if (q) {
          const needle = q.trim().toLowerCase();
          items = items.filter((item) => item.name.toLowerCase().includes(needle));
        }
        return ok(
          items.map((item) => ({
            id: item.id,
            name: item.name,
            category: item.category,
            iconKind: item.iconKind,
            website: item.website,
            isBuiltin: item.isBuiltin,
          })),
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'create_service',
    {
      title: '新增自定义服务',
      description:
        '向服务库添加服务。iconKind 支持 initials（字母标记，iconData 为 1-3 个字符）、brand（内置品牌 SVG path）、image（https 图片地址）。App Store 导入时用 iconKind="image"、iconData=搜索结果里的 iconUrl、website=storeUrl。',
      inputSchema: {
        name: z.string().min(1),
        category: z.string().describe('分类 slug，见 list_categories'),
        iconKind: z.enum(['initials', 'brand', 'image']).optional().describe('默认 initials'),
        iconData: z.string().optional().describe('字母 / SVG path / https 图片地址'),
        color: z.string().optional().describe('#RRGGBB，默认 #6B7280'),
        website: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const input = catalogInputSchema.parse({
          name: args.name,
          category: args.category,
          iconKind: args.iconKind ?? 'initials',
          iconData: args.iconData ?? args.name.slice(0, 2),
          color: args.color ?? '#6B7280',
          website: args.website ?? null,
        });
        const item = createCatalog(input);
        return ok({ id: item.id, name: item.name, category: item.category, iconKind: item.iconKind });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'delete_service',
    {
      title: '删除自定义服务',
      description: '从服务库删除自定义服务（内置服务不可删除）。关联订阅会保留，但图标回退为字母。',
      inputSchema: { id: z.number().int().positive() },
      annotations: { destructiveHint: true },
    },
    async ({ id }) => {
      try {
        deleteCatalog(id);
        return ok({ deleted: true, id });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'search_app_store',
    {
      title: '搜索 App Store',
      description:
        '按关键词搜索 iOS App，返回名称、开发者、分类、512px 图标地址与 App Store 链接。挑选后用 create_service 存入服务库，再用 create_subscription 关联。只覆盖上架 iOS 的应用，不含订阅价格。',
      inputSchema: {
        term: z.string().min(2).describe('搜索词，例如 ChatGPT / Notion'),
        country: z
          .string()
          .length(2)
          .optional()
          .describe('两位国家代码，默认 us；中国区用 cn'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ term, country }) => {
      try {
        return ok(await searchAppStore(term, (country ?? 'us').toLowerCase()));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'get_stats',
    {
      title: '支出统计',
      description:
        '返回按基准币种折算的月均/年化支出、活跃与暂停数量、分类构成、币种敞口、60 天内续费时间线。',
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        return ok(presentStats());
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'refresh_rates',
    {
      title: '同步汇率',
      description: '立即从汇率服务拉取最新汇率并重算统计；失败时保留上一次结果。',
    },
    async () => {
      try {
        await refreshRates(true);
        return ok(ratesMeta());
      } catch (error) {
        return fail(error);
      }
    },
  );

  return server;
}

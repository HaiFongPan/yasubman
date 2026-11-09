/** 共享类型：客户端与服务端共用，避免字段漂移。 */

/** 内置分类：首次启动时写入 categories 表，之后可在设置中新增自定义分类。 */
export const DEFAULT_CATEGORIES = [
  { slug: 'ai', label: 'AI 服务', color: '#6C63C7' },
  { slug: 'cloud', label: '云与基础设施', color: '#3D7EA6' },
  { slug: 'media', label: '影音娱乐', color: '#C2553F' },
  { slug: 'productivity', label: '效率工具', color: '#B08A2E' },
  { slug: 'dev', label: '开发者工具', color: '#4B7F6B' },
  { slug: 'other', label: '其他', color: '#8A8578' },
] as const;

export interface Category {
  id: number;
  /** 稳定标识，订阅与服务通过它引用分类 */
  slug: string;
  label: string;
  color: string;
  sort: number;
  isBuiltin: boolean;
  subscriptionCount: number;
  serviceCount: number;
}

export type CategoryId = string;

export const STATUSES = [
  { id: 'active', label: '活跃' },
  { id: 'paused', label: '暂停' },
  { id: 'cancelled', label: '已取消' },
] as const;

export type StatusId = (typeof STATUSES)[number]['id'];

export const CYCLES = [
  { id: 'weekly', label: '每周', unit: '周' },
  { id: 'biweekly', label: '每两周', unit: '双周' },
  { id: 'monthly', label: '每月', unit: '月' },
  { id: 'quarterly', label: '每季度', unit: '季' },
  { id: 'semiannual', label: '每半年', unit: '半年' },
  { id: 'yearly', label: '每年', unit: '年' },
  { id: 'custom', label: '自定义周期', unit: '天' },
] as const;

export type CycleId = (typeof CYCLES)[number]['id'];
export const CYCLE_IDS = CYCLES.map((c) => c.id) as [CycleId, ...CycleId[]];

/**
 * 支付方式预置清单：仅作为输入提示，存储值仍是自由文本。
 * 前端下拉会把它与「本库已用过的值」合并展示。
 */
export const COMMON_PAYMENT_METHODS = [
  '支付宝',
  '微信支付',
  'Apple Pay',
  'Apple ID 余额',
  'Google Play',
  'PayPal',
  'Visa',
  'Mastercard',
  '银联',
  '银行转账',
  '公司报销',
] as const;

export function cycleLabel(id: string, cycleDays?: number | null): string {
  if (id === 'custom' && cycleDays) return `每 ${cycleDays} 天`;
  return CYCLES.find((c) => c.id === id)?.label ?? '每月';
}

export type IconKind = 'brand' | 'initials' | 'image';

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  exponent: number;
  /** 1 USD = unitsPerUsd 个该币种单位 */
  unitsPerUsd: number;
}

export interface CatalogItem {
  id: number;
  name: string;
  slug: string | null;
  category: CategoryId;
  iconKind: IconKind;
  iconData: string | null;
  color: string;
  website: string | null;
  isBuiltin: boolean;
}

export interface Subscription {
  id: number;
  name: string;
  serviceId: number | null;
  serviceName: string | null;
  category: CategoryId;
  /** 最小货币单位（分），整数存储，导出无损 */
  amountMinor: number;
  currency: string;
  cycle: CycleId;
  cycleDays: number | null;
  anchorDate: string;
  status: StatusId;
  autoRenew: boolean;
  paymentMethod: string | null;
  accountLabel: string | null;
  website: string | null;
  notes: string | null;
  remindDays: number;
  createdAt: string;
  updatedAt: string;
  /** 展示用：来自关联服务，缺省回退到订阅自身分类的默认图标 */
  icon: {
    kind: IconKind;
    data: string | null;
    color: string;
  };
  nextDue: string | null;
  daysUntil: number | null;
  /** 最近一次已生成流水的日期 */
  lastPaidOn: string | null;
  /** 单期金额折合基准币种（用于排序，不再年化） */
  amountBaseMinor: number;
}

export interface Payment {
  id: number;
  subscriptionId: number;
  paidOn: string;
  amountMinor: number;
  currency: string;
  /** 记账时按当时汇率折合的基准币种金额 */
  amountBaseMinor: number;
  baseCurrency: string;
  source: 'auto' | 'manual' | 'backfill';
  note: string | null;
  createdAt: string;
}

export interface UpcomingItem {
  subscriptionId: number;
  name: string;
  date: string;
  daysUntil: number;
  amountMinor: number;
  currency: string;
  amountBaseMinor: number;
  icon: { kind: IconKind; data: string | null; color: string };
  category: CategoryId;
}

export interface Stats {
  baseCurrency: string;
  /** 本月 YYYY-MM */
  month: string;
  /** 下月 YYYY-MM */
  nextMonth: string;
  /** 本月已发生流水（按记账时汇率） */
  monthActualMinor: number;
  monthActualCount: number;
  /** 下月按排期预估（按当前汇率） */
  nextMonthForecastMinor: number;
  nextMonthForecastCount: number;
  activeCount: number;
  pausedCount: number;
  cancelledCount: number;
  byCategory: {
    category: CategoryId;
    label: string;
    color: string;
    count: number;
    amountMinor: number;
  }[];
  byCurrency: {
    code: string;
    count: number;
    nativeMinor: number;
    baseMinor: number;
  }[];
  /** 未来 60 天按排期的扣费 */
  upcoming: UpcomingItem[];
  nextDue: UpcomingItem | null;
}

export interface RateMeta {
  provider: string;
  providerUrl: string | null;
  updatedAt: string | null;
  nextUpdateAt: string | null;
  status: 'ok' | 'error' | 'stale' | 'never' | 'disabled';
  error: string | null;
}

export interface SettingsPayload {
  baseCurrency: string;
  currencies: Currency[];
  storage: { path: string };
  rates: RateMeta;
}

export interface AppStoreResult {
  trackId: number;
  bundleId: string | null;
  name: string;
  seller: string;
  genre: string;
  iconUrl: string;
  storeUrl: string;
  category: CategoryId;
}

export interface MonthlyTotal {
  month: string;
  totalMinor: number;
  count: number;
}

export interface MonthItem {
  id: number;
  subscriptionId: number;
  paidOn: string;
  name: string;
  serviceName: string | null;
  category: CategoryId;
  amountMinor: number;
  currency: string;
  amountBaseMinor: number;
  source: Payment['source'];
  icon: Subscription['icon'];
}

export interface MonthDetail {
  month: string;
  baseCurrency: string;
  totalMinor: number;
  count: number;
  items: MonthItem[];
}

export interface ExportPayload {
  exportedAt: string;
  baseCurrency: string;
  subscriptions: Subscription[];
  payments: Payment[];
  catalog: CatalogItem[];
  currencies: Currency[];
  categories: Category[];
}

import { db } from './db';
import {
  type CatalogItem,
  type CategoryId,
  type Category,
  type Currency,
  type CycleId,
  type ExportPayload,
  type IconKind,
  type MonthDetail,
  type MonthItem,
  type MonthlyTotal,
  type Payment,
  type Stats,
  type StatusId,
  type Subscription,
  type UpcomingItem,
} from '../shared/types';
import { convertMinor, fromMinor } from '../shared/money';
import { advanceCycleDate, daysUntil, nextCycleAfter, nextDueDate, todayISO } from '../shared/cycle';
import { addDays, addMonths, endOfMonth, format, startOfMonth } from 'date-fns';
import type { PaymentInput, CatalogInput, SubscriptionInput } from '../shared/validation';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface SubRow {
  id: number;
  name: string;
  service_id: number | null;
  category: CategoryId;
  amount_minor: number;
  currency: string;
  cycle: CycleId;
  cycle_days: number | null;
  anchor_date: string;
  status: StatusId;
  next_due: string | null;
  paused_at: string | null;
  auto_renew: number;
  payment_method: string | null;
  account_label: string | null;
  website: string | null;
  notes: string | null;
  remind_days: number;
  created_at: string;
  updated_at: string;
  service_name: string | null;
  service_icon_kind: IconKind | null;
  service_icon_data: string | null;
  service_color: string | null;
  service_website: string | null;
}

interface CatalogRow {
  id: number;
  name: string;
  slug: string | null;
  category: CategoryId;
  icon_kind: IconKind;
  icon_data: string | null;
  color: string;
  website: string | null;
  is_builtin: number;
}

interface CurrencyRow {
  code: string;
  name: string;
  symbol: string;
  exponent: number;
  units_per_usd: number;
}

const SUB_SELECT = `
  SELECT s.*,
         c.name       AS service_name,
         c.icon_kind  AS service_icon_kind,
         c.icon_data  AS service_icon_data,
         c.color      AS service_color,
         c.website    AS service_website
  FROM subscriptions s
  LEFT JOIN service_catalog c ON c.id = s.service_id
`;

export function listCurrencies(): Currency[] {
  const rows = db
    .prepare('SELECT * FROM currencies ORDER BY sort ASC, code ASC')
    .all() as CurrencyRow[];
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    symbol: r.symbol,
    exponent: r.exponent,
    unitsPerUsd: r.units_per_usd,
  }));
}

export function currencyMap(): Map<string, Currency> {
  return new Map(listCurrencies().map((c) => [c.code, c]));
}

interface CategoryRow {
  id: number;
  slug: string;
  label: string;
  color: string;
  sort: number;
  is_builtin: number;
  subscription_count: number;
  service_count: number;
}

export function listCategories(): Category[] {
  const rows = db
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM subscriptions s WHERE s.category = c.slug) AS subscription_count,
        (SELECT COUNT(*) FROM service_catalog sc WHERE sc.category = c.slug) AS service_count
       FROM categories c
       ORDER BY c.sort ASC, c.id ASC`,
    )
    .all() as CategoryRow[];
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    label: row.label,
    color: row.color,
    sort: row.sort,
    isBuiltin: row.is_builtin === 1,
    subscriptionCount: row.subscription_count,
    serviceCount: row.service_count,
  }));
}

export function categoryLabelMap(): Map<string, string> {
  return new Map(listCategories().map((item) => [item.slug, item.label]));
}

export function assertCategory(slug: string) {
  const exists = db.prepare('SELECT 1 FROM categories WHERE slug = ?').get(slug);
  if (!exists) throw new HttpError(400, `未知分类「${slug}」`);
}

function uniqueCategorySlug(): string {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const slug = `c_${Math.random().toString(36).slice(2, 8)}`;
    const exists = db.prepare('SELECT 1 FROM categories WHERE slug = ?').get(slug);
    if (!exists) return slug;
  }
  throw new HttpError(500, '无法生成分类标识');
}

export function createCategory(input: { label: string; color: string }): Category {
  const total = db.prepare('SELECT COUNT(*) AS n FROM categories').get() as { n: number };
  if (total.n >= 40) throw new HttpError(400, '分类数量已达上限（40）');
  try {
    const result = db
      .prepare(
        `INSERT INTO categories (slug, label, color, sort, is_builtin, created_at)
         VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM categories), 0, ?)`,
      )
      .run(uniqueCategorySlug(), input.label, input.color, new Date().toISOString());
    return listCategories().find((item) => item.id === Number(result.lastInsertRowid))!;
  } catch (error) {
    if (String(error).includes('UNIQUE')) throw new HttpError(400, '分类名称已存在');
    throw error;
  }
}

export function updateCategory(
  id: number,
  input: { label?: string; color?: string },
): Category {
  const row = db
    .prepare('SELECT id, label, color, is_builtin FROM categories WHERE id = ?')
    .get(id) as { id: number; label: string; color: string; is_builtin: number } | undefined;
  if (!row) throw new HttpError(404, '分类不存在');
  if (row.is_builtin === 1) throw new HttpError(400, '内置分类不可修改');
  try {
    db.prepare('UPDATE categories SET label = ?, color = ? WHERE id = ?').run(
      input.label ?? row.label,
      input.color ?? row.color,
      id,
    );
  } catch (error) {
    if (String(error).includes('UNIQUE')) throw new HttpError(400, '分类名称已存在');
    throw error;
  }
  return listCategories().find((item) => item.id === id)!;
}

export function deleteCategory(id: number, reassign?: string): { reassigned: boolean } {
  const row = db
    .prepare('SELECT slug, is_builtin FROM categories WHERE id = ?')
    .get(id) as { slug: string; is_builtin: number } | undefined;
  if (!row) throw new HttpError(404, '分类不存在');
  if (row.is_builtin === 1) throw new HttpError(400, '内置分类不可删除');
  if (reassign === row.slug) throw new HttpError(400, '不能转移到自身');

  const subs = db
    .prepare('SELECT COUNT(*) AS n FROM subscriptions WHERE category = ?')
    .get(row.slug) as { n: number };
  const services = db
    .prepare('SELECT COUNT(*) AS n FROM service_catalog WHERE category = ?')
    .get(row.slug) as { n: number };

  if (subs.n + services.n > 0) {
    if (!reassign) {
      throw new HttpError(
        400,
        `仍有 ${subs.n} 条订阅、${services.n} 个服务使用该分类，请先转移或指定 reassign`,
      );
    }
    const target = db.prepare('SELECT 1 FROM categories WHERE slug = ?').get(reassign);
    if (!target) throw new HttpError(400, `目标分类「${reassign}」不存在`);
    db.transaction(() => {
      db.prepare('UPDATE subscriptions SET category = ? WHERE category = ?').run(
        reassign,
        row.slug,
      );
      db.prepare('UPDATE service_catalog SET category = ? WHERE category = ?').run(
        reassign,
        row.slug,
      );
      db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    })();
    return { reassigned: true };
  }

  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  return { reassigned: false };
}

export function baseCurrency(): Currency {
  const row = db
    .prepare(`SELECT value FROM settings WHERE key = 'base_currency'`)
    .get() as { value: string } | undefined;
  const map = currencyMap();
  const base = row ? map.get(row.value) : undefined;
  if (base) return base;
  const fallback = map.get('CNY') ?? map.get('USD');
  if (!fallback) throw new HttpError(500, '缺少币种配置');
  return fallback;
}

export function setBaseCurrency(code: string) {
  const map = currencyMap();
  if (!map.has(code)) throw new HttpError(400, `未知币种 ${code}`);
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('base_currency', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(code);
}

function categoryFallback(name: string): { kind: IconKind; data: string; color: string } {
  const initials = name.trim().slice(0, 2).toUpperCase();
  return { kind: 'initials', data: initials, color: '#8A8578' };
}

function mapSub(row: SubRow, currencies: Map<string, Currency>, base: Currency): Subscription {
  const from = currencies.get(row.currency) ?? base;
  const due = row.status === 'active' ? row.next_due : null;
  const lastPaid = db
    .prepare('SELECT paid_on FROM payments WHERE subscription_id = ? ORDER BY paid_on DESC LIMIT 1')
    .get(row.id) as { paid_on: string } | undefined;
  const icon = row.service_id
    ? {
        kind: row.service_icon_kind ?? 'initials',
        data: row.service_icon_data,
        color: row.service_color ?? '#6B7280',
      }
    : categoryFallback(row.name);

  return {
    id: row.id,
    name: row.name,
    serviceId: row.service_id,
    serviceName: row.service_name,
    category: row.category,
    amountMinor: row.amount_minor,
    currency: row.currency,
    cycle: row.cycle,
    cycleDays: row.cycle_days,
    anchorDate: row.anchor_date,
    status: row.status,
    autoRenew: row.auto_renew === 1,
    paymentMethod: row.payment_method,
    accountLabel: row.account_label,
    website: row.website ?? row.service_website ?? null,
    notes: row.notes,
    remindDays: row.remind_days,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    icon,
    nextDue: due,
    daysUntil: daysUntil(due),
    lastPaidOn: lastPaid?.paid_on ?? null,
    amountBaseMinor: convertMinor(row.amount_minor, from, base),
  };
}

export interface ListOptions {
  status?: string;
  category?: string;
  q?: string;
  sort?: string;
}

export function listSubscriptions(options: ListOptions = {}): Subscription[] {
  const rows = db.prepare(`${SUB_SELECT} ORDER BY s.id DESC`).all() as SubRow[];
  const base = baseCurrency();
  const currencies = currencyMap();
  let items = rows.map((r) => mapSub(r, currencies, base));

  if (options.status && options.status !== 'all') {
    items = items.filter((s) => s.status === options.status);
  }
  if (options.category && options.category !== 'all') {
    items = items.filter((s) => s.category === options.category);
  }
  if (options.q) {
    const q = options.q.trim().toLowerCase();
    items = items.filter((s) =>
      [s.name, s.serviceName ?? '', s.accountLabel ?? '', s.notes ?? '']
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }

  const sort = options.sort ?? 'due';
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
}

export function getSubscription(id: number): Subscription {
  const row = db.prepare(`${SUB_SELECT} WHERE s.id = ?`).get(id) as SubRow | undefined;
  if (!row) throw new HttpError(404, '订阅不存在');
  return mapSub(row, currencyMap(), baseCurrency());
}

function resolveService(serviceId: number | null | undefined) {
  if (!serviceId) return null;
  const service = db
    .prepare('SELECT id, category, website FROM service_catalog WHERE id = ?')
    .get(serviceId) as { id: number; category: CategoryId; website: string | null } | undefined;
  if (!service) throw new HttpError(400, '所选服务不存在');
  return service;
}

interface PaymentRow {
  id: number;
  subscription_id: number;
  paid_on: string;
  amount_minor: number;
  currency: string;
  rate_units_per_usd: number;
  base_minor: number;
  base_currency: string;
  source: 'auto' | 'manual' | 'backfill';
  note: string | null;
  created_at: string;
}

function latestPaymentDate(subscriptionId: number): string | null {
  const row = db
    .prepare('SELECT paid_on FROM payments WHERE subscription_id = ? ORDER BY paid_on DESC LIMIT 1')
    .get(subscriptionId) as { paid_on: string } | undefined;
  return row?.paid_on ?? null;
}

/**
 * 从最近一次流水（没有则从锚点）推进到「今天之后」的第一个周期，
 * 暂停/取消期间因此不会被计费。
 */
export function scheduleNext(
  subscriptionId: number,
  cycle: CycleId,
  cycleDays: number | null,
  anchorDate: string,
  from: Date = new Date(),
): string | null {
  if (cycle === 'custom' && (!cycleDays || cycleDays < 1)) return null;
  const last = latestPaymentDate(subscriptionId);
  const today = todayISO(from);
  if (!last) return nextDueDate(anchorDate, cycle, cycleDays, from);
  // 以锚点为准推进，避免 1/31 → 2/28 → 3/28 这种月末漂移
  const after = last > today ? last : today;
  return nextCycleAfter(anchorDate, cycle, cycleDays, after);
}

function mapPayment(
  row: PaymentRow,
  currencies: Map<string, Currency>,
  base: Currency,
): Payment {
  const storedBase = currencies.get(row.base_currency);
  const amountBaseMinor =
    storedBase && row.base_currency !== base.code
      ? convertMinor(row.base_minor, storedBase, base)
      : row.base_minor;
  return {
    id: row.id,
    subscriptionId: row.subscription_id,
    paidOn: row.paid_on,
    amountMinor: row.amount_minor,
    currency: row.currency,
    amountBaseMinor,
    baseCurrency: base.code,
    source: row.source,
    note: row.note,
    createdAt: row.created_at,
  };
}

export function listPayments(subscriptionId?: number): Payment[] {
  const rows = (
    subscriptionId
      ? db
          .prepare(
            'SELECT * FROM payments WHERE subscription_id = ? ORDER BY paid_on DESC, id DESC',
          )
          .all(subscriptionId)
      : db.prepare('SELECT * FROM payments ORDER BY paid_on DESC, id DESC').all()
  ) as PaymentRow[];
  const currencies = currencyMap();
  const base = baseCurrency();
  return rows.map((row) => mapPayment(row, currencies, base));
}

export function addPayment(subscriptionId: number, input: PaymentInput): Payment {
  const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(subscriptionId) as
    | SubRow
    | undefined;
  if (!sub) throw new HttpError(404, '订阅不存在');
  const currencies = currencyMap();
  const code = (input.currency ?? sub.currency).toUpperCase();
  const currency = currencies.get(code);
  if (!currency) throw new HttpError(400, `未知币种 ${code}`);
  const subCurrency = currencies.get(sub.currency) ?? currency;
  const base = baseCurrency();
  const today = todayISO();
  if (input.paidOn > today) throw new HttpError(400, '流水日期不能晚于今天');

  const amountMinor =
    input.amount !== undefined
      ? Math.round(input.amount * 10 ** currency.exponent)
      : code === sub.currency
        ? sub.amount_minor
        : convertMinor(sub.amount_minor, subCurrency, currency);
  const baseMinor = convertMinor(amountMinor, currency, base);

  let result;
  try {
    result = db
      .prepare(
        `INSERT INTO payments
          (subscription_id, paid_on, amount_minor, currency, rate_units_per_usd,
           base_minor, base_currency, source, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)`,
      )
      .run(
        subscriptionId,
        input.paidOn,
        amountMinor,
        currency.code,
        currency.unitsPerUsd,
        baseMinor,
        base.code,
        input.note ?? null,
        new Date().toISOString(),
      );
  } catch (error) {
    if (String(error).includes('UNIQUE')) {
      throw new HttpError(400, '该日期已有流水，请先删除或换一天补录');
    }
    throw error;
  }

  if (sub.status === 'active' && (!sub.next_due || input.paidOn >= sub.next_due)) {
    const next = scheduleNext(subscriptionId, sub.cycle, sub.cycle_days, sub.anchor_date);
    db.prepare('UPDATE subscriptions SET next_due = ? WHERE id = ?').run(next, subscriptionId);
  }

  const row = db
    .prepare('SELECT * FROM payments WHERE id = ?')
    .get(Number(result.lastInsertRowid)) as PaymentRow;
  return mapPayment(row, currencies, base);
}

export function deletePayment(id: number) {
  const result = db.prepare('DELETE FROM payments WHERE id = ?').run(id);
  if (result.changes === 0) throw new HttpError(404, '流水不存在');
}

export function createSubscription(input: SubscriptionInput): Subscription {
  const currencies = currencyMap();
  const currency = currencies.get(input.currency);
  if (!currency) throw new HttpError(400, `未知币种 ${input.currency}`);
  assertCategory(input.category);
  const service = resolveService(input.serviceId);
  const ts = new Date().toISOString();
  const cycleDays = input.cycle === 'custom' ? (input.cycleDays ?? null) : null;
  const nextDue =
    input.status === 'active'
      ? nextDueDate(input.anchorDate, input.cycle, cycleDays, new Date())
      : null;

  const result = db
    .prepare(
      `INSERT INTO subscriptions
        (name, service_id, category, amount_minor, currency, cycle, cycle_days, anchor_date,
         status, next_due, auto_renew, payment_method, account_label, website, notes, remind_days, created_at, updated_at)
       VALUES
        (@name, @serviceId, @category, @amountMinor, @currency, @cycle, @cycleDays, @anchorDate,
         @status, @nextDue, @autoRenew, @paymentMethod, @accountLabel, @website, @notes, @remindDays, @ts, @ts)`,
    )
    .run({
      name: input.name,
      serviceId: service?.id ?? null,
      category: input.category,
      amountMinor: Math.round(input.amount * 10 ** currency.exponent),
      currency: currency.code,
      cycle: input.cycle,
      cycleDays: input.cycle === 'custom' ? (input.cycleDays ?? null) : null,
      anchorDate: input.anchorDate,
      status: input.status,
      nextDue,
      autoRenew: input.autoRenew ? 1 : 0,
      paymentMethod: input.paymentMethod ?? null,
      accountLabel: input.accountLabel ?? null,
      website: input.website ?? null,
      notes: input.notes ?? null,
      remindDays: input.remindDays,
      ts,
    });

  return getSubscription(Number(result.lastInsertRowid));
}

export function updateSubscription(id: number, input: SubscriptionInput): Subscription {
  const existing = db
    .prepare(
      'SELECT id, status, cycle, cycle_days, anchor_date, next_due, paused_at FROM subscriptions WHERE id = ?',
    )
    .get(id) as
    | {
        id: number;
        status: StatusId;
        cycle: CycleId;
        cycle_days: number | null;
        anchor_date: string;
        next_due: string | null;
        paused_at: string | null;
      }
    | undefined;
  if (!existing) throw new HttpError(404, '订阅不存在');
  const currencies = currencyMap();
  const currency = currencies.get(input.currency);
  if (!currency) throw new HttpError(400, `未知币种 ${input.currency}`);
  assertCategory(input.category);
  const service = resolveService(input.serviceId);
  const cycleDays = input.cycle === 'custom' ? (input.cycleDays ?? null) : null;
  const scheduleChanged =
    existing.cycle !== input.cycle ||
    existing.cycle_days !== cycleDays ||
    existing.anchor_date !== input.anchorDate;
  const now = new Date();
  let nextDue = existing.next_due;
  let pausedAt = existing.paused_at;
  if (input.status !== 'active') {
    nextDue = null;
    pausedAt = input.status === 'paused' ? (existing.paused_at ?? now.toISOString()) : null;
  } else {
    if (existing.status !== 'active' || scheduleChanged) {
      nextDue = scheduleNext(id, input.cycle, cycleDays, input.anchorDate, now);
    }
    pausedAt = null;
  }

  db.prepare(
    `UPDATE subscriptions SET
      name = @name, service_id = @serviceId, category = @category, amount_minor = @amountMinor,
      currency = @currency, cycle = @cycle, cycle_days = @cycleDays, anchor_date = @anchorDate,
      status = @status, next_due = @nextDue, paused_at = @pausedAt,
      auto_renew = @autoRenew, payment_method = @paymentMethod,
      account_label = @accountLabel, website = @website, notes = @notes,
      remind_days = @remindDays, updated_at = @ts
     WHERE id = @id`,
  ).run({
    id,
    name: input.name,
    serviceId: service?.id ?? null,
    category: input.category,
    amountMinor: Math.round(input.amount * 10 ** currency.exponent),
    currency: currency.code,
    cycle: input.cycle,
    cycleDays: input.cycle === 'custom' ? (input.cycleDays ?? null) : null,
    anchorDate: input.anchorDate,
    status: input.status,
    nextDue,
    pausedAt,
    autoRenew: input.autoRenew ? 1 : 0,
    paymentMethod: input.paymentMethod ?? null,
    accountLabel: input.accountLabel ?? null,
    website: input.website ?? null,
    notes: input.notes ?? null,
    remindDays: input.remindDays,
    ts: new Date().toISOString(),
  });

  return getSubscription(id);
}

export function deleteSubscription(id: number) {
  const result = db.prepare('DELETE FROM subscriptions WHERE id = ?').run(id);
  if (result.changes === 0) throw new HttpError(404, '订阅不存在');
}

export function clearSubscriptions(): number {
  const result = db.prepare('DELETE FROM subscriptions').run();
  return result.changes;
}

function mapCatalog(row: CatalogRow): CatalogItem {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: row.category,
    iconKind: row.icon_kind,
    iconData: row.icon_data,
    color: row.color,
    website: row.website,
    isBuiltin: row.is_builtin === 1,
  };
}

export function listCatalog(): CatalogItem[] {
  const rows = db
    .prepare('SELECT * FROM service_catalog ORDER BY is_builtin DESC, category ASC, name ASC')
    .all() as CatalogRow[];
  return rows.map(mapCatalog);
}

export function createCatalog(input: CatalogInput): CatalogItem {
  assertCategory(input.category);
  const ts = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO service_catalog
        (name, slug, category, icon_kind, icon_data, color, website, is_builtin, created_at, updated_at)
       VALUES (@name, NULL, @category, @iconKind, @iconData, @color, @website, 0, @ts, @ts)`,
    )
    .run({
      name: input.name,
      category: input.category,
      iconKind: input.iconKind,
      iconData: input.iconKind === 'initials' ? (input.iconData || input.name.slice(0, 2)) : input.iconData,
      color: input.color,
      website: input.website ?? null,
      ts,
    });
  const row = db
    .prepare('SELECT * FROM service_catalog WHERE id = ?')
    .get(Number(result.lastInsertRowid)) as CatalogRow;
  return mapCatalog(row);
}

export function updateCatalog(id: number, input: CatalogInput): CatalogItem {
  const row = db.prepare('SELECT * FROM service_catalog WHERE id = ?').get(id) as
    | CatalogRow
    | undefined;
  if (!row) throw new HttpError(404, '服务不存在');
  if (row.is_builtin === 1) throw new HttpError(400, '内置服务不可编辑');
  assertCategory(input.category);

  db.prepare(
    `UPDATE service_catalog SET
      name = @name, category = @category, icon_kind = @iconKind, icon_data = @iconData,
      color = @color, website = @website, updated_at = @ts
     WHERE id = @id`,
  ).run({
    id,
    name: input.name,
    category: input.category,
    iconKind: input.iconKind,
    iconData: input.iconKind === 'initials' ? (input.iconData || input.name.slice(0, 2)) : input.iconData,
    color: input.color,
    website: input.website ?? null,
    ts: new Date().toISOString(),
  });
  const updated = db.prepare('SELECT * FROM service_catalog WHERE id = ?').get(id) as CatalogRow;
  return mapCatalog(updated);
}

export function deleteCatalog(id: number) {
  const row = db.prepare('SELECT is_builtin FROM service_catalog WHERE id = ?').get(id) as
    | { is_builtin: number }
    | undefined;
  if (!row) throw new HttpError(404, '服务不存在');
  if (row.is_builtin === 1) throw new HttpError(400, '内置服务不可删除');
  db.prepare('DELETE FROM service_catalog WHERE id = ?').run(id);
}

export function updateCurrencyRate(code: string, unitsPerUsd: number): Currency {
  const result = db
    .prepare('UPDATE currencies SET units_per_usd = ? WHERE code = ?')
    .run(unitsPerUsd, code.toUpperCase());
  if (result.changes === 0) throw new HttpError(404, '币种不存在');
  const currency = currencyMap().get(code.toUpperCase());
  if (!currency) throw new HttpError(404, '币种不存在');
  return currency;
}

export function getStats(): Stats {
  const base = baseCurrency();
  const now = new Date();
  const month = format(now, 'yyyy-MM');
  const nextMonth = format(addMonths(now, 1), 'yyyy-MM');
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
  const nextStart = format(startOfMonth(addMonths(now, 1)), 'yyyy-MM-dd');
  const nextEnd = format(endOfMonth(addMonths(now, 1)), 'yyyy-MM-dd');
  const today = todayISO(now);
  const horizon = format(addDays(now, 60), 'yyyy-MM-dd');

  const all = listSubscriptions();
  const active = all.filter((s) => s.status === 'active');
  const subsById = new Map(all.map((s) => [s.id, s]));
  const rates = currencyMap();

  const monthPayments = listPayments().filter(
    (payment) => payment.paidOn >= monthStart && payment.paidOn <= monthEnd,
  );

  let forecastMinor = 0;
  let forecastCount = 0;
  const upcoming: UpcomingItem[] = [];
  for (const sub of active) {
    if (!sub.nextDue) continue;
    const from = rates.get(sub.currency) ?? base;
    let due = sub.nextDue;
    let guard = 0;
    while (due <= horizon && guard < 500) {
      if (due >= today) {
        if (due >= nextStart && due <= nextEnd) {
          forecastMinor += convertMinor(sub.amountMinor, from, base);
          forecastCount += 1;
        }
        upcoming.push({
          subscriptionId: sub.id,
          name: sub.name,
          date: due,
          daysUntil: daysUntil(due, now) ?? 0,
          amountMinor: sub.amountMinor,
          currency: sub.currency,
          amountBaseMinor: convertMinor(sub.amountMinor, from, base),
          icon: sub.icon,
          category: sub.category,
        });
      }
      due = advanceCycleDate(due, sub.cycle, sub.cycleDays, 1);
      guard += 1;
    }
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date));

  const monthActualMinor = monthPayments.reduce((sum, payment) => sum + payment.amountBaseMinor, 0);

  const byCategory = listCategories()
    .map((cat) => {
      const rows = monthPayments.filter(
        (payment) => subsById.get(payment.subscriptionId)?.category === cat.slug,
      );
      return {
        category: cat.slug,
        label: cat.label,
        color: cat.color,
        count: rows.length,
        amountMinor: rows.reduce((sum, payment) => sum + payment.amountBaseMinor, 0),
      };
    })
    .sort((a, b) => b.amountMinor - a.amountMinor);

  const byCurrency = [...new Set(monthPayments.map((payment) => payment.currency))]
    .map((code) => {
      const rows = monthPayments.filter((payment) => payment.currency === code);
      return {
        code,
        count: rows.length,
        nativeMinor: rows.reduce((sum, payment) => sum + payment.amountMinor, 0),
        baseMinor: rows.reduce((sum, payment) => sum + payment.amountBaseMinor, 0),
      };
    })
    .sort((a, b) => b.baseMinor - a.baseMinor);

  return {
    baseCurrency: base.code,
    month,
    nextMonth,
    monthActualMinor,
    monthActualCount: monthPayments.length,
    nextMonthForecastMinor: forecastMinor,
    nextMonthForecastCount: forecastCount,
    activeCount: active.length,
    pausedCount: all.filter((s) => s.status === 'paused').length,
    cancelledCount: all.filter((s) => s.status === 'cancelled').length,
    byCategory,
    byCurrency,
    upcoming,
    nextDue: upcoming[0] ?? null,
  };
}

export function monthlyTotals(limit = 24): MonthlyTotal[] {
  const byMonth = new Map<string, { totalMinor: number; count: number }>();
  for (const payment of listPayments()) {
    const month = payment.paidOn.slice(0, 7);
    const entry = byMonth.get(month) ?? { totalMinor: 0, count: 0 };
    entry.totalMinor += payment.amountBaseMinor;
    entry.count += 1;
    byMonth.set(month, entry);
  }
  return [...byMonth.entries()]
    .map(([month, value]) => ({ month, ...value }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-limit);
}

export function getMonthDetail(month: string): MonthDetail {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, '月份格式应为 YYYY-MM');
  const base = baseCurrency();
  const subs = new Map(listSubscriptions().map((sub) => [sub.id, sub]));
  const items: MonthItem[] = listPayments()
    .filter((payment) => payment.paidOn.startsWith(month))
    .sort((a, b) => a.paidOn.localeCompare(b.paidOn))
    .map((payment) => {
      const sub = subs.get(payment.subscriptionId);
      return {
        id: payment.id,
        subscriptionId: payment.subscriptionId,
        paidOn: payment.paidOn,
        name: sub?.name ?? '已删除订阅',
        serviceName: sub?.serviceName ?? null,
        category: sub?.category ?? 'other',
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        amountBaseMinor: payment.amountBaseMinor,
        source: payment.source,
        icon: sub?.icon ?? { kind: 'initials', data: '?', color: '#8A8578' },
      };
    });
  return {
    month,
    baseCurrency: base.code,
    totalMinor: items.reduce((sum, item) => sum + item.amountBaseMinor, 0),
    count: items.length,
    items,
  };
}

export function exportPayload(): ExportPayload {
  const base = baseCurrency();
  return {
    exportedAt: new Date().toISOString(),
    baseCurrency: base.code,
    subscriptions: listSubscriptions({ sort: 'name' }),
    payments: listPayments(),
    catalog: listCatalog(),
    currencies: listCurrencies(),
    categories: listCategories(),
  };
}

const CSV_HEADERS = [
  '名称',
  '服务',
  '分类',
  '金额',
  '币种',
  '周期',
  '周期天数',
  '首期日期',
  '下次扣费',
  '上次扣费',
  '状态',
  '自动续费',
  '支付方式',
  '账户',
  '网站',
  '备注',
  '提醒提前天数',
  '单期折合（基准币种）',
  '创建时间',
];

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exportCsv(): string {
  const base = baseCurrency();
  const currencies = currencyMap();
  const rows = listSubscriptions({ sort: 'name' });
  const labels = categoryLabelMap();
  const lines = [CSV_HEADERS.join(',')];
  for (const s of rows) {
    const meta = currencies.get(s.currency);
    const amount = meta ? s.amountMinor / 10 ** meta.exponent : s.amountMinor;
    lines.push(
      [
        s.name,
        s.serviceName ?? '',
        labels.get(s.category) ?? s.category,
        amount.toFixed(meta?.exponent ?? 2),
        s.currency,
        s.cycle,
        s.cycleDays ?? '',
        s.anchorDate,
        s.nextDue ?? '',
        s.lastPaidOn ?? '',
        s.status,
        s.autoRenew ? '是' : '否',
        s.paymentMethod ?? '',
        s.accountLabel ?? '',
        s.website ?? '',
        s.notes ?? '',
        s.remindDays,
        (s.amountBaseMinor / 10 ** base.exponent).toFixed(base.exponent),
        s.createdAt,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return `\uFEFF${lines.join('\r\n')}`;
}

const PAYMENT_CSV_HEADERS = [
  '日期',
  '订阅',
  '分类',
  '金额',
  '币种',
  '折合（基准币种）',
  '来源',
  '备注',
];

export function exportPaymentsCsv(): string {
  const base = baseCurrency();
  const currencies = currencyMap();
  const labels = categoryLabelMap();
  const subs = new Map(listSubscriptions().map((sub) => [sub.id, sub]));
  const lines = [PAYMENT_CSV_HEADERS.join(',')];
  for (const payment of listPayments()) {
    const meta = currencies.get(payment.currency);
    const sub = subs.get(payment.subscriptionId);
    lines.push(
      [
        payment.paidOn,
        sub?.name ?? '',
        labels.get(sub?.category ?? '') ?? '',
        (payment.amountMinor / 10 ** (meta?.exponent ?? 2)).toFixed(meta?.exponent ?? 2),
        payment.currency,
        (payment.amountBaseMinor / 10 ** base.exponent).toFixed(base.exponent),
        payment.source,
        payment.note ?? '',
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return `\uFEFF${lines.join('\r\n')}`;
}

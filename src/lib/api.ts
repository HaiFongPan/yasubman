import type { AppStoreResult, CatalogItem, Category, MonthDetail, MonthlyTotal, Payment, RateMeta, SettingsPayload, Stats, Subscription } from '@shared/types';
import type { CatalogInput, SubscriptionInput } from '@shared/validation';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let message = `请求失败 (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface SubscriptionFilters {
  status?: string;
  category?: string;
  q?: string;
  sort?: string;
}

export const api = {
  stats: () => request<Stats>('/stats'),

  monthlyStats: (limit = 24) => request<MonthlyTotal[]>(`/stats/months?limit=${limit}`),

  monthStats: (month: string) => request<MonthDetail>(`/stats/month/${month}`),

  subscriptions: (filters: SubscriptionFilters = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value && value !== 'all') params.set(key, value);
    }
    const query = params.toString();
    return request<Subscription[]>(`/subscriptions${query ? `?${query}` : ''}`);
  },

  subscription: (id: number) => request<Subscription>(`/subscriptions/${id}`),

  payments: (subscriptionId: number) =>
    request<Payment[]>(`/subscriptions/${subscriptionId}/payments`),

  addPayment: (
    subscriptionId: number,
    input: { paidOn: string; amount?: number; currency?: string; note?: string | null },
  ) =>
    request<Payment>(`/subscriptions/${subscriptionId}/payments`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  deletePayment: (id: number) => request<void>(`/payments/${id}`, { method: 'DELETE' }),

  runBilling: () =>
    request<{ generated: number; subscriptions: number }>('/billing/run', { method: 'POST' }),

  createSubscription: (input: SubscriptionInput) =>
    request<Subscription>('/subscriptions', { method: 'POST', body: JSON.stringify(input) }),

  updateSubscription: (id: number, input: SubscriptionInput) =>
    request<Subscription>(`/subscriptions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  deleteSubscription: (id: number) =>
    request<void>(`/subscriptions/${id}`, { method: 'DELETE' }),

  clearSubscriptions: () =>
    request<{ deleted: number }>('/subscriptions', { method: 'DELETE' }),

  catalog: () => request<CatalogItem[]>('/catalog'),

  createCatalog: (input: CatalogInput) =>
    request<CatalogItem>('/catalog', { method: 'POST', body: JSON.stringify(input) }),

  updateCatalog: (id: number, input: CatalogInput) =>
    request<CatalogItem>(`/catalog/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),

  deleteCatalog: (id: number) => request<void>(`/catalog/${id}`, { method: 'DELETE' }),

  categories: () => request<Category[]>('/categories'),

  createCategory: (input: { label: string; color: string }) =>
    request<Category>('/categories', { method: 'POST', body: JSON.stringify(input) }),

  updateCategory: (id: number, input: { label?: string; color?: string }) =>
    request<Category>(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),

  deleteCategory: (id: number, reassign?: string) =>
    request<{ reassigned: boolean }>(
      `/categories/${id}${reassign ? `?reassign=${encodeURIComponent(reassign)}` : ''}`,
      { method: 'DELETE' },
    ),

  settings: () => request<SettingsPayload>('/settings'),

  setBaseCurrency: (baseCurrency: string) =>
    request<SettingsPayload>('/settings', {
      method: 'PATCH',
      body: JSON.stringify({ baseCurrency }),
    }),

  refreshRates: () =>
    request<{ rates: RateMeta; currencies: SettingsPayload['currencies'] }>('/rates/refresh', {
      method: 'POST',
    }),

  searchAppStore: (term: string, country: string, signal?: AbortSignal) => {
    const params = new URLSearchParams({ term, country });
    return request<AppStoreResult[]>(`/appstore/search?${params}`, { signal });
  },
};

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, type SubscriptionFilters } from './api';
import type { CatalogInput, SubscriptionInput } from '@shared/validation';
import type { SettingsPayload } from '@shared/types';

export const keys = {
  stats: ['stats'] as const,
  categories: ['categories'] as const,
  subscriptions: (filters: SubscriptionFilters = {}) => ['subscriptions', filters] as const,
  catalog: ['catalog'] as const,
  settings: ['settings'] as const,
  subscription: (id: number) => ['subscription', id] as const,
  payments: (id: number) => ['payments', id] as const,
};

function useInvalidateAll() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['subscriptions'] });
    qc.invalidateQueries({ queryKey: ['subscription'] });
    qc.invalidateQueries({ queryKey: ['payments'] });
    qc.invalidateQueries({ queryKey: keys.stats });
    qc.invalidateQueries({ queryKey: keys.catalog });
  };
}

export function useStats() {
  return useQuery({ queryKey: keys.stats, queryFn: api.stats });
}

export function useMonthlyStats(limit = 12) {
  return useQuery({
    queryKey: ['stats', 'months', limit],
    queryFn: () => api.monthlyStats(limit),
  });
}

export function useMonthStats(month: string | null) {
  return useQuery({
    queryKey: ['stats', 'month', month],
    queryFn: () => api.monthStats(month as string),
    enabled: Boolean(month),
  });
}

export function useSubscriptions(filters: SubscriptionFilters = {}) {
  return useQuery({
    queryKey: keys.subscriptions(filters),
    queryFn: () => api.subscriptions(filters),
  });
}

export function useSubscription(id: number) {
  return useQuery({
    queryKey: keys.subscription(id),
    queryFn: () => api.subscription(id),
    enabled: Number.isInteger(id) && id > 0,
  });
}

export function usePayments(id: number) {
  return useQuery({
    queryKey: keys.payments(id),
    queryFn: () => api.payments(id),
    enabled: Number.isInteger(id) && id > 0,
  });
}

export function usePaymentMutations(subscriptionId: number) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: keys.payments(subscriptionId) });
    qc.invalidateQueries({ queryKey: keys.subscription(subscriptionId) });
    qc.invalidateQueries({ queryKey: ['subscriptions'] });
    qc.invalidateQueries({ queryKey: keys.stats });
  };

  const add = useMutation({
    mutationFn: (input: { paidOn: string; amount?: number; note?: string | null }) =>
      api.addPayment(subscriptionId, input),
    onSuccess: () => {
      invalidate();
      toast.success('已补录流水');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.deletePayment(id),
    onSuccess: () => {
      invalidate();
      toast.success('已删除流水');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return { add, remove };
}

export function useCatalog() {
  return useQuery({ queryKey: keys.catalog, queryFn: api.catalog });
}

export function useCategories() {
  return useQuery({ queryKey: keys.categories, queryFn: api.categories });
}

export function useCategoryMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: keys.categories });
    qc.invalidateQueries({ queryKey: ['subscriptions'] });
    qc.invalidateQueries({ queryKey: keys.catalog });
    qc.invalidateQueries({ queryKey: keys.stats });
  };

  const create = useMutation({
    mutationFn: (input: { label: string; color: string }) => api.createCategory(input),
    onSuccess: (item) => {
      invalidate();
      toast.success(`已添加分类「${item.label}」`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: number; input: { label?: string; color?: string } }) =>
      api.updateCategory(id, input),
    onSuccess: () => {
      invalidate();
      toast.success('分类已更新');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: ({ id, reassign }: { id: number; reassign?: string }) =>
      api.deleteCategory(id, reassign),
    onSuccess: (result) => {
      invalidate();
      toast.success(result.reassigned ? '已删除分类，关联项归入「其他」' : '已删除分类');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return { create, update, remove };
}

export function useSettings() {
  return useQuery({ queryKey: keys.settings, queryFn: api.settings });
}

export function useSubscriptionMutations() {
  const invalidate = useInvalidateAll();
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: (input: SubscriptionInput) => api.createSubscription(input),
    onSuccess: (sub) => {
      invalidate();
      toast.success(`已添加「${sub.name}」`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: number; input: SubscriptionInput }) =>
      api.updateSubscription(id, input),
    onSuccess: (sub) => {
      invalidate();
      toast.success(`已保存「${sub.name}」`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.deleteSubscription(id),
    onSuccess: () => {
      invalidate();
      toast.success('已删除');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const clear = useMutation({
    mutationFn: () => api.clearSubscriptions(),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: keys.settings });
      toast.success('已清空全部订阅');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return { create, update, remove, clear };
}

export function useCatalogMutations() {
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: (input: CatalogInput) => api.createCatalog(input),
    onSuccess: (item) => {
      qc.invalidateQueries({ queryKey: keys.catalog });
      toast.success(`已添加服务「${item.name}」`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: number; input: CatalogInput }) =>
      api.updateCatalog(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.catalog });
      qc.invalidateQueries({ queryKey: ['subscriptions'] });
      toast.success('已保存服务');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.deleteCatalog(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.catalog });
      qc.invalidateQueries({ queryKey: ['subscriptions'] });
      toast.success('已删除服务');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return { create, update, remove };
}

export function useSettingsMutations() {
  const qc = useQueryClient();

  const setBase = useMutation({
    mutationFn: (code: string) => api.setBaseCurrency(code),
    onSuccess: (payload) => {
      qc.setQueryData(keys.settings, payload);
      qc.invalidateQueries({ queryKey: ['subscriptions'] });
      qc.invalidateQueries({ queryKey: keys.stats });
      toast.success('基准币种已更新');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const syncRates = useMutation({
    mutationFn: () => api.refreshRates(),
    onSuccess: ({ rates, currencies }) => {
      qc.setQueryData<SettingsPayload | undefined>(keys.settings, (current) =>
        current ? { ...current, currencies, rates } : current,
      );
      qc.invalidateQueries({ queryKey: ['subscriptions'] });
      qc.invalidateQueries({ queryKey: keys.stats });
      if (rates.status === 'ok') toast.success('汇率已同步');
      else if (rates.status === 'disabled') toast.error('自动同步已关闭（FX_PROVIDER=off）');
      else toast.error(rates.error ?? '汇率同步失败');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return { setBase, syncRates };
}

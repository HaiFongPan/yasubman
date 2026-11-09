import type { Currency, Subscription } from '@shared/types';
import type { SubscriptionInput } from '@shared/validation';
import { fromMinor } from '@shared/money';

/** 把订阅记录转成接口入参，供局部修改时复用 */
export function subscriptionPayload(
  sub: Subscription,
  currencies: Map<string, Currency>,
  overrides: Partial<SubscriptionInput> = {},
): SubscriptionInput {
  const exponent = currencies.get(sub.currency)?.exponent ?? 2;
  return {
    name: sub.name,
    serviceId: sub.serviceId,
    category: sub.category,
    amount: fromMinor(sub.amountMinor, exponent),
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
    ...overrides,
  };
}

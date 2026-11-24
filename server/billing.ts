import { baseCurrency, currencyMap } from './domain';
import { settleDue } from './settle';

/** 把所有已到期（next_due <= 今天）的活跃订阅结算成流水，并推进下次扣费日 */
export function runBilling(now = new Date()): { generated: number; subscriptions: number } {
  return settleDue({ now, currencies: currencyMap(), base: baseCurrency() });
}

/** 启动时补跑一次，之后每天 00:05 结算 */
export function startBillingScheduler() {
  const run = () => {
    try {
      const result = runBilling();
      if (result.generated > 0) {
        console.log(`[billing] generated ${result.generated} payments`);
      }
    } catch (error) {
      console.error('[billing]', error);
    }
  };

  run();

  const scheduleNext = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(0, 5, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    setTimeout(() => {
      run();
      scheduleNext();
    }, next.getTime() - now.getTime()).unref();
  };
  scheduleNext();
}

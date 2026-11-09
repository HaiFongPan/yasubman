import { Router } from 'express';
import { DB_PATH } from './db';
import { ratesMeta, refreshRates } from './fx';
import { runBilling } from './billing';
import { searchAppStore } from './appstore';
import type { NextFunction, Request, Response } from 'express';
import {
  HttpError,
  addPayment,
  baseCurrency,
  clearSubscriptions,
  deletePayment,
  listPayments,
  monthlyTotals,
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
  createCatalog,
  createSubscription,
  deleteCatalog,
  deleteSubscription,
  exportCsv,
  exportPayload,
  exportPaymentsCsv,
  getMonthDetail,
  getStats,
  getSubscription,
  listCatalog,
  listCurrencies,
  listSubscriptions,
  setBaseCurrency,
  updateCatalog,
  updateCurrencyRate,
  updateSubscription,
} from './domain';
import {
  baseCurrencySchema,
  catalogInputSchema,
  categoryInputSchema,
  categoryUpdateSchema,
  paymentInputSchema,
  currencyRateSchema,
  subscriptionInputSchema,
  zodMessage,
} from '../shared/validation';

export const api = Router();

const idParam = (req: Request): number => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'ID 无效');
  return id;
};

api.get('/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

api.get('/settings', (_req, res) => {
  res.json({
    baseCurrency: baseCurrency().code,
    currencies: listCurrencies(),
    storage: { path: DB_PATH },
    rates: ratesMeta(),
  });
});

api.patch('/settings', (req, res) => {
  const parsed = baseCurrencySchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, zodMessage(parsed.error));
  setBaseCurrency(parsed.data.baseCurrency);
  res.json({
    baseCurrency: baseCurrency().code,
    currencies: listCurrencies(),
    storage: { path: DB_PATH },
    rates: ratesMeta(),
  });
});

api.patch('/currencies/:code', (req, res) => {
  const parsed = currencyRateSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, zodMessage(parsed.error));
  const currency = updateCurrencyRate(String(req.params.code), parsed.data.unitsPerUsd);
  res.json({ currency, currencies: listCurrencies() });
});

api.post('/rates/refresh', async (_req, res) => {
  const rates = await refreshRates(true);
  res.json({ rates, currencies: listCurrencies() });
});

api.get('/appstore/search', async (req, res) => {
  const term = String(req.query.term ?? '').trim();
  const country = String(req.query.country ?? 'us').toLowerCase();
  if (term.length < 2) throw new HttpError(400, '搜索词至少 2 个字符');
  if (!/^[a-z]{2}$/.test(country)) throw new HttpError(400, '国家代码不合法');
  const results = await searchAppStore(term, country);
  res.json(results);
});

api.get('/subscriptions', (req, res) => {
  res.json(
    listSubscriptions({
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      category: typeof req.query.category === 'string' ? req.query.category : undefined,
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      sort: typeof req.query.sort === 'string' ? req.query.sort : undefined,
    }),
  );
});

api.get('/subscriptions/:id/payments', (req, res) => {
  res.json(listPayments(idParam(req)));
});

api.post('/subscriptions/:id/payments', (req, res) => {
  const parsed = paymentInputSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, zodMessage(parsed.error));
  res.status(201).json(addPayment(idParam(req), parsed.data));
});

api.delete('/payments/:id', (req, res) => {
  deletePayment(idParam(req));
  res.status(204).end();
});

api.post('/billing/run', (_req, res) => {
  res.json(runBilling());
});

api.get('/subscriptions/:id', (req, res) => {
  res.json(getSubscription(idParam(req)));
});

api.post('/subscriptions', (req, res) => {
  const parsed = subscriptionInputSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, zodMessage(parsed.error));
  res.status(201).json(createSubscription(parsed.data));
});

api.patch('/subscriptions/:id', (req, res) => {
  const parsed = subscriptionInputSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, zodMessage(parsed.error));
  res.json(updateSubscription(idParam(req), parsed.data));
});

api.delete('/subscriptions/:id', (req, res) => {
  deleteSubscription(idParam(req));
  res.status(204).end();
});

api.delete('/subscriptions', (_req, res) => {
  res.json({ deleted: clearSubscriptions() });
});

api.get('/catalog', (_req, res) => {
  res.json(listCatalog());
});

api.post('/catalog', (req, res) => {
  const parsed = catalogInputSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, zodMessage(parsed.error));
  res.status(201).json(createCatalog(parsed.data));
});

api.patch('/catalog/:id', (req, res) => {
  const parsed = catalogInputSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, zodMessage(parsed.error));
  res.json(updateCatalog(idParam(req), parsed.data));
});

api.delete('/catalog/:id', (req, res) => {
  deleteCatalog(idParam(req));
  res.status(204).end();
});

api.get('/categories', (_req, res) => {
  res.json(listCategories());
});

api.post('/categories', (req, res) => {
  const parsed = categoryInputSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, zodMessage(parsed.error));
  res.status(201).json(createCategory(parsed.data));
});

api.patch('/categories/:id', (req, res) => {
  const parsed = categoryUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, zodMessage(parsed.error));
  res.json(updateCategory(idParam(req), parsed.data));
});

api.delete('/categories/:id', (req, res) => {
  const reassign = typeof req.query.reassign === 'string' ? req.query.reassign : undefined;
  res.json(deleteCategory(idParam(req), reassign));
});

api.get('/stats', (_req, res) => {
  res.json(getStats());
});

api.get('/stats/months', (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 24, 1), 120);
  res.json(monthlyTotals(limit));
});

api.get('/stats/month/:month', (req, res) => {
  res.json(getMonthDetail(String(req.params.month)));
});

api.get('/export', (req, res) => {
  const format = String(req.query.format ?? 'json').toLowerCase();
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="yasubman-${stamp}.csv"`);
    res.send(exportCsv());
    return;
  }
  if (format === 'payments-csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="yasubman-payments-${stamp}.csv"`);
    res.send(exportPaymentsCsv());
    return;
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="yasubman-${stamp}.json"`);
  res.send(JSON.stringify(exportPayload(), null, 2));
});

api.use((_req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : '服务器内部错误';
  console.error('[api]', err);
  res.status(500).json({ error: message });
}

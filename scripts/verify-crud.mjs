#!/usr/bin/env node
/**
 * 端到端 CRUD 验收脚本。
 * 用法：BASE_URL=http://localhost:3999 node scripts/verify-crud.mjs
 * 注意：脚本会清空目标实例的订阅数据，请只在测试库上运行。
 */

const BASE = process.env.BASE_URL ?? 'http://localhost:3999';
let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  \u001b[32m✓\u001b[0m ${name}`);
  } else {
    failures.push(name);
    console.log(`  \u001b[31m✗\u001b[0m ${name}${detail ? ` — ${JSON.stringify(detail)}` : ''}`);
  }
}

async function req(path, init = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, headers: res.headers };
}

const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => iso(new Date(today.getTime() - n * 86_400_000));

function subPayload(overrides = {}) {
  return {
    name: 'Verify Subscription',
    serviceId: null,
    category: 'ai',
    amount: 12.5,
    currency: 'USD',
    cycle: 'monthly',
    cycleDays: null,
    anchorDate: '2025-01-31',
    status: 'active',
    autoRenew: true,
    paymentMethod: 'Visa •••• 4242',
    accountLabel: 'verify@example.com',
    website: 'https://verify.example.com',
    notes: '由 verify-crud 创建',
    remindDays: 5,
    ...overrides,
  };
}

async function main() {
  console.log(`\n验收目标: ${BASE}\n`);

  await req('/subscriptions', { method: 'DELETE' });

  console.log('健康检查与基础配置');
  const health = await req('/health');
  check('GET /health 返回 ok', health.status === 200 && health.body?.ok === true, health);

  const settings = await req('/settings');
  check('GET /settings 返回基准币种与币种表', settings.status === 200 && settings.body?.baseCurrency === 'CNY' && settings.body.currencies.length >= 10, settings.body);
  check('GET /settings 暴露 SQLite 路径', typeof settings.body?.storage?.path === 'string' && settings.body.storage.path.length > 0, settings.body?.storage);
  check('GET /settings 返回汇率同步状态', typeof settings.body?.rates?.provider === 'string' && typeof settings.body?.rates?.status === 'string', settings.body?.rates);

  const cnyRate =
    settings.body?.currencies?.find((item) => item.code === 'CNY')?.unitsPerUsd ?? 7.15;

  const catalog0 = await req('/catalog');
  const openai = catalog0.body?.find((item) => item.slug === 'openai');
  check('GET /catalog 内置服务不少于 80 个', catalog0.status === 200 && catalog0.body.length >= 80, { count: catalog0.body?.length });
  check('内置品牌图标带 SVG path', openai?.iconKind === 'brand' && (openai?.iconData?.length ?? 0) > 20, openai);

  console.log('\n服务库 CRUD');
  const createdCatalog = await req('/catalog', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Verify Service',
      category: 'ai',
      iconKind: 'initials',
      iconData: 'VF',
      color: '#123456',
      website: 'https://verify.example.com',
    }),
  });
  const serviceId = createdCatalog.body?.id;
  check('POST /catalog 创建自定义服务', createdCatalog.status === 201 && createdCatalog.body?.name === 'Verify Service' && createdCatalog.body?.isBuiltin === false, createdCatalog.body);
  check('自定义服务图标与颜色落库', createdCatalog.body?.iconData === 'VF' && createdCatalog.body?.color === '#123456', createdCatalog.body);

  const badCatalog = await req('/catalog', {
    method: 'POST',
    body: JSON.stringify({ name: '', category: 'ai', color: '#123456' }),
  });
  check('POST /catalog 拒绝空名称', badCatalog.status === 400 && typeof badCatalog.body?.error === 'string', badCatalog.body);

  const badColor = await req('/catalog', {
    method: 'POST',
    body: JSON.stringify({ name: 'Bad Color', category: 'ai', color: 'red' }),
  });
  check('POST /catalog 拒绝非法颜色', badColor.status === 400, badColor.body);

  const updatedCatalog = await req(`/catalog/${serviceId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: 'Verify Service 2',
      category: 'cloud',
      iconKind: 'initials',
      iconData: 'V2',
      color: '#654321',
      website: 'https://verify.example.com',
    }),
  });
  check('PATCH /catalog 更新字段', updatedCatalog.status === 200 && updatedCatalog.body?.name === 'Verify Service 2' && updatedCatalog.body?.category === 'cloud' && updatedCatalog.body?.iconData === 'V2', updatedCatalog.body);

  const builtinDelete = await req(`/catalog/${openai.id}`, { method: 'DELETE' });
  check('内置服务不可删除（400）', builtinDelete.status === 400, builtinDelete.body);

  console.log('\n订阅 CRUD');
  const created = await req('/subscriptions', {
    method: 'POST',
    body: JSON.stringify(subPayload({ serviceId, category: 'cloud' })),
  });
  const subId = created.body?.id;
  check('POST /subscriptions 创建订阅', created.status === 201 && created.body?.name === 'Verify Subscription', created.body);
  check('金额转最小单位（12.5 USD → 1250）', created.body?.amountMinor === 1250, created.body?.amountMinor);
  check(`单期折合（1250 USD → ${Math.round(1250 * cnyRate)} CNY）`, created.body?.amountBaseMinor === Math.round(1250 * cnyRate), created.body?.amountBaseMinor);
  const monthEndDue = (() => {
    const anchor = new Date(2025, 0, 31);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const fmt = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    for (let n = 1; n < 60; n += 1) {
      const probe = new Date(anchor.getFullYear(), anchor.getMonth() + n, 1);
      const lastDay = new Date(probe.getFullYear(), probe.getMonth() + 1, 0).getDate();
      probe.setDate(Math.min(31, lastDay));
      if (probe >= today) return fmt(probe);
    }
    return null;
  })();
  check(`月末对齐：1/31 起每月续费落到 ${monthEndDue}`, created.body?.nextDue === monthEndDue, created.body?.nextDue);
  check('关联自定义服务并带图标', created.body?.serviceId === serviceId && created.body?.icon?.data === 'V2', created.body?.icon);
  check('可空字段往返一致', created.body?.paymentMethod === 'Visa •••• 4242' && created.body?.notes === '由 verify-crud 创建' && created.body?.remindDays === 5, created.body);

  const badName = await req('/subscriptions', { method: 'POST', body: JSON.stringify(subPayload({ name: '' })) });
  check('POST /subscriptions 拒绝空名称', badName.status === 400, badName.body);

  const badDate = await req('/subscriptions', { method: 'POST', body: JSON.stringify(subPayload({ anchorDate: '2025/01/31' })) });
  check('POST /subscriptions 拒绝非法日期', badDate.status === 400, badDate.body);

  const badCycle = await req('/subscriptions', { method: 'POST', body: JSON.stringify(subPayload({ cycle: 'custom', cycleDays: null })) });
  check('自定义周期缺少天数时拒绝', badCycle.status === 400, badCycle.body);

  const badCurrency = await req('/subscriptions', { method: 'POST', body: JSON.stringify(subPayload({ currency: 'XXX' })) });
  check('未知币种被拒绝', badCurrency.status === 400, badCurrency.body);

  const readOne = await req(`/subscriptions/${subId}`);
  check('GET /subscriptions/:id 读取', readOne.status === 200 && readOne.body?.id === subId, readOne.body);

  const updated = await req(`/subscriptions/${subId}`, {
    method: 'PATCH',
    body: JSON.stringify(subPayload({ amount: 30, cycle: 'yearly', status: 'paused', anchorDate: daysAgo(400), serviceId, category: 'cloud' })),
  });
  check('PATCH /subscriptions 更新金额与周期', updated.status === 200 && updated.body?.amountMinor === 3000 && updated.body?.cycle === 'yearly', updated.body);
  check('暂停后不再计算下次续费', updated.body?.status === 'paused' && updated.body?.nextDue === null, updated.body);
  check(`单期折合按年付金额（3000 USD）`, updated.body?.amountBaseMinor === Math.round(3000 * cnyRate), updated.body?.amountBaseMinor);

  const customCycle = await req('/subscriptions', {
    method: 'POST',
    body: JSON.stringify(subPayload({ name: 'Verify Custom 45d', cycle: 'custom', cycleDays: 45, anchorDate: daysAgo(100) })),
  });
  check('自定义 45 天周期的下次续费', customCycle.status === 201 && (customCycle.body?.daysUntil ?? 0) >= 30 && (customCycle.body?.daysUntil ?? 0) <= 40, {
    nextDue: customCycle.body?.nextDue,
    daysUntil: customCycle.body?.daysUntil,
  });

  const weekly = await req('/subscriptions', {
    method: 'POST',
    body: JSON.stringify(subPayload({ name: 'Verify Weekly', cycle: 'weekly', amount: 2.99, anchorDate: daysAgo(10) })),
  });
  check('周付订阅下次续费在 7 天内', weekly.status === 201 && (weekly.body?.daysUntil ?? 99) <= 7 && (weekly.body?.daysUntil ?? -1) >= 0, {
    nextDue: weekly.body?.nextDue,
    daysUntil: weekly.body?.daysUntil,
  });

  console.log('\n列表、筛选与统计');
  const list = await req('/subscriptions');
  check('GET /subscriptions 返回全部', list.status === 200 && list.body.length === 3, { count: list.body?.length });

  const search = await req('/subscriptions?q=Verify%20Custom');
  check('按关键词筛选', search.body?.length === 1 && search.body[0].name === 'Verify Custom 45d', search.body?.map((s) => s.name));

  const byStatus = await req('/subscriptions?status=active');
  check('按状态筛选（active=2）', byStatus.body?.length === 2, byStatus.body?.map((s) => s.status));

  const byCategory = await req('/subscriptions?category=cloud');
  check('按分类筛选（cloud=1）', byCategory.body?.length === 1 && byCategory.body[0].category === 'cloud', byCategory.body?.map((s) => s.category));

  const byAmount = await req('/subscriptions?sort=amount');
  check('按金额降序排序', byAmount.body?.[0]?.amountBaseMinor >= byAmount.body?.[1]?.amountBaseMinor, byAmount.body?.map((s) => s.amountBaseMinor));

  const stats = await req('/stats');
  check('GET /stats 汇总活跃订阅', stats.status === 200 && stats.body.activeCount === 2 && stats.body.pausedCount === 1, {
    active: stats.body?.activeCount,
    paused: stats.body?.pausedCount,
  });
  check('/stats 返回调查口径字段', typeof stats.body?.monthActualMinor === 'number' && typeof stats.body?.nextMonthForecastMinor === 'number' && typeof stats.body?.month === 'string', Object.keys(stats.body ?? {}));
  check('/stats 分类构成覆盖 6 类', stats.body?.byCategory?.length === 6, stats.body?.byCategory?.length);
  check('/stats 下次续费取最近的活跃订阅', stats.body?.nextDue?.subscriptionId === (weekly.body?.daysUntil <= (customCycle.body?.daysUntil ?? 999) ? weekly.body?.id : customCycle.body?.id), stats.body?.nextDue);

  console.log('\n流水与结算');
  const ledgerSub = await req('/subscriptions', {
    method: 'POST',
    body: JSON.stringify(
      subPayload({
        name: 'Verify Ledger',
        amount: 30,
        currency: 'CNY',
        cycle: 'monthly',
        anchorDate: new Date().toISOString().slice(0, 10),
        category: 'ai',
      }),
    ),
  });
  const ledgerId = ledgerSub.body?.id;
  check('到期日等于今天的订阅', ledgerSub.status === 201 && ledgerSub.body?.nextDue === new Date().toISOString().slice(0, 10), {
    nextDue: ledgerSub.body?.nextDue,
  });

  const billing = await req('/billing/run', { method: 'POST' });
  check('POST /billing/run 生成到期流水', billing.status === 200 && billing.body?.generated >= 1, billing.body);

  const ledgerPayments = await req(`/subscriptions/${ledgerId}/payments`);
  check('流水记录金额与来源', ledgerPayments.body?.[0]?.amountMinor === 3000 && ledgerPayments.body?.[0]?.source === 'auto', ledgerPayments.body?.[0]);
  const ledgerAfter = await req(`/subscriptions/${ledgerId}`);
  check('结算后下次扣费日顺延', ledgerAfter.body?.nextDue > ledgerSub.body?.nextDue && ledgerAfter.body?.lastPaidOn === new Date().toISOString().slice(0, 10), {
    before: ledgerSub.body?.nextDue,
    after: ledgerAfter.body?.nextDue,
  });

  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const manual = await req(`/subscriptions/${ledgerId}/payments`, {
    method: 'POST',
    body: JSON.stringify({ paidOn: yesterday, amount: 25, note: '补录验证' }),
  });
  check('POST 补录流水', manual.status === 201 && manual.body?.amountMinor === 2500 && manual.body?.source === 'manual', manual.body);
  const delManual = await req(`/payments/${manual.body.id}`, { method: 'DELETE' });
  check('DELETE 流水返回 204', delManual.status === 204, delManual.status);

  const future = await req(`/subscriptions/${ledgerId}/payments`, {
    method: 'POST',
    body: JSON.stringify({ paidOn: '2099-01-01', amount: 1 }),
  });
  check('拒绝未来日期的流水', future.status === 400, future.body);

  const statsAfterBilling = await req('/stats');
  check('/stats 本月实际包含自动流水', statsAfterBilling.body?.monthActualMinor >= 3000 && statsAfterBilling.body?.monthActualCount >= 1, {
    actual: statsAfterBilling.body?.monthActualMinor,
    count: statsAfterBilling.body?.monthActualCount,
  });

  const pauseLedger = await req(`/subscriptions/${ledgerId}`, {
    method: 'PATCH',
    body: JSON.stringify(subPayload({ name: 'Verify Ledger', amount: 30, currency: 'CNY', anchorDate: new Date().toISOString().slice(0, 10), status: 'paused' })),
  });
  check('暂停后清空下次扣费日', pauseLedger.body?.nextDue === null, pauseLedger.body?.nextDue);
  const pausedBilling = await req('/billing/run', { method: 'POST' });
  check('暂停期间不生成流水', pausedBilling.body?.generated === 0, pausedBilling.body);
  const resumeLedger = await req(`/subscriptions/${ledgerId}`, {
    method: 'PATCH',
    body: JSON.stringify(subPayload({ name: 'Verify Ledger', amount: 30, currency: 'CNY', anchorDate: new Date().toISOString().slice(0, 10), status: 'active' })),
  });
  check('恢复后从上次流水重新排期', resumeLedger.body?.nextDue > new Date().toISOString().slice(0, 10), resumeLedger.body?.nextDue);
  await req(`/subscriptions/${ledgerId}`, { method: 'DELETE' });

  console.log('\n币种与汇率');
  const switchBase = await req('/settings', { method: 'PATCH', body: JSON.stringify({ baseCurrency: 'USD' }) });
  check('PATCH /settings 切换基准币种', switchBase.status === 200 && switchBase.body?.baseCurrency === 'USD', switchBase.body);
  const statsUsd = await req('/stats');
  check('切换后统计使用新基准币种', statsUsd.body?.baseCurrency === 'USD' && typeof statsUsd.body?.monthActualMinor === 'number', {
    base: statsUsd.body?.baseCurrency,
  });

  const badBase = await req('/settings', { method: 'PATCH', body: JSON.stringify({ baseCurrency: 'ZZZ' }) });
  check('未知基准币种被拒绝', badBase.status === 400, badBase.body);

  const originalEur = settings.body?.currencies?.find((item) => item.code === 'EUR')?.unitsPerUsd ?? 0.92;
  const rate = await req('/currencies/EUR', { method: 'PATCH', body: JSON.stringify({ unitsPerUsd: 0.9 }) });
  check('PATCH /currencies/:code 更新汇率', rate.status === 200 && rate.body?.currency?.unitsPerUsd === 0.9, rate.body);
  const badRate = await req('/currencies/EUR', { method: 'PATCH', body: JSON.stringify({ unitsPerUsd: -1 }) });
  check('拒绝非法汇率', badRate.status === 400, badRate.body);

  await req('/settings', { method: 'PATCH', body: JSON.stringify({ baseCurrency: 'CNY' }) });
  await req('/currencies/EUR', { method: 'PATCH', body: JSON.stringify({ unitsPerUsd: originalEur }) });

  const refresh = await req('/rates/refresh', { method: 'POST' });
  check('POST /rates/refresh 返回同步状态', refresh.status === 200 && typeof refresh.body?.rates?.status === 'string' && Array.isArray(refresh.body?.currencies), refresh.body?.rates);

  const shortTerm = await req('/appstore/search?term=a&country=us');
  check('App Store 搜索拒绝过短关键词', shortTerm.status === 400, shortTerm.body);
  const badCountry = await req('/appstore/search?term=notion&country=usa');
  check('App Store 搜索拒绝非法国家码', badCountry.status === 400, badCountry.body);
  if (process.env.TEST_APPSTORE === '1') {
    const apps = await req('/appstore/search?term=notion&country=us');
    check('App Store 搜索返回应用与图标', apps.status === 200 && apps.body.length > 0 && apps.body[0].iconUrl.startsWith('https://') && apps.body[0].storeUrl.includes('apps.apple.com'), apps.body?.slice(0, 1));
  }

  console.log('\n分类');
  const cats = await req('/categories');
  check('GET /categories 返回内置分类', cats.status === 200 && cats.body.filter((c) => c.isBuiltin).length === 6, cats.body?.length);
  const newCat = await req('/categories', {
    method: 'POST',
    body: JSON.stringify({ label: 'Verify Category', color: '#123456' }),
  });
  const catSlug = newCat.body?.slug;
  check('POST /categories 创建自定义分类', newCat.status === 201 && newCat.body?.label === 'Verify Category' && newCat.body?.isBuiltin === false, newCat.body);
  const dupCat = await req('/categories', {
    method: 'POST',
    body: JSON.stringify({ label: 'Verify Category', color: '#123456' }),
  });
  check('重复分类名称被拒绝', dupCat.status === 400, dupCat.body);
  const builtinCat = cats.body.find((c) => c.isBuiltin);
  const delBuiltinCat = await req(`/categories/${builtinCat.id}`, { method: 'DELETE' });
  check('内置分类不可删除', delBuiltinCat.status === 400, delBuiltinCat.body);

  const catSub = await req('/subscriptions', {
    method: 'POST',
    body: JSON.stringify(subPayload({ name: 'Verify Categorized', category: catSlug })),
  });
  check('订阅可使用自定义分类', catSub.status === 201 && catSub.body?.category === catSlug, catSub.body);
  const catFilter = await req(`/subscriptions?category=${encodeURIComponent(catSlug)}`);
  check('按自定义分类筛选', catFilter.body?.length === 1 && catFilter.body[0].name === 'Verify Categorized', catFilter.body?.length);

  const delUsedCat = await req(`/categories/${newCat.body.id}`, { method: 'DELETE' });
  check('使用中的分类需指定转移目标', delUsedCat.status === 400, delUsedCat.body);
  const delMovedCat = await req(`/categories/${newCat.body.id}?reassign=other`, { method: 'DELETE' });
  check('删除分类并转移关联项', delMovedCat.status === 200 && delMovedCat.body?.reassigned === true, delMovedCat.body);
  const movedSub = await req(`/subscriptions/${catSub.body.id}`);
  check('关联订阅已归入 other', movedSub.body?.category === 'other', movedSub.body?.category);
  const catsAfter = await req('/categories');
  check('自定义分类已删除', !catsAfter.body.some((c) => c.slug === catSlug), catsAfter.body?.length);
  await req(`/subscriptions/${catSub.body.id}`, { method: 'DELETE' });

  console.log('\n导出');
  const csv = await req('/export?format=csv');
  check('CSV 导出含表头', typeof csv.body === 'string' && csv.body.includes('名称,服务,分类,金额,币种'), String(csv.body).slice(0, 80));
  check('CSV 含新建订阅行', typeof csv.body === 'string' && csv.body.includes('Verify Custom 45d'), null);
  check('CSV 响应为附件下载', (csv.headers.get('content-disposition') ?? '').includes('attachment'), csv.headers.get('content-disposition'));

  const json = await req('/export?format=json');
  check('JSON 导出结构完整', json.body?.subscriptions?.length === 3 && Array.isArray(json.body?.payments) && Array.isArray(json.body?.catalog) && Array.isArray(json.body?.currencies), Object.keys(json.body ?? {}));

  const paymentsCsv = await req('/export?format=payments-csv');
  check('流水 CSV 导出含表头', typeof paymentsCsv.body === 'string' && paymentsCsv.body.includes('日期,订阅,分类,金额'), String(paymentsCsv.body).slice(0, 60));

  console.log('\n删除与逐出');
  const del = await req(`/subscriptions/${subId}`, { method: 'DELETE' });
  check('DELETE /subscriptions/:id 返回 204', del.status === 204, del.status);
  const gone = await req(`/subscriptions/${subId}`);
  check('删除后读取返回 404', gone.status === 404, gone.body);
  const delAgain = await req(`/subscriptions/${subId}`, { method: 'DELETE' });
  check('重复删除返回 404', delAgain.status === 404, delAgain.body);

  const delCatalog = await req(`/catalog/${serviceId}`, { method: 'DELETE' });
  check('DELETE /catalog/:id 返回 204', delCatalog.status === 204, delCatalog.status);
  const catalogAfter = await req('/catalog');
  check('删除后服务库不再包含该项', !catalogAfter.body.some((item) => item.id === serviceId), null);

  const clear = await req('/subscriptions', { method: 'DELETE' });
  check('DELETE /subscriptions 清空全部', clear.status === 200 && clear.body?.deleted === 2, clear.body);
  const empty = await req('/subscriptions');
  check('清空后列表为空', empty.body?.length === 0, empty.body);

  const notFound = await req('/does-not-exist');
  check('未知接口返回 404 JSON', notFound.status === 404 && typeof notFound.body?.error === 'string', notFound.body);

  const total = passed + failures.length;
  console.log(`\n${failures.length === 0 ? '\u001b[32m全部通过\u001b[0m' : '\u001b[31m存在失败\u001b[0m'}: ${passed}/${total}`);
  if (failures.length > 0) {
    console.log('失败项:', failures.join(' | '));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('验收脚本异常:', error);
  process.exitCode = 1;
});

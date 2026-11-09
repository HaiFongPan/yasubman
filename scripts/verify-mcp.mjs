#!/usr/bin/env node
/**
 * MCP 端到端验收：用官方 Client 通过 Streamable HTTP 调用所有工具。
 * 用法：MCP_URL=http://localhost:3997/mcp TEST_APPSTORE=1 node scripts/verify-mcp.mjs
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const MCP_URL = process.env.MCP_URL ?? 'http://localhost:3997/mcp';
const HTTP_URL = MCP_URL.replace(/\/mcp$/, '');
let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  \u001b[32m✓\u001b[0m ${name}`);
  } else {
    failures.push(name);
    console.log(`  \u001b[31m✗\u001b[0m ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  }
}

function payload(result) {
  const text = result?.content?.find((item) => item.type === 'text')?.text ?? 'null';
  if (result?.isError) throw new Error(text);
  return JSON.parse(text);
}

async function main() {
  console.log(`\nMCP 验收目标: ${MCP_URL}\n`);

  const client = new Client({ name: 'yasubman-verify', version: '0.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
  await client.connect(transport);

  const { tools } = await client.listTools();
  const names = tools.map((tool) => tool.name);
  check('tools/list 返回工具清单', tools.length >= 12, names);
  check(
    '覆盖订阅与服务管理',
    ['list_subscriptions', 'create_subscription', 'update_subscription', 'set_subscription_status', 'delete_subscription', 'list_payments', 'add_payment', 'delete_payment', 'list_services', 'create_service', 'delete_service', 'search_app_store', 'get_stats', 'refresh_rates'].every((name) => names.includes(name)),
    names,
  );
  check('工具带描述与入参 schema', tools.every((tool) => tool.description && tool.inputSchema), null);

  const before = payload(await client.callTool({ name: 'list_subscriptions', arguments: {} }));
  check('list_subscriptions 返回数组', Array.isArray(before), typeof before);

  const created = payload(
    await client.callTool({
      name: 'create_subscription',
      arguments: {
        name: 'MCP Verify',
        amount: 9.9,
        currency: 'USD',
        cycle: 'monthly',
        anchorDate: '2026-01-31',
        notes: 'created by verify-mcp',
      },
    }),
  );
  check('create_subscription 创建成功', created.id > 0 && created.name === 'MCP Verify', created);
  check('金额与单期折合正确', created.amount === 9.9 && created.amountBase > 0, created);
  check('返回下次续费与基准币种', /^\d{4}-\d{2}-\d{2}$/.test(created.nextDue) && created.baseCurrency === 'CNY', created);

  const updated = payload(
    await client.callTool({
      name: 'update_subscription',
      arguments: { id: created.id, amount: 12.5, notes: 'updated by MCP' },
    }),
  );
  check('update_subscription 局部更新', updated.amount === 12.5 && updated.notes === 'updated by MCP' && updated.currency === 'USD', updated);

  const paused = payload(
    await client.callTool({
      name: 'set_subscription_status',
      arguments: { id: created.id, status: 'paused' },
    }),
  );
  check('暂停后不再计算续费', paused.status === 'paused' && paused.nextDue === null, paused);

  const resumed = payload(
    await client.callTool({
      name: 'set_subscription_status',
      arguments: { id: created.id, status: 'active' },
    }),
  );
  check('恢复活跃后重新计算续费', resumed.status === 'active' && resumed.nextDue, resumed);

  const service = payload(
    await client.callTool({
      name: 'create_service',
      arguments: { name: 'MCP Service', category: 'dev', iconKind: 'initials', iconData: 'MS' },
    }),
  );
  check('create_service 创建自定义服务', service.id > 0 && service.name === 'MCP Service', service);

  const linked = payload(
    await client.callTool({
      name: 'create_subscription',
      arguments: { name: 'MCP Linked', amount: 30, currency: 'CNY', cycle: 'yearly', serviceId: service.id },
    }),
  );
  check('创建订阅可关联服务', linked.serviceId === service.id && linked.service === 'MCP Service', linked);
  check('单期折合不再年化', linked.amountBase === 30, linked.amountBase);

  const services = payload(await client.callTool({ name: 'list_services', arguments: { q: 'MCP Service' } }));
  check('list_services 支持关键词筛选', services.length === 1 && services[0].id === service.id, services);

  const cats = payload(await client.callTool({ name: 'list_categories', arguments: {} }));
  check('list_categories 返回内置分类', Array.isArray(cats) && cats.filter((c) => c.isBuiltin).length === 6, cats?.length);
  const newCat = payload(await client.callTool({ name: 'create_category', arguments: { label: 'MCP Category', color: '#123456' } }));
  check('create_category 创建自定义分类', newCat.slug?.startsWith('c_') && newCat.label === 'MCP Category', newCat);
  const catSub = payload(
    await client.callTool({
      name: 'create_subscription',
      arguments: { name: 'MCP Categorized', amount: 5, category: newCat.slug },
    }),
  );
  check('create_subscription 使用自定义分类', catSub.category === newCat.slug, catSub.category);

  const stats = payload(await client.callTool({ name: 'get_stats', arguments: {} }));
  check('get_stats 返回统计结构', typeof stats.monthActual === 'number' && typeof stats.nextMonthForecast === 'number' && stats.byCategory.length >= 6 && stats.byCategory.every((row) => row.label && row.color) && stats.baseCurrency === 'CNY', Object.keys(stats));

  const today = new Date().toISOString().slice(0, 10);
  const pay = payload(await client.callTool({
    name: 'add_payment',
    arguments: { subscriptionId: created.id, paidOn: today, amount: 9.9, note: 'MCP 流水' },
  }));
  check('add_payment 补录流水', pay.id > 0 && pay.paidOn === today && pay.amount === 9.9, pay);
  const pays = payload(await client.callTool({ name: 'list_payments', arguments: { subscriptionId: created.id } }));
  check('list_payments 返回流水', pays.length === 1 && pays[0].amount === 9.9 && pays[0].source === 'manual', pays);
  const delPay = payload(await client.callTool({ name: 'delete_payment', arguments: { id: pay.id } }));
  check('delete_payment 删除流水', delPay.deleted === true, delPay);
  check('统计包含活跃订阅', stats.activeCount >= 1, stats.activeCount);

  const rates = payload(await client.callTool({ name: 'refresh_rates', arguments: {} }));
  check('refresh_rates 返回同步状态', typeof rates.status === 'string', rates);

  const bad = await client.callTool({
    name: 'create_subscription',
    arguments: { name: 'Bad Currency', amount: 1, currency: 'ZZZ' },
  });
  check('非法币种返回 isError', bad.isError === true && String(bad.content?.[0]?.text).includes('ZZZ'), bad.content?.[0]?.text);

  const missing = await client.callTool({ name: 'get_subscription', arguments: { id: 999999 } });
  check('不存在 ID 返回 isError', missing.isError === true, missing.content?.[0]?.text);

  if (process.env.TEST_APPSTORE === '1') {
    const apps = payload(await client.callTool({ name: 'search_app_store', arguments: { term: 'notion', country: 'us' } }));
    check('search_app_store 返回图标与链接', Array.isArray(apps) && apps.length > 0 && apps[0].iconUrl.startsWith('https://'), apps?.[0]);
  }

  check('delete_subscription 删除', payload(await client.callTool({ name: 'delete_subscription', arguments: { id: created.id } })).deleted, null);
  check('delete_subscription 删除关联项', payload(await client.callTool({ name: 'delete_subscription', arguments: { id: linked.id } })).deleted, null);
  check('delete_service 删除自定义服务', payload(await client.callTool({ name: 'delete_service', arguments: { id: service.id } })).deleted, null);
  check('delete_subscription 删除分类测试项', payload(await client.callTool({ name: 'delete_subscription', arguments: { id: catSub.id } })).deleted, null);
  const catList = payload(await client.callTool({ name: 'list_categories', arguments: {} }));
  const catId = catList.find((c) => c.slug === newCat.slug)?.id;
  check('delete_category 删除自定义分类', payload(await client.callTool({ name: 'delete_category', arguments: { id: catId, reassign: 'other' } })).reassigned === false, null);

  const after = payload(await client.callTool({ name: 'list_subscriptions', arguments: {} }));
  check('数据已清理', after.length === before.length, { before: before.length, after: after.length });

  const getResponse = await fetch(MCP_URL, { method: 'GET' });
  check('GET /mcp 返回 405', getResponse.status === 405, getResponse.status);

  await client.close();

  const total = passed + failures.length;
  console.log(`\n${failures.length === 0 ? '\u001b[32m全部通过\u001b[0m' : '\u001b[31m存在失败\u001b[0m'}: ${passed}/${total}`);
  if (failures.length > 0) {
    console.log('失败项:', failures.join(' | '));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('MCP 验收异常:', error);
  process.exitCode = 1;
});

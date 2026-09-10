import assert from 'node:assert/strict';
import test from 'node:test';
import { CatsRuntimeClient } from '../src/runtime/client.ts';
import { projectUsageSnapshot, projectUsageQuotaRefresh } from '../src/runtime/usageSnapshot.ts';

function fixture() {
  return { schemaVersion: 1, generatedAt: '2026-09-10T00:00:00Z', runtime: { status: 'available', epoch: 'test', secret: 'SECRET' },
    coverage: { mode: 'memory', truncated: false, raw: 'SECRET' }, totals: { costs: [], metadata: { token: 'SECRET' } },
    targets: [{ provider: 'codex', instance: 'default', backend: 'cli', credentials: 'SECRET', usage: { costs: [] },
      quota: { status: 'available', freshness: 'fresh', source: 'codex.account/rateLimits/updated', accountId: 'SECRET', raw: 'SECRET',
        windows: [{ id: 'primary', usedPercent: 20, remainingPercent: 999, token: 'SECRET' }] } }], sessions: [], apiKey: 'SECRET' };
}

test('public telemetry projection drops extra fields and never forwards account identities', () => {
  const projected = projectUsageSnapshot(fixture());
  assert.doesNotMatch(JSON.stringify(projected), /SECRET|credentials|apiKey|metadata/);
  const target = (projected.targets as Array<{ quota: { accountId: unknown; windows: { remainingPercent: number }[] } }>)[0]!;
  assert.equal(target.quota.accountId, null); assert.equal(target.quota.windows[0]!.remainingPercent, 80);
  assert.throws(() => projectUsageSnapshot({ ...fixture(), schemaVersion: 2 }), /Unsupported/);
});

test('runtime usage request stays fixed-route, authenticated, bounded, and rejects upstream errors', async (t) => {
  let fail = false;
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(url, 'http://runtime.test/usage/snapshot');
    assert.equal((options.headers as Record<string, string>).Authorization, 'Bearer fixture-key');
    assert.ok(options.signal);
    return new Response(fail ? 'upstream-private-body' : JSON.stringify(fixture()), { status: fail ? 401 : 200 });
  });
  const client = new CatsRuntimeClient('http://runtime.test', { apiKey: 'fixture-key' });
  assert.doesNotMatch(JSON.stringify(await client.getUsageSnapshot()), /SECRET/);
  fail = true;
  await assert.rejects(client.getUsageSnapshot(), (error: Error) => !error.message.includes('private-body'));
});

test('usage decoding preserves UTF-8 across chunks and rejects oversized streams', async (t) => {
  const data = fixture();
  data.targets[0]!.instance = '用量';
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let oversized = false;
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({
    start(controller) {
      if (oversized) controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
      else for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
      controller.close();
    },
  })));
  const client = new CatsRuntimeClient('http://runtime.test');
  const snapshot = await client.getUsageSnapshot();
  assert.equal((snapshot.targets as Array<{ instance: string }>)[0]!.instance, '用量');
  oversized = true;
  await assert.rejects(client.getUsageSnapshot(), /size limit/);
});

test('quota refresh is a separate authenticated fixed-route POST and projects only safe facts', async (t) => {
  const snapshot = fixture();
  snapshot.targets[0]!.quota.source = 'codex.account/rateLimits/read';
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(url, 'http://runtime.test/usage/refresh'); assert.equal(options.method, 'POST');
    assert.equal((options.headers as Record<string, string>).Authorization, 'Bearer fixture-key');
    assert.deepEqual(JSON.parse(String(options.body)), { provider: 'codex', instance: 'default' });
    return new Response(JSON.stringify({ status: 'updated', nextRefreshAt: '2026-09-10T00:01:00Z', snapshot, raw: 'SECRET' }));
  });
  const client = new CatsRuntimeClient('http://runtime.test', { apiKey: 'fixture-key' });
  const result = await client.refreshUsageQuota({ provider: 'codex', instance: 'default' });
  assert.equal(result.status, 'updated'); assert.doesNotMatch(JSON.stringify(result), /SECRET/);
  assert.match(JSON.stringify(result), /provider_account_query/);
  await assert.rejects(client.refreshUsageQuota({ provider: 'kiro', instance: 'default' } as never), /Invalid quota target/);
  assert.throws(() => projectUsageQuotaRefresh({ status: 'invented', snapshot }), /Unsupported/);
});

test('Copilot quota keeps native quantities, unlimited meaning and source through the bridge', async (t) => {
  const data = fixture();
  data.targets[0]!.provider = 'copilot';
  Object.assign(data.targets[0]!.quota, { source: 'copilot.account.getQuota', refreshSupported: true, windows: [
    { id: 'premium_interactions', unit: 'requests', used: 60, limit: 300, remaining: 240, usedPercent: 20, token: 'SECRET' },
    { id: 'chat', unit: 'requests', used: 0, limit: -1, remaining: 999, usedPercent: 0, unlimited: true },
  ] });
  t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
    assert.deepEqual(JSON.parse(String(options.body)), { provider: 'copilot', instance: 'default' });
    return new Response(JSON.stringify({ status: 'updated', nextRefreshAt: null, snapshot: data }));
  });
  const client = new CatsRuntimeClient('http://runtime.test');
  const result = await client.refreshUsageQuota({ provider: 'copilot', instance: 'default' });
  const snapshot = result.snapshot as ReturnType<typeof projectUsageSnapshot>;
  const [target] = snapshot.targets as Array<{ quota: { source: string; scope: string; refreshSupported: boolean; windows: Array<Record<string, unknown>> } }>;
  assert.equal(target!.quota.source, 'copilot.account.getQuota');
  assert.equal(target!.quota.scope, 'provider_account_query');
  assert.equal(target!.quota.refreshSupported, true);
  assert.equal(target!.quota.windows[0]!.remaining, 240);
  assert.equal(target!.quota.windows[0]!.unit, 'requests');
  assert.equal(target!.quota.windows[1]!.unlimited, true);
  assert.equal(target!.quota.windows[1]!.limit, null);
  assert.equal(target!.quota.windows[1]!.remainingPercent, null);
  assert.doesNotMatch(JSON.stringify(result), /SECRET/);
});

test('Claude get_usage percentages remain account facts, not session or fractional usage', async (t) => {
  const data = fixture();
  data.targets[0]!.provider = 'claude';
  Object.assign(data.targets[0]!.quota, { source: 'claude.get_usage', refreshSupported: true,
    windows: [{ id: 'seven_day', unit: 'percent', usedPercent: 6 }] });
  t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
    assert.deepEqual(JSON.parse(String(options.body)), { provider: 'claude', instance: 'default' });
    return new Response(JSON.stringify({ status: 'updated', nextRefreshAt: null, snapshot: data }));
  });
  const result = await new CatsRuntimeClient('http://runtime.test').refreshUsageQuota({ provider: 'claude', instance: 'default' });
  const snapshot = result.snapshot as ReturnType<typeof projectUsageSnapshot>;
  const [target] = snapshot.targets as Array<{ quota: { source: string; scope: string; refreshSupported: boolean; windows: Array<Record<string, unknown>> } }>;
  assert.equal(target!.quota.source, 'claude.get_usage');
  assert.equal(target!.quota.scope, 'provider_account_query');
  assert.equal(target!.quota.refreshSupported, true);
  assert.equal(target!.quota.windows[0]!.remainingPercent, 94);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearProviderRegistryClientCache, fetchProviderRegistryFromClientCache,
  peekProviderRegistryClientCache, subscribeProviderRegistry,
} from '../src/app/renderer/providerRegistryClient.ts';
import {
  fetchProviderModelCatalogFromClientCache, peekProviderModelCatalogFromClientCache,
} from '../src/app/renderer/providerCatalogClient.ts';
import { logoutPlatformSession } from '../src/app/renderer/auth/api.ts';

function registry(revision = 'one', providers = ['claude']) {
  return Response.json({ revision, state: providers.length ? 'ready' : 'no_usable_targets',
    providers: providers.map((id) => ({ id, label: id, instances: [
      { id: 'native', target: 'cli/native', backend: 'cli', label: 'Native' },
    ] })) });
}

test('coalesces concurrent reads but verifies selection on every reopened picker', async () => {
  clearProviderRegistryClientCache();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  const fetchImpl = async () => { calls++; await gate; return registry(); };
  const first = fetchProviderRegistryFromClientCache({ fetchImpl });
  const second = fetchProviderRegistryFromClientCache({ fetchImpl });
  release();
  assert.equal((await first).providers.length, 1);
  assert.equal((await second).revision, 'one');
  assert.equal(calls, 1);
  const reopened = await fetchProviderRegistryFromClientCache({ fetchImpl: async () => registry('two', []) });
  assert.deepEqual(reopened.providers, []);
  assert.equal(reopened.revision, 'two');
});

test('retains last successful choices across long idle and temporary Runtime disconnection', async (t) => {
  clearProviderRegistryClientCache();
  await fetchProviderRegistryFromClientCache({ fetchImpl: async () => registry() });
  const later = Date.now() + 24 * 60 * 60_000;
  t.mock.method(Date, 'now', () => later);
  assert.equal(peekProviderRegistryClientCache()?.providers[0]?.id, 'claude');
  const failed = await fetchProviderRegistryFromClientCache({ fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(failed.state, 'runtime_unreachable');
  assert.equal(failed.providers[0]?.id, 'claude');
  assert.equal(failed.revision, 'one');
  assert.equal((await fetchProviderRegistryFromClientCache({ fetchImpl: async () => registry('two') })).state, 'ready');
});

test('invalidation prevents a late registry response from restoring removed choices', async () => {
  clearProviderRegistryClientCache();
  let release!: (value: Response) => void;
  const pending = fetchProviderRegistryFromClientCache({ fetchImpl: () => new Promise((resolve) => { release = resolve; }) });
  const rejected = assert.rejects(pending, /superseded/);
  clearProviderRegistryClientCache();
  await fetchProviderRegistryFromClientCache({ fetchImpl: async () => registry('two', []) });
  release(registry('one'));
  await rejected;
  assert.deepEqual(peekProviderRegistryClientCache()?.providers, []);
});

test('a forced request supersedes an older request without erasing the new in-flight request', async () => {
  clearProviderRegistryClientCache();
  let releaseOld!: (value: Response) => void;
  let releaseNew!: (value: Response) => void;
  const old = fetchProviderRegistryFromClientCache({ fetchImpl: () => new Promise((resolve) => { releaseOld = resolve; }) });
  const rejected = assert.rejects(old, /superseded/);
  const next = fetchProviderRegistryFromClientCache({ force: true,
    fetchImpl: () => new Promise((resolve) => { releaseNew = resolve; }) });
  releaseOld(registry('one'));
  await rejected;
  const shared = fetchProviderRegistryFromClientCache({ fetchImpl: async () => { throw new Error('must coalesce'); } });
  releaseNew(registry('two', []));
  assert.equal((await next).revision, 'two');
  assert.equal((await shared).revision, 'two');
});

test('selection revision changes clear model caches and notify mounted pickers', async () => {
  clearProviderRegistryClientCache();
  await fetchProviderRegistryFromClientCache({ fetchImpl: async () => registry() });
  await fetchProviderModelCatalogFromClientCache({ provider: 'claude', instance: 'cli/native',
    fetchImpl: async () => Response.json({ catalog: { provider: 'claude', instance: 'cli/native', models: [] } }) });
  assert.ok(peekProviderModelCatalogFromClientCache({ provider: 'claude', instance: 'cli/native' }));
  const seen: string[] = [];
  const unsubscribe = subscribeProviderRegistry((value) => { seen.push(value.revision ?? 'offline'); });
  try {
    await fetchProviderRegistryFromClientCache({ fetchImpl: async () => registry('two', []) });
    assert.deepEqual(seen, ['two']);
    assert.equal(peekProviderModelCatalogFromClientCache({ provider: 'claude', instance: 'cli/native' }), null);
  } finally { unsubscribe(); }
});

test('authenticated-session failure clears retained data and rejects late writes', async () => {
  clearProviderRegistryClientCache();
  await fetchProviderRegistryFromClientCache({ fetchImpl: async () => registry() });
  let release!: (response: Response) => void;
  const late = fetchProviderModelCatalogFromClientCache({ provider: 'claude', instance: 'cli/native',
    fetchImpl: () => new Promise((resolve) => { release = resolve; }) });
  const rejected = assert.rejects(late, /selection changed/);
  await assert.rejects(fetchProviderRegistryFromClientCache({
    fetchImpl: async () => Response.json({ error: { message: 'Authentication required' } }, { status: 401 }),
  }), /session is unavailable/);
  assert.equal(peekProviderRegistryClientCache(), null);
  release(Response.json({ catalog: { provider: 'claude', instance: 'cli/native', models: [] } }));
  await rejected;
  assert.equal(peekProviderModelCatalogFromClientCache({ provider: 'claude', instance: 'cli/native' }), null);
});

test('successful logout invalidates provider and model caches', async (t) => {
  clearProviderRegistryClientCache();
  await fetchProviderRegistryFromClientCache({ fetchImpl: async () => registry() });
  await fetchProviderModelCatalogFromClientCache({ provider: 'claude', instance: 'cli/native',
    fetchImpl: async () => Response.json({ catalog: { provider: 'claude', instance: 'cli/native', models: [] } }) });
  t.mock.method(globalThis, 'fetch', async () => Response.json({ authenticated: false, csrfToken: null }));
  await logoutPlatformSession('test-csrf', { fallbackMessageForStatus: () => 'failed' });
  assert.equal(peekProviderRegistryClientCache(), null);
  assert.equal(peekProviderModelCatalogFromClientCache({ provider: 'claude', instance: 'cli/native' }), null);
});

test('old registry and model auth errors cannot clear a newer authenticated session', async () => {
  clearProviderRegistryClientCache();
  let releaseRegistry!: (response: Response) => void;
  let releaseModels!: (response: Response) => void;
  const oldRegistry = fetchProviderRegistryFromClientCache({
    fetchImpl: () => new Promise((resolve) => { releaseRegistry = resolve; }),
  });
  const oldModels = fetchProviderModelCatalogFromClientCache({ provider: 'claude', instance: 'cli/native',
    fetchImpl: () => new Promise((resolve) => { releaseModels = resolve; }) });
  const registryRejected = assert.rejects(oldRegistry, /session is unavailable/);
  const modelsRejected = assert.rejects(oldModels, /session is unavailable/);
  clearProviderRegistryClientCache();
  await fetchProviderRegistryFromClientCache({ fetchImpl: async () => registry('new-session') });
  await fetchProviderModelCatalogFromClientCache({ provider: 'claude', instance: 'cli/native',
    fetchImpl: async () => Response.json({ catalog: { provider: 'claude', instance: 'cli/native', models: [] } }) });
  releaseRegistry(Response.json({}, { status: 401 }));
  releaseModels(Response.json({}, { status: 403 }));
  await Promise.all([registryRejected, modelsRejected]);
  assert.equal(peekProviderRegistryClientCache()?.revision, 'new-session');
  assert.ok(peekProviderModelCatalogFromClientCache({ provider: 'claude', instance: 'cli/native' }));
});

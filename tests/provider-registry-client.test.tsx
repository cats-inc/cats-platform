import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearProviderRegistryClientCache, fetchProviderRegistryFromClientCache,
  peekProviderRegistryClientCache, subscribeProviderRegistry,
} from '../src/app/renderer/providerRegistryClient.ts';
import {
  fetchProviderModelCatalogFromClientCache, peekProviderModelCatalogFromClientCache,
} from '../src/app/renderer/providerCatalogClient.ts';

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

test('drops cached choices when the connected Runtime cannot verify selection', async () => {
  clearProviderRegistryClientCache();
  await fetchProviderRegistryFromClientCache({ fetchImpl: async () => registry() });
  const failed = await fetchProviderRegistryFromClientCache({ fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(failed.state, 'runtime_unreachable');
  assert.deepEqual(failed.providers, []);
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

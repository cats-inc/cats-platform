import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearProviderRegistryClientCache,
  fetchProviderRegistryFromClientCache,
  prefetchProviderRegistryFromClientCache,
  PROVIDER_REGISTRY_CLIENT_CACHE_TTL_MS,
} from '../src/app/renderer/providerRegistryClient.ts';

test('client provider registry cache dedupes in-flight reads and reuses the warmed result', async () => {
  clearProviderRegistryClientCache();
  let calls = 0;
  let releaseFetch: (() => void) | null = null;
  const fetchGate = new Promise<void>((resolve) => {
    releaseFetch = resolve;
  });

  const fetchImpl = async () => {
    calls += 1;
    await fetchGate;
    return new Response(JSON.stringify({
      state: 'ready',
      providers: [{
        id: 'claude',
        label: 'Claude',
        defaultModel: 'sonnet',
        defaultInstance: 'native',
        defaultBackend: 'cli',
        instances: [{
          id: 'native',
          label: 'cli/native',
          target: 'cli/native',
          backend: 'cli',
          default: true,
        }],
        modelsPath: '/api/providers/claude/models',
      }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const prefetchPromise = prefetchProviderRegistryFromClientCache({ fetchImpl });
  const fetchPromise = fetchProviderRegistryFromClientCache({ fetchImpl });
  releaseFetch?.();

  await prefetchPromise;
  const registry = await fetchPromise;
  assert.equal(calls, 1);
  assert.equal(registry.state, 'ready');
  assert.equal(registry.providers.length, 1);

  const cachedRegistry = await fetchProviderRegistryFromClientCache({
    fetchImpl: async () => {
      throw new Error('cache miss');
    },
  });
  assert.equal(cachedRegistry.providers[0]?.id, 'claude');
});

test('client provider registry cache refreshes after ttl expiry', async () => {
  clearProviderRegistryClientCache();
  const originalDateNow = Date.now;
  let nowMs = Date.parse('2026-04-08T12:00:00.000Z');
  let calls = 0;

  Date.now = () => nowMs;
  try {
    const first = await fetchProviderRegistryFromClientCache({
      fetchImpl: async () => {
        calls += 1;
        return new Response(JSON.stringify({
          state: 'ready',
          providers: [{
            id: `claude-${calls}`,
            label: 'Claude',
            defaultModel: 'sonnet',
            defaultInstance: 'native',
            defaultBackend: 'cli',
            instances: [{
              id: 'native',
              label: 'cli/native',
              target: 'cli/native',
              backend: 'cli',
              default: true,
            }],
            modelsPath: '/api/providers/claude/models',
          }],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    assert.equal(first.providers[0]?.id, 'claude-1');

    nowMs += PROVIDER_REGISTRY_CLIENT_CACHE_TTL_MS - 1;
    const cached = await fetchProviderRegistryFromClientCache({
      fetchImpl: async () => {
        calls += 1;
        throw new Error('should not refresh yet');
      },
    });
    assert.equal(cached.providers[0]?.id, 'claude-1');

    nowMs += 2;
    const refreshed = await fetchProviderRegistryFromClientCache({
      fetchImpl: async () => {
        calls += 1;
        return new Response(JSON.stringify({
          state: 'ready',
          providers: [{
            id: `claude-${calls}`,
            label: 'Claude',
            defaultModel: 'sonnet',
            defaultInstance: 'native',
            defaultBackend: 'cli',
            instances: [{
              id: 'native',
              label: 'cli/native',
              target: 'cli/native',
              backend: 'cli',
              default: true,
            }],
            modelsPath: '/api/providers/claude/models',
          }],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    assert.equal(refreshed.providers[0]?.id, 'claude-2');
  } finally {
    Date.now = originalDateNow;
    clearProviderRegistryClientCache();
  }
});

test('client provider registry cache normalizes thrown fetch failures into runtime_unreachable state', async () => {
  clearProviderRegistryClientCache();

  const registry = await fetchProviderRegistryFromClientCache({
    force: true,
    fetchImpl: async () => {
      throw new Error('The operation was aborted due to timeout');
    },
  });

  assert.equal(registry.state, 'runtime_unreachable');
  assert.deepEqual(registry.providers, []);
  assert.equal(registry.warnings?.[0], 'The operation was aborted due to timeout');
});

test('client provider registry cache does not keep runtime_unreachable results warm', async () => {
  clearProviderRegistryClientCache();
  let calls = 0;

  const first = await fetchProviderRegistryFromClientCache({
    fetchImpl: async () => {
      calls += 1;
      throw new Error('cold start');
    },
  });
  assert.equal(first.state, 'runtime_unreachable');

  const second = await fetchProviderRegistryFromClientCache({
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({
        state: 'ready',
        providers: [{
          id: 'claude',
          label: 'Claude',
          defaultModel: 'sonnet',
          defaultInstance: 'native',
          defaultBackend: 'cli',
          instances: [{
            id: 'native',
            label: 'cli/native',
            target: 'cli/native',
            backend: 'cli',
            default: true,
          }],
          modelsPath: '/api/providers/claude/models',
        }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  assert.equal(calls, 2);
  assert.equal(second.state, 'ready');
  assert.equal(second.providers[0]?.id, 'claude');
});

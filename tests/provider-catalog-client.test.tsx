import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearProviderCatalogClientCache,
  fetchProviderAdvancedCatalogFromClientCache,
  fetchProviderModelCatalogFromClientCache,
  prefetchProviderCatalogsForRegistryFromClientCache,
  PROVIDER_CATALOG_CLIENT_CACHE_TTL_MS,
} from '../src/app/renderer/providerCatalogClient.ts';

function createModelCatalogResponse(modelId: string): Response {
  return new Response(JSON.stringify({
    catalog: {
      provider: 'claude',
      backend: 'cli',
      instance: 'native',
      defaultModel: modelId,
      source: 'dynamic',
      cache: null,
      models: [
        { id: modelId, label: modelId, default: true },
      ],
      warnings: [],
    },
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function createAdvancedCatalogResponse(entryId: string): Response {
  return new Response(JSON.stringify({
    catalog: {
      provider: 'claude',
      backend: 'cli',
      instance: 'native',
      defaultModel: entryId,
      source: 'dynamic',
      cache: null,
      entries: [
        { id: entryId, label: entryId, default: true },
      ],
      presets: [],
      controls: [],
      defaultSelection: {
        entryId,
        entryMode: 'explicit',
      },
      support: {
        tier: 'full',
        notes: [],
      },
      warnings: [],
    },
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

test('client provider catalog cache dedupes in-flight model reads and reuses the warmed result', async () => {
  clearProviderCatalogClientCache();
  let calls = 0;
  const paths: string[] = [];
  let releaseFetch: (() => void) | null = null;
  const fetchGate = new Promise<void>((resolve) => {
    releaseFetch = resolve;
  });

  const fetchImpl: typeof fetch = async (input) => {
    calls += 1;
    paths.push(String(input));
    await fetchGate;
    return createModelCatalogResponse('opus');
  };

  const firstRead = fetchProviderModelCatalogFromClientCache({
    provider: 'claude',
    instance: ' native ',
    fetchImpl,
  });
  const secondRead = fetchProviderModelCatalogFromClientCache({
    provider: 'claude',
    instance: 'native',
    fetchImpl,
  });
  releaseFetch?.();

  const [firstCatalog, secondCatalog] = await Promise.all([firstRead, secondRead]);
  assert.equal(calls, 1);
  assert.deepEqual(paths, ['/api/providers/claude/models?instance=native']);
  assert.equal(firstCatalog, secondCatalog);
  assert.equal(firstCatalog.models[0]?.id, 'opus');

  const cachedCatalog = await fetchProviderModelCatalogFromClientCache({
    provider: 'claude',
    instance: 'native',
    fetchImpl: async () => {
      throw new Error('cache miss');
    },
  });
  assert.equal(cachedCatalog.models[0]?.id, 'opus');
});

test('client provider catalog cache keeps model and advanced buckets isolated', async () => {
  clearProviderCatalogClientCache();
  const paths: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const path = String(input);
    paths.push(path);
    if (path.includes('/advanced')) {
      return createAdvancedCatalogResponse('sonnet');
    }
    return createModelCatalogResponse('sonnet');
  };

  const modelCatalog = await fetchProviderModelCatalogFromClientCache({
    provider: 'claude',
    instance: 'native',
    fetchImpl,
  });
  const advancedCatalog = await fetchProviderAdvancedCatalogFromClientCache({
    provider: 'claude',
    instance: 'native',
    fetchImpl,
  });

  assert.deepEqual(paths, [
    '/api/providers/claude/models?instance=native',
    '/api/providers/claude/models/advanced?instance=native',
  ]);
  assert.equal(modelCatalog.models[0]?.id, 'sonnet');
  assert.equal(advancedCatalog.entries[0]?.id, 'sonnet');
});

test('client provider catalog cache refreshes after ttl expiry', async () => {
  clearProviderCatalogClientCache();
  const originalDateNow = Date.now;
  let nowMs = Date.parse('2026-04-21T06:00:00.000Z');
  let calls = 0;

  Date.now = () => nowMs;
  try {
    const first = await fetchProviderModelCatalogFromClientCache({
      provider: 'claude',
      instance: 'native',
      fetchImpl: async () => {
        calls += 1;
        return createModelCatalogResponse(`model-${calls}`);
      },
    });
    assert.equal(first.models[0]?.id, 'model-1');

    nowMs += PROVIDER_CATALOG_CLIENT_CACHE_TTL_MS - 1;
    const cached = await fetchProviderModelCatalogFromClientCache({
      provider: 'claude',
      instance: 'native',
      fetchImpl: async () => {
        calls += 1;
        throw new Error('should not refresh yet');
      },
    });
    assert.equal(cached.models[0]?.id, 'model-1');

    nowMs += 2;
    const refreshed = await fetchProviderModelCatalogFromClientCache({
      provider: 'claude',
      instance: 'native',
      fetchImpl: async () => {
        calls += 1;
        return createModelCatalogResponse(`model-${calls}`);
      },
    });
    assert.equal(refreshed.models[0]?.id, 'model-2');
  } finally {
    Date.now = originalDateNow;
    clearProviderCatalogClientCache();
  }
});

test('client provider catalog cache does not cache failed catalog reads', async () => {
  clearProviderCatalogClientCache();
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({
        error: {
          message: 'runtime catalog unavailable',
        },
      }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    }
    return createModelCatalogResponse('haiku');
  };

  await assert.rejects(
    fetchProviderModelCatalogFromClientCache({
      provider: 'claude',
      instance: 'native',
      fetchImpl,
    }),
    /runtime catalog unavailable/u,
  );

  const recovered = await fetchProviderModelCatalogFromClientCache({
    provider: 'claude',
    instance: 'native',
    fetchImpl,
  });
  assert.equal(calls, 2);
  assert.equal(recovered.models[0]?.id, 'haiku');
});

test('client provider catalog prefetch warms model and advanced catalogs for registry defaults', async () => {
  clearProviderCatalogClientCache();
  const paths: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const path = String(input);
    paths.push(path);
    return path.includes('/advanced')
      ? createAdvancedCatalogResponse('opus')
      : createModelCatalogResponse('opus');
  };

  await prefetchProviderCatalogsForRegistryFromClientCache({
    state: 'ready',
    providers: [{
      id: 'claude',
      label: 'Claude',
      defaultModel: 'opus',
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
  }, { fetchImpl });

  assert.deepEqual(paths, [
    '/api/providers/claude/models?instance=native',
    '/api/providers/claude/models/advanced?instance=native',
  ]);

  const modelCatalog = await fetchProviderModelCatalogFromClientCache({
    provider: 'claude',
    instance: 'native',
    fetchImpl: async () => {
      throw new Error('cache miss');
    },
  });
  const advancedCatalog = await fetchProviderAdvancedCatalogFromClientCache({
    provider: 'claude',
    instance: 'native',
    fetchImpl: async () => {
      throw new Error('cache miss');
    },
  });

  assert.equal(modelCatalog.models[0]?.id, 'opus');
  assert.equal(advancedCatalog.entries[0]?.id, 'opus');
});

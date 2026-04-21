import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import {
  MODEL_CATALOG_CACHE_REFRESH_WARNING_PREFIX as MODEL_CATALOG_CACHE_WARNING_PREFIX,
  PROVIDER_TARGETS_CACHE_REFRESH_WARNING_PREFIX as PROVIDER_TARGETS_CACHE_WARNING_PREFIX,
} from '../build/server/server/routes/providers.js';

let dateNowMockLock = Promise.resolve();

const baseConfig = {
  host: '127.0.0.1',
  port: 0,
  runtimeBaseUrl: 'http://127.0.0.1:3110',
  runtimeApiKey: '',
  chatStatePath: 'unused-for-tests',
};

function listCacheRefreshWarnings(warnings, prefix) {
  return warnings.filter((warning) => warning.startsWith(prefix));
}

function createRuntimeRequestError(message, status) {
  return Object.assign(new Error(message), { status });
}

function createRuntimeStub() {
  return {
    async getHealth() {
      return {
        baseUrl: 'http://127.0.0.1:3110',
        reachable: true,
        status: 'ok',
        service: 'cats-runtime',
      };
    },
    async getProviderConfig() {
      return {
        claude: {
          defaultInstance: 'native',
          defaultBackend: 'cli',
          instances: [
            {
              id: 'native',
              target: 'cli/native',
              backend: 'cli',
              command: 'claude',
              runner: null,
              runtime: null,
              transport: null,
              model: null,
            },
          ],
        },
      };
    },
    async getProviderDiagnostics(query = {}) {
      const providers = [
        {
          provider: 'claude',
          backend: 'cli',
          instance: 'native',
          defaultTarget: true,
          availability: {
            status: 'ok',
            summary: 'CLI ready',
            attentionCodes: [],
          },
        },
      ];
      return {
        probe: 'light',
        providers: typeof query.provider === 'string' && query.provider.trim().length > 0
          ? providers.filter((entry) => entry.provider === query.provider)
          : providers,
      };
    },
    async getProviderModels(provider, instance) {
      return {
        provider,
        backend: 'cli',
        instance: instance ?? 'native',
        defaultModel: `${provider}-default`,
        source: 'config',
        cache: null,
        models: [
          { id: `${provider}-default`, label: `${provider} default`, default: true },
        ],
        warnings: [],
      };
    },
    async getAdvancedProviderModels(provider, instance) {
      return {
        provider,
        backend: 'cli',
        instance: instance ?? 'native',
        defaultSelection: null,
        entries: [
          { id: `${provider}-default`, label: `${provider} default`, default: true },
        ],
        presets: [],
        controls: [],
        warnings: [],
      };
    },
  };
}

async function withServer(runtimeClient, callback) {
  const server = createServer({
    shared: {
      config: baseConfig,
      runtimeClient,
      now: () => new Date('2026-04-21T00:00:00.000Z'),
    },
    chat: {
      chatStore: new MemoryChatStore(),
    },
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve test server address');
  }

  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

async function withMockedDateNow(initialNowMs, callback) {
  const previousLock = dateNowMockLock;
  let releaseLock = () => {};
  dateNowMockLock = new Promise((resolve) => {
    releaseLock = resolve;
  });

  await previousLock;
  const originalDateNow = Date.now;
  let currentNowMs = initialNowMs;
  Date.now = () => currentNowMs;
  try {
    await callback({
      advance(ms) {
        currentNowMs += ms;
      },
      set(value) {
        currentNowMs = value;
      },
    });
  } finally {
    Date.now = originalDateNow;
    releaseLock();
  }
}

test('GET /api/providers/:provider/models scopes selector diagnostics to the requested provider', async () => {
  const runtimeClient = createRuntimeStub();
  const originalGetProviderDiagnostics = runtimeClient.getProviderDiagnostics;
  const diagnosticsQueries = [];

  runtimeClient.getProviderDiagnostics = async (query = {}) => {
    diagnosticsQueries.push({ ...query });
    return originalGetProviderDiagnostics.call(runtimeClient, query);
  };

  await withServer(runtimeClient, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/providers/claude/models`);
    assert.equal(response.status, 200);
  });

  assert.deepEqual(diagnosticsQueries, [
    {
      provider: 'claude',
      scope: 'availability',
    },
  ]);
});

test('GET /api/providers/:provider/models/advanced scopes selector diagnostics to the requested provider', async () => {
  const runtimeClient = createRuntimeStub();
  const originalGetProviderDiagnostics = runtimeClient.getProviderDiagnostics;
  const diagnosticsQueries = [];

  runtimeClient.getProviderDiagnostics = async (query = {}) => {
    diagnosticsQueries.push({ ...query });
    return originalGetProviderDiagnostics.call(runtimeClient, query);
  };

  await withServer(runtimeClient, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/providers/claude/models/advanced`);
    assert.equal(response.status, 200);
  });

  assert.deepEqual(diagnosticsQueries, [
    {
      provider: 'claude',
      scope: 'availability',
    },
  ]);
});

test('GET /api/providers keeps the last good selector after a transient refresh timeout', async () => {
  const runtimeClient = createRuntimeStub();
  const originalGetProviderDiagnostics = runtimeClient.getProviderDiagnostics;
  const initialNowMs = Date.parse('2026-04-21T04:30:00.000Z');
  let failRefresh = false;
  let diagnosticsCalls = 0;

  runtimeClient.getProviderDiagnostics = async (query = {}) => {
    diagnosticsCalls += 1;
    if (failRefresh) {
      throw new Error('The operation was aborted due to timeout');
    }
    return originalGetProviderDiagnostics.call(runtimeClient, query);
  };

  await withMockedDateNow(initialNowMs, async (clock) => {
    await withServer(runtimeClient, async (baseUrl) => {
      const first = await fetch(`${baseUrl}/api/providers`);
      assert.equal(first.status, 200);
      const firstPayload = await first.json();
      assert.equal(firstPayload.state, 'ready');

      failRefresh = true;
      clock.advance(21_000);
      const second = await fetch(`${baseUrl}/api/providers`);
      assert.equal(second.status, 200);
      const secondPayload = await second.json();
      assert.equal(secondPayload.state, 'ready');
      assert.ok(secondPayload.providers.some((provider) => provider.id === 'claude'));
      assert.match(secondPayload.warnings.at(-1), /Using cached provider targets/u);

      const third = await fetch(`${baseUrl}/api/providers`);
      assert.equal(third.status, 200);
      assert.equal(diagnosticsCalls, 2);

      clock.advance(30_001);
      const fourth = await fetch(`${baseUrl}/api/providers`);
      assert.equal(fourth.status, 200);
      const fourthPayload = await fourth.json();
      assert.equal(
        listCacheRefreshWarnings(
          fourthPayload.warnings,
          PROVIDER_TARGETS_CACHE_WARNING_PREFIX,
        ).length,
        1,
      );
      assert.equal(diagnosticsCalls, 3);

      clock.set(initialNowMs + 600_001);
      const expired = await fetch(`${baseUrl}/api/providers`);
      assert.equal(expired.status, 200);
      const expiredPayload = await expired.json();
      assert.equal(expiredPayload.state, 'runtime_unreachable');
    });
  });

  assert.equal(diagnosticsCalls, 4);
});

test('GET /api/providers/:provider/models serves stale catalog after transient runtime failures', async () => {
  const runtimeClient = createRuntimeStub();
  const originalGetProviderModels = runtimeClient.getProviderModels;
  const initialNowMs = Date.parse('2026-04-21T05:00:00.000Z');
  let failCatalogRefresh = false;
  let modelCalls = 0;

  runtimeClient.getProviderModels = async (provider, instance) => {
    modelCalls += 1;
    if (failCatalogRefresh) {
      throw new Error('Runtime catalog unavailable.');
    }
    const catalog = await originalGetProviderModels.call(runtimeClient, provider, instance);
    return {
      ...catalog,
      warnings: ['Using cached authentication token'],
    };
  };

  await withMockedDateNow(initialNowMs, async (clock) => {
    await withServer(runtimeClient, async (baseUrl) => {
      const first = await fetch(`${baseUrl}/api/providers/claude/models`);
      assert.equal(first.status, 200);
      const firstPayload = await first.json();
      assert.equal(firstPayload.catalog.models[0].id, 'claude-default');

      failCatalogRefresh = true;
      clock.advance(361_000);
      const second = await fetch(`${baseUrl}/api/providers/claude/models`);
      assert.equal(second.status, 200);
      const secondPayload = await second.json();
      assert.equal(secondPayload.catalog.models[0].id, 'claude-default');
      assert.match(secondPayload.catalog.warnings.at(-1), /Using cached model catalog/u);

      const third = await fetch(`${baseUrl}/api/providers/claude/models`);
      assert.equal(third.status, 200);
      assert.equal(modelCalls, 2);

      clock.advance(30_001);
      const fourth = await fetch(`${baseUrl}/api/providers/claude/models`);
      assert.equal(fourth.status, 200);
      const fourthPayload = await fourth.json();
      assert.ok(fourthPayload.catalog.warnings.includes('Using cached authentication token'));
      assert.equal(
        listCacheRefreshWarnings(
          fourthPayload.catalog.warnings,
          MODEL_CATALOG_CACHE_WARNING_PREFIX,
        ).length,
        1,
      );
      assert.equal(modelCalls, 3);

      clock.set(initialNowMs + 600_001);
      const expired = await fetch(`${baseUrl}/api/providers/claude/models`);
      assert.ok(expired.status >= 500 && expired.status < 600);
      assert.equal(modelCalls, 4);
    });
  });
});

test('GET /api/providers/:provider/models replaces generated stale warnings and clears them after recovery', async () => {
  const runtimeClient = createRuntimeStub();
  const originalGetProviderModels = runtimeClient.getProviderModels;
  const initialNowMs = Date.parse('2026-04-21T05:15:00.000Z');
  let failCatalogRefresh = false;
  let failureCount = 0;
  let modelCalls = 0;

  runtimeClient.getProviderModels = async (provider, instance) => {
    modelCalls += 1;
    if (failCatalogRefresh) {
      failureCount += 1;
      throw new Error(failureCount === 1
        ? 'Runtime catalog unavailable.'
        : 'Runtime catalog still unavailable.');
    }
    const catalog = await originalGetProviderModels.call(runtimeClient, provider, instance);
    return {
      ...catalog,
      warnings: ['Using cached authentication token'],
    };
  };

  await withMockedDateNow(initialNowMs, async (clock) => {
    await withServer(runtimeClient, async (baseUrl) => {
      const first = await fetch(`${baseUrl}/api/providers/claude/models`);
      assert.equal(first.status, 200);

      failCatalogRefresh = true;
      clock.advance(361_000);
      const firstFailure = await fetch(`${baseUrl}/api/providers/claude/models`);
      assert.equal(firstFailure.status, 200);
      const firstFailurePayload = await firstFailure.json();
      const firstFailureCacheWarnings = listCacheRefreshWarnings(
        firstFailurePayload.catalog.warnings,
        MODEL_CATALOG_CACHE_WARNING_PREFIX,
      );
      assert.equal(firstFailureCacheWarnings.length, 1);
      assert.match(firstFailureCacheWarnings[0], /Runtime catalog unavailable\./u);

      clock.advance(30_001);
      const secondFailure = await fetch(`${baseUrl}/api/providers/claude/models`);
      assert.equal(secondFailure.status, 200);
      const secondFailurePayload = await secondFailure.json();
      const secondFailureCacheWarnings = listCacheRefreshWarnings(
        secondFailurePayload.catalog.warnings,
        MODEL_CATALOG_CACHE_WARNING_PREFIX,
      );
      assert.equal(secondFailureCacheWarnings.length, 1);
      assert.match(secondFailureCacheWarnings[0], /Runtime catalog still unavailable\./u);
      assert.ok(secondFailurePayload.catalog.warnings.includes('Using cached authentication token'));

      failCatalogRefresh = false;
      clock.advance(30_001);
      const recovered = await fetch(`${baseUrl}/api/providers/claude/models`);
      assert.equal(recovered.status, 200);
      const recoveredPayload = await recovered.json();
      assert.deepEqual(
        listCacheRefreshWarnings(
          recoveredPayload.catalog.warnings,
          MODEL_CATALOG_CACHE_WARNING_PREFIX,
        ),
        [],
      );
      assert.deepEqual(recoveredPayload.catalog.warnings, ['Using cached authentication token']);
    });
  });

  assert.equal(modelCalls, 4);
});

test('GET /api/providers/:provider/models serves stale catalog after runtime rate limits', async () => {
  const runtimeClient = createRuntimeStub();
  const initialNowMs = Date.parse('2026-04-21T05:30:00.000Z');
  let rateLimited = false;

  runtimeClient.getProviderModels = async (provider, instance) => {
    if (rateLimited) {
      throw createRuntimeRequestError('Runtime catalog rate limited.', 429);
    }
    return {
      provider,
      backend: 'cli',
      instance: instance ?? 'native',
      defaultModel: 'claude-default',
      source: 'config',
      cache: null,
      models: [
        { id: 'claude-default', label: 'Claude default', default: true },
      ],
      warnings: [],
    };
  };

  await withMockedDateNow(initialNowMs, async (clock) => {
    await withServer(runtimeClient, async (baseUrl) => {
      const first = await fetch(`${baseUrl}/api/providers/claude/models`);
      assert.equal(first.status, 200);

      rateLimited = true;
      clock.advance(361_000);
      const second = await fetch(`${baseUrl}/api/providers/claude/models`);
      assert.equal(second.status, 200);
      const payload = await second.json();
      assert.equal(payload.catalog.models[0].id, 'claude-default');
      assert.match(payload.catalog.warnings.at(-1), /rate limited/u);
    });
  });
});

test('GET /api/providers/:provider/models does not hide non-rate-limit 4xx catalog errors behind stale cache', async () => {
  const runtimeClient = createRuntimeStub();
  const initialNowMs = Date.parse('2026-04-21T06:00:00.000Z');
  let badRequest = false;

  runtimeClient.getProviderModels = async (provider, instance) => {
    if (badRequest) {
      throw createRuntimeRequestError('Invalid provider target.', 400);
    }
    return {
      provider,
      backend: 'cli',
      instance: instance ?? 'native',
      defaultModel: 'claude-default',
      source: 'config',
      cache: null,
      models: [
        { id: 'claude-default', label: 'Claude default', default: true },
      ],
      warnings: [],
    };
  };

  await withMockedDateNow(initialNowMs, async (clock) => {
    await withServer(runtimeClient, async (baseUrl) => {
      const first = await fetch(`${baseUrl}/api/providers/claude/models`);
      assert.equal(first.status, 200);

      badRequest = true;
      clock.advance(361_000);
      const second = await fetch(`${baseUrl}/api/providers/claude/models`);
      assert.equal(second.status, 400);
      const payload = await second.json();
      assert.equal(payload.error.code, 'provider_catalog_lookup_failed');
    });
  });
});

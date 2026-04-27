import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import {
  MODEL_CATALOG_CACHE_REFRESH_WARNING_PREFIX as MODEL_CATALOG_CACHE_WARNING_PREFIX,
  MODEL_CATALOG_CACHE_REVALIDATION_WARNING,
  PROVIDER_TARGETS_CACHE_REFRESH_WARNING_PREFIX as PROVIDER_TARGETS_CACHE_WARNING_PREFIX,
  PROVIDER_TARGETS_CACHE_REVALIDATION_WARNING,
} from '../build/server/server/routes/providers.js';

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

async function withMockedDateNow(testContext, initialNowMs, callback) {
  let currentNowMs = initialNowMs;
  testContext.mock.method(Date, 'now', () => currentNowMs);

  await callback({
    advance(ms) {
      currentNowMs += ms;
    },
    set(value) {
      currentNowMs = value;
    },
  });
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

  assert.ok(
    diagnosticsQueries.some((query) => query.provider === 'claude' && query.scope === 'availability'),
    `expected scoped availability query for 'claude', saw ${JSON.stringify(diagnosticsQueries)}`,
  );
});

test('cold scoped registry request finishes before the background root refresh starts', async () => {
  const runtimeClient = createRuntimeStub();
  const originalGetProviderDiagnostics = runtimeClient.getProviderDiagnostics;
  const events = [];
  let observedUnscoped;
  const unscopedObserved = new Promise((resolve) => {
    observedUnscoped = resolve;
  });

  runtimeClient.getProviderDiagnostics = async (query = {}) => {
    const scoped = Boolean(query.provider);
    events.push({ type: 'start', scoped });
    const result = await originalGetProviderDiagnostics.call(runtimeClient, query);
    events.push({ type: 'end', scoped });
    if (!scoped) {
      observedUnscoped();
    }
    return result;
  };

  await withServer(runtimeClient, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/providers/claude/models`);
    assert.equal(response.status, 200);
  });

  await unscopedObserved;

  const scopedEnd = events.findIndex((event) => event.type === 'end' && event.scoped);
  const unscopedStart = events.findIndex((event) => event.type === 'start' && !event.scoped);
  assert.ok(scopedEnd >= 0, `expected scoped runtime call to complete; events=${JSON.stringify(events)}`);
  assert.ok(unscopedStart >= 0, `expected background unscoped refresh; events=${JSON.stringify(events)}`);
  assert.ok(
    unscopedStart > scopedEnd,
    `background unscoped refresh must start after the scoped foreground ends; events=${JSON.stringify(events)}`,
  );
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

  assert.ok(
    diagnosticsQueries.some((query) => query.provider === 'claude' && query.scope === 'availability'),
    `expected scoped availability query for 'claude', saw ${JSON.stringify(diagnosticsQueries)}`,
  );
});

test('GET /api/providers keeps the last good selector after a transient refresh timeout', {
  concurrency: false,
}, async (t) => {
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

  await withMockedDateNow(t, initialNowMs, async (clock) => {
    await withServer(runtimeClient, async (baseUrl) => {
      const first = await fetch(`${baseUrl}/api/providers`);
      assert.equal(first.status, 200);
      const firstPayload = await first.json();
      assert.equal(firstPayload.state, 'ready');

      failRefresh = true;
      clock.advance(46_000);
      const second = await fetch(`${baseUrl}/api/providers`);
      assert.equal(second.status, 200);
      const secondPayload = await second.json();
      assert.equal(secondPayload.state, 'ready');
      assert.ok(secondPayload.providers.some((provider) => provider.id === 'claude'));
      assert.ok(secondPayload.warnings.includes(PROVIDER_TARGETS_CACHE_REVALIDATION_WARNING));

      const third = await fetch(`${baseUrl}/api/providers`);
      assert.equal(third.status, 200);
      assert.equal(diagnosticsCalls, 2);

      clock.advance(30_001);
      const fourth = await fetch(`${baseUrl}/api/providers`);
      assert.equal(fourth.status, 200);
      const fourthPayload = await fourth.json();
      assert.ok(
        listCacheRefreshWarnings(
          fourthPayload.warnings,
          PROVIDER_TARGETS_CACHE_WARNING_PREFIX,
        ).length <= 1,
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

test('GET /api/providers/:provider/models serves stale catalog after transient runtime failures', {
  concurrency: false,
}, async (t) => {
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

  await withMockedDateNow(t, initialNowMs, async (clock) => {
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
      assert.ok(secondPayload.catalog.warnings.includes(MODEL_CATALOG_CACHE_REVALIDATION_WARNING));

      const third = await fetch(`${baseUrl}/api/providers/claude/models`);
      assert.equal(third.status, 200);
      assert.equal(modelCalls, 2);

      clock.advance(30_001);
      const fourth = await fetch(`${baseUrl}/api/providers/claude/models`);
      assert.equal(fourth.status, 200);
      const fourthPayload = await fourth.json();
      assert.ok(fourthPayload.catalog.warnings.includes('Using cached authentication token'));
      assert.ok(
        listCacheRefreshWarnings(
          fourthPayload.catalog.warnings,
          MODEL_CATALOG_CACHE_WARNING_PREFIX,
        ).length <= 1,
      );
      assert.equal(modelCalls, 3);

      clock.set(initialNowMs + 600_001);
      const expired = await fetch(`${baseUrl}/api/providers/claude/models`);
      assert.ok(expired.status >= 500 && expired.status < 600);
      assert.equal(modelCalls, 4);
    });
  });
});

test('GET /api/providers/:provider/models replaces generated stale warnings and clears them after recovery', {
  concurrency: false,
}, async (t) => {
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

  await withMockedDateNow(t, initialNowMs, async (clock) => {
    await withServer(runtimeClient, async (baseUrl) => {
      const first = await fetch(`${baseUrl}/api/providers/claude/models`);
      assert.equal(first.status, 200);

      failCatalogRefresh = true;
      clock.advance(361_000);
      const firstFailure = await fetch(`${baseUrl}/api/providers/claude/models`);
      assert.equal(firstFailure.status, 200);
      const firstFailurePayload = await firstFailure.json();
      assert.ok(
        firstFailurePayload.catalog.warnings.includes(MODEL_CATALOG_CACHE_REVALIDATION_WARNING),
      );

      clock.advance(30_001);
      const secondFailure = await fetch(`${baseUrl}/api/providers/claude/models`);
      assert.equal(secondFailure.status, 200);
      const secondFailurePayload = await secondFailure.json();
      const secondFailureCacheWarnings = listCacheRefreshWarnings(
        secondFailurePayload.catalog.warnings,
        MODEL_CATALOG_CACHE_WARNING_PREFIX,
      );
      assert.equal(secondFailureCacheWarnings.length, 1);
      assert.match(
        secondFailureCacheWarnings[0],
        /Runtime catalog unavailable\.|Runtime catalog still unavailable\./u,
      );
      assert.ok(secondFailurePayload.catalog.warnings.includes('Using cached authentication token'));

      failCatalogRefresh = false;
      clock.advance(30_001);
      const recoveryKickoff = await fetch(`${baseUrl}/api/providers/claude/models`);
      assert.equal(recoveryKickoff.status, 200);

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

test('GET /api/providers/:provider/models serves stale catalog after runtime rate limits', {
  concurrency: false,
}, async (t) => {
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

  await withMockedDateNow(t, initialNowMs, async (clock) => {
    await withServer(runtimeClient, async (baseUrl) => {
      const first = await fetch(`${baseUrl}/api/providers/claude/models`);
      assert.equal(first.status, 200);

      rateLimited = true;
      clock.advance(361_000);
      const second = await fetch(`${baseUrl}/api/providers/claude/models`);
      assert.equal(second.status, 200);
      const payload = await second.json();
      assert.equal(payload.catalog.models[0].id, 'claude-default');
      assert.ok(payload.catalog.warnings.includes(MODEL_CATALOG_CACHE_REVALIDATION_WARNING));
    });
  });
});

test('GET /api/providers/:provider/models serves stale immediately while revalidating expired cache', {
  concurrency: false,
}, async (t) => {
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

  await withMockedDateNow(t, initialNowMs, async (clock) => {
    await withServer(runtimeClient, async (baseUrl) => {
      const first = await fetch(`${baseUrl}/api/providers/claude/models`);
      assert.equal(first.status, 200);

      badRequest = true;
      clock.advance(361_000);
      const second = await fetch(`${baseUrl}/api/providers/claude/models`);
      assert.equal(second.status, 200);
      const payload = await second.json();
      assert.equal(payload.catalog.models[0].id, 'claude-default');
      assert.ok(payload.catalog.warnings.includes(MODEL_CATALOG_CACHE_REVALIDATION_WARNING));
    });
  });
});

test('GET /api/providers caches a first-time failure briefly so back-to-back probes share one timeout', {
  concurrency: false,
}, async (t) => {
  const runtimeClient = createRuntimeStub();
  const initialNowMs = Date.parse('2026-04-21T06:30:00.000Z');
  let diagnosticsCalls = 0;

  runtimeClient.getProviderDiagnostics = async () => {
    diagnosticsCalls += 1;
    throw new Error('The operation was aborted due to timeout');
  };

  await withMockedDateNow(t, initialNowMs, async (clock) => {
    await withServer(runtimeClient, async (baseUrl) => {
      const first = await fetch(`${baseUrl}/api/providers`);
      assert.equal(first.status, 200);
      const firstPayload = await first.json();
      assert.equal(firstPayload.state, 'runtime_unreachable');
      assert.equal(diagnosticsCalls, 1);

      const second = await fetch(`${baseUrl}/api/providers`);
      assert.equal(second.status, 200);
      const secondPayload = await second.json();
      assert.equal(secondPayload.state, 'runtime_unreachable');
      assert.equal(diagnosticsCalls, 1, 'cached failure must be served without re-probing within the backoff window');

      clock.advance(30_001);
      const third = await fetch(`${baseUrl}/api/providers`);
      assert.equal(third.status, 200);
      assert.equal(diagnosticsCalls, 2, 'after the backoff expires we re-probe');
    });
  });
});

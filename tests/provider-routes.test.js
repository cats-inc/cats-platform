import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';

const baseConfig = {
  host: '127.0.0.1',
  port: 8181,
  runtimeBaseUrl: 'http://127.0.0.1:3110',
  runtimeApiKey: '',
  chatStatePath: 'unused-for-tests',
};

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

test('GET /api/providers keeps the last good selector after a transient refresh timeout', async () => {
  const runtimeClient = createRuntimeStub();
  const originalGetProviderDiagnostics = runtimeClient.getProviderDiagnostics;
  const originalDateNow = Date.now;
  let nowMs = Date.parse('2026-04-21T04:30:00.000Z');
  let failRefresh = false;
  let diagnosticsCalls = 0;

  Date.now = () => nowMs;
  runtimeClient.getProviderDiagnostics = async (query = {}) => {
    diagnosticsCalls += 1;
    if (failRefresh) {
      throw new Error('The operation was aborted due to timeout');
    }
    return originalGetProviderDiagnostics.call(runtimeClient, query);
  };

  try {
    await withServer(runtimeClient, async (baseUrl) => {
      const first = await fetch(`${baseUrl}/api/providers`);
      assert.equal(first.status, 200);
      const firstPayload = await first.json();
      assert.equal(firstPayload.state, 'ready');

      failRefresh = true;
      nowMs += 21_000;
      const second = await fetch(`${baseUrl}/api/providers`);
      assert.equal(second.status, 200);
      const secondPayload = await second.json();
      assert.equal(secondPayload.state, 'ready');
      assert.ok(secondPayload.providers.some((provider) => provider.id === 'claude'));
      assert.match(secondPayload.warnings.at(-1), /Using cached provider targets/u);
    });
  } finally {
    Date.now = originalDateNow;
  }

  assert.equal(diagnosticsCalls, 2);
});

test('GET /api/providers/:provider/models serves stale catalog after transient runtime failures', async () => {
  const runtimeClient = createRuntimeStub();
  const originalGetProviderModels = runtimeClient.getProviderModels;
  const originalDateNow = Date.now;
  let nowMs = Date.parse('2026-04-21T05:00:00.000Z');
  let failCatalogRefresh = false;
  let modelCalls = 0;

  Date.now = () => nowMs;
  runtimeClient.getProviderModels = async (provider, instance) => {
    modelCalls += 1;
    if (failCatalogRefresh) {
      throw new Error('Runtime catalog unavailable.');
    }
    return originalGetProviderModels.call(runtimeClient, provider, instance);
  };

  try {
    await withServer(runtimeClient, async (baseUrl) => {
      const first = await fetch(`${baseUrl}/api/providers/claude/models`);
      assert.equal(first.status, 200);
      const firstPayload = await first.json();
      assert.equal(firstPayload.catalog.models[0].id, 'claude-default');

      failCatalogRefresh = true;
      nowMs += 361_000;
      const second = await fetch(`${baseUrl}/api/providers/claude/models`);
      assert.equal(second.status, 200);
      const secondPayload = await second.json();
      assert.equal(secondPayload.catalog.models[0].id, 'claude-default');
      assert.match(secondPayload.catalog.warnings.at(-1), /Using cached model catalog/u);

      const third = await fetch(`${baseUrl}/api/providers/claude/models`);
      assert.equal(third.status, 200);
      assert.equal(modelCalls, 2);
    });
  } finally {
    Date.now = originalDateNow;
  }
});

test('GET /api/providers/:provider/models serves stale catalog after runtime rate limits', async () => {
  const runtimeClient = createRuntimeStub();
  const originalDateNow = Date.now;
  let nowMs = Date.parse('2026-04-21T05:30:00.000Z');
  let rateLimited = false;

  Date.now = () => nowMs;
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

  try {
    await withServer(runtimeClient, async (baseUrl) => {
      const first = await fetch(`${baseUrl}/api/providers/claude/models`);
      assert.equal(first.status, 200);

      rateLimited = true;
      nowMs += 361_000;
      const second = await fetch(`${baseUrl}/api/providers/claude/models`);
      assert.equal(second.status, 200);
      const payload = await second.json();
      assert.equal(payload.catalog.models[0].id, 'claude-default');
      assert.match(payload.catalog.warnings.at(-1), /rate limited/u);
    });
  } finally {
    Date.now = originalDateNow;
  }
});

test('GET /api/providers/:provider/models does not hide non-rate-limit 4xx catalog errors behind stale cache', async () => {
  const runtimeClient = createRuntimeStub();
  const originalDateNow = Date.now;
  let nowMs = Date.parse('2026-04-21T06:00:00.000Z');
  let badRequest = false;

  Date.now = () => nowMs;
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

  try {
    await withServer(runtimeClient, async (baseUrl) => {
      const first = await fetch(`${baseUrl}/api/providers/claude/models`);
      assert.equal(first.status, 200);

      badRequest = true;
      nowMs += 361_000;
      const second = await fetch(`${baseUrl}/api/providers/claude/models`);
      assert.equal(second.status, 400);
      const payload = await second.json();
      assert.equal(payload.error.code, 'provider_catalog_lookup_failed');
    });
  } finally {
    Date.now = originalDateNow;
  }
});

import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

import { createServer } from '../dist-server/server.js';
import { MemoryWorkspaceStore } from '../dist-server/workspace/store.js';

const baseConfig = {
  host: '127.0.0.1',
  port: 8181,
  runtimeBaseUrl: 'http://127.0.0.1:3110',
  runtimeApiKey: '',
  workspaceStatePath: 'unused-for-tests',
};

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
        codex: {
          defaultInstance: 'agent/bridge',
          defaultBackend: 'agent',
          instances: [
            {
              id: 'agent/bridge',
              target: 'agent/bridge',
              backend: 'agent',
              command: null,
              runner: null,
              runtime: null,
              transport: null,
              model: null,
            },
            {
              id: 'ubuntu',
              target: 'cli/ubuntu',
              backend: 'cli',
              command: 'codex',
              runner: 'wsl',
              runtime: null,
              transport: null,
              model: null,
            },
          ],
        },
      };
    },
    async getProviderModels(provider) {
      return {
        provider,
        backend: 'cli',
        instance: 'default',
        defaultModel: `${provider}-default`,
        source: 'config',
        cache: null,
        models: [
          { id: `${provider}-default`, label: `${provider} default`, default: true },
        ],
        warnings: [],
      };
    },
    async createSession() {
      throw new Error('not used');
    },
    async sendMessage() {
      throw new Error('not used');
    },
    async closeSession() {
      throw new Error('not used');
    },
  };
}

async function withServer(runtimeClient, callback, workspaceStore = new MemoryWorkspaceStore()) {
  const server = createServer({
    config: baseConfig,
    runtimeClient,
    workspaceStore,
    now: () => new Date('2026-03-19T00:00:00.000Z'),
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

test('GET /api/providers returns product provider registry with runtime instance metadata', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/providers`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.ok(Array.isArray(payload.providers));
    assert.ok(payload.providers.some((provider) => provider.id === 'claude'));
    assert.ok(payload.providers.every((provider) => typeof provider.modelsPath === 'string'));
    const claude = payload.providers.find((provider) => provider.id === 'claude');
    assert.equal(claude.defaultInstance, 'native');
    assert.equal(claude.instances[0].id, 'native');
    const codex = payload.providers.find((provider) => provider.id === 'codex');
    assert.equal(codex.defaultInstance, 'agent/bridge');
    assert.equal(codex.instances.length, 2);
  });
});

test('GET /api/providers/:provider/models proxies runtime-owned catalog', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/providers/claude/models`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.catalog.provider, 'claude');
    assert.equal(payload.catalog.source, 'config');
    assert.equal(payload.catalog.models[0].id, 'claude-default');
  });
});

test('GET /api/providers/:provider/models forwards the optional instance query', async () => {
  const calls = [];
  const runtimeClient = createRuntimeStub();
  runtimeClient.getProviderModels = async (provider, instance) => {
    calls.push({ provider, instance });
    return {
      provider,
      backend: 'agent',
      instance: instance ?? 'default',
      defaultModel: 'gpt-5.4',
      source: 'config',
      cache: null,
      models: [
        { id: 'gpt-5.4', label: 'gpt-5.4', default: true },
      ],
      warnings: [],
    };
  };

  await withServer(runtimeClient, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/providers/codex/models?instance=agent/bridge`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.catalog.instance, 'agent/bridge');
  });

  assert.deepEqual(calls, [{ provider: 'codex', instance: 'agent/bridge' }]);
});

test('GET /api/providers/:provider/models falls back to static data on runtime failure', async () => {
  const runtimeClient = createRuntimeStub();
  runtimeClient.getProviderModels = async () => {
    throw new Error('runtime unavailable');
  };

  await withServer(runtimeClient, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/providers/claude/models`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.catalog.provider, 'claude');
    assert.equal(payload.catalog.source, 'static');
    assert.ok(payload.catalog.warnings[0].includes('runtime unavailable'));
  });
});

test('telegram status reports unbound relay before bot binding is configured', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/transports/telegram`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.telegram.status, 'unbound');
    assert.equal(payload.telegram.botBinding, null);
    assert.equal(payload.telegram.mappedConversationCount, 0);
    assert.equal(payload.telegram.lastProcessedUpdateId, null);
  });
});

test('telegram status reports Boss Cat binding once bot webhook ingress is configured', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(setupResponse.status, 200);

    const orchestratorResponse = await fetch(`${baseUrl}/api/orchestrator`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'claude',
        telegramBotName: 'smelly_bot',
      }),
    });
    assert.equal(orchestratorResponse.status, 200);

    const statusResponse = await fetch(`${baseUrl}/api/transports/telegram`);
    assert.equal(statusResponse.status, 200);

    const payload = await statusResponse.json();
    assert.equal(payload.telegram.status, 'bound');
    assert.equal(payload.telegram.bossCatName, 'Smelly');
    assert.equal(payload.telegram.botBinding.botName, 'smelly_bot');
    assert.equal(payload.telegram.webhookPath, '/api/transports/telegram/webhook');
  });
});

test('telegram webhook accepts inbound updates, dedupes update ids, and keeps chat mapping in relay state', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(setupResponse.status, 200);

    const orchestratorResponse = await fetch(`${baseUrl}/api/orchestrator`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'claude',
        telegramBotName: 'smelly_bot',
      }),
    });
    assert.equal(orchestratorResponse.status, 200);

    const webhookBody = {
      update_id: 101,
      message: {
        message_id: 88,
        text: 'hello from telegram',
        chat: { id: 12345, type: 'private' },
      },
    };

    const webhookResponse = await fetch(`${baseUrl}/api/transports/telegram/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(webhookBody),
    });
    assert.equal(webhookResponse.status, 202);

    const acceptedPayload = await webhookResponse.json();
    assert.equal(acceptedPayload.receipt.status, 'accepted');
    assert.equal(acceptedPayload.receipt.bossCatName, 'Smelly');
    assert.equal(acceptedPayload.receipt.mappedConversationId, 'telegram:12345');

    const duplicateResponse = await fetch(`${baseUrl}/api/transports/telegram/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(webhookBody),
    });
    assert.equal(duplicateResponse.status, 202);

    const duplicatePayload = await duplicateResponse.json();
    assert.equal(duplicatePayload.receipt.status, 'ignored');
    assert.equal(duplicatePayload.receipt.reason, 'duplicate_update');
    assert.equal(duplicatePayload.receipt.mappedConversationId, 'telegram:12345');

    const statusResponse = await fetch(`${baseUrl}/api/transports/telegram`);
    assert.equal(statusResponse.status, 200);

    const statusPayload = await statusResponse.json();
    assert.equal(statusPayload.telegram.mappedConversationCount, 1);
    assert.equal(statusPayload.telegram.lastProcessedUpdateId, 101);
  });
});

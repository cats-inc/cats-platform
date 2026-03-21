import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createTelegramRelay } from '../dist-server/platform/transports/telegram/relay.js';
import { createServer } from '../dist-server/server.js';
import {
  FileChatStore,
  MemoryChatStore,
} from '../dist-server/chat/store.js';

const baseConfig = {
  host: '127.0.0.1',
  port: 8181,
  runtimeBaseUrl: 'http://127.0.0.1:3110',
  runtimeApiKey: '',
  chatStatePath: 'unused-for-tests',
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

async function withServer(
  runtimeClient,
  callback,
  chatStore = new MemoryChatStore(),
  extraDependencies = {},
) {
  const server = createServer({
    config: baseConfig,
    runtimeClient,
    chatStore,
    now: () => new Date('2026-03-19T00:00:00.000Z'),
    ...extraDependencies,
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

async function withServerConfig(
  runtimeClient,
  config,
  chatStore,
  callback,
  extraDependencies = {},
) {
  const server = createServer({
    config,
    runtimeClient,
    chatStore,
    now: () => new Date('2026-03-19T00:00:00.000Z'),
    ...extraDependencies,
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

async function configureTelegramBossCat(baseUrl) {
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
}

function createCoreState(overrides = {}) {
  return {
    version: 1,
    updatedAt: '2026-03-19T00:00:00.000Z',
    setupCompleteAt: null,
    ownerProfile: {
      actorId: 'actor-owner',
      displayName: 'Owner',
      avatarColor: null,
      summary: null,
      communicationPreferences: [],
      decisionPreferences: [],
      escalationPreferences: [],
      updatedAt: '2026-03-19T00:00:00.000Z',
    },
    actors: [],
    conversations: [],
    tasks: [],
    botBindings: [],
    archives: [],
    ...overrides,
  };
}

test('GET /api/providers returns the runtime-backed provider registry', async () => {
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

test('GET /api/providers/:provider/models falls back to static data', async () => {
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
    assert.equal(payload.telegram.publicIdentityMode, 'boss_cat_single_identity');
    assert.equal(payload.telegram.diagnosticsPath, '/api/transports/telegram/diagnostics');
    assert.equal(payload.telegram.roomRouting.roomRoutingStatus, 'placeholder');
    assert.equal(payload.telegram.ingress.acceptedUpdates, 0);
    assert.equal(payload.telegram.delivery.status, 'not_configured');
  });
});

test('telegram status ignores orphaned Telegram bindings when Boss Cat is missing', async () => {
  const chatStore = {
    async read() {
      return {
        bossCatId: null,
        cats: [],
      };
    },
    async readCore() {
      return createCoreState({
        botBindings: [
          {
            id: 'bot-binding-telegram-global',
            platform: 'telegram',
            botName: 'smelly_bot',
            orchestratorActorId: 'actor-orchestrator-global',
            bossCatActorId: 'actor-cat-cat-smelly',
            status: 'active',
            createdAt: '2026-03-19T00:00:00.000Z',
            updatedAt: '2026-03-19T00:00:00.000Z',
          },
        ],
      });
    },
  };
  const server = createServer({
    config: baseConfig,
    runtimeClient: createRuntimeStub(),
    chatStore,
    telegramRelay: createTelegramRelay(),
    now: () => new Date('2026-03-19T00:00:00.000Z'),
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve test server address');
  }

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/transports/telegram`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.telegram.status, 'unbound');
    assert.equal(payload.telegram.botBinding, null);
    assert.equal(payload.telegram.publicIdentityMode, 'boss_cat_single_identity');
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('telegram status reports Boss Cat binding after Telegram ingress is configured', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    await configureTelegramBossCat(baseUrl);

    const statusResponse = await fetch(`${baseUrl}/api/transports/telegram`);
    assert.equal(statusResponse.status, 200);

    const payload = await statusResponse.json();
    assert.equal(payload.telegram.status, 'bound');
    assert.equal(payload.telegram.bossCatName, 'Smelly');
    assert.equal(payload.telegram.botBinding.botName, 'smelly_bot');
    assert.equal(payload.telegram.webhookPath, '/api/transports/telegram/webhook');
    assert.equal(payload.telegram.diagnosticsPath, '/api/transports/telegram/diagnostics');
    assert.equal(payload.telegram.roomRouting.transportConversationMode, 'transport_inbox');
    assert.equal(payload.telegram.roomRouting.roomRoutingStatus, 'placeholder');
    assert.equal(payload.telegram.ingress.secretTokenConfigured, false);
    assert.equal(payload.telegram.delivery.status, 'not_configured');
  });
});

test('telegram webhook accepts updates, dedupes ids, and keeps chat mapping state', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    await configureTelegramBossCat(baseUrl);

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
    assert.equal(acceptedPayload.receipt.roomRouting.roomRoutingStatus, 'placeholder');
    assert.equal(acceptedPayload.receipt.messageSummary.textPreview, 'hello from telegram');

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
    assert.equal(statusPayload.telegram.ingress.acceptedUpdates, 1);
    assert.equal(statusPayload.telegram.ingress.ignoredUpdates, 1);
    assert.equal(statusPayload.telegram.ingress.lastReceipt.reason, 'duplicate_update');
  });
});

test('telegram webhook ignores unsupported updates and keeps routing placeholder', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    await configureTelegramBossCat(baseUrl);

    const webhookResponse = await fetch(`${baseUrl}/api/transports/telegram/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        update_id: 101,
      }),
    });
    assert.equal(webhookResponse.status, 202);

    const payload = await webhookResponse.json();
    assert.equal(payload.receipt.status, 'ignored');
    assert.equal(payload.receipt.reason, 'unsupported_update');
    assert.equal(payload.receipt.roomRouting.roomRoutingStatus, 'placeholder');

    const statusResponse = await fetch(`${baseUrl}/api/transports/telegram`);
    const statusPayload = await statusResponse.json();
    assert.equal(statusPayload.telegram.mappedConversationCount, 0);
    assert.equal(statusPayload.telegram.lastProcessedUpdateId, null);
    assert.equal(statusPayload.telegram.ingress.acceptedUpdates, 0);
    assert.equal(statusPayload.telegram.ingress.ignoredUpdates, 1);
  });
});

test('telegram diagnostics exposes binding and dedupe state outside the main transcript model', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    await configureTelegramBossCat(baseUrl);

    await fetch(`${baseUrl}/api/transports/telegram/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        update_id: 101,
        message: {
          message_id: 88,
          caption: 'photo update',
          chat: { id: 12345, type: 'private', username: 'boss_inbox' },
          photo: [{ file_id: 'photo-1', width: 640, height: 640 }],
        },
      }),
    });

    const diagnosticsResponse = await fetch(`${baseUrl}/api/transports/telegram/diagnostics`);
    assert.equal(diagnosticsResponse.status, 200);

    const payload = await diagnosticsResponse.json();
    assert.equal(payload.telegram.status, 'bound');
    assert.equal(payload.telegram.dedupe.retainedUpdateCount, 1);
    assert.equal(payload.telegram.bindings.length, 1);
    assert.equal(payload.telegram.bindings[0].telegramChatId, '12345');
    assert.deepEqual(payload.telegram.bindings[0].lastInboundAttachmentKinds, ['photo']);
    assert.equal(payload.telegram.ingress.lastReceipt.messageSummary.attachmentCount, 1);
  });
});

test('telegram webhook hardening rejects non-json requests', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    await configureTelegramBossCat(baseUrl);

    const response = await fetch(`${baseUrl}/api/transports/telegram/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'not json',
    });
    assert.equal(response.status, 415);

    const payload = await response.json();
    assert.equal(payload.error.code, 'telegram_webhook_requires_json');
  });
});

test('telegram webhook hardening enforces the configured secret token', async () => {
  await withServer(
    createRuntimeStub(),
    async (baseUrl) => {
      await configureTelegramBossCat(baseUrl);

      const unauthorizedResponse = await fetch(`${baseUrl}/api/transports/telegram/webhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          update_id: 101,
          message: {
            message_id: 88,
            text: 'hello from telegram',
            chat: { id: 12345, type: 'private' },
          },
        }),
      });
      assert.equal(unauthorizedResponse.status, 401);
      const unauthorizedPayload = await unauthorizedResponse.json();
      assert.equal(unauthorizedPayload.error.code, 'invalid_telegram_webhook_secret');

      const authorizedResponse = await fetch(`${baseUrl}/api/transports/telegram/webhook`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-telegram-bot-api-secret-token': 'top-secret',
        },
        body: JSON.stringify({
          update_id: 101,
          message: {
            message_id: 88,
            text: 'hello from telegram',
            chat: { id: 12345, type: 'private' },
          },
        }),
      });
      assert.equal(authorizedResponse.status, 202);

      const statusResponse = await fetch(`${baseUrl}/api/transports/telegram`);
      const statusPayload = await statusResponse.json();
      assert.equal(statusPayload.telegram.ingress.secretTokenConfigured, true);
      assert.equal(statusPayload.telegram.ingress.acceptedUpdates, 1);
    },
    undefined,
    {
      telegramRelay: createTelegramRelay({
        webhookSecretToken: 'top-secret',
        now: () => new Date('2026-03-19T00:00:00.000Z'),
      }),
    },
  );
});

test('telegram webhook hardening rejects oversized webhook bodies before relay handling', async () => {
  await withServer(
    createRuntimeStub(),
    async (baseUrl) => {
      await configureTelegramBossCat(baseUrl);

      const response = await fetch(`${baseUrl}/api/transports/telegram/webhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          update_id: 101,
          message: {
            message_id: 88,
            text: 'x'.repeat(4096),
            chat: { id: 12345, type: 'private' },
          },
        }),
      });
      assert.equal(response.status, 413);

      const payload = await response.json();
      assert.equal(payload.error.code, 'telegram_webhook_too_large');
    },
    undefined,
    {
      telegramRelay: createTelegramRelay({
        maxBodyBytes: 128,
        now: () => new Date('2026-03-19T00:00:00.000Z'),
      }),
    },
  );
});

test('telegram relay state survives restart with file-backed chat storage', async () => {
  const stateDir = mkdtempSync(path.join(tmpdir(), 'cats-telegram-routes-'));
  const chatStatePath = path.join(stateDir, 'chat.json');
  const config = {
    ...baseConfig,
    chatStatePath,
  };

  await withServerConfig(
    createRuntimeStub(),
    config,
    new FileChatStore(chatStatePath),
    async (baseUrl) => {
      await configureTelegramBossCat(baseUrl);

      const webhookResponse = await fetch(`${baseUrl}/api/transports/telegram/webhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          update_id: 101,
          message: {
            message_id: 88,
            text: 'hello from telegram',
            chat: { id: 12345, type: 'private' },
          },
        }),
      });
      assert.equal(webhookResponse.status, 202);
    },
  );

  await withServerConfig(
    createRuntimeStub(),
    config,
    new FileChatStore(chatStatePath),
    async (baseUrl) => {
      const statusResponse = await fetch(`${baseUrl}/api/transports/telegram`);
      assert.equal(statusResponse.status, 200);

      const statusPayload = await statusResponse.json();
      assert.equal(statusPayload.telegram.status, 'bound');
      assert.equal(statusPayload.telegram.mappedConversationCount, 1);
      assert.equal(statusPayload.telegram.lastProcessedUpdateId, 101);
      assert.equal(statusPayload.telegram.roomRouting.roomRoutingStatus, 'placeholder');
      assert.equal(statusPayload.telegram.ingress.acceptedUpdates, 1);

      const duplicateResponse = await fetch(`${baseUrl}/api/transports/telegram/webhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          update_id: 101,
          message: {
            message_id: 89,
            text: 'retry after restart',
            chat: { id: 12345, type: 'private' },
          },
        }),
      });
      assert.equal(duplicateResponse.status, 202);

      const duplicatePayload = await duplicateResponse.json();
      assert.equal(duplicatePayload.receipt.status, 'ignored');
      assert.equal(duplicatePayload.receipt.reason, 'duplicate_update');
      assert.equal(duplicatePayload.receipt.mappedConversationId, 'telegram:12345');

      const diagnosticsResponse = await fetch(`${baseUrl}/api/transports/telegram/diagnostics`);
      const diagnosticsPayload = await diagnosticsResponse.json();
      assert.equal(diagnosticsPayload.telegram.bindings[0].conversationId, 'telegram:12345');
      assert.equal(diagnosticsPayload.telegram.ingress.ignoredUpdates, 1);
    },
  );
});

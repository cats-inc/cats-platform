import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createTelegramRelay } from '../build/server/platform/transports/telegram/relay/index.js';
import { createServer } from '../build/server/server.js';
import {
  FileChatStore,
  MemoryChatStore,
} from '../build/server/products/chat/state/store.js';
import { MemoryCompanionBoxStore } from '../build/server/products/chat/state/companion-box/index.js';
import { createChatTelegramRoomBridge } from '../build/server/products/chat/state/telegramBridgeAdapter.js';

const baseConfig = {
  host: '127.0.0.1',
  port: 8181,
  runtimeBaseUrl: 'http://127.0.0.1:3110',
  runtimeApiKey: '',
  chatStatePath: 'unused-for-tests',
};

function createRuntimeStub() {
  let sessionCounter = 0;
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
        openclaw: {
          defaultInstance: 'gateway',
          defaultBackend: 'agent',
          instances: [
            {
              id: 'gateway',
              target: 'agent/gateway',
              backend: 'agent',
              command: null,
              runner: null,
              runtime: null,
              transport: 'openclaw_gateway',
              model: 'openclaw-coder',
            },
          ],
        },
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
        opencode: {
          defaultInstance: 'native',
          defaultBackend: 'cli',
          instances: [
            {
              id: 'native',
              target: 'cli/native',
              backend: 'cli',
              command: 'opencode',
              runner: null,
              runtime: null,
              transport: null,
              model: 'opencode-go/glm-5',
            },
          ],
        },
        kilo: {
          defaultInstance: 'native',
          defaultBackend: 'cli',
          instances: [
            {
              id: 'native',
              target: 'cli/native',
              backend: 'cli',
              command: 'kilo',
              runner: null,
              runtime: null,
              transport: null,
              model: 'kilo/openai/gpt-5.4',
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
      sessionCounter += 1;
      return {
        id: `session-${sessionCounter}`,
        provider: 'claude',
        model: 'claude-default',
        status: 'ready',
        cwd: null,
      };
    },
    async sendMessage(_sessionId, content) {
      return {
        content: 'Boss Cat relay reply',
        inputTokens: 42,
        outputTokens: 24,
        tokensUsed: 66,
      };
    },
    async closeSession() {
      throw new Error('not used');
    },
  };
}

class FailingWriteChatStore extends MemoryChatStore {
  failOnRelativeWrite = null;
  relativeWriteCount = 0;

  enableFailureOnRelativeWrite(relativeWrite) {
    this.failOnRelativeWrite = relativeWrite;
    this.relativeWriteCount = 0;
  }

  async write(state) {
    this.relativeWriteCount += 1;
    if (this.failOnRelativeWrite === this.relativeWriteCount) {
      this.failOnRelativeWrite = null;
      throw new Error('Simulated chat store write failure');
    }
    return super.write(state);
  }
}

async function withServer(
  runtimeClient,
  callback,
  chatStore = new MemoryChatStore(),
  extraDependencies = {},
) {
  const {
    startup,
    coreStore,
    resumePendingOrchestratorDispatch,
    work,
    code,
    ...chatOverrides
  } = extraDependencies;
  const server = createServer({
    shared: {
      config: baseConfig,
      runtimeClient,
      now: () => new Date('2026-03-19T00:00:00.000Z'),
      startup,
      coreStore,
      resumePendingOrchestratorDispatch,
    },
    chat: {
      chatStore,
      ...chatOverrides,
    },
    work,
    code,
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
  const {
    startup,
    coreStore,
    resumePendingOrchestratorDispatch,
    work,
    code,
    ...chatOverrides
  } = extraDependencies;
  const server = createServer({
    shared: {
      config,
      runtimeClient,
      now: () => new Date('2026-03-19T00:00:00.000Z'),
      startup,
      coreStore,
      resumePendingOrchestratorDispatch,
    },
    chat: {
      chatStore,
      ...chatOverrides,
    },
    work,
    code,
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

async function waitFor(
  predicate,
  timeoutMs = 1000,
) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for async side effect');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
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
    const openclaw = payload.providers.find((provider) => provider.id === 'openclaw');
    assert.equal(openclaw.label, 'OpenClaw');
    assert.equal(openclaw.defaultInstance, 'gateway');
    assert.equal(openclaw.defaultBackend, 'agent');
    assert.equal(openclaw.instances[0].label, 'agent/gateway');
    assert.ok(payload.providers.some((provider) => provider.id === 'claude'));
    assert.ok(payload.providers.every((provider) => typeof provider.modelsPath === 'string'));
    const claude = payload.providers.find((provider) => provider.id === 'claude');
    assert.equal(claude.label, 'Claude');
    assert.equal(claude.defaultInstance, 'native');
    assert.equal(claude.instances[0].id, 'native');
    assert.equal(claude.instances[0].label, 'cli/native');
    const codex = payload.providers.find((provider) => provider.id === 'codex');
    assert.equal(codex.label, 'Codex');
    assert.equal(codex.defaultInstance, 'agent/bridge');
    assert.equal(codex.instances.length, 2);
    assert.equal(codex.instances[0].label, 'agent/bridge');
    const opencodeIndex = payload.providers.findIndex((provider) => provider.id === 'opencode');
    const kiloIndex = payload.providers.findIndex((provider) => provider.id === 'kilo');
    assert.ok(opencodeIndex >= 0);
    assert.equal(kiloIndex, opencodeIndex + 1);
    const kilo = payload.providers[kiloIndex];
    assert.equal(kilo.label, 'Kilo');
    assert.equal(kilo.defaultInstance, 'native');
    assert.equal(kilo.defaultBackend, 'cli');
    assert.equal(kilo.instances[0].label, 'cli/native');
  });
});

test('GET /api/providers/:provider/models proxies runtime-owned catalog', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/providers/openclaw/models`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.catalog.provider, 'openclaw');
    assert.equal(payload.catalog.source, 'config');
    assert.equal(payload.catalog.models[0].id, 'openclaw-default');
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

test('GET /api/providers/:provider/models falls back to static kilo catalog data', async () => {
  const runtimeClient = createRuntimeStub();
  runtimeClient.getProviderModels = async () => {
    throw new Error('runtime unavailable');
  };

  await withServer(runtimeClient, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/providers/kilo/models`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.catalog.provider, 'kilo');
    assert.equal(payload.catalog.source, 'static');
    assert.equal(payload.catalog.defaultModel, 'kilo/openai/gpt-5.4');
    assert.equal(payload.catalog.models[0].id, 'kilo/openai/gpt-5.4');
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
    assert.deepEqual(payload.telegram.availableBindings, []);
    assert.equal(payload.telegram.mappedConversationCount, 0);
    assert.equal(payload.telegram.lastProcessedUpdateId, null);
    assert.equal(payload.telegram.publicIdentityMode, 'multi_cat_bindings_single_boss');
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
    shared: {
      config: baseConfig,
      runtimeClient: createRuntimeStub(),
      now: () => new Date('2026-03-19T00:00:00.000Z'),
    },
    chat: {
      chatStore,
      telegramRelay: createTelegramRelay(),
    },
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
    assert.equal(payload.telegram.availableBindings.length, 0);
    assert.equal(payload.telegram.publicIdentityMode, 'multi_cat_bindings_single_boss');
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
    assert.equal(payload.telegram.roomRouting.transportConversationMode, 'direct_cat_chat');
    assert.equal(payload.telegram.roomRouting.roomRoutingStatus, 'placeholder');
    assert.equal(payload.telegram.ingress.secretTokenConfigured, false);
    assert.equal(payload.telegram.delivery.status, 'not_configured');
  });
});

test('telegram webhook routes inbox traffic into a room and relays a reply back to Telegram', async () => {
  const deliveryCalls = [];

  await withServer(
    createRuntimeStub(),
    async (baseUrl) => {
      await configureTelegramBossCat(baseUrl);

      const webhookBody = {
        update_id: 101,
        message: {
          message_id: 88,
          text: 'hello from telegram',
          chat: { id: 12345, type: 'private' },
          from: { id: 1, first_name: 'Kenny' },
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
      assert.equal(acceptedPayload.receipt.roomRouting.roomRoutingStatus, 'linked_room');
      assert.ok(acceptedPayload.receipt.roomRouting.linkedRoomId);
      assert.equal(acceptedPayload.receipt.messageSummary.textPreview, 'hello from telegram');

      const roomId = acceptedPayload.receipt.roomRouting.linkedRoomId;
      const roomResponse = await fetch(`${baseUrl}/api/channels/${roomId}`);
      assert.equal(roomResponse.status, 200);
      const roomPayload = await roomResponse.json();
      assert.equal(roomPayload.channel.id, roomId);
      assert.equal(roomPayload.channel.roomRouting.mode, 'boss_chat');

      const messagesResponse = await fetch(`${baseUrl}/api/channels/${roomId}/messages`);
      assert.equal(messagesResponse.status, 200);
      const messagesPayload = await messagesResponse.json();
      assert.ok(messagesPayload.messages.some((message) =>
        message.senderKind === 'user' && message.body === 'hello from telegram'));
      assert.ok(messagesPayload.messages.some((message) =>
        message.body === 'Boss Cat relay reply'
        && message.metadata?.targetKind === 'orchestrator'
        && (message.senderKind === 'agent' || message.senderKind === 'orchestrator')));

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
      assert.equal(statusPayload.telegram.roomRouting.roomRoutingStatus, 'linked_room');
      assert.equal(statusPayload.telegram.ingress.acceptedUpdates, 1);
      assert.equal(statusPayload.telegram.ingress.ignoredUpdates, 1);
      assert.equal(statusPayload.telegram.delivery.repliedCount, 1);
      assert.equal(statusPayload.telegram.ingress.lastReceipt.reason, 'duplicate_update');

      const diagnosticsResponse = await fetch(`${baseUrl}/api/transports/telegram/diagnostics`);
      assert.equal(diagnosticsResponse.status, 200);
      const diagnosticsPayload = await diagnosticsResponse.json();
      assert.equal(diagnosticsPayload.telegram.bindings[0].linkedRoomId, roomId);
      assert.equal(diagnosticsPayload.telegram.bindings[0].lastOutboundMessageId, '5001');

      assert.equal(deliveryCalls.length, 1);
      assert.equal(deliveryCalls[0].operation, 'reply');
      assert.equal(deliveryCalls[0].replyToMessageId, '88');
      assert.equal(deliveryCalls[0].chatId, '12345');
      assert.match(deliveryCalls[0].text, /Opened room/);
      assert.match(deliveryCalls[0].text, /Boss Cat relay reply/);
    },
    undefined,
    {
      telegramRelay: createTelegramRelay({
        now: () => new Date('2026-03-19T00:00:00.000Z'),
        deliveryClient: {
          async deliver(request) {
            deliveryCalls.push(request);
            return {
              ok: true,
              chatId: request.chatId,
              messageId: '5001',
            };
          },
        },
      }),
    },
  );
});

test('telegram slash commands stay transport-owned and can switch the bound cat mode', async () => {
  const deliveryCalls = [];

  await withServer(
    createRuntimeStub(),
    async (baseUrl) => {
      await configureTelegramBossCat(baseUrl);

      const createCompanionResponse = await fetch(`${baseUrl}/api/cats`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Companion',
          provider: 'claude',
          skillProfile: 'companion',
        }),
      });
      assert.equal(createCompanionResponse.status, 201);
      const createCompanionPayload = await createCompanionResponse.json();
      const catId = createCompanionPayload.cat.id;

      const bindingResponse = await fetch(`${baseUrl}/api/bot-bindings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          platform: 'telegram',
          botName: 'companion_bot',
          catId,
          roomMode: 'direct_cat_chat',
          webhookSecret: 'companion-secret',
        }),
      });
      assert.equal(bindingResponse.status, 201);
      const bindingPayload = await bindingResponse.json();
      const bindingId = bindingPayload.botBinding.id;

      const commandsResponse = await fetch(
        `${baseUrl}/api/transports/telegram/webhook/${bindingId}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-telegram-bot-api-secret-token': 'companion-secret',
          },
          body: JSON.stringify({
            update_id: 501,
            message: {
              message_id: 801,
              text: '/commands',
              chat: { id: 67890, type: 'private' },
              from: { id: 8, first_name: 'Kenny' },
            },
          }),
        },
      );
      assert.equal(commandsResponse.status, 202);

      const commandsPayload = await commandsResponse.json();
      assert.equal(commandsPayload.receipt.status, 'accepted');
      assert.equal(commandsPayload.receipt.commandHandled, true);
      assert.equal(commandsPayload.receipt.bindingId, bindingId);
      assert.equal(
        commandsPayload.receipt.mappedConversationId,
        `telegram:${bindingId}:67890`,
      );

      const modeAgentResponse = await fetch(
        `${baseUrl}/api/transports/telegram/webhook/${bindingId}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-telegram-bot-api-secret-token': 'companion-secret',
          },
          body: JSON.stringify({
            update_id: 502,
            message: {
              message_id: 802,
              text: '/mode agent',
              chat: { id: 67890, type: 'private' },
              from: { id: 8, first_name: 'Kenny' },
            },
          }),
        },
      );
      assert.equal(modeAgentResponse.status, 202);
      const modeAgentPayload = await modeAgentResponse.json();
      assert.equal(modeAgentPayload.receipt.commandHandled, true);

      const catAfterAgentResponse = await fetch(`${baseUrl}/api/cats/${catId}`);
      assert.equal(catAfterAgentResponse.status, 200);
      const catAfterAgentPayload = await catAfterAgentResponse.json();
      assert.equal(catAfterAgentPayload.cat.skillProfile, 'chat-default');

      const statusResponse = await fetch(
        `${baseUrl}/api/transports/telegram/webhook/${bindingId}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-telegram-bot-api-secret-token': 'companion-secret',
          },
          body: JSON.stringify({
            update_id: 503,
            message: {
              message_id: 803,
              text: '/status',
              chat: { id: 67890, type: 'private' },
              from: { id: 8, first_name: 'Kenny' },
            },
          }),
        },
      );
      assert.equal(statusResponse.status, 202);
      const statusPayload = await statusResponse.json();
      assert.equal(statusPayload.receipt.commandHandled, true);

      const modeCompanionResponse = await fetch(
        `${baseUrl}/api/transports/telegram/webhook/${bindingId}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-telegram-bot-api-secret-token': 'companion-secret',
          },
          body: JSON.stringify({
            update_id: 504,
            message: {
              message_id: 804,
              text: '/mode companion',
              chat: { id: 67890, type: 'private' },
              from: { id: 8, first_name: 'Kenny' },
            },
          }),
        },
      );
      assert.equal(modeCompanionResponse.status, 202);
      const modeCompanionPayload = await modeCompanionResponse.json();
      assert.equal(modeCompanionPayload.receipt.commandHandled, true);

      const catAfterCompanionResponse = await fetch(`${baseUrl}/api/cats/${catId}`);
      assert.equal(catAfterCompanionResponse.status, 200);
      const catAfterCompanionPayload = await catAfterCompanionResponse.json();
      assert.equal(catAfterCompanionPayload.cat.skillProfile, 'companion');

      const diagnosticsResponse = await fetch(`${baseUrl}/api/transports/telegram/diagnostics`);
      assert.equal(diagnosticsResponse.status, 200);
      const diagnosticsPayload = await diagnosticsResponse.json();
      const telegramBinding = diagnosticsPayload.telegram.bindings.find((binding) =>
        binding.bindingId === bindingId
        && binding.conversationId === `telegram:${bindingId}:67890`);
      assert.ok(telegramBinding);
      assert.equal(telegramBinding.linkedRoomId, null);
      assert.equal(telegramBinding.roomRoutingStatus, 'placeholder');

      assert.equal(deliveryCalls.length, 4);
      assert.match(deliveryCalls[0].text, /\/mode companion/);
      assert.match(deliveryCalls[0].text, /\/mode agent/);
      assert.match(deliveryCalls[1].text, /Switched Companion to Agent mode/);
      assert.match(deliveryCalls[2].text, /Mode: Agent/);
      assert.match(deliveryCalls[3].text, /Switched Companion to Companion mode/);
    },
    undefined,
    {
      telegramRelay: createTelegramRelay({
        now: () => new Date('2026-03-19T00:00:00.000Z'),
        deliveryClient: {
          async deliver(request) {
            deliveryCalls.push(request);
            return {
              ok: true,
              chatId: request.chatId,
              messageId: String(6000 + deliveryCalls.length),
            };
          },
        },
      }),
    },
  );
});

test('telegram bot binding mutations trigger command surface sync and carry stale tokens', async () => {
  const syncCalls = [];

  await withServer(
    createRuntimeStub(),
    async (baseUrl) => {
      await configureTelegramBossCat(baseUrl);
      await waitFor(() => syncCalls.length === 1);
      syncCalls.length = 0;

      const appShellResponse = await fetch(`${baseUrl}/api/app-shell`);
      assert.equal(appShellResponse.status, 200);
      const appShellPayload = await appShellResponse.json();

      const bindingResponse = await fetch(`${baseUrl}/api/bot-bindings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          platform: 'telegram',
          botName: 'boss_control_bot',
          catId: appShellPayload.chat.bossCatId,
          roomMode: 'direct_cat_chat',
          botToken: 'token-create-sync',
        }),
      });
      assert.equal(bindingResponse.status, 201);
      const bindingPayload = await bindingResponse.json();

      await waitFor(() => syncCalls.length === 1);
      assert.deepEqual(syncCalls, [{ staleBotTokens: [] }]);
      syncCalls.length = 0;

      const updateResponse = await fetch(
        `${baseUrl}/api/bot-bindings/${bindingPayload.botBinding.id}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            botToken: 'token-updated-sync',
          }),
        },
      );
      assert.equal(updateResponse.status, 200);

      await waitFor(() => syncCalls.length === 1);
      assert.deepEqual(syncCalls, [{ staleBotTokens: ['token-create-sync'] }]);
      syncCalls.length = 0;

      const deleteResponse = await fetch(
        `${baseUrl}/api/bot-bindings/${bindingPayload.botBinding.id}`,
        {
          method: 'DELETE',
        },
      );
      assert.equal(deleteResponse.status, 200);

      await waitFor(() => syncCalls.length === 1);
      assert.deepEqual(syncCalls, [{ staleBotTokens: ['token-updated-sync'] }]);
    },
    undefined,
    {
      telegramCommandSurfaceSync: {
        async reconcile(options = {}) {
          syncCalls.push({
            staleBotTokens: [...(options.staleBotTokens ?? [])],
          });
        },
      },
    },
  );
});

test('telegram webhook uses the injected room bridge seam', async () => {
  const chatStore = new MemoryChatStore();
  const companionStore = new MemoryCompanionBoxStore();
  const roomBridge = createChatTelegramRoomBridge({ chatStore, companionStore });
  let createRoomCalls = 0;
  let routeCalls = 0;

  await withServer(
    createRuntimeStub(),
    async (baseUrl) => {
      await configureTelegramBossCat(baseUrl);

      const webhookResponse = await fetch(`${baseUrl}/api/transports/telegram/webhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          update_id: 201,
          message: {
            message_id: 99,
            text: 'room bridge seam',
            chat: { id: 54321, type: 'private' },
            from: { id: 2, first_name: 'Adapter' },
          },
        }),
      });
      assert.equal(webhookResponse.status, 202);

      const payload = await webhookResponse.json();
      assert.equal(payload.receipt.status, 'accepted');
      assert.ok(createRoomCalls >= 1);
      assert.equal(routeCalls, 1);
    },
    chatStore,
    {
      companionStore,
      telegramRelay: createTelegramRelay({
        now: () => new Date('2026-03-19T00:00:00.000Z'),
        deliveryClient: {
          async deliver(request) {
            return {
              ok: true,
              chatId: request.chatId,
              messageId: '5002',
            };
          },
        },
      }),
      telegramRoomBridge: {
        readState() {
          return roomBridge.readState();
        },
        writeState(state) {
          return roomBridge.writeState(state);
        },
        findReusableRoomId(state, input) {
          return roomBridge.findReusableRoomId(state, input);
        },
        createRoom(state, input, timestamp) {
          createRoomCalls += 1;
          return roomBridge.createRoom(state, input, timestamp);
        },
        readRoom(state, roomId) {
          return roomBridge.readRoom(state, roomId);
        },
        routeRoomMessage(input) {
          routeCalls += 1;
          return roomBridge.routeRoomMessage(input);
        },
        buildRecoveryState(input) {
          return roomBridge.buildRecoveryState(input);
        },
      },
    },
  );
});

test('telegram webhook returns 500 and records diagnostics when room persistence fails mid-bridge', async () => {
  const chatStore = new FailingWriteChatStore();

  await withServer(
    createRuntimeStub(),
    async (baseUrl) => {
      await configureTelegramBossCat(baseUrl);
      chatStore.enableFailureOnRelativeWrite(2);

      const webhookResponse = await fetch(`${baseUrl}/api/transports/telegram/webhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          update_id: 101,
          message: {
            message_id: 88,
            text: 'hello from telegram',
            chat: { id: 12345, type: 'private' },
            from: { id: 1, first_name: 'Kenny' },
          },
        }),
      });
      assert.equal(webhookResponse.status, 500);

      const errorPayload = await webhookResponse.json();
      assert.equal(errorPayload.error.code, 'telegram_room_dispatch_failed');
      assert.match(errorPayload.error.message, /could not process the room turn/i);

      const diagnosticsResponse = await fetch(`${baseUrl}/api/transports/telegram/diagnostics`);
      assert.equal(diagnosticsResponse.status, 200);
      const diagnosticsPayload = await diagnosticsResponse.json();
      assert.equal(diagnosticsPayload.telegram.ingress.acceptedUpdates, 1);
      assert.equal(diagnosticsPayload.telegram.delivery.failedCount, 1);
      assert.equal(
        diagnosticsPayload.telegram.delivery.lastReceipt.reason,
        'runtime_dispatch_failed',
      );

      const roomId = diagnosticsPayload.telegram.bindings[0].linkedRoomId;
      assert.ok(roomId);

      const messagesResponse = await fetch(`${baseUrl}/api/channels/${roomId}/messages`);
      assert.equal(messagesResponse.status, 200);
      const messagesPayload = await messagesResponse.json();
      const inboundMessages = messagesPayload.messages.filter((message) =>
        message.senderKind === 'user' && message.body === 'hello from telegram');
      assert.equal(inboundMessages.length, 1);
      assert.ok(messagesPayload.messages.some((message) =>
        message.senderKind === 'system'
        && message.body.includes('Cats Chat could not process the room turn')));
    },
    chatStore,
  );
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
    assert.ok(payload.telegram.bindings[0].linkedRoomId);
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

test('telegram webhook routes can scope ingress to a specific bot binding path and secret', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    await configureTelegramBossCat(baseUrl);

    const createCompanionResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Companion',
        provider: 'claude',
        skillProfile: 'companion',
      }),
    });
    assert.equal(createCompanionResponse.status, 201);
    const createCompanionPayload = await createCompanionResponse.json();

    const bindingResponse = await fetch(`${baseUrl}/api/bot-bindings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        platform: 'telegram',
        botName: 'companion_bot',
        catId: createCompanionPayload.cat.id,
        roomMode: 'direct_cat_chat',
        webhookSecret: 'companion-secret',
      }),
    });
    assert.equal(bindingResponse.status, 201);
    const bindingPayload = await bindingResponse.json();
    const bindingId = bindingPayload.botBinding.id;

    const unauthorizedResponse = await fetch(`${baseUrl}/api/transports/telegram/webhook/${bindingId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        update_id: 101,
        message: {
          message_id: 88,
          text: 'hello companion',
          chat: { id: 12345, type: 'private' },
        },
      }),
    });
    assert.equal(unauthorizedResponse.status, 401);

    const webhookResponse = await fetch(`${baseUrl}/api/transports/telegram/webhook/${bindingId}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'companion-secret',
      },
      body: JSON.stringify({
        update_id: 101,
        message: {
          message_id: 88,
          text: 'hello companion',
          chat: { id: 12345, type: 'private' },
        },
      }),
    });
    assert.equal(webhookResponse.status, 202);
    const webhookPayload = await webhookResponse.json();
    assert.equal(webhookPayload.receipt.status, 'accepted');
    assert.equal(webhookPayload.receipt.bindingId, bindingId);
    assert.equal(webhookPayload.receipt.roomRouting.roomRoutingStatus, 'linked_room');
    assert.equal(
      webhookPayload.receipt.mappedConversationId,
      `telegram:${bindingId}:12345`,
    );

    const diagnosticsResponse = await fetch(`${baseUrl}/api/transports/telegram/diagnostics`);
    assert.equal(diagnosticsResponse.status, 200);
    const diagnosticsPayload = await diagnosticsResponse.json();
    assert.ok(diagnosticsPayload.telegram.bindings.some((binding) =>
      binding.bindingId === bindingId
      && binding.conversationId === `telegram:${bindingId}:12345`
      && binding.linkedRoomId));
  });
});

test('telegram webhook for a cat binding reuses that cat direct lane', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    await configureTelegramBossCat(baseUrl);

    const createCompanionResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Companion',
        provider: 'claude',
        skillProfile: 'companion',
      }),
    });
    assert.equal(createCompanionResponse.status, 201);
    const createCompanionPayload = await createCompanionResponse.json();
    const catId = createCompanionPayload.cat.id;

    const directLaneResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: '',
        topic: 'Companion direct lane',
        roomMode: 'direct_cat_chat',
        participantCatIds: [catId],
        leadParticipantId: catId,
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(directLaneResponse.status, 201);
    const directLanePayload = await directLaneResponse.json();
    const directLaneId = directLanePayload.channel.id;

    const bindingResponse = await fetch(`${baseUrl}/api/bot-bindings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        platform: 'telegram',
        botName: 'companion_bot',
        catId,
        roomMode: 'direct_cat_chat',
        webhookSecret: 'companion-secret',
      }),
    });
    assert.equal(bindingResponse.status, 201);
    const bindingPayload = await bindingResponse.json();
    const bindingId = bindingPayload.botBinding.id;

    const webhookResponse = await fetch(`${baseUrl}/api/transports/telegram/webhook/${bindingId}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'companion-secret',
      },
      body: JSON.stringify({
        update_id: 301,
        message: {
          message_id: 188,
          text: 'hello companion',
          chat: { id: 67890, type: 'private' },
          from: { id: 8, first_name: 'Kenny' },
        },
      }),
    });
    assert.equal(webhookResponse.status, 202);

    const diagnosticsResponse = await fetch(`${baseUrl}/api/transports/telegram/diagnostics`);
    assert.equal(diagnosticsResponse.status, 200);
    const diagnosticsPayload = await diagnosticsResponse.json();
    const telegramBinding = diagnosticsPayload.telegram.bindings.find((binding) =>
      binding.bindingId === bindingId
      && binding.conversationId === `telegram:${bindingId}:67890`,
    );

    assert.ok(telegramBinding);
    assert.equal(telegramBinding.linkedRoomId, directLaneId);

    const roomResponse = await fetch(`${baseUrl}/api/channels/${directLaneId}`);
    assert.equal(roomResponse.status, 200);
    const roomPayload = await roomResponse.json();
    assert.equal(roomPayload.channel.roomRouting.mode, 'direct_cat_chat');
    assert.equal(roomPayload.channel.roomRouting.leadParticipantId, catId);

    const messagesResponse = await fetch(`${baseUrl}/api/channels/${directLaneId}/messages`);
    assert.equal(messagesResponse.status, 200);
    const messagesPayload = await messagesResponse.json();
    assert.ok(messagesPayload.messages.some((message) =>
      message.senderKind === 'user' && message.body === 'hello companion'));
    assert.ok(messagesPayload.messages.some((message) =>
      message.senderKind === 'agent' && message.senderName === 'Companion'));
  });
});

test('telegram webhook normalizes legacy boss room mode for cat-bound bots into direct lanes', async () => {
  const chatStore = new MemoryChatStore();

  await withServer(createRuntimeStub(), async (baseUrl) => {
    await configureTelegramBossCat(baseUrl);

    const shellResponse = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(shellResponse.status, 200);
    const shellPayload = await shellResponse.json();
    const bossCatId = shellPayload.chat.bossCatId;
    assert.ok(bossCatId);

    const bindingResponse = await fetch(`${baseUrl}/api/bot-bindings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        platform: 'telegram',
        botName: 'legacy_boss_bot',
        catId: bossCatId,
        webhookSecret: 'legacy-secret',
      }),
    });
    assert.equal(bindingResponse.status, 201);
    const bindingPayload = await bindingResponse.json();
    const bindingId = bindingPayload.botBinding.id;

    const core = await chatStore.readCore();
    await chatStore.writeCore({
      ...core,
      botBindings: core.botBindings.map((binding) =>
        binding.id === bindingId
          ? {
              ...binding,
              roomMode: 'boss_chat',
            }
          : binding),
    });

    const shellAfterLegacyResponse = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(shellAfterLegacyResponse.status, 200);
    const shellAfterLegacyPayload = await shellAfterLegacyResponse.json();
    const legacyBinding = shellAfterLegacyPayload.chat.botBindings.find((binding) => binding.id === bindingId);
    assert.equal(legacyBinding.roomMode, 'direct_cat_chat');

    const webhookResponse = await fetch(`${baseUrl}/api/transports/telegram/webhook/${bindingId}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'legacy-secret',
      },
      body: JSON.stringify({
        update_id: 401,
        message: {
          message_id: 288,
          text: 'hello legacy boss cat',
          chat: { id: 77889, type: 'private' },
          from: { id: 12, first_name: 'Kenny' },
        },
      }),
    });
    assert.equal(webhookResponse.status, 202);

    const diagnosticsResponse = await fetch(`${baseUrl}/api/transports/telegram/diagnostics`);
    assert.equal(diagnosticsResponse.status, 200);
    const diagnosticsPayload = await diagnosticsResponse.json();
    const telegramBinding = diagnosticsPayload.telegram.bindings.find((binding) =>
      binding.bindingId === bindingId
      && binding.conversationId === `telegram:${bindingId}:77889`,
    );

    assert.ok(telegramBinding);
    assert.ok(telegramBinding.linkedRoomId);

    const roomResponse = await fetch(`${baseUrl}/api/channels/${telegramBinding.linkedRoomId}`);
    assert.equal(roomResponse.status, 200);
    const roomPayload = await roomResponse.json();
    assert.equal(roomPayload.channel.roomRouting.mode, 'direct_cat_chat');
    assert.equal(roomPayload.channel.roomRouting.leadParticipantId, bossCatId);
  }, chatStore);
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
      assert.equal(statusPayload.telegram.roomRouting.roomRoutingStatus, 'linked_room');
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
      assert.ok(diagnosticsPayload.telegram.bindings[0].linkedRoomId);
      assert.equal(diagnosticsPayload.telegram.ingress.ignoredUpdates, 1);
    },
  );
});


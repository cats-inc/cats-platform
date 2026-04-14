import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import { MemoryCoreStore } from '../build/server/core/store.js';
import {
  createDefaultCoreState,
  upsertCoreConversation,
  upsertCoreSession,
  upsertCoreTransportBinding,
} from '../build/server/core/model/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';

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
      return {};
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
      return {
        id: 'session-stub',
        provider: 'claude',
        model: 'claude-default',
        status: 'ready',
        cwd: path.join(os.tmpdir(), '.cats', 'runtime', 'sessions', 'session-stub'),
      };
    },
    async sendMessage() {
      return {
        segments: [{ kind: 'text', text: 'stub', toolName: null, toolId: null }],
        inputTokens: 0,
        outputTokens: 0,
        tokensUsed: 0,
      };
    },
    async closeSession() {},
    async deleteSession() {
      return { action: 'delete', sessionId: 'session-stub', status: 'deleted' };
    },
  };
}

function createInteractionCoreState() {
  let core = createDefaultCoreState();

  core = upsertCoreConversation(
    core,
    {
      id: 'conversation-1',
      title: 'Telegram conversation',
      kind: 'external_transport',
      status: 'active',
      createdAt: '2026-04-15T03:20:00.000Z',
    },
    new Date('2026-04-15T03:20:00.000Z'),
  ).core;

  core = upsertCoreConversation(
    core,
    {
      id: 'conversation-2',
      title: 'Web conversation',
      kind: 'direct_message',
      status: 'active',
      createdAt: '2026-04-15T03:21:00.000Z',
    },
    new Date('2026-04-15T03:21:00.000Z'),
  ).core;

  core = upsertCoreTransportBinding(
    core,
    {
      id: 'transport-binding-1',
      platform: 'telegram',
      direction: 'bidirectional',
      conversationId: 'conversation-1',
      participantId: 'participant-1',
      agentId: 'actor-agent-1',
      externalThreadKey: 'telegram:thread:1',
      status: 'active',
      createdAt: '2026-04-15T03:22:00.000Z',
    },
    new Date('2026-04-15T03:22:00.000Z'),
  ).core;

  core = upsertCoreTransportBinding(
    core,
    {
      id: 'transport-binding-2',
      platform: 'web',
      direction: 'inbound',
      conversationId: 'conversation-2',
      participantId: 'participant-2',
      agentId: 'actor-agent-2',
      externalThreadKey: 'web:thread:2',
      status: 'disabled',
      createdAt: '2026-04-15T03:23:00.000Z',
    },
    new Date('2026-04-15T03:23:00.000Z'),
  ).core;

  core = upsertCoreSession(
    core,
    {
      id: 'session-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      laneId: 'lane-1',
      participantId: 'participant-1',
      agentId: 'actor-agent-1',
      transportBindingId: 'transport-binding-1',
      runtimeKey: 'claude:cli',
      status: 'active',
      createdAt: '2026-04-15T03:24:00.000Z',
      startedAt: '2026-04-15T03:24:00.000Z',
    },
    new Date('2026-04-15T03:24:00.000Z'),
  ).core;

  core = upsertCoreSession(
    core,
    {
      id: 'session-2',
      conversationId: 'conversation-2',
      turnId: 'turn-2',
      laneId: 'lane-2',
      participantId: 'participant-2',
      agentId: 'actor-agent-2',
      transportBindingId: 'transport-binding-2',
      runtimeKey: 'gemini:cli',
      status: 'failed',
      createdAt: '2026-04-15T03:25:00.000Z',
      startedAt: '2026-04-15T03:25:00.000Z',
      completedAt: '2026-04-15T03:26:00.000Z',
    },
    new Date('2026-04-15T03:26:00.000Z'),
  ).core;

  return core;
}

async function withServer(callback) {
  const tempStateDir = await mkdtemp(path.join(os.tmpdir(), 'cats-core-interaction-'));
  const core = createInteractionCoreState();
  const chatStore = new MemoryChatStore();
  const sharedCoreStore = new MemoryCoreStore(core);
  await chatStore.writeCore(core);
  const server = createServer({
    shared: {
      config: {
        ...baseConfig,
        chatStatePath: path.join(tempStateDir, 'platform', 'state', 'chat-state.local.json'),
        runtimeDataDir: path.join(tempStateDir, 'runtime-data'),
      },
      runtimeClient: createRuntimeStub(),
      now: () => new Date('2026-04-15T03:20:00.000Z'),
      coreStore: sharedCoreStore,
    },
    chat: {
      chatStore,
    },
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve test server address');
  }

  try {
    await sharedCoreStore.writeCore(core);
    await chatStore.writeCore(core);
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
    await rm(tempStateDir, { recursive: true, force: true });
  }
}

test('core interaction routes support filtered transport binding queries', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/core/transport-bindings?platform=telegram&direction=bidirectional&status=active&agentId=actor-agent-1`,
    );
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.transportBindings.length, 1);
    assert.equal(payload.transportBindings[0].id, 'transport-binding-1');
  });
});

test('core interaction routes reject invalid transport binding filters with structured 400 responses', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/core/transport-bindings?direction=sideways`);
    assert.equal(response.status, 400);

    const payload = await response.json();
    assert.equal(payload.error.code, 'bad_request');
    assert.match(payload.error.message, /direction must be one of/i);
  });
});

test('core interaction routes support filtered session queries', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/core/sessions?conversationId=conversation-1&laneId=lane-1&transportBindingId=transport-binding-1&status=active&runtimeKey=claude:cli`,
    );
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.sessions.length, 1);
    assert.equal(payload.sessions[0].id, 'session-1');
  });
});

test('core interaction routes reject invalid session filters with structured 400 responses', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/core/sessions?status=paused`);
    assert.equal(response.status, 400);

    const payload = await response.json();
    assert.equal(payload.error.code, 'bad_request');
    assert.match(payload.error.message, /status must be one of/i);
  });
});

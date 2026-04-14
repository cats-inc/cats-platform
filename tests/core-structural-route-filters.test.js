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
  upsertCoreContainer,
  upsertCoreConversation,
  upsertCoreParticipant,
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

function createCoreState() {
  let core = createDefaultCoreState();

  core = upsertCoreContainer(
    core,
    {
      id: 'container-1',
      kind: 'chat_root',
      title: 'Chat root',
      status: 'active',
      parentContainerId: 'container-parent',
      createdAt: '2026-04-15T05:30:00.000Z',
    },
    new Date('2026-04-15T05:30:00.000Z'),
  ).core;

  core = upsertCoreConversation(
    core,
    {
      id: 'conversation-1',
      title: 'Primary conversation',
      kind: 'direct_message',
      status: 'active',
      containerId: 'container-1',
      participantActorIds: ['actor-owner', 'actor-worker'],
      sourceChannelId: 'channel-1',
      repoPath: 'C:/repo-one',
      responseLanguage: 'en',
      createdAt: '2026-04-15T05:31:00.000Z',
    },
    new Date('2026-04-15T05:31:00.000Z'),
  ).core;

  core = upsertCoreParticipant(
    core,
    {
      id: 'participant-1',
      conversationId: 'conversation-1',
      agentId: 'actor-worker',
      role: 'assistant',
      status: 'active',
      joinedAt: '2026-04-15T05:32:00.000Z',
    },
    new Date('2026-04-15T05:32:00.000Z'),
  ).core;

  return core;
}

async function withServer(callback) {
  const tempStateDir = await mkdtemp(path.join(os.tmpdir(), 'cats-core-structural-'));
  const core = createCoreState();
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
      now: () => new Date('2026-04-15T05:30:00.000Z'),
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

test('core structural routes support filtered raw record queries', async () => {
  await withServer(async (baseUrl) => {
    const containerResponse = await fetch(
      `${baseUrl}/api/core/containers?id=container-1&kind=chat_root&status=active&parentContainerId=container-parent`,
    );
    assert.equal(containerResponse.status, 200);
    const containerPayload = await containerResponse.json();
    assert.equal(containerPayload.containers.length, 1);
    assert.equal(containerPayload.containers[0].id, 'container-1');

    const conversationResponse = await fetch(
      `${baseUrl}/api/core/conversations?id=conversation-1&kind=direct_message&status=active&containerId=container-1&participantActorId=actor-worker&sourceChannelId=channel-1&repoPath=C:/repo-one&responseLanguage=en`,
    );
    assert.equal(conversationResponse.status, 200);
    const conversationPayload = await conversationResponse.json();
    assert.equal(conversationPayload.conversations.length, 1);
    assert.equal(conversationPayload.conversations[0].id, 'conversation-1');

    const participantResponse = await fetch(
      `${baseUrl}/api/core/participants?id=participant-1&conversationId=conversation-1&agentId=actor-worker&role=assistant&status=active`,
    );
    assert.equal(participantResponse.status, 200);
    const participantPayload = await participantResponse.json();
    assert.equal(participantPayload.participants.length, 1);
    assert.equal(participantPayload.participants[0].id, 'participant-1');
  });
});

test('core structural routes reject invalid raw record filters with structured 400 responses', async () => {
  await withServer(async (baseUrl) => {
    const containerResponse = await fetch(`${baseUrl}/api/core/containers?kind=room`);
    assert.equal(containerResponse.status, 400);
    const containerPayload = await containerResponse.json();
    assert.equal(containerPayload.error.code, 'bad_request');
    assert.match(containerPayload.error.message, /kind must be one of/i);

    const conversationResponse = await fetch(`${baseUrl}/api/core/conversations?status=running`);
    assert.equal(conversationResponse.status, 400);
    const conversationPayload = await conversationResponse.json();
    assert.equal(conversationPayload.error.code, 'bad_request');
    assert.match(conversationPayload.error.message, /status must be one of/i);

    const participantResponse = await fetch(`${baseUrl}/api/core/participants?status=waiting`);
    assert.equal(participantResponse.status, 400);
    const participantPayload = await participantResponse.json();
    assert.equal(participantPayload.error.code, 'bad_request');
    assert.match(participantPayload.error.message, /status must be one of/i);
  });
});

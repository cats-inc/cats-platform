import assert from 'node:assert/strict';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import {
  buildChatConversationId,
  buildDirectLaneTransportBindingId,
  CHAT_ROOT_CONTAINER_ID,
} from '../build/server/shared/chatCoreIds.js';

const baseConfig = {
  host: '127.0.0.1',
  port: 0,
  runtimeBaseUrl: 'http://127.0.0.1:3110',
  runtimeApiKey: '',
  chatStatePath: 'unused-for-tests',
};

function createRuntimeStub() {
  let nextSession = 1;
  return {
    createdSessions: [],
    async getHealth() {
      return {
        baseUrl: baseConfig.runtimeBaseUrl,
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
    async getAdvancedProviderModels(provider) {
      return {
        provider,
        backend: 'cli',
        instance: 'default',
        defaultModel: `${provider}-default`,
        source: 'config',
        cache: null,
        entries: [
          { id: `${provider}-default`, label: `${provider} default`, default: true },
        ],
        presets: [],
        controls: [],
        defaultSelection: null,
        support: {
          tier: 'entry_only',
        },
        warnings: [],
      };
    },
    async createSession(input) {
      const sessionId = `session-${nextSession++}`;
      const session = {
        id: sessionId,
        provider: input.provider,
        model: input.model ?? null,
        status: 'ready',
        cwd: input.cwd ?? path.join(os.tmpdir(), '.cats', 'runtime', 'sessions', sessionId),
      };
      this.createdSessions.push({ ...input, id: session.id });
      return session;
    },
    async sendMessage() {
      return {
        segments: [{ kind: 'text', text: 'Agent response from runtime.', toolName: null, toolId: null }],
        inputTokens: 11,
        outputTokens: 7,
        tokensUsed: 18,
      };
    },
    async closeSession() {},
  };
}

async function withServer(runtimeClient, callback, chatStore = new MemoryChatStore()) {
  const server = createServer({
    shared: {
      config: baseConfig,
      runtimeClient,
      now: () => new Date('2026-04-15T00:00:00.000Z'),
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
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('assigning a cat emits session_started metadata keyed by participantId', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Spawn target identity',
        topic: 'Use participant identity for session_started messages.',
        originSurface: 'chat',
        repoPath: 'C:/repo/cats-platform',
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;
    assert.equal(createChannelPayload.channel.runtimeWorkspaceKind, 'source');
    assert.equal(createChannelPayload.channel.runtimeWorkspaceAccess, 'read_write');
    assert.equal(createChannelPayload.channel.runtimePermissionMode, 'skip');

    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Agent-Spawn',
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const createCatPayload = await createCatResponse.json();
    const catId = createCatPayload.cat.id;

    const assignResponse = await fetch(`${baseUrl}/api/channels/${channelId}/cats/${catId}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(assignResponse.status, 201);
    const assignPayload = await assignResponse.json();
    assert.equal(runtimeClient.createdSessions.length, 1);
    assert.equal(assignPayload.cat.execution.lease.sessionId, 'session-1');

    const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
    assert.equal(channelResponse.status, 200);
    const channelPayload = await channelResponse.json();
    const assignmentParticipantId = channelPayload.channel.catAssignments?.[0]?.participantId;
    assert.equal(typeof assignmentParticipantId, 'string');
    const sessionStartedMessage = channelPayload.channel.messages.find(
      (message) =>
        message.metadata?.event === 'session_started'
        && message.metadata?.sessionId === 'session-1',
    );
    assert.ok(sessionStartedMessage);
    assert.equal(sessionStartedMessage.metadata?.targetId, assignmentParticipantId);
    assert.equal(
      sessionStartedMessage.metadata?.conversationId,
      buildChatConversationId(channelId),
    );
    assert.equal(sessionStartedMessage.metadata?.containerId, CHAT_ROOT_CONTAINER_ID);
    assert.equal(
      sessionStartedMessage.body,
      'Agent-Spawn connected to cats-runtime session session-1.\n(cwd: C:/repo/cats-platform)',
    );
  });
});

test('channel creation rejects runtime policy combinations that would otherwise be silently coerced', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Invalid runtime policy',
        topic: 'Do not silently rewrite read_write + default.',
        originSurface: 'chat',
        repoPath: 'C:/repo/cats-platform',
        runtimeWorkspaceAccess: 'read_write',
        runtimePermissionMode: 'default',
        skipBossCatGreeting: true,
      }),
    });

    assert.equal(createChannelResponse.status, 400);
    const payload = await createChannelResponse.json();
    assert.equal(payload.error?.code, 'invalid_runtime_policy_combination');
    assert.equal(
      payload.error?.message,
      'read_write sessions may only use skip or whitelist permission modes.',
    );
    assert.deepEqual(payload.error?.details, {
      workspaceAccess: 'read_write',
      permissionMode: 'default',
    });
  });
});

test('assigning a cat keeps direct-lane transport binding on session_start_failed metadata', async () => {
  const runtimeClient = createRuntimeStub();
  runtimeClient.createSession = async () => {
    throw new Error('runtime create failed');
  };

  await withServer(runtimeClient, async (baseUrl) => {
    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Agent-Spawn',
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const createCatPayload = await createCatResponse.json();
    const catId = createCatPayload.cat.id;

    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Spawn target direct failure',
        topic: 'Keep direct-lane binding on session_start_failed messages.',
        originSurface: 'chat',
        roomMode: 'direct_cat_chat',
        defaultRecipientId: catId,
        repoPath: 'C:/repo/cats-platform',
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    const assignResponse = await fetch(`${baseUrl}/api/channels/${channelId}/cats/${catId}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(assignResponse.status, 201);

    const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
    assert.equal(channelResponse.status, 200);
    const channelPayload = await channelResponse.json();
    const assignmentParticipantId = channelPayload.channel.catAssignments?.[0]?.participantId;
    assert.equal(typeof assignmentParticipantId, 'string');
    const sessionStartFailedMessage = channelPayload.channel.messages.find(
      (message) => message.metadata?.event === 'session_start_failed',
    );
    assert.ok(sessionStartFailedMessage);
    assert.equal(sessionStartFailedMessage.metadata?.targetId, assignmentParticipantId);
    assert.equal(
      sessionStartFailedMessage.metadata?.conversationId,
      buildChatConversationId(channelId),
    );
    assert.equal(sessionStartFailedMessage.metadata?.containerId, CHAT_ROOT_CONTAINER_ID);
    assert.equal(
      sessionStartFailedMessage.metadata?.transportBindingId,
      buildDirectLaneTransportBindingId(channelId),
    );
  });
});

test('assigning a cat reuses the channel runtime session policy when starting a new session', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Policy-aware spawn',
        topic: 'Carry code draft session policy into runtime session creation.',
        originSurface: 'chat',
        repoPath: 'C:/repo/cats-platform',
        runtimeWorkspaceKind: 'worktree',
        runtimeWorkspaceAccess: 'read_only',
        runtimePermissionMode: 'default',
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;
    assert.equal(createChannelPayload.channel.runtimeWorkspaceKind, 'worktree');
    assert.equal(createChannelPayload.channel.runtimeWorkspaceAccess, 'read_only');
    assert.equal(createChannelPayload.channel.runtimePermissionMode, 'default');

    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Policy Cat',
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const createCatPayload = await createCatResponse.json();
    const catId = createCatPayload.cat.id;

    const assignResponse = await fetch(`${baseUrl}/api/channels/${channelId}/cats/${catId}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(assignResponse.status, 201);

    assert.equal(runtimeClient.createdSessions.length, 1);
    assert.equal(runtimeClient.createdSessions[0]?.workspaceKind, 'worktree');
    assert.equal(runtimeClient.createdSessions[0]?.workspaceAccess, 'read_only');
    assert.equal(runtimeClient.createdSessions[0]?.permissionMode, 'default');
  });
});

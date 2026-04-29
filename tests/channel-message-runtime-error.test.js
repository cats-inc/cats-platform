import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import {
  RUNTIME_MESSAGE_SEND_TOOL,
} from '../build/server/platform/supervision/runtimeBoundary.js';
import {
  buildChatConversationId,
  buildDirectLaneTransportBindingId,
  CHAT_ROOT_CONTAINER_ID,
} from '../build/server/shared/chatCoreIds.js';
import { waitForCondition } from './testUtils.js';

const baseConfig = {
  host: '127.0.0.1',
  port: 0,
  runtimeBaseUrl: 'http://127.0.0.1:3110',
  runtimeApiKey: '',
};

function createRuntimeStub(options = {}) {
  let nextSession = 1;
  const sendMessageImpl = options.sendMessageImpl ?? (async () => {
    throw new Error('Injected runtime failure from test stub.');
  });
  return {
    createdSessions: [],
    sentMessages: [],
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
    async createSession(input) {
      const sessionId = `session-${nextSession++}`;
      const session = {
        id: sessionId,
        provider: input.provider,
        model: input.model ?? null,
        status: 'ready',
        cwd: input.cwd ?? path.join('C:/repo/cats-platform', '.runtime', sessionId),
      };
      this.createdSessions.push({ ...input, id: session.id });
      return session;
    },
    async sendMessage(sessionId, content, input) {
      this.sentMessages.push({ sessionId, content, input });
      return sendMessageImpl(sessionId, content, input);
    },
    async closeSession() {},
    async cancelSession() {},
    async deleteSession(sessionId) {
      return { action: 'delete', sessionId, status: 'deleted' };
    },
  };
}

async function withServer(runtimeClient, callback, chatStore = new MemoryChatStore()) {
  const tempStateDir = await mkdtemp(path.join(os.tmpdir(), 'cats-runtime-error-'));
  const server = createServer({
    shared: {
      config: {
        ...baseConfig,
        chatStatePath: path.join(tempStateDir, 'platform', 'state', 'chat-state.local.json'),
        runtimeDataDir: path.join(tempStateDir, 'runtime-data'),
      },
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
    await rm(tempStateDir, { recursive: true, force: true });
  }
}

test('posting a direct-lane message keeps canonical transport binding on runtime_error metadata', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Companion',
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
        title: 'Direct lane runtime error',
        topic: 'Preserve canonical transport binding on runtime_error notices.',
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
    assert.equal(
      runtimeClient.createdSessions[0]?.context?.metadata?.supervisionBoundary,
      'cats-supervision-runtime-boundary',
    );

    const sendResponse = await fetch(`${baseUrl}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        body: 'Please fail this direct-lane dispatch.',
      }),
    });
    const sendPayload = await sendResponse.json();
    assert.equal(sendResponse.status, 200, JSON.stringify(sendPayload));
    assert.equal(sendPayload.phase, 'acknowledged');

    const channelPayload = await waitForCondition(async () => {
      const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
      assert.equal(channelResponse.status, 200);
      const payload = await channelResponse.json();
      const runtimeError = payload.channel.messages.find((message) =>
        message.metadata?.event === 'runtime_error'
        && /Injected runtime failure/u.test(message.body),
      );
      return runtimeError ? payload : null;
    }, {
      timeoutMs: 2_000,
      intervalMs: 25,
    });

    const runtimeError = channelPayload.channel.messages.find((message) =>
      message.metadata?.event === 'runtime_error'
      && /Injected runtime failure/u.test(message.body),
    );
    assert.ok(runtimeError);
    assert.equal(
      runtimeClient.sentMessages[0]?.input?.context?.metadata?.supervisionBoundary,
      'cats-supervision-runtime-boundary',
    );
    assert.equal(runtimeError.metadata?.toolName, RUNTIME_MESSAGE_SEND_TOOL);
    assert.equal(runtimeError.metadata?.rejectionCode, 'E_PRECHECK_FAILED');
    assert.equal(runtimeError.metadata?.conversationId, buildChatConversationId(channelId));
    assert.equal(runtimeError.metadata?.containerId, CHAT_ROOT_CONTAINER_ID);
    assert.equal(
      runtimeError.metadata?.transportBindingId,
      buildDirectLaneTransportBindingId(channelId),
    );
  });
});

test('posting a direct-lane message keeps canonical transport binding on assistant_turn_segment metadata', async () => {
  const runtimeClient = createRuntimeStub({
    sendMessageImpl: async () => ({
      segments: [{ kind: 'text', text: 'Direct reply from runtime.', toolName: null, toolId: null }],
      inputTokens: 11,
      outputTokens: 7,
      tokensUsed: 18,
    }),
  });

  await withServer(runtimeClient, async (baseUrl) => {
    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Companion',
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
        title: 'Direct lane assistant segment',
        topic: 'Preserve canonical transport binding on assistant_turn_segment replies.',
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

    const sendResponse = await fetch(`${baseUrl}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        body: 'Please answer this direct-lane prompt.',
      }),
    });
    const sendPayload = await sendResponse.json();
    assert.equal(sendResponse.status, 200, JSON.stringify(sendPayload));
    assert.equal(sendPayload.phase, 'acknowledged');

    const channelPayload = await waitForCondition(async () => {
      const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
      assert.equal(channelResponse.status, 200);
      const payload = await channelResponse.json();
      const assistantReply = payload.channel.messages.find((message) =>
        message.senderKind === 'agent'
        && message.body === 'Direct reply from runtime.'
        && message.metadata?.event === 'assistant_turn_segment',
      );
      return assistantReply ? payload : null;
    }, {
      timeoutMs: 2_000,
      intervalMs: 25,
    });

    const assistantReply = channelPayload.channel.messages.find((message) =>
      message.senderKind === 'agent'
      && message.body === 'Direct reply from runtime.'
      && message.metadata?.event === 'assistant_turn_segment',
    );
    assert.ok(assistantReply);
    assert.equal(
      runtimeClient.sentMessages[0]?.input?.context?.metadata?.supervisionBoundary,
      'cats-supervision-runtime-boundary',
    );
    assert.equal(assistantReply.metadata?.conversationId, buildChatConversationId(channelId));
    assert.equal(assistantReply.metadata?.containerId, CHAT_ROOT_CONTAINER_ID);
    assert.equal(
      assistantReply.metadata?.transportBindingId,
      buildDirectLaneTransportBindingId(channelId),
    );
  });
});

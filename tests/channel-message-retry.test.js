import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import {
  assignCatToChannel,
  createCat,
  createChannel,
  requireChannel,
} from '../build/server/products/chat/state/model/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { buildDirectLaneTransportBindingId } from '../build/server/shared/chatCoreIds.js';
import { waitForCondition } from './testUtils.js';

const baseConfig = {
  host: '127.0.0.1',
  port: 8181,
  runtimeBaseUrl: 'http://127.0.0.1:3110',
  runtimeApiKey: '',
  chatStatePath: 'unused-for-tests',
};

function createRetryRuntimeStub() {
  let nextSession = 1;
  let sendAttempts = 0;
  return {
    createdSessions: [],
    sentMessages: [],
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
    async getProviderDiagnostics() {
      return {
        probe: 'light',
        providers: [],
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
    async createSession(input) {
      const sessionId = `session-${nextSession++}`;
      const session = {
        id: sessionId,
        provider: input.provider ?? 'claude',
        model: input.model ?? null,
        status: 'ready',
        cwd: input.cwd ?? path.join(os.tmpdir(), '.cats', 'runtime', 'sessions', sessionId),
      };
      this.createdSessions.push({ ...input, id: sessionId });
      return session;
    },
    async sendMessage(sessionId, content) {
      this.sentMessages.push({ sessionId, content });
      sendAttempts += 1;
      if (sendAttempts === 1) {
        throw new Error('Runtime unavailable.');
      }
      return {
        segments: [{ kind: 'text', text: 'Recovered response from retry.', toolName: null, toolId: null }],
        inputTokens: 12,
        outputTokens: 8,
        tokensUsed: 20,
      };
    },
    async closeSession() {},
    async cancelSession() {},
    async deleteSession(sessionId) {
      return { action: 'delete', sessionId, status: 'deleted' };
    },
  };
}

async function withServer(runtimeClient, callback, chatStore = new MemoryChatStore()) {
  const tempStateDir = await mkdtemp(path.join(os.tmpdir(), 'cats-message-retry-'));
  const runtimeDataDir = path.join(tempStateDir, 'runtime-data');
  const server = createServer({
    shared: {
      config: {
        ...baseConfig,
        chatStatePath: path.join(tempStateDir, 'platform', 'state', 'chat-state.local.json'),
        runtimeDataDir,
      },
      runtimeClient,
      now: () => new Date('2026-04-11T00:00:00.000Z'),
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

test('POST /api/channels/:id/messages/:messageId/retry replays the same acknowledged user message without appending a duplicate', async () => {
  const runtimeClient = createRetryRuntimeStub();
  const chatStore = new MemoryChatStore();
  const now = new Date('2026-04-11T00:00:00.000Z');

  let state = await chatStore.read();
  state = createChannel(state, {
    title: 'Retry the same turn',
    topic: 'Verify last-message retry replays the acknowledged user message.',
    originSurface: 'chat',
    entryKind: 'solo',
    skipBossCatGreeting: true,
  }, now);
  const channelId = state.selectedChannelId;
  await chatStore.write(state);

  await withServer(runtimeClient, async (baseUrl) => {
    const firstSendResponse = await fetch(`${baseUrl}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        body: 'Please recover this failed response.',
      }),
    });
    assert.equal(firstSendResponse.status, 200);
    const firstSendPayload = await firstSendResponse.json();
    const sourceMessageId = firstSendPayload.message.id;

    const failedChannel = await waitForCondition(async () => {
      const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
      assert.equal(channelResponse.status, 200);
      const payload = await channelResponse.json();
      return payload.channel.roomRouting.lastOutcome?.status === 'error'
        ? payload.channel
        : null;
    }, {
      timeoutMs: 2_000,
      intervalMs: 25,
    });

    assert.equal(
      failedChannel.roomRouting.lastOutcome.sourceMessageId,
      sourceMessageId,
    );

    const retryResponse = await fetch(
      `${baseUrl}/api/channels/${channelId}/messages/${sourceMessageId}/retry`,
      {
        method: 'POST',
      },
    );
    assert.equal(retryResponse.status, 200);
    const retryPayload = await retryResponse.json();
    assert.equal(retryPayload.phase, 'acknowledged');
    assert.equal(retryPayload.message.id, sourceMessageId);

    const completedChannel = await waitForCondition(async () => {
      const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
      assert.equal(channelResponse.status, 200);
      const payload = await channelResponse.json();
      return payload.channel.roomRouting.workflow.turnHistory[0]?.status === 'completed'
        ? payload.channel
        : null;
    }, {
      timeoutMs: 2_000,
      intervalMs: 25,
    });

    const userMessages = completedChannel.messages.filter((message) => message.senderKind === 'user');
    assert.equal(userMessages.length, 1);
    assert.equal(userMessages[0].id, sourceMessageId);
    assert.ok(
      completedChannel.messages.some((message) =>
        message.senderKind === 'agent'
        && message.body === 'Recovered response from retry.'),
    );
  }, chatStore);
});

test('POST /api/channels/:id/messages/:messageId/retry rebuilds a missing user source from canonical history', async () => {
  const runtimeClient = createRetryRuntimeStub();
  const chatStore = new MemoryChatStore();
  const now = new Date('2026-04-11T00:00:00.000Z');

  let state = await chatStore.read();
  state = createChannel(state, {
    title: 'Retry from canonical source',
    topic: 'Verify retry survives transcript drift.',
    originSurface: 'chat',
    entryKind: 'solo',
    skipBossCatGreeting: true,
  }, now);
  const channelId = state.selectedChannelId;
  await chatStore.write(state);

  await withServer(runtimeClient, async (baseUrl) => {
    const firstSendResponse = await fetch(`${baseUrl}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        body: 'Please recover this failed response after drift.',
      }),
    });
    assert.equal(firstSendResponse.status, 200);
    const firstSendPayload = await firstSendResponse.json();
    const sourceMessageId = firstSendPayload.message.id;

    await waitForCondition(async () => {
      const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
      assert.equal(channelResponse.status, 200);
      const payload = await channelResponse.json();
      return payload.channel.roomRouting.lastOutcome?.status === 'error'
        ? payload.channel
        : null;
    }, {
      timeoutMs: 2_000,
      intervalMs: 25,
    });

    const driftedState = await chatStore.read();
    const driftedChannel = requireChannel(driftedState, channelId);
    driftedChannel.messages = driftedChannel.messages.filter((message) => message.id !== sourceMessageId);
    await chatStore.write(driftedState);

    const retryResponse = await fetch(
      `${baseUrl}/api/channels/${channelId}/messages/${sourceMessageId}/retry`,
      {
        method: 'POST',
      },
    );
    assert.equal(retryResponse.status, 200);
    const retryPayload = await retryResponse.json();
    assert.equal(retryPayload.phase, 'acknowledged');
    assert.equal(retryPayload.message.id, sourceMessageId);
    assert.equal(retryPayload.message.body, 'Please recover this failed response after drift.');

    const completedChannel = await waitForCondition(async () => {
      const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
      assert.equal(channelResponse.status, 200);
      const payload = await channelResponse.json();
      return payload.channel.roomRouting.workflow.turnHistory[0]?.status === 'completed'
        ? payload.channel
        : null;
    }, {
      timeoutMs: 2_000,
      intervalMs: 25,
    });

    const userMessages = completedChannel.messages.filter((message) => message.senderKind === 'user');
    assert.equal(userMessages.length, 1);
    assert.equal(userMessages[0].id, sourceMessageId);
    assert.ok(
      completedChannel.messages.some((message) =>
        message.senderKind === 'agent'
        && message.body === 'Recovered response from retry.'),
    );
  }, chatStore);
});

test('POST /api/channels/:id/messages/:messageId/retry accepts the latest failed user turn from canonical history when workflow state drifts', async () => {
  const runtimeClient = createRetryRuntimeStub();
  const chatStore = new MemoryChatStore();
  const now = new Date('2026-04-11T00:00:00.000Z');

  let state = await chatStore.read();
  state = createChannel(state, {
    title: 'Retry from canonical failure state',
    topic: 'Verify retry survives workflow snapshot drift.',
    originSurface: 'chat',
    entryKind: 'solo',
    skipBossCatGreeting: true,
  }, now);
  const channelId = state.selectedChannelId;
  await chatStore.write(state);

  await withServer(runtimeClient, async (baseUrl) => {
    const firstSendResponse = await fetch(`${baseUrl}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        body: 'Please recover this failed response after workflow drift.',
      }),
    });
    assert.equal(firstSendResponse.status, 200);
    const firstSendPayload = await firstSendResponse.json();
    const sourceMessageId = firstSendPayload.message.id;

    await waitForCondition(async () => {
      const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
      assert.equal(channelResponse.status, 200);
      const payload = await channelResponse.json();
      return payload.channel.roomRouting.lastOutcome?.status === 'error'
        ? payload.channel
        : null;
    }, {
      timeoutMs: 2_000,
      intervalMs: 25,
    });

    const driftedState = await chatStore.read();
    const driftedChannel = requireChannel(driftedState, channelId);
    driftedChannel.roomRouting.lastOutcome = null;
    driftedChannel.roomRouting.workflow.turnHistory = [];
    await chatStore.write(driftedState);

    const retryResponse = await fetch(
      `${baseUrl}/api/channels/${channelId}/messages/${sourceMessageId}/retry`,
      {
        method: 'POST',
      },
    );
    assert.equal(retryResponse.status, 200);
    const retryPayload = await retryResponse.json();
    assert.equal(retryPayload.phase, 'acknowledged');
    assert.equal(retryPayload.message.id, sourceMessageId);
    assert.equal(
      retryPayload.message.body,
      'Please recover this failed response after workflow drift.',
    );

    const completedChannel = await waitForCondition(async () => {
      const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
      assert.equal(channelResponse.status, 200);
      const payload = await channelResponse.json();
      return payload.channel.roomRouting.workflow.turnHistory[0]?.status === 'completed'
        ? payload.channel
        : null;
    }, {
      timeoutMs: 2_000,
      intervalMs: 25,
    });

    assert.ok(
      completedChannel.messages.some((message) =>
        message.senderKind === 'agent'
        && message.body === 'Recovered response from retry.'),
    );
  }, chatStore);
});

test('POST /api/channels/:id/messages/:messageId/retry rejects retry when the latest acknowledged user turn did not fail', async () => {
  const runtimeClient = {
    ...createRetryRuntimeStub(),
    async sendMessage(sessionId, content) {
      this.sentMessages.push({ sessionId, content });
      return {
        segments: [{ kind: 'text', text: 'Completed successfully.', toolName: null, toolId: null }],
        inputTokens: 10,
        outputTokens: 6,
        tokensUsed: 16,
      };
    },
  };
  const chatStore = new MemoryChatStore();
  const now = new Date('2026-04-11T00:00:00.000Z');

  let state = await chatStore.read();
  state = createChannel(state, {
    title: 'No retry needed',
    topic: 'Reject retry when the latest turn already completed.',
    originSurface: 'chat',
    entryKind: 'solo',
    skipBossCatGreeting: true,
  }, now);
  const channelId = state.selectedChannelId;
  await chatStore.write(state);

  await withServer(runtimeClient, async (baseUrl) => {
    const sendResponse = await fetch(`${baseUrl}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        body: 'Complete this without retry.',
      }),
    });
    assert.equal(sendResponse.status, 200);
    const sendPayload = await sendResponse.json();
    const sourceMessageId = sendPayload.message.id;

    await waitForCondition(async () => {
      const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
      assert.equal(channelResponse.status, 200);
      const payload = await channelResponse.json();
      return payload.channel.roomRouting.workflow.turnHistory[0]?.status === 'completed'
        ? true
        : false;
    }, {
      timeoutMs: 2_000,
      intervalMs: 25,
    });

    const retryResponse = await fetch(
      `${baseUrl}/api/channels/${channelId}/messages/${sourceMessageId}/retry`,
      {
        method: 'POST',
      },
    );
    assert.equal(retryResponse.status, 409);
    const retryPayload = await retryResponse.json();
    assert.equal(retryPayload.error.code, 'message_retry_not_available');
  }, chatStore);
});

test('POST /api/channels/:id/messages/:messageId/retry restores a drifted direct-lane turn with transport binding intact', async () => {
  const runtimeClient = createRetryRuntimeStub();
  const chatStore = new MemoryChatStore();
  const now = new Date('2026-04-11T00:00:00.000Z');

  let state = await chatStore.read();
  state = createCat(state, {
    name: 'Companion',
    provider: 'claude',
  }, now);
  const catId = state.cats[0].id;
  state = createChannel(state, {
    title: 'Retry direct-lane canonical turn',
    topic: 'Verify retry restores a drifted direct-lane turn from canonical history.',
    originSurface: 'chat',
    roomMode: 'direct_cat_chat',
    defaultRecipientId: catId,
    repoPath: 'C:/repo/cats-platform',
    skipBossCatGreeting: true,
  }, now);
  const channelId = state.selectedChannelId;
  state = assignCatToChannel(state, channelId, { catId, provider: 'claude' }, now);
  await chatStore.write(state);

  await withServer(runtimeClient, async (baseUrl) => {
    const firstSendResponse = await fetch(`${baseUrl}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        body: 'Please recover this direct-lane response after drift.',
      }),
    });
    assert.equal(firstSendResponse.status, 200);
    const firstSendPayload = await firstSendResponse.json();
    const sourceMessageId = firstSendPayload.message.id;

    await waitForCondition(async () => {
      const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
      assert.equal(channelResponse.status, 200);
      const payload = await channelResponse.json();
      return payload.channel.roomRouting.lastOutcome?.status === 'error'
        ? payload.channel
        : null;
    }, {
      timeoutMs: 2_000,
      intervalMs: 25,
    });

    const driftedState = await chatStore.read();
    const driftedChannel = requireChannel(driftedState, channelId);
    driftedChannel.messages = driftedChannel.messages.filter((message) => message.id !== sourceMessageId);
    await chatStore.write(driftedState);

    const retryResponse = await fetch(
      `${baseUrl}/api/channels/${channelId}/messages/${sourceMessageId}/retry`,
      {
        method: 'POST',
      },
    );
    assert.equal(retryResponse.status, 200);
    const retryPayload = await retryResponse.json();
    assert.equal(retryPayload.phase, 'acknowledged');
    assert.equal(retryPayload.message.id, sourceMessageId);
    assert.equal(
      retryPayload.message.body,
      'Please recover this direct-lane response after drift.',
    );

    const completedChannel = await waitForCondition(async () => {
      const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
      assert.equal(channelResponse.status, 200);
      const payload = await channelResponse.json();
      return payload.channel.roomRouting.workflow.turnHistory[0]?.status === 'completed'
        ? payload.channel
        : null;
    }, {
      timeoutMs: 2_000,
      intervalMs: 25,
    });

    const userMessages = completedChannel.messages.filter((message) => message.senderKind === 'user');
    assert.equal(userMessages.length, 1);
    assert.equal(userMessages[0].id, sourceMessageId);
    const assistantReply = completedChannel.messages.find((message) =>
      message.senderKind === 'agent'
      && message.body === 'Recovered response from retry.'
      && message.metadata?.event === 'assistant_turn_segment');
    assert.ok(assistantReply);
    assert.equal(
      assistantReply.metadata?.transportBindingId,
      buildDirectLaneTransportBindingId(channelId),
    );
  }, chatStore);
});

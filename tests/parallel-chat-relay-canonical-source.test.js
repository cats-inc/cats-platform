import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import { requireChannel } from '../build/server/products/chat/state/model/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { waitForCondition } from './testUtils.js';

const baseConfig = {
  host: '127.0.0.1',
  port: 8181,
  runtimeBaseUrl: 'http://127.0.0.1:3110',
  runtimeApiKey: '',
  chatStatePath: 'unused-for-tests',
};

function createRuntimeStub() {
  let nextSession = 1;
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
        provider: input.provider,
        model: input.model ?? null,
        status: 'ready',
        cwd: input.cwd ?? path.join(os.tmpdir(), '.cats', 'runtime', 'sessions', sessionId),
      };
      this.createdSessions.push({ ...input, id: session.id });
      return session;
    },
    async sendMessage(sessionId, content) {
      this.sentMessages.push({ sessionId, content });
      const text = content.includes('check this response')
        ? 'Target channel accepted the relayed reply.'
        : 'Orchestrator acknowledged the chat request.';
      return {
        segments: [{ kind: 'text', text, toolName: null, toolId: null }],
        inputTokens: 11,
        outputTokens: 7,
        tokensUsed: 18,
      };
    },
    async closeSession() {},
    async deleteSession(sessionId) {
      return { action: 'delete', sessionId, status: 'deleted' };
    },
    async observeSession(sessionId) {
      return {
        session: {
          id: sessionId,
          inspection: {
            state: 'idle',
          },
        },
        observePath: `/sessions/${sessionId}/observe`,
        stream: {
          path: `/sessions/${sessionId}/stream`,
          available: false,
        },
      };
    },
    async streamSession() {},
  };
}

async function withServer(runtimeClient, callback, chatStore = new MemoryChatStore()) {
  const tempStateDir = await mkdtemp(path.join(os.tmpdir(), 'cats-parallel-relay-'));
  const runtimeDataDir = path.join(tempStateDir, 'runtime-data');
  const server = createServer({
    shared: {
      config: {
        ...baseConfig,
        chatStatePath: path.join(tempStateDir, 'platform', 'state', 'chat-state.local.json'),
        runtimeDataDir,
      },
      runtimeClient,
      now: () => new Date('2026-04-14T00:00:00.000Z'),
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
    await callback(`http://127.0.0.1:${address.port}`, chatStore);
  } finally {
    server.close();
    await once(server, 'close');
    await rm(tempStateDir, { recursive: true, force: true });
  }
}

test('parallel chat relay rebuilds a missing source reply from canonical history', async () => {
  await withServer(createRuntimeStub(), async (baseUrl, chatStore) => {
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

    const createGroupResponse = await fetch(`${baseUrl}/api/concurrent-groups`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Parallel Relay Canonical',
        targets: [
          { provider: 'claude', instance: 'native' },
          { provider: 'codex', instance: 'native' },
        ],
      }),
    });
    assert.equal(createGroupResponse.status, 201);
    const createGroupPayload = await createGroupResponse.json();
    const groupId = createGroupPayload.group.id;
    const [sourceChannelId, targetChannelId] = createGroupPayload.group.memberChannelIds;

    const sendResponse = await fetch(`${baseUrl}/api/channels/${sourceChannelId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        body: 'Seed the source reply before relay.',
      }),
    });
    assert.equal(sendResponse.status, 200);

    const sourceReplyId = await waitForCondition(async () => {
      const channelResponse = await fetch(`${baseUrl}/api/channels/${sourceChannelId}`);
      assert.equal(channelResponse.status, 200);
      const payload = await channelResponse.json();
      const sourceReply = payload.channel.messages.find((message) =>
        message.metadata?.event === 'assistant_turn_segment'
        && message.metadata?.terminal === true);
      return sourceReply?.id ?? null;
    }, {
      timeoutMs: 2_000,
      intervalMs: 25,
    });

    const driftedState = await chatStore.read();
    const driftedChannel = requireChannel(driftedState, sourceChannelId);
    driftedChannel.messages = driftedChannel.messages.filter((message) => message.id !== sourceReplyId);
    await chatStore.write(driftedState);

    const relayResponse = await fetch(`${baseUrl}/api/concurrent-groups/${groupId}/relay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        activeChannelId: sourceChannelId,
        sourceChannelId,
        sourceMessageId: sourceReplyId,
        targetPolicy: 'single',
        targetChannelId,
        command: 'check_this',
      }),
    });
    assert.equal(relayResponse.status, 200);

    const targetChannelPayload = await waitForCondition(async () => {
      const channelResponse = await fetch(`${baseUrl}/api/channels/${targetChannelId}`);
      assert.equal(channelResponse.status, 200);
      const payload = await channelResponse.json();
      const relayIncoming = payload.channel.messages.find((message) =>
        message.metadata?.event === 'parallel_relay_incoming'
        && message.metadata?.sourceMessageId === sourceReplyId);
      return relayIncoming ? payload : null;
    }, {
      timeoutMs: 2_000,
      intervalMs: 25,
    });

    assert.equal(
      targetChannelPayload.channel.messages.some((message) =>
        message.metadata?.event === 'parallel_relay_incoming'
        && message.metadata?.sourceMessageId === sourceReplyId),
      true,
    );
  });
});

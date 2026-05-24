import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import { createChannel } from '../build/server/products/chat/state/model/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import {
  createAuthenticatedTestSession,
  createTestAuthConfig,
  installAuthenticatedFetch,
  waitForCondition,
} from './testUtils.js';

const baseConfig = {
  host: '127.0.0.1',
  port: 8181,
  runtimeBaseUrl: 'http://127.0.0.1:3110',
  runtimeApiKey: '',
  chatStatePath: 'unused-for-tests',
  auth: createTestAuthConfig(),
};

function createBlockingRuntimeStub() {
  let nextSession = 1;
  const pendingMessages = new Map();
  return {
    createdSessions: [],
    sentMessages: [],
    cancelledSessions: [],
    closedSessions: [],
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
      return new Promise((resolve, reject) => {
        pendingMessages.set(sessionId, { resolve, reject });
      });
    },
    async cancelSession(sessionId) {
      this.cancelledSessions.push(sessionId);
      const pending = pendingMessages.get(sessionId);
      if (pending) {
        pendingMessages.delete(sessionId);
        pending.reject(new Error('Stopped by user.'));
      }
    },
    async closeSession(sessionId) {
      this.closedSessions.push(sessionId);
      const pending = pendingMessages.get(sessionId);
      if (pending) {
        pendingMessages.delete(sessionId);
        pending.reject(new Error('Session closed.'));
      }
    },
  };
}

async function withServer(runtimeClient, callback, chatStore = new MemoryChatStore()) {
  const tempStateDir = await mkdtemp(path.join(os.tmpdir(), 'cats-channel-cancel-'));
  const runtimeDataDir = path.join(tempStateDir, 'runtime-data');
  const now = new Date('2026-04-08T00:00:00.000Z');
  const auth = await createAuthenticatedTestSession({
    now,
    sessionSecret: baseConfig.auth.sessionSecret,
    sessionTtlMs: baseConfig.auth.sessionTtlMs,
  });
  const server = createServer({
    shared: {
      config: {
        ...baseConfig,
        chatStatePath: path.join(tempStateDir, 'platform', 'state', 'chat-state.local.json'),
        runtimeDataDir,
      },
      runtimeClient,
      authStore: auth.authStore,
      now: () => now,
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

  const baseUrl = `http://127.0.0.1:${address.port}`;
  const restoreFetch = installAuthenticatedFetch(baseUrl, auth, {
    defaultOriginSurface: 'chat',
    origin: 'http://127.0.0.1:8181',
  });
  try {
    await callback(baseUrl);
  } finally {
    restoreFetch();
    server.close();
    await once(server, 'close');
    await rm(tempStateDir, { recursive: true, force: true });
  }
}

test('POST /api/channels/:id/cancel stops an in-flight group room dispatch', async () => {
  const runtimeClient = createBlockingRuntimeStub();
  const chatStore = new MemoryChatStore();
  const now = new Date('2026-04-08T00:00:00.000Z');

  let state = await chatStore.read();
  state = createChannel(
    state,
    {
      title: 'Stop group room',
      topic: 'Verify stop during an active group dispatch.',
      originSurface: 'chat',
      entryKind: 'group',
      skipBossCatGreeting: true,
      defaultRecipientId: 'participant-inline',
      temporaryParticipants: [
        {
          participantId: 'participant-inline',
          name: 'Inline Reviewer',
          provider: 'claude',
          instance: 'native',
          model: 'claude-opus-4-6',
          modelSelection: null,
          roleHint: 'Primary review pass.',
        },
        {
          participantId: 'participant-counter',
          name: 'Counterpoint',
          provider: 'antigravity',
          instance: 'native',
          model: 'antigravity-default',
          modelSelection: null,
          roleHint: 'Secondary challenge.',
        },
      ],
    },
    now,
  );
  const channelId = state.selectedChannelId;
  await chatStore.write(state);

  await withServer(runtimeClient, async (baseUrl) => {
    const sendResponse = await fetch(`${baseUrl}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        body: 'Review this draft together.',
      }),
    });
    assert.equal(sendResponse.status, 200);

    await waitForCondition(
      () => runtimeClient.sentMessages.length > 0,
      { timeoutMs: 2_000, intervalMs: 25 },
    );

    const cancelResponse = await fetch(`${baseUrl}/api/channels/${channelId}/cancel`, {
      method: 'POST',
    });
    assert.equal(cancelResponse.status, 200);

    const cancelPayload = await cancelResponse.json();
    assert.equal(cancelPayload.cancellation.channelId, channelId);
    assert.ok(runtimeClient.cancelledSessions.length >= 1);
    assert.ok(
      runtimeClient.cancelledSessions.some((sessionId) =>
        runtimeClient.sentMessages.some((message) => message.sessionId === sessionId)),
    );

    const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
    assert.equal(channelResponse.status, 200);
    const channelPayload = await channelResponse.json();
    assert.equal(channelPayload.channel.roomRouting.workflow.activeTurn, null);
    assert.match(
      JSON.stringify(channelPayload.channel.messages),
      /Stopped this response\./u,
    );
  }, chatStore);
});

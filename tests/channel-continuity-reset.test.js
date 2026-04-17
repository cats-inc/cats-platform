import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
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
    closedSessions: [],
    observedSessionPayloads: new Map(),
    setObservedSession(sessionId, payload) {
      this.observedSessionPayloads.set(sessionId, payload);
    },
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
        defaultSelection: {
          entryMode: 'auto',
          entryId: `${provider}-default`,
          presetId: null,
          controls: {},
        },
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
    async sendMessage(sessionId, content, input) {
      this.sentMessages.push({ sessionId, content, input });
      return {
        segments: [
          {
            kind: 'text',
            text: 'Orchestrator acknowledged the chat request.',
            toolName: null,
            toolId: null,
          },
        ],
        inputTokens: 11,
        outputTokens: 7,
        tokensUsed: 18,
      };
    },
    async closeSession(sessionId) {
      this.closedSessions.push(sessionId);
    },
    async observeSession(sessionId) {
      return this.observedSessionPayloads.get(sessionId) ?? {
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

async function withServer(
  runtimeClient,
  callback,
  chatStore = new MemoryChatStore(),
  overrides = {},
) {
  const tempStateDir = await mkdtemp(path.join(os.tmpdir(), 'cats-server-state-'));
  const runtimeDataDir = path.join(tempStateDir, 'runtime-data');
  const server = createServer({
    shared: {
      config: {
        ...baseConfig,
        chatStatePath: path.join(tempStateDir, 'platform', 'state', 'chat-state.local.json'),
        runtimeDataDir,
      },
      runtimeClient,
      now: () => new Date('2026-03-11T00:00:00.000Z'),
    },
    chat: {
      chatStore,
      ...overrides,
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

test('PATCH /api/channels/:channelId flushes pending runtime memory hooks before solo continuity reset', async () => {
  const runtimeClient = createRuntimeStub();
  const chatStore = new MemoryChatStore();
  const flushedChannels = [];
  const memoryService = {
    async flushChannel(input) {
      flushedChannels.push({ ...input });
      return {
        scope: 'channel',
        subjectId: input.channelId,
        reason: input.reason ?? 'manual',
        generatedAt: (input.now ?? new Date('2026-03-11T00:00:00.000Z')).toISOString(),
        persistedCount: 1,
        persistedRecordIds: ['cats-memory-1'],
        removedRecordIds: [],
        payload: {
          version: 1,
          reason: input.reason ?? 'manual',
          generatedAt: (input.now ?? new Date('2026-03-11T00:00:00.000Z')).toISOString(),
          subject: {
            kind: 'channel',
            id: input.channelId,
          },
          replacementMode: 'subject_projection_replace',
          sourceScopeKeys: ['channel:reset'],
          persistedRecords: [],
          removedRecordIds: [],
        },
      };
    },
  };

  await withServer(runtimeClient, async (baseUrl) => {
    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Solo Draft',
        topic: 'Flush memory before explicit fresh-start resets.',
        composerMode: 'solo',
        pendingProvider: 'claude',
        pendingInstance: 'native',
        pendingModel: 'claude-opus-4-6',
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const { channel } = await createChannelResponse.json();

    const messageResponse = await fetch(`${baseUrl}/api/channels/${channel.id}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        body: 'Capture this working state first.',
        pendingProvider: 'claude',
        pendingInstance: 'native',
        pendingModel: 'claude-opus-4-6',
      }),
    });
    assert.equal(messageResponse.status, 200);

    await waitForCondition(async () => {
      if (runtimeClient.createdSessions.length !== 1) {
        return null;
      }

      const channelResponse = await fetch(`${baseUrl}/api/channels/${channel.id}`);
      if (channelResponse.status !== 200) {
        return null;
      }
      const channelPayload = await channelResponse.json();
      return channelPayload.channel.orchestratorLease.sessionId === 'session-1'
        ? channelPayload
        : null;
    });

    runtimeClient.setObservedSession('session-1', {
      session: {
        id: 'session-1',
        context: {
          metadata: {
            channelId: channel.id,
          },
        },
        inspection: {
          maintenance: {
            hooks: {
              preReset: {
                pending: [
                  {
                    id: 'memory_flush',
                    status: 'pending',
                  },
                ],
              },
              preCompaction: {
                pending: [],
              },
            },
          },
        },
      },
      observePath: '/sessions/session-1/observe',
      stream: {
        path: '/sessions/session-1/stream',
        available: false,
      },
    });

    const resetResponse = await fetch(`${baseUrl}/api/channels/${channel.id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        resetContinuity: true,
      }),
    });
    assert.equal(resetResponse.status, 200);
    assert.deepEqual(flushedChannels, [
      {
        channelId: channel.id,
        reason: 'pre_reset',
        now: new Date('2026-03-11T00:00:00.000Z'),
      },
    ]);
    assert.deepEqual(runtimeClient.closedSessions, ['session-1']);
  }, chatStore, { memoryService });
});

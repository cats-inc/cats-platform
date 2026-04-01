import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../dist-server/server.js';
import { RuntimeRequestError } from '../dist-server/runtime/client.js';
import {
  assignCatToChannel,
  createCat,
  createChannel,
  createConcurrentGroup,
  setChannelCatLease,
  setChannelOrchestratorLease,
} from '../dist-server/chat/model.js';
import { MemoryChatStore } from '../dist-server/chat/store.js';

const baseConfig = {
  host: '127.0.0.1',
  port: 0,
  runtimeBaseUrl: 'http://127.0.0.1:3110',
  runtimeApiKey: '',
  debugKeepRuntimeSessionsOnProductDelete: false,
};

function createRuntimeStub(options = {}) {
  const {
    deleteResults = new Map(),
    deleteErrors = new Map(),
  } = options;

  let nextSession = 1;
  return {
    createdSessions: [],
    closedSessions: [],
    deletedSessions: [],
    async getHealth() {
      return {
        baseUrl: baseConfig.runtimeBaseUrl,
        reachable: true,
        status: 'ok',
        service: 'cats-runtime',
      };
    },
    async getProviderConfig() { return {}; },
    async getProviderModels(provider) {
      return {
        provider,
        backend: 'cli',
        instance: 'default',
        defaultModel: `${provider}-default`,
        source: 'config',
        cache: null,
        models: [{ id: `${provider}-default`, label: `${provider} default`, default: true }],
        warnings: [],
      };
    },
    async createSession(input) {
      const sessionId = `session-${nextSession++}`;
      this.createdSessions.push({ ...input, id: sessionId });
      return {
        id: sessionId,
        provider: input.provider,
        model: input.model ?? null,
        status: 'ready',
        cwd: input.cwd ?? path.join(os.tmpdir(), '.cats-runtime', 'sessions', sessionId),
      };
    },
    async sendMessage() {
      return { content: 'Response.', inputTokens: 1, outputTokens: 1, tokensUsed: 2 };
    },
    async cancelSession() {},
    async closeSession(sessionId) {
      this.closedSessions.push(sessionId);
    },
    async deleteSession(sessionId) {
      this.deletedSessions.push(sessionId);
      if (deleteErrors.has(sessionId)) {
        throw deleteErrors.get(sessionId);
      }
      return deleteResults.get(sessionId) ?? {
        action: 'delete',
        sessionId,
        status: 'deleted',
      };
    },
    async observeSession() { return null; },
    async streamSession() {},
    async getSessionMaintenanceCapability() { return null; },
    async performSessionMaintenance() { return { performed: false }; },
  };
}

async function withServer(
  runtimeClient,
  callback,
  {
    chatStore = new MemoryChatStore(),
    configOverrides = {},
  } = {},
) {
  const tempStateDir = await mkdtemp(path.join(os.tmpdir(), 'cats-delete-cleanup-'));
  const server = createServer({
    shared: {
      config: {
        ...baseConfig,
        ...configOverrides,
        chatStatePath: path.join(tempStateDir, 'chat-state.json'),
        runtimeDataDir: path.join(tempStateDir, 'runtime-data'),
      },
      runtimeClient,
      now: () => new Date('2026-04-02T12:00:00.000Z'),
    },
    chat: { chatStore },
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

test('DELETE /api/channels/:id deletes linked runtime sessions by default', async () => {
  const runtime = createRuntimeStub();
  const chatStore = new MemoryChatStore();
  const now = new Date('2026-04-02T12:00:00.000Z');
  let state = await chatStore.read();
  state = createCat(state, { name: 'Cleanup Cat', provider: 'claude' }, now);
  const catId = state.cats[0].id;
  state = createChannel(state, { title: 'Delete Channel', topic: 'cleanup' }, now);
  const channelId = state.selectedChannelId;
  state = assignCatToChannel(state, channelId, { catId, provider: 'claude' }, now);
  state = setChannelCatLease(state, channelId, catId, {
    status: 'ready',
    sessionId: 'session-delete-channel',
    provider: 'claude',
    model: 'claude-default',
  }, now);
  await chatStore.write(state);

  await withServer(runtime, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/channels/${channelId}`, {
      method: 'DELETE',
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.deleted, true);
    assert.deepEqual(runtime.deletedSessions, ['session-delete-channel']);
    assert.deepEqual(runtime.closedSessions, []);
  }, { chatStore });
});

test('DELETE /api/channels/:id keeps close-only behavior when debug retention override is enabled', async () => {
  const runtime = createRuntimeStub();
  const chatStore = new MemoryChatStore();
  const now = new Date('2026-04-02T12:00:00.000Z');
  let state = await chatStore.read();
  state = createCat(state, { name: 'Debug Cat', provider: 'claude' }, now);
  const catId = state.cats[0].id;
  state = createChannel(state, { title: 'Debug Delete', topic: 'cleanup' }, now);
  const channelId = state.selectedChannelId;
  state = assignCatToChannel(state, channelId, { catId, provider: 'claude' }, now);
  state = setChannelCatLease(state, channelId, catId, {
    status: 'ready',
    sessionId: 'session-debug-delete',
    provider: 'claude',
    model: 'claude-default',
  }, now);
  await chatStore.write(state);

  await withServer(runtime, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/channels/${channelId}`, {
      method: 'DELETE',
    });
    assert.equal(response.status, 200);
    assert.deepEqual(runtime.deletedSessions, []);
    assert.deepEqual(runtime.closedSessions, ['session-debug-delete']);
  }, {
    chatStore,
    configOverrides: {
      debugKeepRuntimeSessionsOnProductDelete: true,
    },
  });
});

test('DELETE /api/channels/:id fails and keeps product state when runtime delete is retained', async () => {
  const runtime = createRuntimeStub({
    deleteResults: new Map([
      ['session-retained-channel', {
        action: 'delete',
        sessionId: 'session-retained-channel',
        status: 'retained',
        reason: 'Session files were kept for retry.',
      }],
    ]),
  });
  const chatStore = new MemoryChatStore();
  const now = new Date('2026-04-02T12:00:00.000Z');
  let state = await chatStore.read();
  state = createCat(state, { name: 'Retained Cat', provider: 'claude' }, now);
  const catId = state.cats[0].id;
  state = createChannel(state, { title: 'Retained Delete', topic: 'cleanup' }, now);
  const channelId = state.selectedChannelId;
  state = assignCatToChannel(state, channelId, { catId, provider: 'claude' }, now);
  state = setChannelCatLease(state, channelId, catId, {
    status: 'ready',
    sessionId: 'session-retained-channel',
    provider: 'claude',
    model: 'claude-default',
  }, now);
  await chatStore.write(state);

  await withServer(runtime, async (baseUrl, store) => {
    const response = await fetch(`${baseUrl}/api/channels/${channelId}`, {
      method: 'DELETE',
    });
    assert.equal(response.status, 409);
    const payload = await response.json();
    assert.equal(payload.error.code, 'runtime_session_delete_failed');

    const persisted = await store.read();
    assert.ok(persisted.channels.some((channel) => channel.id === channelId));
  }, { chatStore });
});

test('DELETE /api/cats/:id deletes linked runtime sessions by default', async () => {
  const runtime = createRuntimeStub();
  const chatStore = new MemoryChatStore();
  const now = new Date('2026-04-02T12:00:00.000Z');
  let state = await chatStore.read();
  state = createCat(state, { name: 'Delete Me', provider: 'claude' }, now);
  const catId = state.cats[0].id;
  state = createChannel(state, { title: 'Delete Cat Channel', topic: 'cleanup' }, now);
  const channelId = state.selectedChannelId;
  state = assignCatToChannel(state, channelId, { catId, provider: 'claude' }, now);
  state = setChannelCatLease(state, channelId, catId, {
    status: 'ready',
    sessionId: 'session-delete-cat',
    provider: 'claude',
    model: 'claude-default',
  }, now);
  await chatStore.write(state);

  await withServer(runtime, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/cats/${catId}`, {
      method: 'DELETE',
    });
    assert.equal(response.status, 200);
    assert.deepEqual(runtime.deletedSessions, ['session-delete-cat']);
  }, { chatStore });
});

test('DELETE /api/concurrent-groups/:id deletes member chat runtime sessions by default', async () => {
  const runtime = createRuntimeStub();
  const chatStore = new MemoryChatStore();
  const now = new Date('2026-04-02T12:00:00.000Z');
  let state = await chatStore.read();
  state = createConcurrentGroup(state, {
    title: 'Parallel Cleanup',
    targets: [
      { provider: 'claude' },
      { provider: 'codex' },
    ],
  }, now);
  const groupId = state.concurrentGroups[0].id;
  const [firstChannelId, secondChannelId] = state.concurrentGroups[0].memberChannelIds;
  state = setChannelOrchestratorLease(state, firstChannelId, {
    status: 'ready',
    sessionId: 'session-parallel-1',
    provider: 'claude',
    model: 'claude-default',
  }, now);
  state = setChannelOrchestratorLease(state, secondChannelId, {
    status: 'ready',
    sessionId: 'session-parallel-2',
    provider: 'codex',
    model: 'gpt-5.4',
  }, now);
  await chatStore.write(state);

  await withServer(runtime, async (baseUrl, store) => {
    const response = await fetch(`${baseUrl}/api/concurrent-groups/${groupId}`, {
      method: 'DELETE',
    });
    assert.equal(response.status, 200);
    assert.deepEqual(
      runtime.deletedSessions.sort(),
      ['session-parallel-1', 'session-parallel-2'],
    );

    const persisted = await store.read();
    assert.equal(persisted.concurrentGroups.length, 0);
    assert.equal(persisted.channels.length, 0);
  }, { chatStore });
});

test('DELETE /api/channels/:id treats missing runtime sessions as idempotent success', async () => {
  const runtime = createRuntimeStub({
    deleteErrors: new Map([
      ['session-missing-delete', new RuntimeRequestError('Session not found', 404)],
    ]),
  });
  const chatStore = new MemoryChatStore();
  const now = new Date('2026-04-02T12:00:00.000Z');
  let state = await chatStore.read();
  state = createCat(state, { name: 'Missing Runtime', provider: 'claude' }, now);
  const catId = state.cats[0].id;
  state = createChannel(state, { title: 'Missing Runtime Delete', topic: 'cleanup' }, now);
  const channelId = state.selectedChannelId;
  state = assignCatToChannel(state, channelId, { catId, provider: 'claude' }, now);
  state = setChannelCatLease(state, channelId, catId, {
    status: 'ready',
    sessionId: 'session-missing-delete',
    provider: 'claude',
    model: 'claude-default',
  }, now);
  await chatStore.write(state);

  await withServer(runtime, async (baseUrl, store) => {
    const response = await fetch(`${baseUrl}/api/channels/${channelId}`, {
      method: 'DELETE',
    });
    assert.equal(response.status, 200);
    const persisted = await store.read();
    assert.equal(persisted.channels.length, 0);
  }, { chatStore });
});

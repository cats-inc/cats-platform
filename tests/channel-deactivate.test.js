import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/server.js';
import {
  assignCatToChannel,
  createCat,
  createChannel,
  setChannelCatLease,
} from '../build/server/products/chat/state/model/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';

const baseConfig = {
  host: '127.0.0.1',
  port: 0,
  runtimeBaseUrl: 'http://127.0.0.1:3110',
  runtimeApiKey: '',
};

function createRuntimeStub() {
  let nextSession = 1;
  return {
    createdSessions: [],
    closedSessions: [],
    async getHealth() {
      return { baseUrl: baseConfig.runtimeBaseUrl, reachable: true, status: 'ok', service: 'cats-runtime' };
    },
    async getProviderConfig() { return {}; },
    async getProviderModels(provider) {
      return {
        provider, backend: 'cli', instance: 'default',
        defaultModel: `${provider}-default`, source: 'config', cache: null,
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
        cwd: input.cwd ?? path.join(os.tmpdir(), '.cats', 'runtime', 'sessions', sessionId),
      };
    },
    async sendMessage() {
      return { content: 'Response.', inputTokens: 5, outputTokens: 3, tokensUsed: 8 };
    },
    async closeSession(sessionId) {
      this.closedSessions.push(sessionId);
    },
    async getSessionInfo(sessionId) {
      return { id: sessionId, provider: 'claude', model: null, status: 'ready', cwd: null };
    },
    async observeSession() { return null; },
    async streamSession() {},
    async getSessionMaintenanceCapability() { return null; },
    async performSessionMaintenance() { return { performed: false }; },
  };
}

async function withServer(runtimeClient, callback, chatStore = new MemoryChatStore()) {
  const tempStateDir = await mkdtemp(path.join(os.tmpdir(), 'cats-deactivate-'));
  const server = createServer({
    shared: {
      config: {
        ...baseConfig,
        chatStatePath: path.join(tempStateDir, 'platform', 'state', 'chat-state.local.json'),
        runtimeDataDir: path.join(tempStateDir, 'runtime-data'),
      },
      runtimeClient,
      now: () => new Date('2026-03-29T12:00:00.000Z'),
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
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
    await rm(tempStateDir, { recursive: true, force: true });
  }
}

test('POST /api/channels/:id/deactivate returns 404 for nonexistent channel', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/channels/nonexistent/deactivate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(response.status, 404);
  });
});

test('POST /api/channels/:id/deactivate on idle channel returns 0 closed sessions', async () => {
  const runtime = createRuntimeStub();
  const chatStore = new MemoryChatStore();
  const now = new Date('2026-03-29T12:00:00.000Z');
  let state = await chatStore.read();
  state = createCat(state, { name: 'TestCat', provider: 'claude' }, now);
  const catId = state.cats[0].id;
  state = createChannel(state, { title: 'Test', topic: 'test' }, now);
  const channelId = state.selectedChannelId;
  state = assignCatToChannel(state, channelId, { catId, provider: 'claude' }, now);
  await chatStore.write(state);

  await withServer(runtime, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/channels/${channelId}/deactivate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.deactivation.channelId, channelId);
    assert.equal(payload.deactivation.closedSessionCount, 0);
    assert.equal(runtime.closedSessions.length, 0);
  }, chatStore);
});

test('POST /api/channels/:id/deactivate closes runtime sessions for active leases', async () => {
  const runtime = createRuntimeStub();
  const chatStore = new MemoryChatStore();
  const now = new Date('2026-03-29T12:00:00.000Z');
  let state = await chatStore.read();
  state = createCat(state, { name: 'TestCat', provider: 'claude' }, now);
  const catId = state.cats[0].id;
  state = createChannel(state, { title: 'Test', topic: 'test' }, now);
  const channelId = state.selectedChannelId;
  state = assignCatToChannel(state, channelId, { catId, provider: 'claude' }, now);
  // Simulate an active session by setting lease to ready with a sessionId
  state = setChannelCatLease(state, channelId, catId, {
    status: 'ready',
    sessionId: 'live-session-1',
    provider: 'claude',
    model: 'claude-default',
  }, now);
  await chatStore.write(state);

  await withServer(runtime, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/channels/${channelId}/deactivate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.deactivation.closedSessionCount, 1);
    assert.ok(runtime.closedSessions.includes('live-session-1'),
      'runtime.closeSession should have been called with the active session ID');

    // Verify lease is now closed in state
    const updatedState = await chatStore.read();
    const updatedChannel = updatedState.channels.find((ch) => ch.id === channelId);
    const catAssignment = updatedChannel.catAssignments.find((a) => a.catId === catId);
    assert.equal(catAssignment.execution.lease.status, 'closed');
    assert.equal(catAssignment.execution.lease.sessionId, null);
  }, chatStore);
});

test('GET /api/channels/:id/deactivate returns 405', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/channels/any/deactivate`, { method: 'GET' });
    assert.equal(response.status, 405);
  });
});


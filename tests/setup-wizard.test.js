import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

import { createServer } from '../dist-server/server.js';
import { MemoryWorkspaceStore } from '../dist-server/workspace/store.js';

const baseConfig = {
  host: '127.0.0.1',
  port: 8181,
  runtimeBaseUrl: 'http://127.0.0.1:3110',
  runtimeApiKey: '',
  workspaceStatePath: 'unused-for-tests',
};

function createRuntimeStub() {
  let nextSession = 1;
  return {
    createdSessions: [],
    sentMessages: [],
    closedSessions: [],
    async getHealth() {
      return {
        baseUrl: 'http://127.0.0.1:3110',
        reachable: true,
        status: 'ok',
        service: 'cats-runtime',
      };
    },
    async createSession(input) {
      const session = {
        id: `session-${nextSession++}`,
        provider: input.provider,
        model: input.model ?? null,
        status: 'ready',
        cwd: input.cwd ?? 'C:/workspace/runtime',
      };
      this.createdSessions.push({ ...input, id: session.id });
      return session;
    },
    async sendMessage(sessionId, content) {
      this.sentMessages.push({ sessionId, content });
      return {
        content: 'Acknowledged.',
        inputTokens: 11,
        outputTokens: 7,
        tokensUsed: 18,
      };
    },
    async closeSession(sessionId) {
      this.closedSessions.push(sessionId);
    },
  };
}

async function withServer(runtimeClient, callback, workspaceStore = new MemoryWorkspaceStore()) {
  const server = createServer({
    config: baseConfig,
    runtimeClient,
    workspaceStore,
    now: () => new Date('2026-03-19T00:00:00.000Z'),
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

test('GET /api/app-shell returns setupCompleteAt: null for uninitialized workspace', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.setupCompleteAt, null);
    assert.equal(payload.ownerDisplayName, 'Owner');
    assert.equal(payload.workspace.bossCatId, null);
  });
});

test('POST /api/setup/complete creates Boss Cat, channel, and marks setup done', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
        bossCatModel: 'claude-opus-4-6',
      }),
    });
    assert.equal(response.status, 200);

    const payload = await response.json();

    // Setup is marked complete
    assert.ok(payload.setupCompleteAt);
    assert.equal(payload.ownerDisplayName, 'Kenny');

    // Boss Cat was created
    assert.ok(payload.workspace.bossCatId);
    assert.ok(payload.workspace.pals.length >= 1);

    // First channel was created
    assert.ok(payload.workspace.channels.length >= 1);
    assert.ok(payload.workspace.selectedChannelId);

    // Greeting message exists in the selected channel
    const selected = payload.workspace.selectedChannel;
    assert.ok(selected);
    assert.ok(selected.messages.length >= 1);
    const greeting = selected.messages.find(
      (m) => m.senderKind === 'agent' && m.senderName === 'Smelly',
    );
    assert.ok(greeting, 'Boss Cat greeting message should exist');
    assert.ok(greeting.body.includes('Smelly'));
  });
});

test('POST /api/setup/complete returns 409 if setup already completed', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    // Complete setup first time
    const first = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(first.status, 200);

    // Try again
    const second = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Other',
        bossCatName: 'Other',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(second.status, 409);
  });
});

test('after setup complete, GET /api/app-shell reflects initialized state', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    // Complete setup
    await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
      }),
    });

    // Verify app-shell reflects setup
    const response = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.ok(payload.setupCompleteAt);
    assert.equal(payload.ownerDisplayName, 'Kenny');
    assert.ok(payload.workspace.bossCatId);
    assert.ok(payload.workspace.channels.length >= 1);
  });
});

test('POST /api/setup/reset clears setup state and returns clean workspace', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    // Complete setup first
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

    // Reset
    const resetResponse = await fetch(`${baseUrl}/api/setup/reset`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
    assert.equal(resetResponse.status, 200);

    const payload = await resetResponse.json();
    assert.equal(payload.setupCompleteAt, null);
    assert.equal(payload.ownerDisplayName, 'Owner');
    assert.equal(payload.workspace.bossCatId, null);
    assert.deepEqual(payload.workspace.pals, []);
    assert.deepEqual(payload.workspace.channels, []);
  });
});

test('POST /api/setup/complete defaults Boss Cat name to Smelly if empty', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: '',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(response.status, 200);

    const payload = await response.json();
    const bossCat = payload.workspace.pals.find(
      (p) => p.id === payload.workspace.bossCatId,
    );
    assert.ok(bossCat);
    assert.equal(bossCat.name, 'Smelly');
  });
});

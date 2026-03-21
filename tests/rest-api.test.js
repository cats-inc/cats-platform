import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

import { createServer } from '../dist-server/server.js';
import { UUID_PATTERN } from '../dist-server/shared/channelPaths.js';
import { MemoryChatStore } from '../dist-server/chat/store.js';

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
    async createSession(input) {
      const session = {
        id: `session-${nextSession++}`,
        provider: input.provider,
        model: input.model ?? null,
        status: 'ready',
        cwd: input.cwd ?? 'C:/chat/runtime',
      };
      this.createdSessions.push({ ...input, id: session.id });
      return session;
    },
    async sendMessage(sessionId, content) {
      this.sentMessages.push({ sessionId, content });
      return {
        content: 'Agent response from runtime.',
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

async function withServer(runtimeClient, callback, chatStore = new MemoryChatStore()) {
  const server = createServer({
    config: baseConfig,
    runtimeClient,
    chatStore,
    now: () => new Date('2026-03-18T00:00:00.000Z'),
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

// ---------------------------------------------------------------------------
// Phase 2: Read-side resource routes
// ---------------------------------------------------------------------------

test('GET /api/views/app-shell returns the same read model as /api/app-shell', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const [legacyResponse, restResponse] = await Promise.all([
      fetch(`${baseUrl}/api/app-shell`),
      fetch(`${baseUrl}/api/views/app-shell`),
    ]);
    assert.equal(legacyResponse.status, 200);
    assert.equal(restResponse.status, 200);

    const legacyPayload = await legacyResponse.json();
    const restPayload = await restResponse.json();
    assert.equal(restPayload.app.name, legacyPayload.app.name);
    assert.equal(restPayload.chat.name, legacyPayload.chat.name);
  });
});

test('GET /api/cats returns empty cat list', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/cats`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.ok(Array.isArray(payload.cats));
    assert.equal(payload.cats.length, 0);
  });
});

test('REST API returns structured 404 for nonexistent channel', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/channels/nonexistent`);
    assert.equal(response.status, 404);

    const payload = await response.json();
    assert.equal(payload.error.code, 'channel_not_found');
  });
});

test('REST API returns structured 404 for nonexistent cat', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/cats/nonexistent`);
    assert.equal(response.status, 404);

    const payload = await response.json();
    assert.equal(payload.error.code, 'cat_not_found');
  });
});

test('REST API returns 405 for unsupported methods', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const deleteOnCats = await fetch(`${baseUrl}/api/cats`, { method: 'DELETE' });
    assert.equal(deleteOnCats.status, 405);
    const deleteOnCatsBody = await deleteOnCats.json();
    assert.equal(deleteOnCatsBody.error.code, 'method_not_allowed');

    const putOnChannels = await fetch(`${baseUrl}/api/channels`, { method: 'PUT' });
    assert.equal(putOnChannels.status, 405);
  });
});

// ---------------------------------------------------------------------------
// Canonical public routes (SPEC-009 / PLAN-009)
// ---------------------------------------------------------------------------

test('GET /api/cats returns empty cat list', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/cats`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.ok(Array.isArray(payload.cats));
    assert.equal(payload.cats.length, 0);
  });
});

test('GET /api/cats/nonexistent returns 404 with cat_not_found', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/cats/nonexistent`);
    assert.equal(response.status, 404);

    const payload = await response.json();
    assert.equal(payload.error.code, 'cat_not_found');
    assert.match(payload.error.message, /Cat not found/);
  });
});

test('GET /api/preferences returns preferences', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/preferences`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(typeof payload.preferences.selectedChannelId, 'string');
  });
});

test('GET /api/orchestrator returns orchestrator state', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/orchestrator`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.orchestrator.mode, 'global');
    assert.equal(payload.orchestrator.status, 'ready');
    assert.ok(payload.orchestrator.executionTarget);
  });
});

test('canonical routes full lifecycle: create cat, channel, activate, message, assign, remove, export, delete', async () => {
  const runtimeClient = createRuntimeStub();
  const chatStore = new MemoryChatStore();

  await withServer(runtimeClient, async (baseUrl) => {
    // POST /api/cats – create a cat
    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Agent-1',
        provider: 'claude',
        roles: ['coder'],
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const createCatPayload = await createCatResponse.json();
    assert.equal(createCatPayload.cat.name, 'Agent-1');
    assert.ok(createCatPayload.cat.id);
    const catId = createCatPayload.cat.id;

    // GET /api/cats/:catId – read cat detail
    const getCatResponse = await fetch(`${baseUrl}/api/cats/${catId}`);
    assert.equal(getCatResponse.status, 200);
    const getCatPayload = await getCatResponse.json();
    assert.equal(getCatPayload.cat.name, 'Agent-1');

    // GET /api/cats – list cats
    const listCatsResponse = await fetch(`${baseUrl}/api/cats`);
    assert.equal(listCatsResponse.status, 200);
    const listCatsPayload = await listCatsResponse.json();
    assert.equal(listCatsPayload.cats.length, 1);

    // POST /api/channels – create channel
    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Ops Radar',
        topic: 'Track regressions.',
        repoPath: 'C:/repo/cats',
        language: 'TypeScript',
        cats: [
          { name: 'Inline-Agent', provider: 'gemini', roles: ['reviewer'] },
        ],
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    assert.equal(createChannelPayload.channel.title, 'Ops Radar');
    const channelId = createChannelPayload.channel.id;
    assert.match(channelId, UUID_PATTERN);

    // GET /api/channels – list channels
    const listChannelsResponse = await fetch(`${baseUrl}/api/channels`);
    assert.equal(listChannelsResponse.status, 200);
    const listChannelsPayload = await listChannelsResponse.json();
    assert.equal(listChannelsPayload.channels.length, 1);

    // PATCH /api/preferences – select channel
    const updatePrefsResponse = await fetch(`${baseUrl}/api/preferences`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ selectedChannelId: channelId }),
    });
    assert.equal(updatePrefsResponse.status, 200);
    const updatePrefsPayload = await updatePrefsResponse.json();
    assert.equal(updatePrefsPayload.preferences.selectedChannelId, channelId);

    // POST /api/channels/:cid/activations
    const activateResponse = await fetch(
      `${baseUrl}/api/channels/${channelId}/activations`,
      { method: 'POST' },
    );
    assert.equal(activateResponse.status, 200);
    const activatePayload = await activateResponse.json();
    assert.equal(activatePayload.activation.channelId, channelId);
    assert.ok(activatePayload.activation.results.length >= 1);

    // POST /api/channels/:cid/messages – send message
    const sendMessageResponse = await fetch(
      `${baseUrl}/api/channels/${channelId}/messages`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: 'Hello from canonical route' }),
      },
    );
    assert.equal(sendMessageResponse.status, 200);
    const sendMessagePayload = await sendMessageResponse.json();
    assert.equal(sendMessagePayload.message.body, 'Hello from canonical route');
    assert.ok(sendMessagePayload.dispatch);

    // GET /api/channels/:cid/messages – list messages
    const listMessagesResponse = await fetch(
      `${baseUrl}/api/channels/${channelId}/messages`,
    );
    assert.equal(listMessagesResponse.status, 200);
    const listMessagesPayload = await listMessagesResponse.json();
    assert.ok(listMessagesPayload.messages.length >= 2);

    // PUT /api/channels/:cid/cats/:catId – assign cat
    const assignCatResponse = await fetch(
      `${baseUrl}/api/channels/${channelId}/cats/${catId}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: 'claude',
          roles: ['coder'],
        }),
      },
    );
    assert.equal(assignCatResponse.status, 201);
    const assignCatPayload = await assignCatResponse.json();
    assert.equal(assignCatPayload.cat.catId, catId);

    // GET /api/channels/:cid/cats – list channel cats
    const listChannelCatsResponse = await fetch(
      `${baseUrl}/api/channels/${channelId}/cats`,
    );
    assert.equal(listChannelCatsResponse.status, 200);
    const listChannelCatsPayload = await listChannelCatsResponse.json();
    assert.ok(listChannelCatsPayload.cats.length >= 2);
    assert.ok(listChannelCatsPayload.cats.some((c) => c.catId === catId));

    // PATCH /api/orchestrator – update orchestrator
    const updateOrchResponse = await fetch(`${baseUrl}/api/orchestrator`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'claude',
        model: 'claude-opus-4-6',
        systemPrompt: 'Updated from canonical.',
      }),
    });
    assert.equal(updateOrchResponse.status, 200);
    const updateOrchPayload = await updateOrchResponse.json();
    assert.equal(updateOrchPayload.orchestrator.executionTarget.model, 'claude-opus-4-6');

    // GET /api/channels/:cid/exports/latest
    const exportResponse = await fetch(
      `${baseUrl}/api/channels/${channelId}/exports/latest`,
    );
    assert.equal(exportResponse.status, 200);
    assert.match(
      exportResponse.headers.get('content-disposition') ?? '',
      /channel-ops-radar\.json/,
    );

    // DELETE /api/channels/:cid/cats/:catId – remove cat
    const removeCatResponse = await fetch(
      `${baseUrl}/api/channels/${channelId}/cats/${catId}`,
      { method: 'DELETE' },
    );
    assert.equal(removeCatResponse.status, 200);
    const removeCatPayload = await removeCatResponse.json();
    assert.equal(removeCatPayload.removed, true);
    assert.equal(removeCatPayload.catId, catId);

    // DELETE /api/channels/:channelId
    const deleteChannelResponse = await fetch(
      `${baseUrl}/api/channels/${channelId}`,
      { method: 'DELETE' },
    );
    assert.equal(deleteChannelResponse.status, 200);
    const deletePayload = await deleteChannelResponse.json();
    assert.equal(deletePayload.deleted, true);

    // Verify channel is gone
    const listAfterDelete = await fetch(`${baseUrl}/api/channels`);
    const listAfterDeletePayload = await listAfterDelete.json();
    assert.equal(listAfterDeletePayload.channels.length, 0);
  }, chatStore);
});

test('canonical 405 for unsupported methods', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const deleteOnCats = await fetch(`${baseUrl}/api/cats`, { method: 'DELETE' });
    assert.equal(deleteOnCats.status, 405);
    const deleteOnCatsBody = await deleteOnCats.json();
    assert.equal(deleteOnCatsBody.error.code, 'method_not_allowed');

    const putOnChannels = await fetch(`${baseUrl}/api/channels`, { method: 'PUT' });
    assert.equal(putOnChannels.status, 405);

    const postOnPreferences = await fetch(`${baseUrl}/api/preferences`, { method: 'POST' });
    assert.equal(postOnPreferences.status, 405);

    const deleteOnOrchestrator = await fetch(`${baseUrl}/api/orchestrator`, { method: 'DELETE' });
    assert.equal(deleteOnOrchestrator.status, 405);
    assert.equal(deleteOnOrchestrator.headers.get('allow'), 'GET, PATCH, PUT');
  });
});

test('GET /api/preferences includes showVerboseMessages defaulting to false', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/preferences`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.preferences.showVerboseMessages, false);
  });
});

test('PATCH /api/preferences accepts showVerboseMessages and persists it', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    // Enable verbose messages
    const patchResponse = await fetch(`${baseUrl}/api/preferences`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ showVerboseMessages: true }),
    });
    assert.equal(patchResponse.status, 200);
    const patchPayload = await patchResponse.json();
    assert.equal(patchPayload.preferences.showVerboseMessages, true);

    // Verify it persists on GET
    const getResponse = await fetch(`${baseUrl}/api/preferences`);
    assert.equal(getResponse.status, 200);
    const getPayload = await getResponse.json();
    assert.equal(getPayload.preferences.showVerboseMessages, true);
  });
});


import assert from 'node:assert/strict';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import { UUID_PATTERN } from '../build/server/products/chat/shared/channelPaths.js';
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
      const sessionId = `session-${nextSession++}`;
      const session = {
        id: sessionId,
        provider: input.provider,
        model: input.model ?? null,
        status: 'ready',
        cwd: input.cwd ?? path.join(tmpdir(), '.cats', 'runtime', 'sessions', sessionId),
      };
      this.createdSessions.push({ ...input, id: session.id });
      return session;
    },
    async sendMessage(sessionId, content) {
      this.sentMessages.push({ sessionId, content });
      return {
        segments: [{ kind: 'text', text: 'Agent response from runtime.', toolName: null, toolId: null }],
        inputTokens: 11,
        outputTokens: 7,
        tokensUsed: 18,
      };
    },
    async closeSession(sessionId) {
      this.closedSessions.push(sessionId);
    },
    async deleteSession(sessionId) {
      this.deletedSessions = this.deletedSessions || [];
      this.deletedSessions.push(sessionId);
      return { action: 'delete', sessionId, status: 'deleted' };
    },
  };
}

async function withServer(runtimeClient, callback, chatStore = new MemoryChatStore()) {
  const server = createServer({
    shared: {
      config: baseConfig,
      runtimeClient,
      now: () => new Date('2026-03-18T00:00:00.000Z'),
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

class DelayedMemoryChatStore extends MemoryChatStore {
  async read() {
    const state = await super.read();
    await new Promise((resolve) => setTimeout(resolve, 20));
    return state;
  }

  async write(state) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return super.write(state);
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
    assert.equal(payload.preferences.newChatDefaults.provider, 'claude');
    assert.deepEqual(payload.preferences.folderBrowsePreferences, {
      bySurface: {},
      chatDirectLaneByCatId: {},
    });
  });
});

test('PATCH /api/preferences persists folder browse memory per surface and per chat direct lane', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const chatSurfaceResponse = await fetch(`${baseUrl}/api/preferences`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        folderBrowsePreference: {
          surface: 'chat',
          path: 'C:/repo/chat-root',
        },
      }),
    });
    assert.equal(chatSurfaceResponse.status, 200);

    const codeSurfaceResponse = await fetch(`${baseUrl}/api/preferences`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        folderBrowsePreference: {
          surface: 'code',
          path: 'C:/repo/code-root',
        },
      }),
    });
    assert.equal(codeSurfaceResponse.status, 200);

    const directLaneResponse = await fetch(`${baseUrl}/api/preferences`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        folderBrowsePreference: {
          surface: 'chat',
          directLaneCatId: 'cat-direct-1',
          path: 'C:/repo/direct-cat-1',
        },
      }),
    });
    assert.equal(directLaneResponse.status, 200);

    const readResponse = await fetch(`${baseUrl}/api/preferences`);
    assert.equal(readResponse.status, 200);
    const readPayload = await readResponse.json();
    assert.deepEqual(readPayload.preferences.folderBrowsePreferences, {
      bySurface: {
        chat: 'C:/repo/chat-root',
        code: 'C:/repo/code-root',
      },
      chatDirectLaneByCatId: {
        'cat-direct-1': 'C:/repo/direct-cat-1',
      },
    });

    const appShellResponse = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(appShellResponse.status, 200);
    const appShellPayload = await appShellResponse.json();
    assert.deepEqual(appShellPayload.chat.folderBrowsePreferences, {
      bySurface: {
        chat: 'C:/repo/chat-root',
        code: 'C:/repo/code-root',
      },
      chatDirectLaneByCatId: {
        'cat-direct-1': 'C:/repo/direct-cat-1',
      },
    });
  });
});

test('PATCH /api/preferences serializes concurrent folder browse updates', async () => {
  await withServer(
    createRuntimeStub(),
    async (baseUrl) => {
      const [chatResponse, workResponse] = await Promise.all([
        fetch(`${baseUrl}/api/preferences`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            folderBrowsePreference: {
              surface: 'chat',
              path: 'C:/repo/chat-root',
            },
          }),
        }),
        fetch(`${baseUrl}/api/preferences`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            folderBrowsePreference: {
              surface: 'work',
              path: 'C:/repo/work-root',
            },
          }),
        }),
      ]);

      assert.equal(chatResponse.status, 200);
      assert.equal(workResponse.status, 200);

      const readResponse = await fetch(`${baseUrl}/api/preferences`);
      assert.equal(readResponse.status, 200);
      const readPayload = await readResponse.json();
      assert.deepEqual(readPayload.preferences.folderBrowsePreferences, {
        bySurface: {
          chat: 'C:/repo/chat-root',
          work: 'C:/repo/work-root',
        },
        chatDirectLaneByCatId: {},
      });
    },
    new DelayedMemoryChatStore(),
  );
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
        repoPath: 'C:/repo/cats-platform',
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
    assert.equal(sendMessagePayload.phase, 'acknowledged');
    assert.equal(sendMessagePayload.message.body, 'Hello from canonical route');
    assert.ok(Array.isArray(sendMessagePayload.results));
    assert.ok(sendMessagePayload.dispatch);
    assert.deepEqual(sendMessagePayload.results, sendMessagePayload.dispatch.results);
    assert.match(sendMessagePayload.message.id, UUID_PATTERN);

    // GET /api/channels/:cid/messages – list messages
    const listMessagesResponse = await fetch(
      `${baseUrl}/api/channels/${channelId}/messages`,
    );
    assert.equal(listMessagesResponse.status, 200);
    const listMessagesPayload = await listMessagesResponse.json();
    assert.ok(listMessagesPayload.messages.length >= 1);

    const appShellPayload = await waitForCondition(async () => {
      const appShellResponse = await fetch(`${baseUrl}/api/app-shell`);
      assert.equal(appShellResponse.status, 200);
      const payload = await appShellResponse.json();
      return payload.chat.selectedChannel.roomRouting.workflow.turnHistory[0]?.status === 'completed'
        ? payload
        : null;
    });
    assert.equal(
      appShellPayload.chat.selectedChannel.roomRouting.workflow.turnHistory[0].status,
      'completed',
    );
    assert.ok(
      appShellPayload.chat.selectedChannel.roomRouting.workflow.eventHistory.some(
        (event) => event.kind === 'outcome',
      ),
    );

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

test('PATCH /api/preferences persists new chat model defaults across subsequent reads', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const updateResponse = await fetch(`${baseUrl}/api/preferences`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        newChatDefaults: {
          provider: 'codex',
          instance: 'default',
          model: 'gpt-5.4',
          modelSelection: {
            entryMode: 'auto',
            presetId: 'balanced',
            controls: {
              'openai.reasoning_effort': 'high',
            },
          },
        },
      }),
    });
    assert.equal(updateResponse.status, 200);

    const updatePayload = await updateResponse.json();
    assert.deepEqual(updatePayload.preferences.newChatDefaults, {
      provider: 'codex',
      instance: 'default',
      model: 'gpt-5.4',
      modelSelection: {
        entryMode: 'auto',
        presetId: 'balanced',
        controls: {
          'openai.reasoning_effort': 'high',
        },
      },
    });

    const readResponse = await fetch(`${baseUrl}/api/preferences`);
    assert.equal(readResponse.status, 200);
    const readPayload = await readResponse.json();
    assert.deepEqual(readPayload.preferences.newChatDefaults, {
      provider: 'codex',
      instance: 'default',
      model: 'gpt-5.4',
      modelSelection: {
        entryMode: 'auto',
        presetId: 'balanced',
        controls: {
          'openai.reasoning_effort': 'high',
        },
      },
    });

    const appShellResponse = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(appShellResponse.status, 200);
    const appShellPayload = await appShellResponse.json();
    assert.deepEqual(appShellPayload.chat.newChatDefaults, {
      provider: 'codex',
      instance: 'default',
      model: 'gpt-5.4',
      modelSelection: {
        entryMode: 'auto',
        presetId: 'balanced',
        controls: {
          'openai.reasoning_effort': 'high',
        },
      },
    });
  });
});

test('GET /api/preferences includes default conversation behavior for chat, work, and code', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/preferences`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.deepEqual(payload.preferences.conversationBehavior, {
      chat: {
        showVerboseMessages: false,
        showLiveProgressDetails: false,
        concurrentPresentationMode: 'inline_stack',
      },
      work: {
        showVerboseMessages: false,
        showLiveProgressDetails: false,
        concurrentPresentationMode: 'inline_stack',
      },
      code: {
        showVerboseMessages: false,
        showLiveProgressDetails: false,
        concurrentPresentationMode: 'inline_stack',
      },
    });
  });
});

test('PATCH /api/preferences accepts chat conversation behavior and persists it', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const patchResponse = await fetch(`${baseUrl}/api/preferences`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        conversationBehavior: {
          chat: {
            showVerboseMessages: true,
            concurrentPresentationMode: 'compare_cards',
          },
        },
      }),
    });
    assert.equal(patchResponse.status, 200);
    const patchPayload = await patchResponse.json();
    assert.equal(patchPayload.preferences.conversationBehavior.chat.showVerboseMessages, true);
    assert.equal(
      patchPayload.preferences.conversationBehavior.chat.concurrentPresentationMode,
      'compare_cards',
    );

    const getResponse = await fetch(`${baseUrl}/api/preferences`);
    assert.equal(getResponse.status, 200);
    const getPayload = await getResponse.json();
    assert.equal(getPayload.preferences.conversationBehavior.chat.showVerboseMessages, true);
    assert.equal(
      getPayload.preferences.conversationBehavior.chat.concurrentPresentationMode,
      'compare_cards',
    );
  });
});

test('PATCH /api/preferences keeps work conversation behavior isolated from chat app-shell behavior', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const patchResponse = await fetch(`${baseUrl}/api/preferences`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        conversationBehavior: {
          work: {
            showVerboseMessages: true,
            showLiveProgressDetails: true,
            concurrentPresentationMode: 'focus_rail',
          },
        },
      }),
    });
    assert.equal(patchResponse.status, 200);
    const patchPayload = await patchResponse.json();
    assert.deepEqual(patchPayload.preferences.conversationBehavior.work, {
      showVerboseMessages: true,
      showLiveProgressDetails: true,
      concurrentPresentationMode: 'focus_rail',
    });

    const getResponse = await fetch(`${baseUrl}/api/preferences`);
    assert.equal(getResponse.status, 200);
    const getPayload = await getResponse.json();
    assert.deepEqual(getPayload.preferences.conversationBehavior.work, {
      showVerboseMessages: true,
      showLiveProgressDetails: true,
      concurrentPresentationMode: 'focus_rail',
    });

    const appShellResponse = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(appShellResponse.status, 200);
    const appShellPayload = await appShellResponse.json();
    assert.deepEqual(appShellPayload.chat.conversationBehavior.work, {
      showVerboseMessages: true,
      showLiveProgressDetails: true,
      concurrentPresentationMode: 'focus_rail',
    });
    assert.deepEqual(appShellPayload.chat.conversationBehavior.chat, {
      showVerboseMessages: false,
      showLiveProgressDetails: false,
      concurrentPresentationMode: 'inline_stack',
    });
  });
});

test('PATCH /api/channels/:channelId persists default chat AI reply settings', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Default',
        topic: 'Default chat',
        originSurface: 'chat',
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    const patchResponse = await fetch(`${baseUrl}/api/channels/${channelId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pendingProvider: 'claude',
        pendingInstance: 'default',
        pendingModel: 'claude-default',
        pendingModelSelection: {
          entryMode: 'auto',
          presetId: 'balanced',
          controls: {
            'openai.reasoning_effort': 'high',
          },
        },
      }),
    });
    assert.equal(patchResponse.status, 200);

    const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
    assert.equal(channelResponse.status, 200);
    const channelPayload = await channelResponse.json();
    assert.equal(channelPayload.channel.pendingProvider, 'claude');
    assert.equal(channelPayload.channel.pendingInstance, 'default');
    assert.equal(channelPayload.channel.pendingModel, 'claude-default');
    assert.deepEqual(channelPayload.channel.pendingModelSelection, {
      entryMode: 'auto',
      presetId: 'balanced',
      controls: {
        'openai.reasoning_effort': 'high',
      },
    });
  });
});

test('PATCH /api/channels/:channelId/participants/:participantId renames temporary participants', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Group',
        topic: 'Shared chat',
        entryKind: 'group',
        temporaryParticipants: [
          {
            participantId: 'participant-inline',
            name: 'Claude',
            provider: 'claude',
            roleHint: 'Counterpoint',
          },
        ],
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    const patchResponse = await fetch(
      `${baseUrl}/api/channels/${channelId}/participants/participant-inline`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Reviewer Claude' }),
      },
    );
    assert.equal(patchResponse.status, 200);

    const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
    assert.equal(channelResponse.status, 200);
    const channelPayload = await channelResponse.json();
    assert.equal(channelPayload.channel.assignedParticipants[0].name, 'Reviewer Claude');
    assert.equal(channelPayload.channel.assignedParticipants[0].roleHint, 'Counterpoint');
  });
});

test('POST /api/channels supports direct Cat chat with existingCatIds and initializes working memory', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Companion',
        provider: 'claude',
        roles: ['companion'],
        skillProfile: 'companion',
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const createCatPayload = await createCatResponse.json();
    const companionCatId = createCatPayload.cat.id;

    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: '',
        topic: 'Private companion lane',
        roomMode: 'direct_message',
        participantCatIds: [companionCatId],
      }),
    });
    assert.equal(createChannelResponse.status, 201);

    const createChannelPayload = await createChannelResponse.json();
    assert.equal(createChannelPayload.channel.title, 'Companion Direct Chat');
    assert.equal(createChannelPayload.channel.assignedCats.length, 1);
    assert.equal(createChannelPayload.channel.assignedCats[0].catId, companionCatId);
    assert.equal(createChannelPayload.channel.roomRouting.mode, 'direct_message');
    assert.equal(createChannelPayload.channel.roomRouting.defaultRecipientId, companionCatId);
    assert.deepEqual(createChannelPayload.channel.workingMemory, {
      summary: null,
      facts: [],
      openLoops: [],
      updatedAt: null,
    });
    assert.equal(createChannelPayload.channel.messages.length, 1);
    assert.equal(createChannelPayload.channel.messages[0].metadata?.event, 'room_created');
  });
});

test('bot binding routes support multiple Telegram bots across Cats', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Boss Cat',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(setupResponse.status, 200);
    const setupPayload = await setupResponse.json();
    const bossCatId = setupPayload.chat.bossCatId;

    const createCompanionResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Companion',
        provider: 'claude',
        skillProfile: 'companion',
      }),
    });
    assert.equal(createCompanionResponse.status, 201);
    const createCompanionPayload = await createCompanionResponse.json();
    const companionCatId = createCompanionPayload.cat.id;

    const bossBindingResponse = await fetch(`${baseUrl}/api/bot-bindings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        platform: 'telegram',
        botName: 'boss_cat_bot',
        catId: bossCatId,
      }),
    });
    assert.equal(bossBindingResponse.status, 201);

    const companionBindingResponse = await fetch(`${baseUrl}/api/bot-bindings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        platform: 'telegram',
        botName: 'companion_bot',
        catId: companionCatId,
        roomMode: 'direct_message',
      }),
    });
    assert.equal(companionBindingResponse.status, 201);
    const companionBindingPayload = await companionBindingResponse.json();
    const companionBindingId = companionBindingPayload.botBinding.id;

    const listBindingsResponse = await fetch(`${baseUrl}/api/bot-bindings`);
    assert.equal(listBindingsResponse.status, 200);
    const listBindingsPayload = await listBindingsResponse.json();
    assert.equal(listBindingsPayload.botBindings.length, 2);
    assert.ok(listBindingsPayload.botBindings.some((binding) =>
      binding.botName === 'boss_cat_bot'
      && binding.isBossBinding === true
      && binding.roomMode === 'direct_message'));
    assert.ok(listBindingsPayload.botBindings.some((binding) =>
      binding.botName === 'companion_bot'
      && binding.catId === companionCatId
      && binding.roomMode === 'direct_message'));

    const patchBindingResponse = await fetch(`${baseUrl}/api/bot-bindings/${companionBindingId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        roomMode: 'direct_message',
        status: 'disabled',
      }),
    });
    assert.equal(patchBindingResponse.status, 200);
    const patchBindingPayload = await patchBindingResponse.json();
    assert.equal(patchBindingPayload.botBinding.roomMode, 'direct_message');
    assert.equal(patchBindingPayload.botBinding.status, 'disabled');

    const appShellResponse = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(appShellResponse.status, 200);
    const appShellPayload = await appShellResponse.json();
    assert.equal(appShellPayload.chat.botBindings.length, 2);

    const deleteBindingResponse = await fetch(`${baseUrl}/api/bot-bindings/${companionBindingId}`, {
      method: 'DELETE',
    });
    assert.equal(deleteBindingResponse.status, 200);

    const afterDeleteResponse = await fetch(`${baseUrl}/api/bot-bindings`);
    const afterDeletePayload = await afterDeleteResponse.json();
    assert.equal(afterDeletePayload.botBindings.length, 1);
    assert.equal(afterDeletePayload.botBindings[0].botName, 'boss_cat_bot');
  });
});

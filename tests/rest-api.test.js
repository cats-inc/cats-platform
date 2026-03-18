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

async function withServer(runtimeClient, callback, workspaceStore = new MemoryWorkspaceStore()) {
  const server = createServer({
    config: baseConfig,
    runtimeClient,
    workspaceStore,
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
    assert.equal(restPayload.workspace.name, legacyPayload.workspace.name);
  });
});

test('GET /api/workspaces/default returns workspace summary', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/workspaces/default`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.workspace.id, 'default');
    assert.equal(payload.workspace.name, 'Chat');
    assert.equal(typeof payload.workspace.channelCount, 'number');
    assert.equal(typeof payload.workspace.palCount, 'number');
    assert.ok(payload.workspace.capabilities);
  });
});

test('GET /api/workspaces/invalid returns 404 with structured error', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/workspaces/invalid`);
    assert.equal(response.status, 404);

    const payload = await response.json();
    assert.equal(payload.error.code, 'workspace_not_found');
    assert.match(payload.error.message, /invalid/);
  });
});

test('GET /api/workspaces/default/preferences returns selectedChannelId', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/workspaces/default/preferences`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(typeof payload.preferences.selectedChannelId, 'string');
  });
});

test('GET /api/workspaces/default/channels returns empty channel list', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/workspaces/default/channels`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.ok(Array.isArray(payload.channels));
    assert.equal(payload.channels.length, 0);
  });
});

test('GET /api/pals returns empty pal list', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/pals`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.ok(Array.isArray(payload.pals));
    assert.equal(payload.pals.length, 0);
  });
});

test('GET /api/workspaces/default/orchestrator returns orchestrator state', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/workspaces/default/orchestrator`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.orchestrator.mode, 'global');
    assert.equal(payload.orchestrator.status, 'ready');
    assert.ok(payload.orchestrator.executionTarget);
  });
});

// ---------------------------------------------------------------------------
// Phase 3: Write-side resource and operation routes
// ---------------------------------------------------------------------------

test('REST API full lifecycle: create pal, create channel, activate, message, assign, remove, export, delete', async () => {
  const runtimeClient = createRuntimeStub();
  const workspaceStore = new MemoryWorkspaceStore();

  await withServer(runtimeClient, async (baseUrl) => {
    // POST /api/pals – create a pal
    const createPalResponse = await fetch(`${baseUrl}/api/pals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Agent-1',
        provider: 'claude',
        roles: ['coder'],
      }),
    });
    assert.equal(createPalResponse.status, 201);
    const createPalPayload = await createPalResponse.json();
    assert.equal(createPalPayload.pal.name, 'Agent-1');
    assert.ok(createPalPayload.pal.id);
    const palId = createPalPayload.pal.id;

    // GET /api/pals/:palId – read pal detail
    const getPalResponse = await fetch(`${baseUrl}/api/pals/${palId}`);
    assert.equal(getPalResponse.status, 200);
    const getPalPayload = await getPalResponse.json();
    assert.equal(getPalPayload.pal.name, 'Agent-1');

    // GET /api/pals – list pals
    const listPalsResponse = await fetch(`${baseUrl}/api/pals`);
    assert.equal(listPalsResponse.status, 200);
    const listPalsPayload = await listPalsResponse.json();
    assert.equal(listPalsPayload.pals.length, 1);

    // POST /api/workspaces/default/channels – create channel (with inline pal)
    const createChannelResponse = await fetch(`${baseUrl}/api/workspaces/default/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Ops Radar',
        topic: 'Track regressions.',
        repoPath: 'C:/repo/cats-inc',
        language: 'TypeScript',
        pals: [
          { name: 'Inline-Agent', provider: 'gemini', roles: ['reviewer'] },
        ],
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    assert.equal(createChannelPayload.channel.title, 'Ops Radar');
    assert.equal(createChannelPayload.channel.id, 'ops-radar');
    assert.ok(createChannelPayload.channel.assignedPals.length >= 1);
    // Verify no appShell in response
    assert.equal(createChannelPayload.appShell, undefined);
    const channelId = createChannelPayload.channel.id;

    // GET /api/workspaces/default/channels – list channels
    const listChannelsResponse = await fetch(`${baseUrl}/api/workspaces/default/channels`);
    assert.equal(listChannelsResponse.status, 200);
    const listChannelsPayload = await listChannelsResponse.json();
    assert.equal(listChannelsPayload.channels.length, 1);
    assert.equal(listChannelsPayload.channels[0].id, channelId);

    // GET /api/workspaces/default/channels/:channelId – get channel detail
    const getChannelResponse = await fetch(`${baseUrl}/api/workspaces/default/channels/${channelId}`);
    assert.equal(getChannelResponse.status, 200);
    const getChannelPayload = await getChannelResponse.json();
    assert.equal(getChannelPayload.channel.id, channelId);
    assert.ok(getChannelPayload.channel.messages.length >= 1);

    // PUT /api/workspaces/default/channels/:cid/pal-assignments/:pid – assign existing pal
    const assignPalResponse = await fetch(
      `${baseUrl}/api/workspaces/default/channels/${channelId}/pal-assignments/${palId}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: 'claude',
          roles: ['coder'],
        }),
      },
    );
    assert.equal(assignPalResponse.status, 201); // new assignment
    const assignPalPayload = await assignPalResponse.json();
    assert.equal(assignPalPayload.palAssignment.palId, palId);
    assert.equal(assignPalPayload.palAssignment.name, 'Agent-1');

    // GET /api/workspaces/default/channels/:cid/pal-assignments
    const listAssignmentsResponse = await fetch(
      `${baseUrl}/api/workspaces/default/channels/${channelId}/pal-assignments`,
    );
    assert.equal(listAssignmentsResponse.status, 200);
    const listAssignmentsPayload = await listAssignmentsResponse.json();
    assert.equal(listAssignmentsPayload.palAssignments.length, 2); // inline + assigned

    // PUT again (update existing) – should return 200 not 201
    const reassignResponse = await fetch(
      `${baseUrl}/api/workspaces/default/channels/${channelId}/pal-assignments/${palId}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roles: ['reviewer'] }),
      },
    );
    assert.equal(reassignResponse.status, 200); // existing assignment updated

    // POST /api/workspaces/default/channels/:cid/activations
    const activateResponse = await fetch(
      `${baseUrl}/api/workspaces/default/channels/${channelId}/activations`,
      { method: 'POST' },
    );
    assert.equal(activateResponse.status, 200);
    const activatePayload = await activateResponse.json();
    assert.equal(activatePayload.activation.channelId, channelId);
    assert.ok(activatePayload.activation.results.length >= 2);
    assert.equal(activatePayload.appShell, undefined); // no full shell

    // PATCH /api/workspaces/default/preferences – select channel
    const updatePrefsResponse = await fetch(`${baseUrl}/api/workspaces/default/preferences`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ selectedChannelId: channelId }),
    });
    assert.equal(updatePrefsResponse.status, 200);
    const updatePrefsPayload = await updatePrefsResponse.json();
    assert.equal(updatePrefsPayload.preferences.selectedChannelId, channelId);

    // GET /api/workspaces/default/channels/:cid/messages – list messages
    const listMessagesResponse = await fetch(
      `${baseUrl}/api/workspaces/default/channels/${channelId}/messages`,
    );
    assert.equal(listMessagesResponse.status, 200);
    const listMessagesPayload = await listMessagesResponse.json();
    assert.ok(Array.isArray(listMessagesPayload.messages));
    assert.ok(listMessagesPayload.messages.length >= 1);

    // POST /api/workspaces/default/channels/:cid/messages – send message
    const sendMessageResponse = await fetch(
      `${baseUrl}/api/workspaces/default/channels/${channelId}/messages`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: 'Hello from REST API' }),
      },
    );
    assert.equal(sendMessageResponse.status, 200);
    const sendMessagePayload = await sendMessageResponse.json();
    assert.equal(sendMessagePayload.message.senderKind, 'user');
    assert.equal(sendMessagePayload.message.body, 'Hello from REST API');
    assert.ok(sendMessagePayload.dispatch);
    assert.equal(sendMessagePayload.dispatch.channelId, channelId);
    assert.ok(Array.isArray(sendMessagePayload.dispatch.results));
    // No appShell in REST response
    assert.equal(sendMessagePayload.appShell, undefined);

    // PATCH /api/workspaces/default/orchestrator
    const updateOrchResponse = await fetch(`${baseUrl}/api/workspaces/default/orchestrator`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'claude',
        model: 'claude-opus-4-6',
        systemPrompt: 'Updated from REST.',
      }),
    });
    assert.equal(updateOrchResponse.status, 200);
    const updateOrchPayload = await updateOrchResponse.json();
    assert.equal(updateOrchPayload.orchestrator.executionTarget.model, 'claude-opus-4-6');
    assert.equal(updateOrchPayload.orchestrator.status, 'ready');

    // GET /api/workspaces/default/channels/:cid/exports/latest
    const exportResponse = await fetch(
      `${baseUrl}/api/workspaces/default/channels/${channelId}/exports/latest`,
    );
    assert.equal(exportResponse.status, 200);
    assert.match(
      exportResponse.headers.get('content-disposition') ?? '',
      /channel-ops-radar\.json/,
    );
    const exportPayload = await exportResponse.json();
    assert.equal(exportPayload.channel.id, channelId);

    // DELETE /api/workspaces/default/channels/:cid/pal-assignments/:pid
    const removePalResponse = await fetch(
      `${baseUrl}/api/workspaces/default/channels/${channelId}/pal-assignments/${palId}`,
      { method: 'DELETE' },
    );
    assert.equal(removePalResponse.status, 200);
    const removePalPayload = await removePalResponse.json();
    assert.equal(removePalPayload.removed, true);
    assert.equal(removePalPayload.palId, palId);

    // DELETE /api/workspaces/default/channels/:channelId
    const deleteChannelResponse = await fetch(
      `${baseUrl}/api/workspaces/default/channels/${channelId}`,
      { method: 'DELETE' },
    );
    assert.equal(deleteChannelResponse.status, 200);
    const deletePayload = await deleteChannelResponse.json();
    assert.equal(deletePayload.deleted, true);
    assert.equal(deletePayload.channelId, channelId);
    // No appShell in response
    assert.equal(deletePayload.appShell, undefined);

    // Verify channel is gone
    const listAfterDelete = await fetch(`${baseUrl}/api/workspaces/default/channels`);
    const listAfterDeletePayload = await listAfterDelete.json();
    assert.equal(listAfterDeletePayload.channels.length, 0);
  }, workspaceStore);
});

test('REST API returns structured 404 for nonexistent channel', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/workspaces/default/channels/nonexistent`);
    assert.equal(response.status, 404);

    const payload = await response.json();
    assert.equal(payload.error.code, 'channel_not_found');
  });
});

test('REST API returns structured 404 for nonexistent pal', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/pals/nonexistent`);
    assert.equal(response.status, 404);

    const payload = await response.json();
    assert.equal(payload.error.code, 'pal_not_found');
  });
});

test('REST API returns 405 for unsupported methods', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const deleteOnPals = await fetch(`${baseUrl}/api/pals`, { method: 'DELETE' });
    assert.equal(deleteOnPals.status, 405);

    const postOnWorkspace = await fetch(`${baseUrl}/api/workspaces/default`, { method: 'POST' });
    assert.equal(postOnWorkspace.status, 405);

    const putOnChannels = await fetch(`${baseUrl}/api/workspaces/default/channels`, { method: 'PUT' });
    assert.equal(putOnChannels.status, 405);
  });
});

test('legacy routes still work alongside REST routes', async () => {
  const runtimeClient = createRuntimeStub();
  const workspaceStore = new MemoryWorkspaceStore();

  await withServer(runtimeClient, async (baseUrl) => {
    // Legacy create channel
    const createResponse = await fetch(`${baseUrl}/api/workspace/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Legacy Chat',
        topic: 'Created via legacy route.',
        pals: [{ name: 'LegacyPal', provider: 'claude', roles: ['coder'] }],
      }),
    });
    assert.equal(createResponse.status, 200);
    const createPayload = await createResponse.json();
    // Legacy returns AppShellPayload
    assert.ok(createPayload.workspace);
    assert.ok(createPayload.app);
    const channelId = createPayload.workspace.selectedChannel.id;

    // REST read the same channel
    const getChannelResponse = await fetch(
      `${baseUrl}/api/workspaces/default/channels/${channelId}`,
    );
    assert.equal(getChannelResponse.status, 200);
    const getChannelPayload = await getChannelResponse.json();
    assert.equal(getChannelPayload.channel.title, 'Legacy Chat');
    // REST returns resource, not shell
    assert.equal(getChannelPayload.app, undefined);

    // REST list channels
    const listResponse = await fetch(`${baseUrl}/api/workspaces/default/channels`);
    const listPayload = await listResponse.json();
    assert.equal(listPayload.channels.length, 1);
    assert.equal(listPayload.channels[0].id, channelId);
  }, workspaceStore);
});

import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

import { createServer } from '../dist-server/server.js';
import { UUID_PATTERN } from '../dist-server/shared/channelPaths.js';
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
        cwd: input.cwd ?? 'C:/workspace/runtime',
      };
      this.createdSessions.push({ ...input, id: session.id });
      return session;
    },
    async sendMessage(sessionId, content) {
      this.sentMessages.push({ sessionId, content });
      return {
        content: content.includes('Agent-1')
          ? 'Agent-1 handled the routed turn.'
          : 'Orchestrator acknowledged the chat request.',
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
    now: () => new Date('2026-03-11T00:00:00.000Z'),
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

test('GET /health reports runtime reachability', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.service, 'cats-inc');
    assert.equal(payload.status, 'ok');
    assert.equal(payload.runtime.service, 'cats-runtime');
  });
});

test('GET /api/app-shell exposes detailed workspace state with global pals', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.app.name, 'cats-inc');
    assert.equal(payload.workspace.name, 'Chat');
    assert.equal(payload.workspace.selectedChannelId, '');
    assert.equal(payload.workspace.channels.length, 0);
    assert.equal(payload.workspace.pals.length, 0);
    assert.equal(payload.workspace.selectedChannel, null);
    assert.equal(payload.workspace.capabilities.mentions, 'basic');
    assert.equal(payload.workspace.capabilities.transcriptExport, true);
  });
});

test('GET /api/core endpoints expose the shared Cats Core contract', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const stateResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(stateResponse.status, 200);
    const statePayload = await stateResponse.json();
    assert.equal(statePayload.version, 1);
    assert.equal(statePayload.ownerProfile.actorId, 'actor-owner');
    assert.ok(Array.isArray(statePayload.actors));
    assert.ok(Array.isArray(statePayload.conversations));
    assert.ok(Array.isArray(statePayload.tasks));

    const actorsResponse = await fetch(`${baseUrl}/api/core/actors`);
    assert.equal(actorsResponse.status, 200);
    const actorsPayload = await actorsResponse.json();
    assert.ok(actorsPayload.actors.some((actor) => actor.kind === 'owner'));
    assert.ok(actorsPayload.actors.some((actor) => actor.kind === 'orchestrator'));

    const ownerProfileResponse = await fetch(`${baseUrl}/api/core/owner-profile`);
    assert.equal(ownerProfileResponse.status, 200);
    const ownerProfilePayload = await ownerProfileResponse.json();
    assert.equal(ownerProfilePayload.ownerProfile.displayName, 'Owner');
  });
});

test('workspace API covers chat setup, activation, messaging, global pals, assignments, and export', async () => {
  const runtimeClient = createRuntimeStub();
  const workspaceStore = new MemoryWorkspaceStore();

  await withServer(runtimeClient, async (baseUrl) => {
    const createResponse = await fetch(`${baseUrl}/api/workspace/channels`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Ops Radar',
        topic: 'Track runtime regressions before shipping the desktop shell.',
        repoPath: 'C:/repo/cats-inc',
        language: 'TypeScript',
        pals: [
          {
            name: 'Agent-1',
            provider: 'claude',
            roles: ['coder'],
          },
        ],
      }),
    });

    assert.equal(createResponse.status, 200);
    const createdPayload = await createResponse.json();
    const channelId = createdPayload.workspace.selectedChannel.id;
    assert.match(channelId, UUID_PATTERN);
    assert.equal(createdPayload.workspace.pals.length, 1);
    assert.equal(createdPayload.workspace.selectedChannel.assignedPals.length, 1);
    assert.equal(
      createdPayload.workspace.selectedChannel.assignedPals[0].execution.target.provider,
      'claude',
    );

    const activateResponse = await fetch(`${baseUrl}/api/workspace/channels/${channelId}/activate`, {
      method: 'POST',
    });
    assert.equal(activateResponse.status, 200);
    const activationPayload = await activateResponse.json();
    assert.equal(activationPayload.results.length, 2);
    assert.equal(activationPayload.appShell.workspace.selectedChannel.status, 'active');
    assert.equal(runtimeClient.createdSessions.length, 2);

    const messageResponse = await fetch(`${baseUrl}/api/workspace/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        body: 'Please review this fix with @Agent-1',
      }),
    });
    assert.equal(messageResponse.status, 200);
    const messagePayload = await messageResponse.json();
    assert.equal(messagePayload.results[0].status, 'sent');
    assert.equal(runtimeClient.sentMessages.length, 1);
    assert.ok(
      messagePayload.appShell.workspace.selectedChannel.messages.some(
        (message) => message.senderName === 'Agent-1',
      ),
    );

    const createPalResponse = await fetch(`${baseUrl}/api/workspace/pals`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Agent-2',
        provider: 'gemini',
        roles: ['reviewer'],
      }),
    });
    assert.equal(createPalResponse.status, 200);
    const createPalPayload = await createPalResponse.json();
    assert.equal(createPalPayload.workspace.pals.length, 2);
    const secondPal = createPalPayload.workspace.pals.find((pal) => pal.name === 'Agent-2');
    assert.ok(secondPal);

    const assignPalResponse = await fetch(`${baseUrl}/api/workspace/channels/${channelId}/pals`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        palId: secondPal.id,
        provider: 'gemini',
        model: 'gemini-2.5-pro',
        roles: ['reviewer'],
      }),
    });
    assert.equal(assignPalResponse.status, 200);
    const assignPalPayload = await assignPalResponse.json();
    assert.equal(assignPalPayload.workspace.selectedChannel.assignedPals.length, 2);
    assert.equal(
      assignPalPayload.workspace.selectedChannel.assignedPals.find((pal) => pal.palId === secondPal.id).execution.target.model,
      'gemini-2.5-pro',
    );

    const firstPal = assignPalPayload.workspace.selectedChannel.assignedPals.find(
      (pal) => pal.name === 'Agent-1',
    );
    assert.ok(firstPal);

    const removePalResponse = await fetch(
      `${baseUrl}/api/workspace/channels/${channelId}/pals/${firstPal.palId}`,
      {
        method: 'DELETE',
      },
    );
    assert.equal(removePalResponse.status, 200);
    const removePalPayload = await removePalResponse.json();
    assert.equal(
      removePalPayload.workspace.selectedChannel.assignedPals.find(
        (pal) => pal.palId === firstPal.palId,
      ).status,
      'removed',
    );
    assert.equal(runtimeClient.closedSessions.length, 1);

    const orchestratorResponse = await fetch(`${baseUrl}/api/orchestrator`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'claude',
        model: 'claude-opus-4-6',
        systemPrompt: 'Coordinate explicitly and keep mention routing visible.',
      }),
    });
    assert.equal(orchestratorResponse.status, 200);
    const orchestratorPayload = await orchestratorResponse.json();
    assert.equal(
      orchestratorPayload.workspace.globalOrchestrator.executionTarget.model,
      'claude-opus-4-6',
    );

    const actorsResponse = await fetch(`${baseUrl}/api/core/actors`);
    assert.equal(actorsResponse.status, 200);
    const actorsPayload = await actorsResponse.json();
    assert.ok(actorsPayload.actors.some((actor) => actor.name === 'Agent-1'));
    assert.ok(actorsPayload.actors.some((actor) => actor.name === 'Agent-2'));

    const conversationsResponse = await fetch(`${baseUrl}/api/core/conversations`);
    assert.equal(conversationsResponse.status, 200);
    const conversationsPayload = await conversationsResponse.json();
    assert.ok(
      conversationsPayload.conversations.some(
        (conversation) => conversation.sourceChannelId === channelId,
      ),
    );

    const tasksResponse = await fetch(`${baseUrl}/api/core/tasks`);
    assert.equal(tasksResponse.status, 200);
    const tasksPayload = await tasksResponse.json();
    assert.ok(
      tasksPayload.tasks.some(
        (task) => task.conversationId === `conversation-channel-${channelId}`,
      ),
    );

    const exportResponse = await fetch(`${baseUrl}/api/workspace/channels/${channelId}/export`);
    assert.equal(exportResponse.status, 200);
    assert.match(exportResponse.headers.get('content-disposition') ?? '', /channel-ops-radar\.json/);
    const exportPayload = await exportResponse.json();
    assert.equal(exportPayload.channel.id, channelId);
    assert.ok(exportPayload.assignedPals.length >= 1);
    assert.ok(exportPayload.channel.messages.length >= 4);

    const deleteResponse = await fetch(`${baseUrl}/api/workspace/channels/${channelId}`, {
      method: 'DELETE',
    });
    assert.equal(deleteResponse.status, 200);
    const deletePayload = await deleteResponse.json();
    assert.equal(deletePayload.workspace.channels.length, 0);
    assert.equal(deletePayload.workspace.selectedChannelId, '');
    assert.equal(deletePayload.workspace.selectedChannel, null);
    assert.equal(runtimeClient.closedSessions.length, 3);

    const conversationsAfterDelete = await fetch(`${baseUrl}/api/core/conversations`);
    assert.equal(conversationsAfterDelete.status, 200);
    const conversationsAfterDeletePayload = await conversationsAfterDelete.json();
    assert.equal(conversationsAfterDeletePayload.conversations.length, 0);

    const tasksAfterDelete = await fetch(`${baseUrl}/api/core/tasks`);
    assert.equal(tasksAfterDelete.status, 200);
    const tasksAfterDeletePayload = await tasksAfterDelete.json();
    assert.equal(tasksAfterDeletePayload.tasks.length, 0);
  }, workspaceStore);
});

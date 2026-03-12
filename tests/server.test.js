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

test('GET /api/app-shell exposes detailed workspace state', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.app.name, 'cats-inc');
    assert.equal(payload.workspace.name, 'Chat');
    assert.equal(payload.workspace.selectedChannelId, 'lobby');
    assert.equal(payload.workspace.channels.length, 1);
    assert.deepEqual(
      payload.workspace.channels.map((channel) => channel.id),
      ['lobby'],
    );
    assert.equal(payload.workspace.selectedChannel.title, 'Lobby');
    assert.equal(payload.workspace.capabilities.mentions, 'basic');
    assert.equal(payload.workspace.capabilities.transcriptExport, true);
  });
});

test('workspace API covers channel setup, activation, messaging, members, and export', async () => {
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
        members: [
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
    assert.equal(channelId, 'ops-radar');
    assert.equal(createdPayload.workspace.selectedChannel.members.length, 1);
    assert.equal(
      createdPayload.workspace.selectedChannel.members[0].execution.target.provider,
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

    const addMemberResponse = await fetch(`${baseUrl}/api/workspace/channels/${channelId}/members`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Agent-2',
        provider: 'claude',
        roles: ['reviewer'],
      }),
    });
    assert.equal(addMemberResponse.status, 200);
    const addMemberPayload = await addMemberResponse.json();
    assert.equal(addMemberPayload.workspace.selectedChannel.members.length, 2);

    const firstMember = addMemberPayload.workspace.selectedChannel.members.find(
      (member) => member.name === 'Agent-1',
    );
    assert.ok(firstMember);

    const removeMemberResponse = await fetch(
      `${baseUrl}/api/workspace/channels/${channelId}/members/${firstMember.id}`,
      {
        method: 'DELETE',
      },
    );
    assert.equal(removeMemberResponse.status, 200);
    const removeMemberPayload = await removeMemberResponse.json();
    assert.equal(
      removeMemberPayload.workspace.selectedChannel.members.find(
        (member) => member.id === firstMember.id,
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

    const exportResponse = await fetch(`${baseUrl}/api/workspace/channels/${channelId}/export`);
    assert.equal(exportResponse.status, 200);
    assert.match(exportResponse.headers.get('content-disposition') ?? '', /channel-ops-radar\.json/);
    const exportPayload = await exportResponse.json();
    assert.equal(exportPayload.channel.id, channelId);
    assert.ok(exportPayload.channel.messages.length >= 4);
  }, workspaceStore);
});

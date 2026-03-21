import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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
    assert.equal(payload.service, 'cats');
    assert.equal(payload.status, 'ok');
    assert.equal(payload.runtime.service, 'cats-runtime');
  });
});

test('GET /api/app-shell exposes detailed workspace state with global pals', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.app.name, 'cats');
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
    assert.equal(statePayload.version, 2);
    assert.equal(statePayload.ownerProfile.actorId, 'actor-owner');
    assert.ok(Array.isArray(statePayload.actors));
    assert.ok(Array.isArray(statePayload.conversations));
    assert.ok(Array.isArray(statePayload.tasks));
    assert.ok(Array.isArray(statePayload.runs));
    assert.ok(Array.isArray(statePayload.traces));
    assert.ok(Array.isArray(statePayload.checkpoints));
    assert.ok(Array.isArray(statePayload.outcomes));

    const actorsResponse = await fetch(`${baseUrl}/api/core/actors`);
    assert.equal(actorsResponse.status, 200);
    const actorsPayload = await actorsResponse.json();
    assert.ok(actorsPayload.actors.some((actor) => actor.kind === 'owner'));
    assert.ok(actorsPayload.actors.some((actor) => actor.kind === 'orchestrator'));

    const approvalsResponse = await fetch(`${baseUrl}/api/core/approvals`);
    assert.equal(approvalsResponse.status, 200);
    const approvalsPayload = await approvalsResponse.json();
    assert.ok(Array.isArray(approvalsPayload.approvals));
    assert.equal(approvalsPayload.approvals.length, 0);

    const ownerProfileResponse = await fetch(`${baseUrl}/api/core/owner-profile`);
    assert.equal(ownerProfileResponse.status, 200);
    const ownerProfilePayload = await ownerProfileResponse.json();
    assert.equal(ownerProfilePayload.ownerProfile.displayName, 'Owner');
  });
});

test('core write APIs persist owner profile, tasks, approvals, traces, checkpoints, runs, and outcomes', async () => {
  const workspaceStore = new MemoryWorkspaceStore();

  await withServer(createRuntimeStub(), async (baseUrl) => {
    const ownerProfileResponse = await fetch(`${baseUrl}/api/core/owner-profile`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        displayName: 'Boss Owner',
        decisionPreferences: ['show options first'],
      }),
    });
    assert.equal(ownerProfileResponse.status, 200);
    const ownerProfilePayload = await ownerProfileResponse.json();
    assert.equal(ownerProfilePayload.ownerProfile.displayName, 'Boss Owner');

    const taskResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          id: 'task-system-1',
          title: 'Approve orchestrator dispatch',
          conversationId: 'conversation-system-1',
          summary: 'Core-owned approval task for Team 2.',
        },
      }),
    });
    assert.equal(taskResponse.status, 201);
    const taskPayload = await taskResponse.json();
    assert.equal(taskPayload.task.id, 'task-system-1');

    const approvalResponse = await fetch(`${baseUrl}/api/core/approvals`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        taskId: 'task-system-1',
        status: 'pending',
        requestedByActorId: 'actor-orchestrator-global',
        notes: 'Need approval before dispatch.',
      }),
    });
    assert.equal(approvalResponse.status, 200);
    const approvalPayload = await approvalResponse.json();
    assert.equal(approvalPayload.task.approval.status, 'pending');
    assert.equal(approvalPayload.queueItem.taskId, 'task-system-1');

    const traceResponse = await fetch(`${baseUrl}/api/core/traces`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        trace: {
          id: 'trace-record-1',
          traceId: 'trace-system-1',
          kind: 'dispatch',
          conversationId: 'conversation-system-1',
          taskId: 'task-system-1',
          message: 'Dispatch recorded.',
        },
      }),
    });
    assert.equal(traceResponse.status, 201);
    const tracePayload = await traceResponse.json();
    assert.equal(tracePayload.trace.id, 'trace-record-1');

    const checkpointResponse = await fetch(`${baseUrl}/api/core/checkpoints`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        checkpoint: {
          id: 'checkpoint-system-1',
          label: 'owner-gate',
          status: 'open',
          conversationId: 'conversation-system-1',
          taskId: 'task-system-1',
          sourceTraceId: 'trace-record-1',
          summary: 'Waiting for owner decision.',
        },
      }),
    });
    assert.equal(checkpointResponse.status, 201);
    const checkpointPayload = await checkpointResponse.json();
    assert.equal(checkpointPayload.checkpoint.id, 'checkpoint-system-1');

    const runResponse = await fetch(`${baseUrl}/api/core/runs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        run: {
          id: 'run-system-1',
          title: 'Dispatch run',
          status: 'running',
          conversationId: 'conversation-system-1',
          taskId: 'task-system-1',
          traceId: 'trace-system-1',
        },
      }),
    });
    assert.equal(runResponse.status, 201);
    const runPayload = await runResponse.json();
    assert.equal(runPayload.run.id, 'run-system-1');

    const outcomeResponse = await fetch(`${baseUrl}/api/core/outcomes`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        outcome: {
          id: 'outcome-system-1',
          title: 'Blocked for owner',
          status: 'blocked',
          conversationId: 'conversation-system-1',
          runId: 'run-system-1',
          taskId: 'task-system-1',
          summary: 'Still awaiting owner approval.',
        },
      }),
    });
    assert.equal(outcomeResponse.status, 201);
    const outcomePayload = await outcomeResponse.json();
    assert.equal(outcomePayload.outcome.id, 'outcome-system-1');

    const approvalsListResponse = await fetch(`${baseUrl}/api/core/approvals`);
    assert.equal(approvalsListResponse.status, 200);
    const approvalsListPayload = await approvalsListResponse.json();
    assert.equal(approvalsListPayload.approvals.length, 1);

    const stateResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(stateResponse.status, 200);
    const statePayload = await stateResponse.json();
    assert.equal(statePayload.ownerProfile.displayName, 'Boss Owner');
    assert.ok(statePayload.tasks.some((task) => task.id === 'task-system-1'));
    assert.ok(statePayload.runs.some((run) => run.id === 'run-system-1'));
    assert.ok(statePayload.traces.some((trace) => trace.id === 'trace-record-1'));
    assert.ok(
      statePayload.checkpoints.some((checkpoint) => checkpoint.id === 'checkpoint-system-1'),
    );
    assert.ok(statePayload.outcomes.some((outcome) => outcome.id === 'outcome-system-1'));
  }, workspaceStore);
});

test('GET /api/work and /api/code expose dedicated placeholder surfaces', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const workResponse = await fetch(`${baseUrl}/api/work`);
    assert.equal(workResponse.status, 200);
    const workPayload = await workResponse.json();
    assert.equal(workPayload.product.id, 'work');
    assert.equal(workPayload.product.status, 'placeholder');
    assert.equal(workPayload.product.routeBase, '/work');
    assert.equal(workPayload.summary.ownerActorId, 'actor-owner');
    assert.ok(workPayload.extensionPoints.futureRoutes.includes('/api/work/war-room'));

    const codeResponse = await fetch(`${baseUrl}/api/code`);
    assert.equal(codeResponse.status, 200);
    const codePayload = await codeResponse.json();
    assert.equal(codePayload.product.id, 'code');
    assert.equal(codePayload.product.status, 'placeholder');
    assert.equal(codePayload.product.routeBase, '/code');
    assert.equal(codePayload.summary.ownerActorId, 'actor-owner');
    assert.ok(codePayload.extensionPoints.futureRoutes.includes('/api/code/previews'));
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
        repoPath: 'C:/repo/cats',
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

    const approvalsResponse = await fetch(`${baseUrl}/api/core/approvals`);
    assert.equal(approvalsResponse.status, 200);
    const approvalsPayload = await approvalsResponse.json();
    assert.equal(approvalsPayload.approvals.length, 0);

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

test('assigning a cat to a channel immediately creates a runtime session in the channel cwd', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Session Spawn',
        topic: 'Verify assignment spawns a session.',
        repoPath: 'C:/repo/cats',
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Agent-Spawn',
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const createCatPayload = await createCatResponse.json();
    const catId = createCatPayload.cat.id;

    const assignResponse = await fetch(`${baseUrl}/api/channels/${channelId}/cats/${catId}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(assignResponse.status, 201);
    const assignPayload = await assignResponse.json();

    assert.equal(runtimeClient.createdSessions.length, 1);
    assert.equal(runtimeClient.createdSessions[0].cwd, 'C:/repo/cats');
    assert.equal(assignPayload.cat.execution.lease.sessionId, 'session-1');
    assert.equal(assignPayload.cat.execution.lease.cwd, 'C:/repo/cats');

    const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
    assert.equal(channelResponse.status, 200);
    const channelPayload = await channelResponse.json();
    const sessionStartedMessage = channelPayload.channel.messages.find(
      (message) => message.metadata?.event === 'session_started' && message.metadata?.targetId === catId,
    );
    assert.ok(sessionStartedMessage);
    assert.equal(
      sessionStartedMessage.body,
      'Agent-Spawn connected to cats-runtime session session-1 (cwd: C:/repo/cats).',
    );
  });
});

test('assigning a cat without a channel cwd defers session creation until Boss Cat activation establishes one', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Deferred Session Spawn',
        topic: 'Wait for Boss Cat to anchor the workspace first.',
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Agent-Deferred',
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const createCatPayload = await createCatResponse.json();
    const catId = createCatPayload.cat.id;

    const assignResponse = await fetch(`${baseUrl}/api/channels/${channelId}/cats/${catId}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(assignResponse.status, 201);
    const assignPayload = await assignResponse.json();

    assert.equal(runtimeClient.createdSessions.length, 0);
    assert.equal(assignPayload.cat.execution.lease.sessionId, null);
    assert.equal(assignPayload.cat.execution.lease.cwd, null);

    const activateResponse = await fetch(`${baseUrl}/api/channels/${channelId}/activations`, {
      method: 'POST',
    });
    assert.equal(activateResponse.status, 200);
    const activatePayload = await activateResponse.json();

    assert.equal(runtimeClient.createdSessions.length, 2);
    assert.equal(runtimeClient.createdSessions[0].cwd, null);
    assert.equal(runtimeClient.createdSessions[1].cwd, 'C:/workspace/runtime');
    assert.equal(activatePayload.activation.results[0].targetKind, 'orchestrator');
    assert.equal(activatePayload.activation.results[1].targetKind, 'pal');
  });
});

test('attachment uploads sanitize names and avoid overwriting earlier files', async () => {
  const runtimeClient = createRuntimeStub();
  const tempWorkspace = await mkdtemp(path.join(os.tmpdir(), 'cats-attachments-'));

  try {
    await withServer(runtimeClient, async (baseUrl) => {
      const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Attachment Uploads',
          topic: 'Verify unique attachment names.',
          repoPath: tempWorkspace,
          skipBossCatGreeting: true,
        }),
      });
      assert.equal(createChannelResponse.status, 201);
      const createChannelPayload = await createChannelResponse.json();
      const channelId = createChannelPayload.channel.id;

      const uploadResponse = await fetch(`${baseUrl}/api/channels/${channelId}/attachments`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          files: [
            { name: 'notes.txt', data: Buffer.from('first').toString('base64') },
            { name: '../notes.txt', data: Buffer.from('second').toString('base64') },
            { name: '..', data: Buffer.from('third').toString('base64') },
          ],
        }),
      });
      assert.equal(uploadResponse.status, 200);
      const uploadPayload = await uploadResponse.json();

      assert.deepEqual(
        uploadPayload.attachments.map((attachment) => attachment.relativePath),
        [
          '.cats-attachments/notes.txt',
          '.cats-attachments/notes-2.txt',
          '.cats-attachments/attachment',
        ],
      );

      const firstContent = await readFile(path.join(tempWorkspace, '.cats-attachments', 'notes.txt'), 'utf8');
      const secondContent = await readFile(path.join(tempWorkspace, '.cats-attachments', 'notes-2.txt'), 'utf8');
      const thirdContent = await readFile(path.join(tempWorkspace, '.cats-attachments', 'attachment'), 'utf8');

      assert.equal(firstContent, 'first');
      assert.equal(secondContent, 'second');
      assert.equal(thirdContent, 'third');
    });
  } finally {
    await rm(tempWorkspace, { recursive: true, force: true });
  }
});

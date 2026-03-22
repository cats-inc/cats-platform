import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../dist-server/server.js';
import { UUID_PATTERN } from '../dist-server/shared/channelPaths.js';
import { createSharedCoreFixtureBundle } from '../dist-server/shared/core.js';
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

async function withServer(runtimeClient, callback, chatStore = new MemoryChatStore()) {
  const server = createServer({
    config: baseConfig,
    runtimeClient,
    chatStore,
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

test('GET /api/app-shell exposes detailed chat state with global cats', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.app.name, 'cats');
    assert.equal(payload.chat.name, 'Chat');
    assert.equal(payload.chat.selectedChannelId, '');
    assert.equal(payload.chat.channels.length, 0);
    assert.equal(payload.chat.cats.length, 0);
    assert.equal(payload.chat.selectedChannel, null);
    assert.equal(payload.chat.capabilities.mentions, 'basic');
    assert.equal(payload.chat.capabilities.transcriptExport, true);
  });
});

test('GET /api/core endpoints expose the shared Cats Core contract', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const stateResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(stateResponse.status, 200);
    const statePayload = await stateResponse.json();
    assert.equal(statePayload.version, 4);
    assert.equal(statePayload.ownerProfile.actorId, 'actor-owner');
    assert.ok(Array.isArray(statePayload.actors));
    assert.ok(Array.isArray(statePayload.conversations));
    assert.ok(Array.isArray(statePayload.projects));
    assert.ok(Array.isArray(statePayload.workItems));
    assert.ok(Array.isArray(statePayload.tasks));
    assert.ok(Array.isArray(statePayload.runs));
    assert.ok(Array.isArray(statePayload.traces));
    assert.ok(Array.isArray(statePayload.checkpoints));
    assert.ok(Array.isArray(statePayload.outcomes));
    assert.ok(Array.isArray(statePayload.artifacts));
    assert.ok(Array.isArray(statePayload.activities));
    assert.ok(Array.isArray(statePayload.approvalBindings));

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

test('core write APIs persist shared project, work, approval, trace, artifact, and owner records', async () => {
  const chatStore = new MemoryChatStore();
  const fixtures = createSharedCoreFixtureBundle();

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
      body: JSON.stringify({ task: fixtures.task }),
    });
    assert.equal(taskResponse.status, 201);
    const taskPayload = await taskResponse.json();
    assert.equal(taskPayload.task.id, fixtures.task.id);

    const projectResponse = await fetch(`${baseUrl}/api/core/projects`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ project: fixtures.project }),
    });
    assert.equal(projectResponse.status, 201);

    const workItemResponse = await fetch(`${baseUrl}/api/core/work-items`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ workItem: fixtures.workItem }),
    });
    assert.equal(workItemResponse.status, 201);

    const approvalResponse = await fetch(`${baseUrl}/api/core/approvals`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(fixtures.approvalDecision),
    });
    assert.equal(approvalResponse.status, 200);
    const approvalPayload = await approvalResponse.json();
    assert.equal(approvalPayload.task.approval.status, 'pending');
    assert.equal(approvalPayload.queueItem.taskId, fixtures.task.id);

    const traceResponse = await fetch(`${baseUrl}/api/core/traces`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ trace: fixtures.trace }),
    });
    assert.equal(traceResponse.status, 201);
    const tracePayload = await traceResponse.json();
    assert.equal(tracePayload.trace.id, fixtures.trace.id);

    const checkpointResponse = await fetch(`${baseUrl}/api/core/checkpoints`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ checkpoint: fixtures.checkpoint }),
    });
    assert.equal(checkpointResponse.status, 201);
    const checkpointPayload = await checkpointResponse.json();
    assert.equal(checkpointPayload.checkpoint.id, fixtures.checkpoint.id);

    const runResponse = await fetch(`${baseUrl}/api/core/runs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ run: fixtures.run }),
    });
    assert.equal(runResponse.status, 201);
    const runPayload = await runResponse.json();
    assert.equal(runPayload.run.id, fixtures.run.id);

    const outcomeResponse = await fetch(`${baseUrl}/api/core/outcomes`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ outcome: fixtures.outcome }),
    });
    assert.equal(outcomeResponse.status, 201);
    const outcomePayload = await outcomeResponse.json();
    assert.equal(outcomePayload.outcome.id, fixtures.outcome.id);

    const artifactResponse = await fetch(`${baseUrl}/api/core/artifacts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ artifact: fixtures.artifact }),
    });
    assert.equal(artifactResponse.status, 201);

    const activityResponse = await fetch(`${baseUrl}/api/core/activities`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ activity: fixtures.activity }),
    });
    assert.equal(activityResponse.status, 201);

    const approvalBindingResponse = await fetch(`${baseUrl}/api/core/approval-bindings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ approvalBinding: fixtures.approvalBinding }),
    });
    assert.equal(approvalBindingResponse.status, 201);

    const approvalsListResponse = await fetch(`${baseUrl}/api/core/approvals`);
    assert.equal(approvalsListResponse.status, 200);
    const approvalsListPayload = await approvalsListResponse.json();
    assert.equal(approvalsListPayload.approvals.length, 1);

    const stateResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(stateResponse.status, 200);
    const statePayload = await stateResponse.json();
    assert.equal(statePayload.ownerProfile.displayName, 'Boss Owner');
    assert.ok(statePayload.projects.some((project) => project.id === fixtures.project.id));
    assert.ok(statePayload.workItems.some((workItem) => workItem.id === fixtures.workItem.id));
    assert.ok(statePayload.tasks.some((task) => task.id === fixtures.task.id));
    assert.ok(statePayload.runs.some((run) => run.id === fixtures.run.id));
    assert.ok(statePayload.traces.some((trace) => trace.id === fixtures.trace.id));
    assert.ok(
      statePayload.checkpoints.some((checkpoint) => checkpoint.id === fixtures.checkpoint.id),
    );
    assert.ok(statePayload.outcomes.some((outcome) => outcome.id === fixtures.outcome.id));
    assert.ok(statePayload.artifacts.some((artifact) => artifact.id === fixtures.artifact.id));
    assert.ok(statePayload.activities.some((activity) => activity.id === fixtures.activity.id));
    assert.ok(
      statePayload.approvalBindings.some(
        (approvalBinding) => approvalBinding.id === fixtures.approvalBinding.id,
      ),
    );
  }, chatStore);
});

test('core approval write returns 409 for invalid terminal-to-pending transition', async () => {
  const chatStore = new MemoryChatStore();

  await withServer(createRuntimeStub(), async (baseUrl) => {
    const taskResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          id: 'task-system-invalid-transition',
          title: 'Invalid transition guard',
          status: 'pending_approval',
        },
      }),
    });
    assert.equal(taskResponse.status, 201);

    const pendingResponse = await fetch(`${baseUrl}/api/core/approvals`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        taskId: 'task-system-invalid-transition',
        status: 'pending',
      }),
    });
    assert.equal(pendingResponse.status, 200);

    const approvedResponse = await fetch(`${baseUrl}/api/core/approvals`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        taskId: 'task-system-invalid-transition',
        status: 'approved',
        decidedByActorId: 'actor-owner',
      }),
    });
    assert.equal(approvedResponse.status, 200);

    const invalidResponse = await fetch(`${baseUrl}/api/core/approvals`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        taskId: 'task-system-invalid-transition',
        status: 'pending',
      }),
    });
    assert.equal(invalidResponse.status, 409);
    const invalidPayload = await invalidResponse.json();
    assert.equal(invalidPayload.error.code, 'approval_transition_invalid');
  }, chatStore);
});

test('core artifact and activity writes enforce non-negative sizeBytes and append-only ids', async () => {
  const chatStore = new MemoryChatStore();
  const fixtures = createSharedCoreFixtureBundle();

  await withServer(createRuntimeStub(), async (baseUrl) => {
    const artifactResponse = await fetch(`${baseUrl}/api/core/artifacts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        artifact: {
          ...fixtures.artifact,
          id: 'artifact-invalid-size',
          sizeBytes: -1,
        },
      }),
    });
    assert.equal(artifactResponse.status, 400);

    const taskResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ task: fixtures.task }),
    });
    assert.equal(taskResponse.status, 201);

    const firstActivityResponse = await fetch(`${baseUrl}/api/core/activities`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ activity: fixtures.activity }),
    });
    assert.equal(firstActivityResponse.status, 201);

    const duplicateActivityResponse = await fetch(`${baseUrl}/api/core/activities`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ activity: fixtures.activity }),
    });
    assert.equal(duplicateActivityResponse.status, 409);
    const duplicateActivityPayload = await duplicateActivityResponse.json();
    assert.equal(duplicateActivityPayload.error.code, 'activity_already_exists');
  }, chatStore);
});

test('core approval bindings require an existing approval task', async () => {
  const chatStore = new MemoryChatStore();
  const fixtures = createSharedCoreFixtureBundle();

  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/core/approval-bindings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ approvalBinding: fixtures.approvalBinding }),
    });
    assert.equal(response.status, 404);
    const payload = await response.json();
    assert.equal(payload.error.code, 'task_not_found');
  }, chatStore);
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

test('GET /api/shell/browse lists subdirectories for the folder browser modal', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats-folder-browser-'));
  const alphaDir = path.join(root, 'alpha');
  const betaDir = path.join(root, 'beta');
  const hiddenDir = path.join(root, '.hidden');
  const filePath = path.join(root, 'notes.txt');

  await mkdir(alphaDir);
  await mkdir(betaDir);
  await mkdir(hiddenDir);
  await writeFile(filePath, 'not a directory');

  try {
    await withServer(createRuntimeStub(), async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/shell/browse?path=${encodeURIComponent(root)}`,
      );
      assert.equal(response.status, 200);

      const payload = await response.json();
      assert.equal(payload.current, root);
      assert.equal(payload.parent, path.dirname(root));
      assert.equal(payload.error, undefined);
      assert.deepEqual(
        payload.entries.map((entry) => entry.name),
        ['alpha', 'beta'],
      );
      assert.deepEqual(
        payload.entries.map((entry) => entry.path),
        [alphaDir, betaDir],
      );
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
        topic: 'Wait for Boss Cat to anchor the chat first.',
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
    assert.equal(runtimeClient.createdSessions[1].cwd, 'C:/chat/runtime');
    assert.equal(activatePayload.activation.results[0].targetKind, 'orchestrator');
    assert.equal(activatePayload.activation.results[1].targetKind, 'cat');
  });
});

test('attachment uploads sanitize names and avoid overwriting earlier files', async () => {
  const runtimeClient = createRuntimeStub();
  const tempWorkingDir = await mkdtemp(path.join(os.tmpdir(), 'cats-attachments-'));

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
          repoPath: tempWorkingDir,
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

      const firstContent = await readFile(path.join(tempWorkingDir, '.cats-attachments', 'notes.txt'), 'utf8');
      const secondContent = await readFile(path.join(tempWorkingDir, '.cats-attachments', 'notes-2.txt'), 'utf8');
      const thirdContent = await readFile(path.join(tempWorkingDir, '.cats-attachments', 'attachment'), 'utf8');

      assert.equal(firstContent, 'first');
      assert.equal(secondContent, 'second');
      assert.equal(thirdContent, 'third');
    });
  } finally {
    await rm(tempWorkingDir, { recursive: true, force: true });
  }
});




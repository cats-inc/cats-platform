import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import { MemoryCoreStore } from '../build/server/core/store.js';
import {
  createDefaultCoreState,
  upsertCoreApprovalBinding,
  upsertCoreTask,
} from '../build/server/core/model/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';

const baseConfig = {
  host: '127.0.0.1',
  port: 8181,
  runtimeBaseUrl: 'http://127.0.0.1:3110',
  runtimeApiKey: '',
  chatStatePath: 'unused-for-tests',
};

function createRuntimeStub() {
  return {
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
    async createSession() {
      return {
        id: 'session-stub',
        provider: 'claude',
        model: 'claude-default',
        status: 'ready',
        cwd: path.join(os.tmpdir(), '.cats', 'runtime', 'sessions', 'session-stub'),
      };
    },
    async sendMessage() {
      return {
        segments: [{ kind: 'text', text: 'stub', toolName: null, toolId: null }],
        inputTokens: 0,
        outputTokens: 0,
        tokensUsed: 0,
      };
    },
    async closeSession() {},
    async deleteSession() {
      return { action: 'delete', sessionId: 'session-stub', status: 'deleted' };
    },
  };
}

function createCoreState() {
  let core = createDefaultCoreState();

  core = upsertCoreTask(
    core,
    {
      id: 'task-1',
      title: 'Primary task',
      status: 'in_progress',
      conversationId: 'conversation-1',
      parentTaskId: 'task-parent',
      ownerActorId: 'actor-owner',
      orchestratorActorId: 'actor-orchestrator',
      assignedActorIds: ['actor-worker'],
      approval: {
        status: 'approved',
        decisionAction: 'approve',
      },
      createdAt: '2026-04-15T05:10:00.000Z',
    },
    new Date('2026-04-15T05:10:00.000Z'),
  ).core;

  core = upsertCoreTask(
    core,
    {
      id: 'task-2',
      title: 'Secondary task',
      status: 'blocked',
      conversationId: 'conversation-2',
      ownerActorId: 'actor-owner',
      assignedActorIds: ['actor-reviewer'],
      approval: {
        status: 'pending',
      },
      createdAt: '2026-04-15T05:11:00.000Z',
    },
    new Date('2026-04-15T05:11:00.000Z'),
  ).core;

  core = upsertCoreApprovalBinding(
    core,
    {
      id: 'approval-binding-1',
      kind: 'owner_decision',
      approvalTaskId: 'task-1',
      subjectKind: 'task',
      subjectId: 'task-1',
      projectId: 'project-1',
      workItemId: 'work-item-1',
      conversationId: 'conversation-1',
      requestedByActorId: 'actor-orchestrator',
      requestedForActorId: 'actor-owner',
      createdAt: '2026-04-15T05:12:00.000Z',
    },
    new Date('2026-04-15T05:12:00.000Z'),
  ).core;

  return core;
}

async function withServer(callback) {
  const tempStateDir = await mkdtemp(path.join(os.tmpdir(), 'cats-core-governance-task-'));
  const core = createCoreState();
  const chatStore = new MemoryChatStore();
  const sharedCoreStore = new MemoryCoreStore(core);
  await chatStore.writeCore(core);
  const server = createServer({
    shared: {
      config: {
        ...baseConfig,
        chatStatePath: path.join(tempStateDir, 'platform', 'state', 'chat-state.local.json'),
        runtimeDataDir: path.join(tempStateDir, 'runtime-data'),
      },
      runtimeClient: createRuntimeStub(),
      now: () => new Date('2026-04-15T05:10:00.000Z'),
      coreStore: sharedCoreStore,
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
    await sharedCoreStore.writeCore(core);
    await chatStore.writeCore(core);
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
    await rm(tempStateDir, { recursive: true, force: true });
  }
}

test('core task and governance routes support filtered raw record queries', async () => {
  await withServer(async (baseUrl) => {
    const taskResponse = await fetch(
      `${baseUrl}/api/core/tasks?id=task-1&status=in_progress&conversationId=conversation-1&parentTaskId=task-parent&ownerActorId=actor-owner&orchestratorActorId=actor-orchestrator&assignedActorId=actor-worker&approvalStatus=approved&approvalDecisionAction=approve`,
    );
    assert.equal(taskResponse.status, 200);
    const taskPayload = await taskResponse.json();
    assert.equal(taskPayload.tasks.length, 1);
    assert.equal(taskPayload.tasks[0].id, 'task-1');

    const approvalBindingResponse = await fetch(
      `${baseUrl}/api/core/approval-bindings?id=approval-binding-1&kind=owner_decision&subjectKind=task&approvalTaskId=task-1&subjectId=task-1&projectId=project-1&workItemId=work-item-1&conversationId=conversation-1&requestedByActorId=actor-orchestrator&requestedForActorId=actor-owner`,
    );
    assert.equal(approvalBindingResponse.status, 200);
    const approvalBindingPayload = await approvalBindingResponse.json();
    assert.equal(approvalBindingPayload.approvalBindings.length, 1);
    assert.equal(approvalBindingPayload.approvalBindings[0].id, 'approval-binding-1');
  });
});

test('core task and governance routes reject invalid raw record filters with structured 400 responses', async () => {
  await withServer(async (baseUrl) => {
    const taskResponse = await fetch(`${baseUrl}/api/core/tasks?status=waiting`);
    assert.equal(taskResponse.status, 400);
    const taskPayload = await taskResponse.json();
    assert.equal(taskPayload.error.code, 'bad_request');
    assert.match(taskPayload.error.message, /status must be one of/i);

    const approvalBindingResponse = await fetch(
      `${baseUrl}/api/core/approval-bindings?kind=manual_gate`,
    );
    assert.equal(approvalBindingResponse.status, 400);
    const approvalBindingPayload = await approvalBindingResponse.json();
    assert.equal(approvalBindingPayload.error.code, 'bad_request');
    assert.match(approvalBindingPayload.error.message, /kind must be one of/i);
  });
});

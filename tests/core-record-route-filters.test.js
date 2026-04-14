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
  upsertCoreActor,
  upsertCoreArtifact,
  upsertCoreMission,
  upsertCoreProject,
  upsertCoreWorkItem,
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

  core = upsertCoreActor(
    core,
    {
      id: 'actor-1',
      name: 'Ops Cat',
      kind: 'worker',
      status: 'active',
      roles: ['planner', 'reviewer'],
      defaultExecutionTarget: {
        provider: 'claude',
        instance: 'default',
        model: 'claude-default',
      },
      memory: {
        summary: 'Has durable memory',
        facts: ['f1'],
        openLoops: [],
        updatedAt: '2026-04-15T04:20:01.000Z',
      },
      source: 'core_record',
      sourceId: 'ops-cat',
      createdAt: '2026-04-15T04:20:00.000Z',
    },
    new Date('2026-04-15T04:20:00.000Z'),
  ).core;

  core = upsertCoreActor(
    core,
    {
      id: 'actor-2',
      name: 'Chat Cat',
      kind: 'bot',
      status: 'archived',
      roles: ['assistant'],
      source: 'chat_cat',
      sourceId: 'chat-bot',
      createdAt: '2026-04-15T04:21:00.000Z',
    },
    new Date('2026-04-15T04:21:00.000Z'),
  ).core;

  core = upsertCoreMission(
    core,
    {
      id: 'mission-1',
      managedWorkId: 'work-item-1',
      conversationId: 'conversation-1',
      sourceTurnId: 'turn-1',
      sourceLaneId: 'lane-1',
      assignedAgentId: 'actor-1',
      title: 'Primary mission',
      status: 'running',
      createdAt: '2026-04-15T04:22:00.000Z',
      metadata: {
        runId: 'run-1',
      },
    },
    new Date('2026-04-15T04:22:00.000Z'),
  ).core;

  core = upsertCoreMission(
    core,
    {
      id: 'mission-2',
      managedWorkId: 'work-item-2',
      conversationId: 'conversation-2',
      sourceTurnId: 'turn-2',
      sourceLaneId: 'lane-2',
      assignedAgentId: 'actor-2',
      title: 'Queued mission',
      status: 'queued',
      createdAt: '2026-04-15T04:23:00.000Z',
    },
    new Date('2026-04-15T04:23:00.000Z'),
  ).core;

  core = upsertCoreProject(
    core,
    {
      id: 'project-1',
      title: 'Project one',
      status: 'active',
      ownerActorId: 'actor-owner',
      primaryConversationId: 'conversation-1',
      repoPath: 'C:/repo-one',
      createdAt: '2026-04-15T04:24:00.000Z',
    },
    new Date('2026-04-15T04:24:00.000Z'),
  ).core;

  core = upsertCoreWorkItem(
    core,
    {
      id: 'work-item-1',
      title: 'Work item one',
      status: 'in_progress',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      taskId: 'task-1',
      ownerActorId: 'actor-owner',
      assignedActorIds: ['actor-1'],
      createdAt: '2026-04-15T04:25:00.000Z',
    },
    new Date('2026-04-15T04:25:00.000Z'),
  ).core;

  core = upsertCoreArtifact(
    core,
    {
      id: 'artifact-1',
      title: 'Artifact one',
      kind: 'document',
      status: 'ready',
      projectId: 'project-1',
      workItemId: 'work-item-1',
      conversationId: 'conversation-1',
      taskId: 'task-1',
      runId: 'run-1',
      mimeType: 'text/markdown',
      createdAt: '2026-04-15T04:26:00.000Z',
    },
    new Date('2026-04-15T04:26:00.000Z'),
  ).core;

  return core;
}

async function withServer(callback) {
  const tempStateDir = await mkdtemp(path.join(os.tmpdir(), 'cats-core-record-'));
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
      now: () => new Date('2026-04-15T04:20:00.000Z'),
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

test('core record routes support filtered actor and mission queries', async () => {
  await withServer(async (baseUrl) => {
    const actorsResponse = await fetch(
      `${baseUrl}/api/core/actors?actorKind=worker&status=active&source=core_record&role=planner&hasDefaultExecutionTarget=true&hasMemory=true`,
    );
    assert.equal(actorsResponse.status, 200);
    const actorsPayload = await actorsResponse.json();
    assert.equal(actorsPayload.actors.length, 1);
    assert.equal(actorsPayload.actors[0].id, 'actor-1');

    const missionsResponse = await fetch(
      `${baseUrl}/api/core/missions?managedWorkId=work-item-1&conversationId=conversation-1&sourceTurnId=turn-1&sourceLaneId=lane-1&assignedAgentId=actor-1&status=running&runId=run-1`,
    );
    assert.equal(missionsResponse.status, 200);
    const missionsPayload = await missionsResponse.json();
    assert.equal(missionsPayload.missions.length, 1);
    assert.equal(missionsPayload.missions[0].id, 'mission-1');
  });
});

test('core record routes reject invalid actor and mission filters with structured 400 responses', async () => {
  await withServer(async (baseUrl) => {
    const actorsResponse = await fetch(`${baseUrl}/api/core/actors?actorKind=ghost`);
    assert.equal(actorsResponse.status, 400);
    const actorsPayload = await actorsResponse.json();
    assert.equal(actorsPayload.error.code, 'bad_request');
    assert.match(actorsPayload.error.message, /actorKind must be one of/i);

    const missionsResponse = await fetch(`${baseUrl}/api/core/missions?status=paused`);
    assert.equal(missionsResponse.status, 400);
    const missionsPayload = await missionsResponse.json();
    assert.equal(missionsPayload.error.code, 'bad_request');
    assert.match(missionsPayload.error.message, /status must be one of/i);
  });
});

test('core record routes support filtered project, work item, and artifact queries', async () => {
  await withServer(async (baseUrl) => {
    const projectsResponse = await fetch(
      `${baseUrl}/api/core/projects?status=active&ownerActorId=actor-owner&primaryConversationId=conversation-1&repoPath=C:/repo-one`,
    );
    assert.equal(projectsResponse.status, 200);
    const projectsPayload = await projectsResponse.json();
    assert.equal(projectsPayload.projects.length, 1);
    assert.equal(projectsPayload.projects[0].id, 'project-1');

    const workItemsResponse = await fetch(
      `${baseUrl}/api/core/work-items?status=in_progress&projectId=project-1&conversationId=conversation-1&taskId=task-1&ownerActorId=actor-owner&assignedActorId=actor-1`,
    );
    assert.equal(workItemsResponse.status, 200);
    const workItemsPayload = await workItemsResponse.json();
    assert.equal(workItemsPayload.workItems.length, 1);
    assert.equal(workItemsPayload.workItems[0].id, 'work-item-1');

    const artifactsResponse = await fetch(
      `${baseUrl}/api/core/artifacts?kind=document&status=ready&projectId=project-1&workItemId=work-item-1&conversationId=conversation-1&taskId=task-1&runId=run-1&mimeType=text/markdown`,
    );
    assert.equal(artifactsResponse.status, 200);
    const artifactsPayload = await artifactsResponse.json();
    assert.equal(artifactsPayload.artifacts.length, 1);
    assert.equal(artifactsPayload.artifacts[0].id, 'artifact-1');
  });
});

test('core record routes reject invalid project, work item, and artifact filters with structured 400 responses', async () => {
  await withServer(async (baseUrl) => {
    const projectsResponse = await fetch(`${baseUrl}/api/core/projects?status=running`);
    assert.equal(projectsResponse.status, 400);
    const projectsPayload = await projectsResponse.json();
    assert.equal(projectsPayload.error.code, 'bad_request');
    assert.match(projectsPayload.error.message, /status must be one of/i);

    const workItemsResponse = await fetch(`${baseUrl}/api/core/work-items?status=waiting`);
    assert.equal(workItemsResponse.status, 400);
    const workItemsPayload = await workItemsResponse.json();
    assert.equal(workItemsPayload.error.code, 'bad_request');
    assert.match(workItemsPayload.error.message, /status must be one of/i);

    const artifactsResponse = await fetch(`${baseUrl}/api/core/artifacts?kind=binary`);
    assert.equal(artifactsResponse.status, 400);
    const artifactsPayload = await artifactsResponse.json();
    assert.equal(artifactsPayload.error.code, 'bad_request');
    assert.match(artifactsPayload.error.message, /kind must be one of/i);
  });
});

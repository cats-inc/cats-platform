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
  upsertCoreConversation,
  upsertCoreMission,
  upsertCoreParticipant,
  upsertCoreProject,
  upsertCoreRun,
  upsertCoreSession,
  upsertCoreTask,
  upsertCoreTransportBinding,
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

function createProjectionCoreState() {
  let core = createDefaultCoreState();

  core = upsertCoreActor(
    core,
    {
      id: 'actor-agent-1',
      name: 'Ops Cat',
      kind: 'worker',
      source: 'core_record',
      createdAt: '2026-04-15T00:59:59.000Z',
    },
    new Date('2026-04-15T00:59:59.000Z'),
  ).core;

  core = upsertCoreActor(
    core,
    {
      id: 'actor-agent-2',
      name: 'Review Cat',
      kind: 'worker',
      source: 'core_record',
      createdAt: '2026-04-15T00:59:59.500Z',
    },
    new Date('2026-04-15T00:59:59.500Z'),
  ).core;

  core = upsertCoreConversation(
    core,
    {
      id: 'conversation-1',
      title: 'Primary conversation',
      kind: 'work_thread',
      status: 'active',
      participantActorIds: ['actor-owner'],
      createdAt: '2026-04-15T01:00:00.000Z',
    },
    new Date('2026-04-15T01:00:00.000Z'),
  ).core;

  core = upsertCoreConversation(
    core,
    {
      id: 'conversation-2',
      title: 'Secondary conversation',
      kind: 'code_thread',
      status: 'active',
      participantActorIds: ['actor-owner'],
      createdAt: '2026-04-15T01:00:01.000Z',
    },
    new Date('2026-04-15T01:00:01.000Z'),
  ).core;

  core = upsertCoreProject(
    core,
    {
      id: 'project-1',
      title: 'Primary project',
      createdAt: '2026-04-15T01:00:02.000Z',
    },
    new Date('2026-04-15T01:00:02.000Z'),
  ).core;

  core = upsertCoreTask(
    core,
    {
      id: 'task-1',
      title: 'Tracked task',
      conversationId: 'conversation-1',
      ownerActorId: 'actor-owner',
      createdAt: '2026-04-15T01:00:03.000Z',
    },
    new Date('2026-04-15T01:00:03.000Z'),
  ).core;

  core = upsertCoreParticipant(
    core,
    {
      id: 'participant-1',
      conversationId: 'conversation-1',
      agentId: 'actor-agent-1',
      status: 'active',
      joinedAt: '2026-04-15T01:00:03.500Z',
    },
    new Date('2026-04-15T01:00:03.500Z'),
  ).core;

  core = upsertCoreWorkItem(
    core,
    {
      id: 'work-item-1',
      title: 'Tracked work item',
      taskId: 'task-1',
      conversationId: 'conversation-1',
      projectId: 'project-1',
      ownerActorId: 'actor-owner',
      createdAt: '2026-04-15T01:00:04.000Z',
    },
    new Date('2026-04-15T01:00:04.000Z'),
  ).core;

  core = upsertCoreWorkItem(
    core,
    {
      id: 'work-item-2',
      title: 'Untracked work item',
      conversationId: 'conversation-2',
      ownerActorId: 'actor-other',
      status: 'blocked',
      createdAt: '2026-04-15T01:00:05.000Z',
    },
    new Date('2026-04-15T01:00:05.000Z'),
  ).core;

  core = upsertCoreRun(
    core,
    {
      id: 'run-1',
      title: 'Successful run',
      conversationId: 'conversation-1',
      taskId: 'task-1',
      status: 'running',
      createdAt: '2026-04-15T01:00:06.000Z',
      startedAt: '2026-04-15T01:00:06.000Z',
    },
    new Date('2026-04-15T01:00:06.000Z'),
  ).core;

  core = upsertCoreMission(
    core,
    {
      id: 'mission-1',
      managedWorkId: 'work-item-1',
      conversationId: 'conversation-1',
      assignedAgentId: 'actor-agent-1',
      title: 'Primary mission',
      status: 'running',
      createdAt: '2026-04-15T01:00:07.000Z',
      metadata: {
        runId: 'run-1',
      },
    },
    new Date('2026-04-15T01:00:07.000Z'),
  ).core;

  core = upsertCoreMission(
    core,
    {
      id: 'mission-2',
      managedWorkId: 'work-item-2',
      conversationId: 'conversation-2',
      assignedAgentId: 'actor-agent-2',
      title: 'Queued mission',
      status: 'queued',
      createdAt: '2026-04-15T01:00:08.000Z',
    },
    new Date('2026-04-15T01:00:08.000Z'),
  ).core;

  core = upsertCoreTransportBinding(
    core,
    {
      id: 'transport-binding-1',
      platform: 'telegram',
      direction: 'bidirectional',
      conversationId: 'conversation-1',
      agentId: 'actor-agent-1',
      externalThreadKey: 'telegram:1',
      status: 'active',
      createdAt: '2026-04-15T01:00:09.000Z',
    },
    new Date('2026-04-15T01:00:09.000Z'),
  ).core;

  core = upsertCoreTransportBinding(
    core,
    {
      id: 'transport-binding-2',
      platform: 'web',
      direction: 'bidirectional',
      conversationId: 'conversation-2',
      agentId: 'actor-agent-2',
      externalThreadKey: 'web:2',
      status: 'disabled',
      createdAt: '2026-04-15T01:00:10.000Z',
    },
    new Date('2026-04-15T01:00:10.000Z'),
  ).core;

  core = upsertCoreSession(
    core,
    {
      id: 'session-1',
      conversationId: 'conversation-1',
      participantId: 'participant-1',
      agentId: 'actor-agent-1',
      transportBindingId: 'transport-binding-1',
      status: 'active',
      createdAt: '2026-04-15T01:00:11.000Z',
      startedAt: '2026-04-15T01:00:11.000Z',
    },
    new Date('2026-04-15T01:00:11.000Z'),
  ).core;

  return core;
}

async function withServer(callback) {
  const tempStateDir = await mkdtemp(path.join(os.tmpdir(), 'cats-core-projection-'));
  const core = createProjectionCoreState();
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
      now: () => new Date('2026-04-15T01:00:00.000Z'),
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

test('projection routes support filtered control-plane queries', async () => {
  await withServer(async (baseUrl) => {
    const managedWorkResponse = await fetch(
      `${baseUrl}/api/core/managed-work?ownerActorId=actor-owner&hasRun=true`,
    );
    assert.equal(managedWorkResponse.status, 200);
    const managedWorkPayload = await managedWorkResponse.json();
    assert.equal(managedWorkPayload.items.length, 1);
    assert.equal(managedWorkPayload.items[0].workItem.id, 'work-item-1');

    const missionRunsResponse = await fetch(
      `${baseUrl}/api/core/mission-runs?assignedAgentId=actor-agent-2&missionStatus=queued`,
    );
    assert.equal(missionRunsResponse.status, 200);
    const missionRunsPayload = await missionRunsResponse.json();
    assert.equal(missionRunsPayload.items.length, 1);
    assert.equal(missionRunsPayload.items[0].mission.id, 'mission-2');

    const actorWorkloadResponse = await fetch(
      `${baseUrl}/api/core/actor-workload?actorKind=worker&hasMission=true&hasActiveSession=true`,
    );
    assert.equal(actorWorkloadResponse.status, 200);
    const actorWorkloadPayload = await actorWorkloadResponse.json();
    assert.equal(actorWorkloadPayload.items.length, 1);
    assert.equal(actorWorkloadPayload.items[0].actor.id, 'actor-agent-1');

    const transportStateResponse = await fetch(
      `${baseUrl}/api/core/transport-state?platform=telegram&activeSession=true`,
    );
    assert.equal(transportStateResponse.status, 200);
    const transportStatePayload = await transportStateResponse.json();
    assert.equal(transportStatePayload.items.length, 1);
    assert.equal(transportStatePayload.items[0].transportBinding.id, 'transport-binding-1');
  });
});

test('projection routes reject invalid filter enums with structured 400 responses', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/core/transport-state?platform=discord`);
    assert.equal(response.status, 400);

    const payload = await response.json();
    assert.equal(payload.error.code, 'bad_request');
    assert.match(payload.error.message, /platform must be one of/i);
  });
});

import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { persistCatAssignmentUpdate } from '../build/server/products/chat/api/routeSupport.js';
import {
  createCat,
  createChannel,
  setChannelOrchestratorLease,
} from '../build/server/products/chat/state/model/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';

function createRuntimeStub() {
  const createdSessions = [];
  return {
    createdSessions,
    async createSession(input) {
      createdSessions.push(input);
      return {
        id: 'session-new-cat',
        provider: input.provider,
        model: input.model ?? null,
        status: 'ready',
        cwd: input.cwd,
      };
    },
    async closeSession() {},
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
        models: [{ id: `${provider}-default`, label: `${provider} default`, default: true }],
        warnings: [],
      };
    },
  };
}

test('persistCatAssignmentUpdate starts new cat sessions from the orchestrator attachment cwd', async () => {
  const chatStore = new MemoryChatStore();
  const runtimeClient = createRuntimeStub();
  const now = new Date('2026-04-15T14:00:00.000Z');
  const orchestratorWorkspace = path.join(
    os.tmpdir(),
    '.cats',
    'runtime',
    'sessions',
    'orchestrator-live',
  );

  let state = await chatStore.read();
  state = createCat(state, { name: 'Companion', provider: 'claude' }, now);
  const catId = state.cats[0].id;
  state = createChannel(state, {
    title: 'Route support lane',
    topic: 'spawn new cat sessions from the orchestrator attachment cwd',
    skipBossCatGreeting: true,
  }, now);
  const channelId = state.selectedChannelId;
  state = setChannelOrchestratorLease(state, channelId, {
    status: 'ready',
    sessionId: 'session-orchestrator',
    laneId: 'lane-orchestrator',
    cwd: orchestratorWorkspace,
    provider: 'claude',
    model: 'claude-sonnet',
    startedAt: now.toISOString(),
  }, now);
  await chatStore.write(state);

  const { persisted, isNew } = await persistCatAssignmentUpdate(
    {
      dependencies: {
        config: {
          runtimeDataDir: path.join(os.tmpdir(), 'cats-route-support-runtime-data'),
        },
        runtimeClient,
        chatStore,
        companionStore: undefined,
        memoryService: undefined,
        now: () => now,
      },
    },
    channelId,
    {
      catId,
      provider: 'claude',
      roles: ['helper'],
    },
  );

  assert.equal(isNew, true);
  assert.equal(runtimeClient.createdSessions.length, 1);
  assert.equal(runtimeClient.createdSessions[0]?.cwd, orchestratorWorkspace);
  assert.equal(runtimeClient.createdSessions[0]?.workspaceKind, 'source');

  const channel = persisted.channels.find((candidate) => candidate.id === channelId);
  assert.ok(channel);
  const catAssignment = channel.catAssignments.find((candidate) => candidate.catId === catId);
  assert.ok(catAssignment);
  assert.equal(catAssignment.execution.lease.sessionId, 'session-new-cat');
  assert.equal(catAssignment.execution.lease.cwd, orchestratorWorkspace);
});

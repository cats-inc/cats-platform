import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  persistCatAssignmentRemoval,
  persistCatAssignmentUpdate,
} from '../build/server/products/chat/api/routeSupport.js';
import {
  buildChatConversationId,
  buildDirectLaneTransportBindingId,
  CHAT_ROOT_CONTAINER_ID,
} from '../build/server/shared/chatCoreIds.js';
import {
  assignCatToChannel,
  createCat,
  createChannel,
  setChannelCatLease,
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
  const sessionStarted = channel.messages.find((message) =>
    message.metadata?.event === 'session_started'
    && message.metadata?.sessionId === 'session-new-cat');
  assert.ok(sessionStarted);
  assert.equal(sessionStarted.metadata?.containerId, CHAT_ROOT_CONTAINER_ID);
  assert.equal(sessionStarted.metadata?.conversationId, buildChatConversationId(channelId));
});

test('persistCatAssignmentUpdate keeps direct-lane transport binding on session_start_failed metadata', async () => {
  const chatStore = new MemoryChatStore();
  const now = new Date('2026-04-15T14:05:00.000Z');
  const runtimeClient = {
    async createSession() {
      throw new Error('runtime create failed');
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

  let state = await chatStore.read();
  state = createCat(state, { name: 'Companion', provider: 'claude' }, now);
  const catId = state.cats[0].id;
  state = createChannel(state, {
    title: 'Route support direct lane failure',
    topic: 'keep direct-lane transport binding on session_start_failed metadata',
    roomMode: 'direct_cat_chat',
    repoPath: 'C:/repo/cats-platform',
    defaultRecipientId: catId,
    skipBossCatGreeting: true,
  }, now);
  const channelId = state.selectedChannelId;
  await chatStore.write(state);

  const { persisted } = await persistCatAssignmentUpdate(
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

  const channel = persisted.channels.find((candidate) => candidate.id === channelId);
  assert.ok(channel);
  const sessionStartFailed = channel.messages.find((message) =>
    message.metadata?.event === 'session_start_failed');
  assert.ok(sessionStartFailed);
  assert.equal(sessionStartFailed.metadata?.containerId, CHAT_ROOT_CONTAINER_ID);
  assert.equal(sessionStartFailed.metadata?.conversationId, buildChatConversationId(channelId));
  assert.equal(
    sessionStartFailed.metadata?.transportBindingId,
    buildDirectLaneTransportBindingId(channelId),
  );
});

test('persistCatAssignmentUpdate keeps direct-lane transport binding on session_close_failed metadata', async () => {
  const chatStore = new MemoryChatStore();
  const now = new Date('2026-04-16T10:00:00.000Z');
  const runtimeClient = {
    async createSession(input) {
      return {
        id: 'session-direct-close-replacement',
        provider: input.provider,
        model: input.model ?? null,
        status: 'ready',
        cwd: input.cwd ?? null,
      };
    },
    async closeSession() {
      throw new Error('runtime close failed');
    },
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

  let state = await chatStore.read();
  state = createCat(state, { name: 'Companion', provider: 'claude' }, now);
  const catId = state.cats[0].id;
  state = createChannel(state, {
    title: 'Route support direct lane close failure',
    topic: 'keep direct-lane transport binding on session_close_failed metadata',
    roomMode: 'direct_cat_chat',
    defaultRecipientId: catId,
    skipBossCatGreeting: true,
  }, now);
  const channelId = state.selectedChannelId;
  state = assignCatToChannel(state, channelId, {
    catId,
    provider: 'claude',
    roles: ['helper'],
  }, now);
  state = setChannelCatLease(state, channelId, catId, {
    sessionId: 'session-direct-close-old',
    status: 'ready',
    cwd: null,
    lastError: null,
    provider: 'claude',
    model: 'claude-old',
    startedAt: now.toISOString(),
    lastUsedAt: now.toISOString(),
  }, now);
  await chatStore.write(state);

  const { persisted } = await persistCatAssignmentUpdate(
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
      provider: 'gemini',
      roles: ['helper'],
    },
  );

  const channel = persisted.channels.find((candidate) => candidate.id === channelId);
  assert.ok(channel);
  const catAssignment = channel.catAssignments.find((candidate) => candidate.catId === catId);
  assert.ok(catAssignment);
  const sessionCloseFailed = channel.messages.find((message) =>
    message.metadata?.event === 'session_close_failed');
  assert.ok(sessionCloseFailed);
  assert.equal(sessionCloseFailed.metadata?.containerId, CHAT_ROOT_CONTAINER_ID);
  assert.equal(sessionCloseFailed.metadata?.conversationId, buildChatConversationId(channelId));
  assert.equal(
    sessionCloseFailed.metadata?.transportBindingId,
    buildDirectLaneTransportBindingId(channelId),
  );
  assert.equal(sessionCloseFailed.metadata?.targetKind, 'cat');
  assert.equal(sessionCloseFailed.metadata?.targetId, catAssignment.participantId);
  assert.equal(sessionCloseFailed.metadata?.sessionId, 'session-direct-close-old');
});

test('persistCatAssignmentRemoval keeps direct-lane transport binding on session_close_failed metadata', async () => {
  const chatStore = new MemoryChatStore();
  const now = new Date('2026-04-16T10:05:00.000Z');
  const runtimeClient = {
    async createSession() {
      throw new Error('createSession should not run for removal close-failure regression');
    },
    async closeSession() {
      throw new Error('runtime close failed');
    },
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

  let state = await chatStore.read();
  state = createCat(state, { name: 'Companion', provider: 'claude' }, now);
  const catId = state.cats[0].id;
  state = createChannel(state, {
    title: 'Route support direct lane removal close failure',
    topic: 'keep direct-lane transport binding on removal session_close_failed metadata',
    roomMode: 'direct_cat_chat',
    defaultRecipientId: catId,
    skipBossCatGreeting: true,
  }, now);
  const channelId = state.selectedChannelId;
  state = assignCatToChannel(state, channelId, {
    catId,
    provider: 'claude',
    roles: ['helper'],
  }, now);
  state = setChannelCatLease(state, channelId, catId, {
    sessionId: 'session-direct-remove-old',
    status: 'ready',
    cwd: null,
    lastError: null,
    provider: 'claude',
    model: 'claude-old',
    startedAt: now.toISOString(),
    lastUsedAt: now.toISOString(),
  }, now);
  await chatStore.write(state);

  await persistCatAssignmentRemoval(
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
    catId,
  );

  const persisted = await chatStore.read();
  const channel = persisted.channels.find((candidate) => candidate.id === channelId);
  assert.ok(channel);
  const sessionCloseFailed = channel.messages.find((message) =>
    message.metadata?.event === 'session_close_failed');
  assert.ok(sessionCloseFailed);
  assert.equal(sessionCloseFailed.metadata?.containerId, CHAT_ROOT_CONTAINER_ID);
  assert.equal(sessionCloseFailed.metadata?.conversationId, buildChatConversationId(channelId));
  assert.equal(
    sessionCloseFailed.metadata?.transportBindingId,
    buildDirectLaneTransportBindingId(channelId),
  );
  assert.equal(sessionCloseFailed.metadata?.targetKind, 'cat');
  assert.equal(sessionCloseFailed.metadata?.sessionId, 'session-direct-remove-old');
});

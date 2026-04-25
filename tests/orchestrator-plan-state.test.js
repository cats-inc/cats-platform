import assert from 'node:assert/strict';
import test from 'node:test';

import { buildChannelMessageOrchestratorPlanState } from '../build/server/products/chat/api/orchestratorPlanState.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import {
  createChannel,
  requireChannel,
  setChannelOrchestratorLease,
} from '../build/server/products/chat/state/model/index.js';
import {
  beginChannelMessageDispatch,
} from '../build/server/products/chat/state/runtimeActions.js';

function createRuntimeStub() {
  return {
    async closeSession() {},
  };
}

test('orchestrator plan state applies solo pending target changes before planning', () => {
  const now = new Date('2026-04-25T01:00:00.000Z');
  let state = createDefaultChatState();
  state = createChannel(state, {
    title: 'Solo target switch',
    topic: 'Planning should not keep the old runtime lease.',
    originSurface: 'code',
    entryKind: 'solo',
    pendingProvider: 'openai',
    pendingModel: 'gpt-5.4',
    skipBossCatGreeting: true,
  }, now);
  const channelId = state.selectedChannelId;
  state = setChannelOrchestratorLease(state, channelId, {
    sessionId: 'session-old',
    status: 'running',
    provider: 'openai',
    model: 'gpt-5.4',
    startedAt: now.toISOString(),
    lastError: null,
  }, now);

  const planned = buildChannelMessageOrchestratorPlanState(state, channelId, {
    body: 'Use the new model for this turn.',
    pendingProvider: 'anthropic',
    pendingModel: 'claude-sonnet-5',
    pendingInstance: null,
  }, now);

  const originalChannel = requireChannel(state, channelId);
  const plannedChannel = requireChannel(planned, channelId);
  assert.equal(originalChannel.orchestratorLease.sessionId, 'session-old');
  assert.equal(plannedChannel.pendingProvider, 'anthropic');
  assert.equal(plannedChannel.pendingModel, 'claude-sonnet-5');
  assert.equal(plannedChannel.orchestratorLease.sessionId, null);
  assert.equal(plannedChannel.orchestratorLease.status, 'not_started');
  assert.equal(plannedChannel.orchestratorLease.provider, 'anthropic');
});

test('orchestrator plan state clears stale explicit model selections with the pending model', () => {
  const now = new Date('2026-04-25T01:30:00.000Z');
  let state = createDefaultChatState();
  state = createChannel(state, {
    title: 'Solo target clear',
    topic: 'Planning should clear the old explicit model selection.',
    originSurface: 'code',
    entryKind: 'solo',
    pendingProvider: 'openai',
    pendingModel: 'gpt-5.4',
    pendingModelSelection: { entryId: 'gpt-5.4', entryMode: 'explicit' },
    skipBossCatGreeting: true,
  }, now);
  const channelId = state.selectedChannelId;
  state = setChannelOrchestratorLease(state, channelId, {
    sessionId: 'session-old-selection',
    status: 'running',
    provider: 'openai',
    model: 'gpt-5.4',
    modelSelection: { entryId: 'gpt-5.4', entryMode: 'explicit' },
    startedAt: now.toISOString(),
    lastError: null,
  }, now);

  const planned = buildChannelMessageOrchestratorPlanState(state, channelId, {
    body: 'Use the provider default for this turn.',
    pendingModel: null,
    pendingModelSelection: null,
  }, now);

  const plannedChannel = requireChannel(planned, channelId);
  assert.equal(plannedChannel.pendingModel, null);
  assert.equal(plannedChannel.pendingModelSelection, null);
  assert.equal(plannedChannel.orchestratorLease.model, null);
  assert.equal(plannedChannel.orchestratorLease.modelSelection ?? null, null);
});

test('channel dispatch clears stale explicit model selections with the pending model', async () => {
  const now = new Date('2026-04-25T01:45:00.000Z');
  let state = createDefaultChatState();
  state = createChannel(state, {
    title: 'Solo dispatch target clear',
    topic: 'Dispatch should clear the old explicit model selection.',
    originSurface: 'code',
    entryKind: 'solo',
    pendingProvider: 'openai',
    pendingModel: 'gpt-5.4',
    pendingModelSelection: { entryId: 'gpt-5.4', entryMode: 'explicit' },
    skipBossCatGreeting: true,
  }, now);
  const channelId = state.selectedChannelId;
  state = setChannelOrchestratorLease(state, channelId, {
    sessionId: 'session-dispatch-old-selection',
    status: 'running',
    provider: 'openai',
    model: 'gpt-5.4',
    modelSelection: { entryId: 'gpt-5.4', entryMode: 'explicit' },
    startedAt: now.toISOString(),
    lastError: null,
  }, now);

  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: 'Use the provider default for this turn.',
      pendingModel: null,
      pendingModelSelection: null,
    },
    createRuntimeStub(),
    now,
  );

  const dispatchedChannel = requireChannel(begun.state, channelId);
  assert.equal(dispatchedChannel.pendingModel, null);
  assert.equal(dispatchedChannel.pendingModelSelection, null);
  assert.equal(dispatchedChannel.orchestratorLease.model, null);
  assert.equal(dispatchedChannel.orchestratorLease.modelSelection ?? null, null);
});

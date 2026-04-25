import assert from 'node:assert/strict';
import test from 'node:test';

import { buildChannelMessageOrchestratorPlanState } from '../build/server/products/chat/api/orchestratorPlanState.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import {
  createChannel,
  requireChannel,
  setChannelOrchestratorLease,
} from '../build/server/products/chat/state/model/index.js';

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

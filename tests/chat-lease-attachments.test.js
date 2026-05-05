import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import {
  createCat,
  createChannel,
  requireChannel,
  resolveChannelEntryParticipant,
  setChannelCatLease,
  setChannelOrchestratorLease,
} from '../build/server/products/chat/state/model/index.js';
import {
  collectChannelLeaseAttachments,
  collectChannelSessionIds,
  resolveExecutionLeaseSnapshot,
  resolveOrchestratorExecutionLease,
  resolveOrchestratorLeaseAttachment,
  resolveParticipantExecutionLease,
} from '../build/server/products/chat/shared/channelParticipants.js';
import { collectLinkedChannelSessionIds, collectCatSessionIds } from '../build/server/products/chat/api/routeStateSupport.js';
import { collectActiveChannelSessionIds } from '../build/server/products/chat/api/routeSessions.js';

function buildLease({
  sessionId = null,
  laneId = null,
  status = 'not_started',
  cwd = null,
  startedAt = null,
  lastError = null,
  provider = 'claude',
  instance = 'cli',
  model = 'claude-sonnet',
} = {}) {
  return {
    sessionId,
    laneId,
    status,
    cwd,
    lastError,
    provider,
    instance,
    model,
    startedAt,
    lastUsedAt: startedAt,
  };
}

function buildAssignment({
  participantId,
  sessionId,
  laneId,
  status = 'ready',
  sourceKind = 'adhoc',
  sourceRefId = null,
  name = participantId,
  cwd = null,
  startedAt = null,
  lastError = null,
} = {}) {
  return {
    participantId,
    sourceKind,
    sourceRefId,
    name,
    status: 'active',
    roles: [],
    roleHint: null,
    joinedAt: '2026-04-15T00:00:00.000Z',
    leftAt: null,
    execution: {
      target: {
        provider: 'claude',
        instance: 'cli',
        model: 'claude-sonnet',
      },
      modelSelection: null,
      lease: buildLease({
        sessionId,
        laneId,
        status,
        cwd,
        startedAt,
        lastError,
      }),
    },
  };
}

function buildCatAssignment({
  participantId,
  catId,
  sessionId,
  laneId,
  status = 'ready',
  name = 'Companion',
  cwd = null,
  startedAt = null,
} = {}) {
  return {
    ...buildAssignment({
      participantId,
      sessionId,
      laneId,
      status,
      sourceKind: 'cat',
      sourceRefId: catId,
      name,
      cwd,
      startedAt,
    }),
    catId,
  };
}

test('channel lease attachment helpers merge participant and orchestrator attachments with lane and status filtering', () => {
  const channel = {
    participantAssignments: [
      buildAssignment({
        participantId: 'participant-inline',
        sessionId: 'session-inline',
        laneId: 'lane-inline',
        status: 'ready',
        cwd: '/tmp/inline',
        startedAt: '2026-04-15T10:00:00.000Z',
      }),
      buildAssignment({
        participantId: 'participant-stale',
        sessionId: 'session-stale',
        laneId: 'lane-stale',
        status: 'closed',
        cwd: '/tmp/stale',
      }),
    ],
    catAssignments: [
      buildCatAssignment({
        participantId: 'participant-cat',
        catId: 'cat-1',
        sessionId: 'session-cat',
        laneId: 'lane-cat',
        status: 'initializing',
        cwd: '/tmp/cat',
        startedAt: '2026-04-15T10:01:00.000Z',
      }),
    ],
    orchestratorLease: buildLease({
      sessionId: 'session-orchestrator',
      laneId: 'lane-orchestrator',
      status: 'ready',
      cwd: '/tmp/orchestrator',
      startedAt: '2026-04-15T09:59:00.000Z',
    }),
  };

  assert.deepEqual(
    collectChannelLeaseAttachments(channel, {
      statuses: ['ready', 'initializing'],
    }),
    [
      {
        participantId: 'participant-cat',
        sessionId: 'session-cat',
        laneId: 'lane-cat',
        status: 'initializing',
        cwd: '/tmp/cat',
        provider: 'claude',
        instance: 'cli',
        model: 'claude-sonnet',
        startedAt: '2026-04-15T10:01:00.000Z',
        lastUsedAt: '2026-04-15T10:01:00.000Z',
        lastError: null,
      },
      {
        participantId: 'participant-inline',
        sessionId: 'session-inline',
        laneId: 'lane-inline',
        status: 'ready',
        cwd: '/tmp/inline',
        provider: 'claude',
        instance: 'cli',
        model: 'claude-sonnet',
        startedAt: '2026-04-15T10:00:00.000Z',
        lastUsedAt: '2026-04-15T10:00:00.000Z',
        lastError: null,
      },
      {
        participantId: 'orchestrator',
        sessionId: 'session-orchestrator',
        laneId: 'lane-orchestrator',
        status: 'ready',
        cwd: '/tmp/orchestrator',
        provider: 'claude',
        instance: 'cli',
        model: 'claude-sonnet',
        startedAt: '2026-04-15T09:59:00.000Z',
        lastUsedAt: '2026-04-15T09:59:00.000Z',
        lastError: null,
      },
    ],
  );

  assert.deepEqual(
    collectChannelSessionIds(channel, {
      statuses: ['ready', 'initializing'],
    }),
    ['session-cat', 'session-inline', 'session-orchestrator'],
  );

  assert.deepEqual(
    resolveOrchestratorLeaseAttachment(channel, { laneId: 'lane-orchestrator' }),
    {
      participantId: 'orchestrator',
      sessionId: 'session-orchestrator',
      laneId: 'lane-orchestrator',
      status: 'ready',
      cwd: '/tmp/orchestrator',
      provider: 'claude',
      instance: 'cli',
      model: 'claude-sonnet',
      startedAt: '2026-04-15T09:59:00.000Z',
      lastUsedAt: '2026-04-15T09:59:00.000Z',
      lastError: null,
    },
  );

  assert.deepEqual(resolveParticipantExecutionLease(channel, 'participant-inline'), {
    sessionId: 'session-inline',
    laneId: 'lane-inline',
    status: 'ready',
    cwd: '/tmp/inline',
    lastError: null,
    provider: 'claude',
    instance: 'cli',
    model: 'claude-sonnet',
    startedAt: '2026-04-15T10:00:00.000Z',
    lastUsedAt: '2026-04-15T10:00:00.000Z',
  });

  const participantSnapshot = resolveExecutionLeaseSnapshot(channel, {
    participantKind: 'cat',
    participantId: 'participant-inline',
  });
  assert.ok(participantSnapshot);
  participantSnapshot.sessionId = 'mutated-session';
  participantSnapshot.lastError = 'mutated-error';
  assert.equal(resolveParticipantExecutionLease(channel, 'participant-inline')?.sessionId, 'session-inline');
  assert.equal(resolveParticipantExecutionLease(channel, 'participant-inline')?.lastError, null);

  assert.deepEqual(resolveOrchestratorExecutionLease(channel), channel.orchestratorLease);
});

test('route session collectors follow attachment-based channel session identities', () => {
  const channelA = {
    participantAssignments: [],
    catAssignments: [
      buildCatAssignment({
        participantId: 'participant-cat',
        catId: 'cat-1',
        sessionId: 'session-cat-active',
        laneId: 'lane-cat-active',
        status: 'ready',
      }),
    ],
    orchestratorLease: buildLease({
      sessionId: 'session-orchestrator-ready',
      laneId: 'lane-orchestrator-ready',
      status: 'ready',
    }),
  };
  const channelB = {
    participantAssignments: [],
    catAssignments: [
      buildCatAssignment({
        participantId: 'participant-cat',
        catId: 'cat-1',
        sessionId: 'session-cat-closed',
        laneId: 'lane-cat-closed',
        status: 'closed',
      }),
    ],
    orchestratorLease: buildLease({
      sessionId: 'session-orchestrator-closed',
      laneId: 'lane-orchestrator-closed',
      status: 'closed',
    }),
  };
  const state = { channels: [channelA, channelB] };

  assert.deepEqual(
    collectLinkedChannelSessionIds(channelA),
    ['session-cat-active', 'session-orchestrator-ready'],
  );
  assert.deepEqual(
    collectActiveChannelSessionIds(channelA),
    ['session-cat-active', 'session-orchestrator-ready'],
  );
  assert.deepEqual(
    collectCatSessionIds(state, 'cat-1'),
    ['session-cat-active', 'session-cat-closed'],
  );
});

test('resolveParticipantExecutionLease tolerates sparse assignment fixtures without execution state', () => {
  const channel = {
    participantAssignments: [],
    catAssignments: [
      {
        participantId: 'participant-cat',
        catId: 'cat-1',
      },
    ],
  };

  assert.equal(resolveParticipantExecutionLease(channel, 'participant-cat'), null);
  assert.equal(
    resolveExecutionLeaseSnapshot(channel, {
      participantKind: 'cat',
      participantId: 'participant-cat',
    }),
    null,
  );
});

test('resolveChannelEntryParticipant uses participant lease state for direct lanes and orchestrator lease state for boss rooms', () => {
  const now = new Date('2026-04-15T12:00:00.000Z');
  let state = createDefaultChatState();

  state = createCat(
    state,
    {
      name: 'Companion',
      provider: 'claude',
      roles: ['helper'],
    },
    now,
  );
  const companionId = state.cats[0].id;

  state = createChannel(
    state,
    {
      title: 'Direct lane',
      topic: 'Lead participant lifecycle',
      entryKind: 'direct',
      roomMode: 'direct_message',
      participantCatIds: [companionId],
      skipBossCatGreeting: true,
    },
    now,
  );
  const directChannelId = state.selectedChannelId;
  state = setChannelCatLease(
    state,
    directChannelId,
    companionId,
    {
      status: 'initializing',
      sessionId: 'session-direct',
      laneId: 'lane-direct',
      startedAt: now.toISOString(),
    },
    now,
  );

  const directChannel = requireChannel(state, directChannelId);
  const directParticipantId = directChannel.catAssignments[0]?.participantId;
  assert.ok(directParticipantId);
  assert.deepEqual(
    resolveChannelEntryParticipant(state, directChannelId),
    {
      participantKind: 'cat',
      participantId: directParticipantId,
      participantName: 'Companion',
      lifecycleState: 'waking_up',
    },
  );

  state = createChannel(
    state,
    {
      title: 'Boss room',
      topic: 'Orchestrator lifecycle',
      skipBossCatGreeting: true,
    },
    now,
  );
  const bossChannelId = state.selectedChannelId;
  state = setChannelOrchestratorLease(
    state,
    bossChannelId,
    {
      status: 'error',
      sessionId: 'session-boss',
      laneId: 'lane-boss',
      lastError: 'session went stale',
    },
    now,
  );

  assert.deepEqual(
    resolveChannelEntryParticipant(state, bossChannelId),
    {
      participantKind: 'orchestrator',
      participantId: 'orchestrator',
      participantName: 'Orchestrator',
      lifecycleState: 'error',
    },
  );
});

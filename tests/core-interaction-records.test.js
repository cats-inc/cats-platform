import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreLane,
  upsertCoreMission,
  upsertCoreSegment,
  upsertCoreSession,
  upsertCoreTurn,
} from '../build/server/core/model/index.js';

test('createDefaultCoreState exposes empty canonical interaction record collections', () => {
  const core = createDefaultCoreState();

  assert.deepEqual(core.participants, []);
  assert.deepEqual(core.containers, []);
  assert.deepEqual(core.turns, []);
  assert.deepEqual(core.lanes, []);
  assert.deepEqual(core.segments, []);
  assert.deepEqual(core.sessions, []);
  assert.deepEqual(core.missions, []);
  assert.deepEqual(core.transportBindings, []);
});

test('core interaction helpers persist turns, lanes, segments, and sessions without collapsing identity layers', () => {
  let core = createDefaultCoreState();
  const now = new Date('2026-04-14T21:00:00.000Z');

  core = upsertCoreTurn(
    core,
    {
      id: 'turn-user-1',
      conversationId: 'conversation-direct-1',
      kind: 'user',
      status: 'active',
      sourceParticipantId: 'participant-owner',
      createdAt: '2026-04-14T21:00:00.000Z',
    },
    now,
  ).core;

  core = upsertCoreLane(
    core,
    {
      id: 'lane-cat-1',
      turnId: 'turn-user-1',
      conversationId: 'conversation-direct-1',
      participantId: 'participant-cat-1',
      agentId: 'agent-cat-1',
      orderIndex: 0,
      status: 'streaming',
      createdAt: '2026-04-14T21:00:01.000Z',
    },
    new Date('2026-04-14T21:00:01.000Z'),
  ).core;

  core = upsertCoreSession(
    core,
    {
      id: 'session-runtime-1',
      conversationId: 'conversation-direct-1',
      turnId: 'turn-user-1',
      laneId: 'lane-cat-1',
      participantId: 'participant-cat-1',
      agentId: 'agent-cat-1',
      runtimeKey: 'claude:cli',
      status: 'active',
      createdAt: '2026-04-14T21:00:02.000Z',
      startedAt: '2026-04-14T21:00:02.000Z',
    },
    new Date('2026-04-14T21:00:02.000Z'),
  ).core;

  core = upsertCoreSegment(
    core,
    {
      id: 'segment-cat-1',
      laneId: 'lane-cat-1',
      turnId: 'turn-user-1',
      conversationId: 'conversation-direct-1',
      sessionId: 'session-runtime-1',
      sequence: 0,
      kind: 'text',
      status: 'streaming',
      content: 'Working...',
      createdAt: '2026-04-14T21:00:03.000Z',
    },
    new Date('2026-04-14T21:00:03.000Z'),
  ).core;

  assert.equal(core.turns.length, 1);
  assert.equal(core.lanes.length, 1);
  assert.equal(core.sessions.length, 1);
  assert.equal(core.segments.length, 1);

  assert.equal(core.lanes[0].id, 'lane-cat-1');
  assert.equal(core.sessions[0].id, 'session-runtime-1');
  assert.equal(core.sessions[0].laneId, 'lane-cat-1');
  assert.equal(core.segments[0].laneId, 'lane-cat-1');
  assert.equal(core.segments[0].sessionId, 'session-runtime-1');
});

test('core mission helper persists source turn, lane, and assigned agent identity separately from runs', () => {
  let core = createDefaultCoreState();

  core = upsertCoreMission(
    core,
    {
      id: 'mission-1',
      conversationId: 'conversation-direct-1',
      sourceTurnId: 'turn-user-1',
      sourceLaneId: 'lane-cat-1',
      assignedAgentId: 'agent-cat-1',
      title: 'Review the latest reply',
      status: 'queued',
      createdAt: '2026-04-14T21:10:00.000Z',
      metadata: {
        runId: 'run-1',
      },
    },
    new Date('2026-04-14T21:10:00.000Z'),
  ).core;

  assert.equal(core.missions.length, 1);
  assert.equal(core.missions[0].sourceTurnId, 'turn-user-1');
  assert.equal(core.missions[0].sourceLaneId, 'lane-cat-1');
  assert.equal(core.missions[0].assignedAgentId, 'agent-cat-1');
  assert.equal(core.missions[0].metadata.runId, 'run-1');
});

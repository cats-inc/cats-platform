import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreLane,
  upsertCoreSegment,
  upsertCoreTurn,
} from '../build/server/core/model/index.js';
import {
  listLanes,
  listSegments,
  listTurns,
} from '../build/server/core/interactionRecordLists.js';

test('listTurns filters turns by conversation, source participant, kind, and status', () => {
  let core = createDefaultCoreState();

  core = upsertCoreTurn(
    core,
    {
      id: 'turn-1',
      conversationId: 'conversation-1',
      kind: 'user',
      status: 'active',
      sourceParticipantId: 'participant-owner',
      createdAt: '2026-04-15T03:50:00.000Z',
    },
    new Date('2026-04-15T03:50:00.000Z'),
  ).core;

  core = upsertCoreTurn(
    core,
    {
      id: 'turn-2',
      conversationId: 'conversation-2',
      kind: 'agent',
      status: 'completed',
      sourceParticipantId: 'participant-agent',
      createdAt: '2026-04-15T03:51:00.000Z',
    },
    new Date('2026-04-15T03:51:00.000Z'),
  ).core;

  const filtered = listTurns(core, {
    conversationIds: ['conversation-1'],
    sourceParticipantIds: ['participant-owner'],
    kinds: ['user'],
    statuses: ['active'],
  });

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'turn-1');
});

test('listLanes and listSegments filter by canonical relationships and status/kind', () => {
  let core = createDefaultCoreState();

  core = upsertCoreLane(
    core,
    {
      id: 'lane-1',
      turnId: 'turn-1',
      conversationId: 'conversation-1',
      participantId: 'participant-1',
      agentId: 'actor-agent-1',
      status: 'streaming',
      createdAt: '2026-04-15T03:52:00.000Z',
    },
    new Date('2026-04-15T03:52:00.000Z'),
  ).core;

  core = upsertCoreLane(
    core,
    {
      id: 'lane-2',
      turnId: 'turn-2',
      conversationId: 'conversation-2',
      participantId: 'participant-2',
      agentId: 'actor-agent-2',
      status: 'failed',
      createdAt: '2026-04-15T03:53:00.000Z',
    },
    new Date('2026-04-15T03:53:00.000Z'),
  ).core;

  core = upsertCoreSegment(
    core,
    {
      id: 'segment-1',
      laneId: 'lane-1',
      turnId: 'turn-1',
      conversationId: 'conversation-1',
      sessionId: 'session-1',
      kind: 'text',
      status: 'streaming',
      content: 'hello',
      createdAt: '2026-04-15T03:54:00.000Z',
    },
    new Date('2026-04-15T03:54:00.000Z'),
  ).core;

  core = upsertCoreSegment(
    core,
    {
      id: 'segment-2',
      laneId: 'lane-2',
      turnId: 'turn-2',
      conversationId: 'conversation-2',
      sessionId: 'session-2',
      kind: 'tool',
      status: 'failed',
      content: null,
      createdAt: '2026-04-15T03:55:00.000Z',
    },
    new Date('2026-04-15T03:55:00.000Z'),
  ).core;

  const lanes = listLanes(core, {
    conversationIds: ['conversation-1'],
    turnIds: ['turn-1'],
    participantIds: ['participant-1'],
    agentIds: ['actor-agent-1'],
    statuses: ['streaming'],
  });
  assert.equal(lanes.length, 1);
  assert.equal(lanes[0].id, 'lane-1');

  const segments = listSegments(core, {
    conversationIds: ['conversation-1'],
    turnIds: ['turn-1'],
    laneIds: ['lane-1'],
    sessionIds: ['session-1'],
    kinds: ['text'],
    statuses: ['streaming'],
  });
  assert.equal(segments.length, 1);
  assert.equal(segments[0].id, 'segment-1');
});

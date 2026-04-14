import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreActor,
  upsertCoreConversation,
  upsertCoreMission,
  upsertCoreParticipant,
  upsertCoreRun,
  upsertCoreSession,
  upsertCoreTransportBinding,
  upsertCoreWorkItem,
} from '../build/server/core/model/index.js';
import { buildActorWorkloadProjection } from '../build/server/core/actorWorkloadProjection.js';

test('buildActorWorkloadProjection summarizes managed work, missions, transports, and sessions', () => {
  let core = createDefaultCoreState();

  core = upsertCoreActor(
    core,
    {
      id: 'actor-worker-1',
      name: 'Ops Cat',
      kind: 'worker',
      source: 'core_record',
      createdAt: '2026-04-15T02:00:00.000Z',
    },
    new Date('2026-04-15T02:00:00.000Z'),
  ).core;

  core = upsertCoreConversation(
    core,
    {
      id: 'conversation-1',
      title: 'Primary conversation',
      kind: 'work_thread',
      status: 'active',
      participantActorIds: ['actor-worker-1'],
      createdAt: '2026-04-15T02:00:01.000Z',
    },
    new Date('2026-04-15T02:00:01.000Z'),
  ).core;

  core = upsertCoreParticipant(
    core,
    {
      id: 'participant-1',
      conversationId: 'conversation-1',
      agentId: 'actor-worker-1',
      status: 'active',
      joinedAt: '2026-04-15T02:00:02.000Z',
    },
    new Date('2026-04-15T02:00:02.000Z'),
  ).core;

  core = upsertCoreWorkItem(
    core,
    {
      id: 'work-item-1',
      title: 'Primary work item',
      conversationId: 'conversation-1',
      ownerActorId: 'actor-worker-1',
      createdAt: '2026-04-15T02:00:03.000Z',
    },
    new Date('2026-04-15T02:00:03.000Z'),
  ).core;

  core = upsertCoreRun(
    core,
    {
      id: 'run-1',
      title: 'Primary run',
      conversationId: 'conversation-1',
      status: 'running',
      createdAt: '2026-04-15T02:00:04.000Z',
      startedAt: '2026-04-15T02:00:04.000Z',
    },
    new Date('2026-04-15T02:00:04.000Z'),
  ).core;

  core = upsertCoreMission(
    core,
    {
      id: 'mission-1',
      managedWorkId: 'work-item-1',
      conversationId: 'conversation-1',
      assignedAgentId: 'actor-worker-1',
      title: 'Primary mission',
      status: 'running',
      createdAt: '2026-04-15T02:00:05.000Z',
      metadata: {
        runId: 'run-1',
      },
    },
    new Date('2026-04-15T02:00:05.000Z'),
  ).core;

  core = upsertCoreTransportBinding(
    core,
    {
      id: 'transport-binding-1',
      platform: 'telegram',
      direction: 'bidirectional',
      conversationId: 'conversation-1',
      agentId: 'actor-worker-1',
      externalThreadKey: 'telegram:ops',
      status: 'active',
      createdAt: '2026-04-15T02:00:06.000Z',
    },
    new Date('2026-04-15T02:00:06.000Z'),
  ).core;

  core = upsertCoreSession(
    core,
    {
      id: 'session-1',
      conversationId: 'conversation-1',
      participantId: 'participant-1',
      agentId: 'actor-worker-1',
      transportBindingId: 'transport-binding-1',
      status: 'active',
      createdAt: '2026-04-15T02:00:07.000Z',
      startedAt: '2026-04-15T02:00:07.000Z',
    },
    new Date('2026-04-15T02:00:07.000Z'),
  ).core;

  const projection = buildActorWorkloadProjection(core, {
    actorKinds: ['worker'],
    hasMission: true,
    hasActiveSession: true,
  });

  assert.equal(projection.summary.total, 1);
  assert.equal(projection.summary.withMission, 1);
  assert.equal(projection.summary.withTransport, 1);
  assert.equal(projection.summary.withActiveParticipant, 1);
  assert.equal(projection.summary.withActiveSession, 1);
  assert.equal(projection.summary.runningMissionCount, 1);
  assert.equal(projection.items.length, 1);
  assert.equal(projection.items[0].actor.id, 'actor-worker-1');
  assert.equal(projection.items[0].assignedManagedWork[0]?.id, 'work-item-1');
  assert.equal(projection.items[0].assignedMissions[0]?.id, 'mission-1');
  assert.equal(projection.items[0].latestRun?.id, 'run-1');
  assert.equal(projection.items[0].latestSession?.id, 'session-1');
});

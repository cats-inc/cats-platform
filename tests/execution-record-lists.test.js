import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendCoreActivity,
  appendCoreTrace,
  createDefaultCoreState,
  upsertCoreCheckpoint,
  upsertCoreOutcome,
  upsertCoreRun,
} from '../build/server/core/model/index.js';
import {
  listActivities,
  listCheckpoints,
  listOutcomes,
  listRuns,
  listTraces,
} from '../build/server/core/executionRecordLists.js';

test('listRuns and listTraces filter execution records by canonical fields', () => {
  let core = createDefaultCoreState();

  core = upsertCoreRun(
    core,
    {
      id: 'run-1',
      title: 'Primary run',
      status: 'running',
      conversationId: 'conversation-1',
      taskId: 'task-1',
      orchestratorActorId: 'actor-owner',
      traceId: 'trace-1',
      createdAt: '2026-04-15T04:40:00.000Z',
      startedAt: '2026-04-15T04:40:00.000Z',
    },
    new Date('2026-04-15T04:40:00.000Z'),
  ).core;

  core = appendCoreTrace(
    core,
    {
      id: 'trace-record-1',
      traceId: 'trace-1',
      kind: 'dispatch',
      conversationId: 'conversation-1',
      runId: 'run-1',
      taskId: 'task-1',
      actorId: 'actor-owner',
      message: 'dispatch',
      createdAt: '2026-04-15T04:41:00.000Z',
    },
    new Date('2026-04-15T04:41:00.000Z'),
  ).core;

  const runs = listRuns(core, {
    statuses: ['running'],
    conversationIds: ['conversation-1'],
    taskIds: ['task-1'],
    orchestratorActorIds: ['actor-owner'],
    traceIds: ['trace-1'],
  });
  assert.equal(runs.length, 1);
  assert.equal(runs[0].id, 'run-1');

  const traces = listTraces(core, {
    kinds: ['dispatch'],
    conversationIds: ['conversation-1'],
    runIds: ['run-1'],
    taskIds: ['task-1'],
    actorIds: ['actor-owner'],
    traceIds: ['trace-1'],
  });
  assert.equal(traces.length, 1);
  assert.equal(traces[0].id, 'trace-record-1');
});

test('listCheckpoints, listOutcomes, and listActivities filter execution lifecycle records', () => {
  let core = createDefaultCoreState();

  core = upsertCoreCheckpoint(
    core,
    {
      id: 'checkpoint-1',
      label: 'Checkpoint one',
      status: 'open',
      conversationId: 'conversation-1',
      runId: 'run-1',
      taskId: 'task-1',
      sourceTraceId: 'trace-1',
      createdAt: '2026-04-15T04:42:00.000Z',
    },
    new Date('2026-04-15T04:42:00.000Z'),
  ).core;

  core = upsertCoreOutcome(
    core,
    {
      id: 'outcome-1',
      title: 'Outcome one',
      status: 'succeeded',
      conversationId: 'conversation-1',
      runId: 'run-1',
      taskId: 'task-1',
      recordedAt: '2026-04-15T04:43:00.000Z',
    },
    new Date('2026-04-15T04:43:00.000Z'),
  ).core;

  core = appendCoreActivity(
    core,
    {
      id: 'activity-1',
      kind: 'checkpoint_recorded',
      actorId: 'actor-owner',
      projectId: 'project-1',
      workItemId: 'work-item-1',
      conversationId: 'conversation-1',
      taskId: 'task-1',
      runId: 'run-1',
      artifactId: 'artifact-1',
      message: 'activity',
      createdAt: '2026-04-15T04:44:00.000Z',
    },
    new Date('2026-04-15T04:44:00.000Z'),
  ).core;

  const checkpoints = listCheckpoints(core, {
    statuses: ['open'],
    conversationIds: ['conversation-1'],
    runIds: ['run-1'],
    taskIds: ['task-1'],
    sourceTraceIds: ['trace-1'],
  });
  assert.equal(checkpoints.length, 1);
  assert.equal(checkpoints[0].id, 'checkpoint-1');

  const outcomes = listOutcomes(core, {
    statuses: ['succeeded'],
    conversationIds: ['conversation-1'],
    runIds: ['run-1'],
    taskIds: ['task-1'],
  });
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].id, 'outcome-1');

  const activities = listActivities(core, {
    kinds: ['checkpoint_recorded'],
    actorIds: ['actor-owner'],
    projectIds: ['project-1'],
    workItemIds: ['work-item-1'],
    conversationIds: ['conversation-1'],
    taskIds: ['task-1'],
    runIds: ['run-1'],
    artifactIds: ['artifact-1'],
  });
  assert.equal(activities.length, 1);
  assert.equal(activities[0].id, 'activity-1');
});

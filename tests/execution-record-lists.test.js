import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendCoreTrace,
  createDefaultCoreState,
  upsertCoreRun,
} from '../build/server/core/model/index.js';
import {
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

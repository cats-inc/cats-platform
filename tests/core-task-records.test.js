import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendCoreActivity,
  appendCoreTrace,
  createDefaultCoreState,
  upsertCoreApprovalBinding,
  upsertCoreCheckpoint,
  upsertCoreOutcome,
  upsertCoreRun,
  upsertCoreTask,
} from '../dist-server/core/model/index.js';
import { buildCoreTaskRecordsView } from '../dist-server/core/taskRecords.js';

test('buildCoreTaskRecordsView filters and sorts records for one task', () => {
  const now = new Date('2026-03-26T15:00:00.000Z');
  let core = createDefaultCoreState();

  core = upsertCoreTask(
    core,
    {
      id: 'task-records',
      title: 'Collect task records',
      status: 'blocked',
      conversationId: 'conversation-channel-records',
      createdAt: '2026-03-26T14:50:00.000Z',
    },
    now,
  ).core;
  core = upsertCoreTask(
    core,
    {
      id: 'task-other',
      title: 'Other task',
      status: 'draft',
      createdAt: '2026-03-26T14:51:00.000Z',
    },
    now,
  ).core;

  core = upsertCoreApprovalBinding(
    core,
    {
      id: 'binding-task-records',
      kind: 'owner_decision',
      approvalTaskId: 'task-records',
      subjectKind: 'task',
      subjectId: 'task-records',
      requestedForActorId: 'actor-owner',
      createdAt: '2026-03-26T14:52:00.000Z',
    },
    now,
  ).core;
  core = upsertCoreApprovalBinding(
    core,
    {
      id: 'binding-task-records-older',
      kind: 'owner_decision',
      approvalTaskId: 'task-records',
      subjectKind: 'task',
      subjectId: 'task-records',
      requestedForActorId: 'actor-owner',
      createdAt: '2026-03-26T14:51:30.000Z',
    },
    new Date('2026-03-26T14:58:00.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-records-newer',
      title: 'Newer run',
      status: 'blocked',
      taskId: 'task-records',
      conversationId: 'conversation-channel-records',
      createdAt: '2026-03-26T14:53:00.000Z',
    },
    now,
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-records-older',
      title: 'Older run',
      status: 'failed',
      taskId: 'task-records',
      conversationId: 'conversation-channel-records',
      createdAt: '2026-03-26T14:52:30.000Z',
    },
    new Date('2026-03-26T14:59:00.000Z'),
  ).core;
  core = appendCoreTrace(
    core,
    {
      id: 'trace-records-newer',
      traceId: 'trace-records',
      kind: 'status',
      taskId: 'task-records',
      message: 'Newer trace',
      createdAt: '2026-03-26T14:56:00.000Z',
    },
    now,
  ).core;
  core = appendCoreTrace(
    core,
    {
      id: 'trace-records-older',
      traceId: 'trace-records',
      kind: 'status',
      taskId: 'task-records',
      message: 'Older trace',
      createdAt: '2026-03-26T14:55:00.000Z',
    },
    now,
  ).core;
  core = appendCoreTrace(
    core,
    {
      id: 'trace-other',
      traceId: 'trace-other',
      kind: 'status',
      taskId: 'task-other',
      message: 'Other trace',
      createdAt: '2026-03-26T14:57:00.000Z',
    },
    now,
  ).core;
  core = upsertCoreCheckpoint(
    core,
    {
      id: 'checkpoint-records',
      label: 'review',
      status: 'open',
      taskId: 'task-records',
      runId: 'run-records-newer',
      createdAt: '2026-03-26T14:57:30.000Z',
    },
    now,
  ).core;
  core = upsertCoreCheckpoint(
    core,
    {
      id: 'checkpoint-records-older',
      label: 'prepare',
      status: 'completed',
      taskId: 'task-records',
      runId: 'run-records-older',
      createdAt: '2026-03-26T14:57:00.000Z',
    },
    new Date('2026-03-26T14:58:30.000Z'),
  ).core;
  core = upsertCoreOutcome(
    core,
    {
      id: 'outcome-records',
      title: 'Blocked',
      status: 'blocked',
      taskId: 'task-records',
      runId: 'run-records-newer',
      recordedAt: '2026-03-26T14:58:00.000Z',
    },
    now,
  ).core;
  core = upsertCoreOutcome(
    core,
    {
      id: 'outcome-records-older',
      title: 'Failed',
      status: 'failed',
      taskId: 'task-records',
      runId: 'run-records-older',
      recordedAt: '2026-03-26T14:57:45.000Z',
    },
    new Date('2026-03-26T14:58:45.000Z'),
  ).core;
  core = appendCoreActivity(
    core,
    {
      id: 'activity-records',
      kind: 'note',
      taskId: 'task-records',
      message: 'Newest activity',
      createdAt: '2026-03-26T14:59:30.000Z',
    },
    now,
  ).core;
  core = appendCoreActivity(
    core,
    {
      id: 'activity-records-older',
      kind: 'note',
      taskId: 'task-records',
      message: 'Older activity',
      createdAt: '2026-03-26T14:58:30.000Z',
    },
    now,
  ).core;

  const task = core.tasks.find((candidate) => candidate.id === 'task-records');
  assert.ok(task);

  const records = buildCoreTaskRecordsView(core, task);

  assert.equal(records.taskId, 'task-records');
  assert.equal(records.conversationId, 'conversation-channel-records');
  assert.deepEqual(records.approvalBindings.map((record) => record.id), [
    'binding-task-records',
    'binding-task-records-older',
  ]);
  assert.deepEqual(records.runs.map((record) => record.id), ['run-records-newer', 'run-records-older']);
  assert.deepEqual(records.traces.map((record) => record.id), [
    'trace-records-newer',
    'trace-records-older',
  ]);
  assert.deepEqual(records.checkpoints.map((record) => record.id), [
    'checkpoint-records',
    'checkpoint-records-older',
  ]);
  assert.deepEqual(records.outcomes.map((record) => record.id), [
    'outcome-records',
    'outcome-records-older',
  ]);
  assert.deepEqual(records.activities.map((record) => record.id), [
    'activity-records',
    'activity-records-older',
  ]);
});

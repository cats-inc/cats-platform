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
import {
  buildCoreTaskTimelineView,
  queryCoreTaskTimelineView,
} from '../dist-server/core/taskTimeline.js';

test('buildCoreTaskTimelineView normalizes task history into a chronological narrative', () => {
  let core = createDefaultCoreState();

  core = upsertCoreTask(
    core,
    {
      id: 'task-timeline',
      title: 'Timeline task',
      status: 'blocked',
      conversationId: 'conversation-channel-timeline',
      summary: 'Recover the blocked room workflow.',
      createdAt: '2026-03-26T15:40:00.000Z',
    },
    new Date('2026-03-26T15:40:00.000Z'),
  ).core;
  core = upsertCoreTask(
    core,
    {
      id: 'task-other',
      title: 'Other task',
      status: 'draft',
      createdAt: '2026-03-26T15:41:00.000Z',
    },
    new Date('2026-03-26T15:41:00.000Z'),
  ).core;

  core = upsertCoreApprovalBinding(
    core,
    {
      id: 'binding-timeline',
      kind: 'owner_decision',
      approvalTaskId: 'task-timeline',
      subjectKind: 'task',
      subjectId: 'task-timeline',
      requestedByActorId: 'actor-orchestrator-global',
      requestedForActorId: 'actor-owner',
      createdAt: '2026-03-26T15:41:00.000Z',
    },
    new Date('2026-03-26T15:41:00.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-timeline',
      title: 'Primary run',
      status: 'blocked',
      conversationId: 'conversation-channel-timeline',
      taskId: 'task-timeline',
      traceId: 'trace-timeline',
      summary: 'Run blocked after a failed continuation.',
      createdAt: '2026-03-26T15:42:00.000Z',
    },
    new Date('2026-03-26T15:46:00.000Z'),
  ).core;
  core = appendCoreTrace(
    core,
    {
      id: 'trace-timeline-record',
      traceId: 'trace-timeline',
      kind: 'status',
      taskId: 'task-timeline',
      runId: 'run-timeline',
      message: 'Trace captured the blocked continuation.',
      createdAt: '2026-03-26T15:43:00.000Z',
    },
    new Date('2026-03-26T15:43:00.000Z'),
  ).core;
  core = upsertCoreCheckpoint(
    core,
    {
      id: 'checkpoint-timeline',
      label: 'recovery-review',
      status: 'open',
      taskId: 'task-timeline',
      runId: 'run-timeline',
      summary: 'Review the recovery plan.',
      createdAt: '2026-03-26T15:44:00.000Z',
    },
    new Date('2026-03-26T15:47:00.000Z'),
  ).core;
  core = upsertCoreOutcome(
    core,
    {
      id: 'outcome-timeline',
      title: 'Recovery blocked',
      status: 'blocked',
      taskId: 'task-timeline',
      runId: 'run-timeline',
      summary: 'Outcome stayed blocked pending operator retry.',
      recordedAt: '2026-03-26T15:45:00.000Z',
    },
    new Date('2026-03-26T15:48:00.000Z'),
  ).core;
  core = appendCoreActivity(
    core,
    {
      id: 'activity-timeline-operator',
      kind: 'operator_action',
      taskId: 'task-timeline',
      runId: 'run-timeline',
      actorId: 'actor-owner',
      message: 'Operator requested a retry.',
      createdAt: '2026-03-26T15:49:00.000Z',
      metadata: {
        source: 'core-operator-actions',
      },
    },
    new Date('2026-03-26T15:49:00.000Z'),
  ).core;
  core = appendCoreActivity(
    core,
    {
      id: 'activity-timeline-recovery',
      kind: 'note',
      taskId: 'task-timeline',
      message: 'Replay failed during startup recovery.',
      createdAt: '2026-03-26T15:50:00.000Z',
      metadata: {
        source: 'orchestrator-startup-recovery',
        replayPhase: 'replay_failed',
        replayTrigger: 'startup_recovery',
      },
    },
    new Date('2026-03-26T15:50:00.000Z'),
  ).core;
  core = appendCoreActivity(
    core,
    {
      id: 'activity-other',
      kind: 'note',
      taskId: 'task-other',
      message: 'Ignore me.',
      createdAt: '2026-03-26T15:51:00.000Z',
    },
    new Date('2026-03-26T15:51:00.000Z'),
  ).core;

  const task = core.tasks.find((candidate) => candidate.id === 'task-timeline');
  assert.ok(task);

  const timeline = buildCoreTaskTimelineView(core, task);

  assert.equal(timeline.taskId, 'task-timeline');
  assert.equal(timeline.conversationId, 'conversation-channel-timeline');
  assert.equal(timeline.latestTimestamp, '2026-03-26T15:50:00.000Z');
  assert.deepEqual(timeline.counts, {
    total: 8,
    taskLifecycle: 1,
    governance: 1,
    execution: 2,
    workflow: 2,
    recovery: 1,
    operator: 1,
  });
  assert.deepEqual(
    timeline.items.map((item) => [item.kind, item.recordId, item.category]),
    [
      ['activity', 'activity-timeline-recovery', 'recovery'],
      ['activity', 'activity-timeline-operator', 'operator'],
      ['outcome', 'outcome-timeline', 'execution'],
      ['checkpoint', 'checkpoint-timeline', 'workflow'],
      ['run', 'run-timeline', 'execution'],
      ['trace', 'trace-timeline-record', 'workflow'],
      ['approval_binding', 'binding-timeline', 'governance'],
      ['task', 'task-timeline', 'task_lifecycle'],
    ],
  );
  assert.equal(timeline.items[0]?.summary, 'Replay failed during startup recovery.');
  assert.equal(timeline.items[1]?.actorId, 'actor-owner');
  assert.equal(timeline.items[4]?.traceId, 'trace-timeline');
});

test('queryCoreTaskTimelineView filters task history by category, kind, actor, and run', () => {
  let core = createDefaultCoreState();

  core = upsertCoreTask(
    core,
    {
      id: 'task-timeline-filter',
      title: 'Timeline filter task',
      status: 'blocked',
      conversationId: 'conversation-channel-timeline-filter',
      createdAt: '2026-03-26T16:00:00.000Z',
    },
    new Date('2026-03-26T16:00:00.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-timeline-filter',
      title: 'Timeline filter run',
      status: 'blocked',
      taskId: 'task-timeline-filter',
      conversationId: 'conversation-channel-timeline-filter',
      summary: 'Run blocked pending retry.',
      createdAt: '2026-03-26T16:01:00.000Z',
    },
    new Date('2026-03-26T16:04:00.000Z'),
  ).core;
  core = appendCoreActivity(
    core,
    {
      id: 'activity-timeline-filter-operator',
      kind: 'operator_action',
      taskId: 'task-timeline-filter',
      runId: 'run-timeline-filter',
      actorId: 'actor-owner',
      message: 'Operator requested a retry.',
      createdAt: '2026-03-26T16:05:00.000Z',
      metadata: {
        source: 'core-operator-actions',
      },
    },
    new Date('2026-03-26T16:05:00.000Z'),
  ).core;
  core = appendCoreActivity(
    core,
    {
      id: 'activity-timeline-filter-recovery',
      kind: 'note',
      taskId: 'task-timeline-filter',
      runId: 'run-timeline-filter',
      message: 'Recovery replay failed.',
      createdAt: '2026-03-26T16:06:00.000Z',
      metadata: {
        source: 'orchestrator-startup-recovery',
        replayPhase: 'replay_failed',
      },
    },
    new Date('2026-03-26T16:06:00.000Z'),
  ).core;

  const task = core.tasks.find((candidate) => candidate.id === 'task-timeline-filter');
  assert.ok(task);

  const result = queryCoreTaskTimelineView(core, task, {
    categories: ['operator', 'recovery'],
    kinds: ['activity'],
    actorIds: ['actor-owner', ''],
    runIds: ['run-timeline-filter'],
    limit: 1,
  });

  assert.equal(result.summary.totalAvailable, 4);
  assert.equal(result.summary.matching, 2);
  assert.equal(result.summary.returned, 1);
  assert.equal(result.timeline.latestTimestamp, '2026-03-26T16:06:00.000Z');
  assert.deepEqual(result.timeline.counts, {
    total: 1,
    taskLifecycle: 0,
    governance: 0,
    execution: 0,
    workflow: 0,
    recovery: 1,
    operator: 0,
  });
  assert.deepEqual(
    result.timeline.items.map((item) => [item.kind, item.recordId, item.category]),
    [['activity', 'activity-timeline-filter-recovery', 'recovery']],
  );
});

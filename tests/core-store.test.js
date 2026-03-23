import assert from 'node:assert/strict';
import test from 'node:test';

import { MemoryCoreStore } from '../dist-server/core/store.js';
import {
  appendCoreTrace,
  appendCoreActivity,
  buildApprovalQueue,
  createDefaultCoreState,
  patchOwnerProfile,
  upsertCoreApprovalBinding,
  upsertCoreArtifact,
  upsertCoreCheckpoint,
  upsertCoreOutcome,
  upsertCoreProject,
  upsertCoreRun,
  upsertCoreTask,
  upsertCoreWorkItem,
  writeApprovalDecision,
} from '../dist-server/core/model.js';
import { createSharedCoreFixtureBundle } from '../dist-server/shared/core.js';

test('MemoryCoreStore exposes a neutral read/write boundary for Cats Core state', async () => {
  const initialState = createDefaultCoreState();
  const store = new MemoryCoreStore(initialState);

  const firstRead = await store.readCore();
  assert.deepEqual(firstRead, initialState);
  assert.notStrictEqual(firstRead, initialState);

  const nextState = structuredClone(firstRead);
  nextState.setupCompleteAt = '2026-03-21T00:00:00.000Z';
  nextState.ownerProfile.displayName = 'Suite Owner';

  const written = await store.writeCore(nextState);
  const secondRead = await store.readCore();

  assert.equal(written.setupCompleteAt, '2026-03-21T00:00:00.000Z');
  assert.equal(secondRead.ownerProfile.displayName, 'Suite Owner');

  nextState.ownerProfile.displayName = 'Mutated after write';
  assert.equal(secondRead.ownerProfile.displayName, 'Suite Owner');
});

test('buildApprovalQueue only surfaces tasks that are actually pending approval', () => {
  const core = createDefaultCoreState();
  core.tasks.push(
    {
      id: 'task-draft',
      title: 'Draft task',
      status: 'draft',
      conversationId: null,
      ownerActorId: 'actor-owner',
      orchestratorActorId: 'actor-orchestrator-global',
      assignedActorIds: [],
      summary: null,
      approval: {
        status: 'not_requested',
        requestedAt: null,
        decidedAt: null,
        decidedByActorId: null,
        notes: null,
      },
      createdAt: '2026-03-21T00:00:00.000Z',
      updatedAt: '2026-03-21T00:00:00.000Z',
    },
    {
      id: 'task-pending',
      title: 'Pending approval task',
      status: 'pending_approval',
      conversationId: 'conversation-1',
      ownerActorId: 'actor-owner',
      orchestratorActorId: 'actor-orchestrator-global',
      assignedActorIds: ['actor-cat-1'],
      summary: 'Needs owner decision',
      approval: {
        status: 'pending',
        requestedAt: '2026-03-21T00:01:00.000Z',
        decidedAt: null,
        decidedByActorId: null,
        notes: 'Approve before dispatch',
      },
      createdAt: '2026-03-21T00:00:00.000Z',
      updatedAt: '2026-03-21T00:01:00.000Z',
    },
    {
      id: 'task-stale-pending',
      title: 'Stale pending approval task',
      status: 'in_progress',
      conversationId: 'conversation-2',
      ownerActorId: 'actor-owner',
      orchestratorActorId: 'actor-orchestrator-global',
      assignedActorIds: ['actor-cat-2'],
      summary: 'Approval should not stay queued once work has started',
      approval: {
        status: 'pending',
        requestedAt: '2026-03-21T00:02:00.000Z',
        decidedAt: null,
        decidedByActorId: null,
        notes: 'Stale approval marker',
      },
      createdAt: '2026-03-21T00:00:00.000Z',
      updatedAt: '2026-03-21T00:02:00.000Z',
    },
  );

  const approvals = buildApprovalQueue(core);

  assert.equal(approvals.length, 1);
  assert.equal(approvals[0].taskId, 'task-pending');
  assert.equal(approvals[0].status, 'pending');
  assert.equal(approvals[0].requiresOwnerDecision, true);
});

test('core model helpers persist owner profile, task approvals, and system records', () => {
  let core = createDefaultCoreState();

  core = patchOwnerProfile(
    core,
    {
      displayName: 'Suite Owner',
      decisionPreferences: ['show options first'],
    },
    new Date('2026-03-21T00:00:00.000Z'),
  ).core;

  const taskWrite = upsertCoreTask(
    core,
    {
      id: 'task-system-1',
      title: 'Review orchestrator plan',
      conversationId: 'conversation-system-1',
      summary: 'Wait for owner approval before dispatch.',
    },
    new Date('2026-03-21T00:01:00.000Z'),
  );
  core = taskWrite.core;

  core = writeApprovalDecision(
    core,
    {
      taskId: 'task-system-1',
      status: 'pending',
      requestedByActorId: 'actor-orchestrator-global',
      notes: 'Need owner confirmation.',
    },
    new Date('2026-03-21T00:02:00.000Z'),
  ).core;

  core = upsertCoreRun(
    core,
    {
      id: 'run-system-1',
      title: 'Primary orchestrator dispatch',
      status: 'running',
      conversationId: 'conversation-system-1',
      taskId: 'task-system-1',
      traceId: 'trace-system-1',
    },
    new Date('2026-03-21T00:03:00.000Z'),
  ).core;

  core = appendCoreTrace(
    core,
    {
      id: 'trace-record-1',
      traceId: 'trace-system-1',
      kind: 'dispatch',
      conversationId: 'conversation-system-1',
      runId: 'run-system-1',
      taskId: 'task-system-1',
      message: 'Dispatching plan to Team 2 substrate.',
    },
    new Date('2026-03-21T00:04:00.000Z'),
  ).core;

  core = upsertCoreCheckpoint(
    core,
    {
      id: 'checkpoint-system-1',
      label: 'approval-gate',
      status: 'open',
      conversationId: 'conversation-system-1',
      runId: 'run-system-1',
      taskId: 'task-system-1',
      sourceTraceId: 'trace-record-1',
      summary: 'Waiting for owner approval.',
    },
    new Date('2026-03-21T00:05:00.000Z'),
  ).core;

  core = upsertCoreOutcome(
    core,
    {
      id: 'outcome-system-1',
      title: 'Approval gate recorded',
      status: 'blocked',
      conversationId: 'conversation-system-1',
      runId: 'run-system-1',
      taskId: 'task-system-1',
      summary: 'Run is blocked pending owner approval.',
    },
    new Date('2026-03-21T00:06:00.000Z'),
  ).core;

  const approvals = buildApprovalQueue(core);

  assert.equal(core.ownerProfile.displayName, 'Suite Owner');
  assert.deepEqual(core.ownerProfile.decisionPreferences, ['show options first']);
  assert.equal(core.tasks.length, 1);
  assert.equal(core.tasks[0].approval.status, 'pending');
  assert.equal(core.runs.length, 1);
  assert.equal(core.traces.length, 1);
  assert.equal(core.checkpoints.length, 1);
  assert.equal(core.outcomes.length, 1);
  assert.equal(approvals.length, 1);
  assert.equal(approvals[0].taskId, 'task-system-1');
});

test('writeApprovalDecision preserves the first terminal decision timestamp and rejects invalid transitions', () => {
  let core = createDefaultCoreState();

  core = upsertCoreTask(
    core,
    {
      id: 'task-system-approval',
      title: 'Approval state machine',
      status: 'pending_approval',
    },
    new Date('2026-03-21T01:00:00.000Z'),
  ).core;

  core = writeApprovalDecision(
    core,
    {
      taskId: 'task-system-approval',
      status: 'pending',
      requestedByActorId: 'actor-orchestrator-global',
    },
    new Date('2026-03-21T01:01:00.000Z'),
  ).core;

  core = writeApprovalDecision(
    core,
    {
      taskId: 'task-system-approval',
      status: 'approved',
      decidedByActorId: 'actor-owner',
    },
    new Date('2026-03-21T01:02:00.000Z'),
  ).core;

  const firstDecisionAt = core.tasks[0].approval.decidedAt;
  assert.equal(firstDecisionAt, '2026-03-21T01:02:00.000Z');
  assert.equal(core.tasks[0].approval.decisionAction, 'approve');

  core = writeApprovalDecision(
    core,
    {
      taskId: 'task-system-approval',
      status: 'approved',
      decidedByActorId: 'actor-owner',
    },
    new Date('2026-03-21T01:03:00.000Z'),
  ).core;

  assert.equal(core.tasks[0].approval.decidedAt, firstDecisionAt);

  assert.throws(
    () => writeApprovalDecision(
      core,
      {
        taskId: 'task-system-approval',
        status: 'pending',
      },
      new Date('2026-03-21T01:04:00.000Z'),
    ),
    /Approval transition not allowed/,
  );

  let rejectedCore = createDefaultCoreState();
  rejectedCore = upsertCoreTask(
    rejectedCore,
    {
      id: 'task-system-reject',
      title: 'Rejected review',
      status: 'pending_approval',
    },
    new Date('2026-03-21T01:05:00.000Z'),
  ).core;
  rejectedCore = writeApprovalDecision(
    rejectedCore,
    {
      taskId: 'task-system-reject',
      status: 'pending',
    },
    new Date('2026-03-21T01:06:00.000Z'),
  ).core;
  rejectedCore = writeApprovalDecision(
    rejectedCore,
    {
      taskId: 'task-system-reject',
      status: 'rejected',
      decidedByActorId: 'actor-owner',
    },
    new Date('2026-03-21T01:07:00.000Z'),
  ).core;

  assert.equal(rejectedCore.tasks[0].status, 'pending_approval');
  assert.equal(rejectedCore.tasks[0].approval.status, 'rejected');
  assert.equal(rejectedCore.tasks[0].approval.decisionAction, 'reject');
});

test('writeApprovalDecision supports reroute as a rejected draft-seeking approval action', () => {
  let core = createDefaultCoreState();

  core = upsertCoreTask(
    core,
    {
      id: 'task-system-reroute',
      title: 'Reroute this plan',
      status: 'pending_approval',
    },
    new Date('2026-03-21T01:10:00.000Z'),
  ).core;

  core = writeApprovalDecision(
    core,
    {
      taskId: 'task-system-reroute',
      status: 'pending',
    },
    new Date('2026-03-21T01:11:00.000Z'),
  ).core;

  core = writeApprovalDecision(
    core,
    {
      taskId: 'task-system-reroute',
      status: 'rejected',
      action: 'reroute',
      decidedByActorId: 'actor-owner',
    },
    new Date('2026-03-21T01:12:00.000Z'),
  ).core;

  assert.equal(core.tasks[0].status, 'draft');
  assert.equal(core.tasks[0].approval.status, 'rejected');
  assert.equal(core.tasks[0].approval.decisionAction, 'reroute');
});

test('upsertCoreCheckpoint keeps completed checkpoints consistent with completedAt', () => {
  let core = createDefaultCoreState();

  const completed = upsertCoreCheckpoint(
    core,
    {
      id: 'checkpoint-complete-1',
      label: 'done',
      status: 'completed',
      completedAt: null,
    },
    new Date('2026-03-21T02:00:00.000Z'),
  );
  core = completed.core;

  assert.equal(core.checkpoints[0].status, 'completed');
  assert.equal(core.checkpoints[0].completedAt, '2026-03-21T02:00:00.000Z');

  assert.throws(
    () => upsertCoreCheckpoint(
      core,
      {
        id: 'checkpoint-open-1',
        label: 'still-open',
        status: 'open',
        completedAt: '2026-03-21T02:05:00.000Z',
      },
      new Date('2026-03-21T02:06:00.000Z'),
    ),
    /completedAt can only be set when status is completed/,
  );
});

test('shared core write helpers persist reusable project, work-item, artifact, activity, and approval-binding records', () => {
  const fixtures = createSharedCoreFixtureBundle();
  let core = createDefaultCoreState();

  core = upsertCoreProject(core, fixtures.project, new Date('2026-03-21T03:00:00.000Z')).core;
  core = upsertCoreWorkItem(core, fixtures.workItem, new Date('2026-03-21T03:01:00.000Z')).core;
  core = upsertCoreTask(core, fixtures.task, new Date('2026-03-21T03:02:00.000Z')).core;
  core = upsertCoreRun(core, fixtures.run, new Date('2026-03-21T03:03:00.000Z')).core;
  core = upsertCoreArtifact(core, fixtures.artifact, new Date('2026-03-21T03:04:00.000Z')).core;
  core = appendCoreActivity(core, fixtures.activity, new Date('2026-03-21T03:05:00.000Z')).core;
  core = upsertCoreApprovalBinding(
    core,
    fixtures.approvalBinding,
    new Date('2026-03-21T03:06:00.000Z'),
  ).core;

  assert.equal(core.projects.length, 1);
  assert.equal(core.projects[0].id, fixtures.project.id);
  assert.equal(core.workItems.length, 1);
  assert.equal(core.workItems[0].projectId, fixtures.project.id);
  assert.equal(core.artifacts.length, 1);
  assert.equal(core.artifacts[0].workItemId, fixtures.workItem.id);
  assert.equal(core.activities.length, 1);
  assert.equal(core.activities[0].artifactId, fixtures.artifact.id);
  assert.equal(core.approvalBindings.length, 1);
  assert.equal(core.approvalBindings[0].approvalTaskId, fixtures.task.id);
});

test('appendCoreActivity rejects duplicate activity ids and approval bindings require an existing task', () => {
  const fixtures = createSharedCoreFixtureBundle();
  let core = createDefaultCoreState();

  core = upsertCoreTask(core, fixtures.task, new Date('2026-03-21T04:00:00.000Z')).core;
  core = appendCoreActivity(
    core,
    fixtures.activity,
    new Date('2026-03-21T04:01:00.000Z'),
  ).core;

  assert.throws(
    () =>
      appendCoreActivity(
        core,
        fixtures.activity,
        new Date('2026-03-21T04:02:00.000Z'),
      ),
    /Activity already exists/,
  );

  assert.throws(
    () =>
      upsertCoreApprovalBinding(
        createDefaultCoreState(),
        fixtures.approvalBinding,
        new Date('2026-03-21T04:03:00.000Z'),
      ),
    /Task not found/,
  );
});

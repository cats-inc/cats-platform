import assert from 'node:assert/strict';
import test from 'node:test';

import { MemoryCoreStore } from '../dist-server/core/store.js';
import {
  appendCoreTrace,
  buildApprovalQueue,
  createDefaultCoreState,
  patchOwnerProfile,
  upsertCoreCheckpoint,
  upsertCoreOutcome,
  upsertCoreRun,
  upsertCoreTask,
  writeApprovalDecision,
} from '../dist-server/core/model.js';

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
      assignedActorIds: ['actor-pal-1'],
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
      assignedActorIds: ['actor-pal-2'],
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

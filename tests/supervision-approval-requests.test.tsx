import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApprovalQueue } from '../src/core/approvalQueue.ts';
import {
  createDefaultCoreState,
  upsertCoreRun,
  upsertCoreTask,
} from '../src/core/model/index.ts';
import {
  persistSupervisionApprovalRequest,
} from '../src/platform/supervision/index.ts';

test('supervision approval requests enter the production approval queue via run binding', () => {
  let core = createDefaultCoreState();
  core = upsertCoreTask(
    core,
    {
      id: 'task-parent-supervision-approval',
      title: 'Parent supervised task',
      status: 'in_progress',
      conversationId: 'conversation-supervision-approval',
      createdAt: '2026-04-25T15:00:00.000Z',
    },
    new Date('2026-04-25T15:00:00.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-supervision-approval',
      title: 'Run with approval request',
      status: 'running',
      conversationId: 'conversation-supervision-approval',
      taskId: 'task-parent-supervision-approval',
      createdAt: '2026-04-25T15:01:00.000Z',
    },
    new Date('2026-04-25T15:01:00.000Z'),
  ).core;

  const result = persistSupervisionApprovalRequest({
    core,
    runId: 'run-supervision-approval',
    approvalRequestId: 'run-supervision-approval:action-approval:approval',
    actionId: 'action-approval',
    toolName: 'work.approval_gated.apply',
    summary: 'Apply approval-gated Work change.',
    requestedByActorId: 'agent:boss',
    now: new Date('2026-04-25T15:02:00.000Z'),
  });
  const approvalQueue = buildApprovalQueue(result.core);

  assert.equal(result.created, true);
  assert.equal(result.task.status, 'pending_approval');
  assert.equal(result.task.approval.status, 'pending');
  assert.equal(result.task.parentTaskId, 'task-parent-supervision-approval');
  assert.equal(result.approvalBinding.subjectKind, 'run');
  assert.equal(result.approvalBinding.subjectId, 'run-supervision-approval');
  assert.equal(
    (result.approvalBinding.metadata.supervisionApproval as Record<string, unknown>)
      .approvalRequestId,
    'run-supervision-approval:action-approval:approval',
  );
  assert.equal(approvalQueue.length, 1);
  assert.equal(approvalQueue[0]?.taskId, result.task.id);
  assert.equal(approvalQueue[0]?.requestedByActorId, 'agent:boss');

  const repeated = persistSupervisionApprovalRequest({
    core: result.core,
    runId: 'run-supervision-approval',
    approvalRequestId: 'run-supervision-approval:action-approval:approval',
    actionId: 'action-approval',
    toolName: 'work.approval_gated.apply',
    summary: 'Apply approval-gated Work change.',
    requestedByActorId: 'agent:boss',
    now: new Date('2026-04-25T15:03:00.000Z'),
  });

  assert.equal(repeated.created, false);
  assert.equal(repeated.core.approvalBindings.length, 1);
  assert.equal(
    repeated.core.tasks.filter((task) =>
      (task.metadata.supervisionApproval as Record<string, unknown> | undefined)
        ?.approvalRequestId === 'run-supervision-approval:action-approval:approval').length,
    1,
  );
});

test('supervision approval request persistence requires an existing run', () => {
  assert.throws(
    () =>
      persistSupervisionApprovalRequest({
        core: createDefaultCoreState(),
        runId: 'run-missing',
        approvalRequestId: 'approval-missing',
        actionId: 'action-missing',
        toolName: 'work.approval_gated.apply',
        summary: 'Missing run should reject.',
        requestedByActorId: 'agent:boss',
        now: new Date('2026-04-25T15:04:00.000Z'),
      }),
    /Run not found: run-missing/u,
  );
});

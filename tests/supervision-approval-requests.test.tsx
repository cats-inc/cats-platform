import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { buildApprovalQueue } from '../src/core/approvalQueue.ts';
import { routeCoreApprovalsApi } from '../src/core/api/controlApprovals.ts';
import {
  createDefaultCoreState,
  upsertCoreRun,
  upsertCoreTask,
  writeApprovalDecision,
} from '../src/core/model/index.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import {
  applySupervisionApprovalDecision,
  persistSupervisionApprovalRequest,
} from '../src/platform/supervision/index.ts';

let seedCounter = 0;

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

test('supervision approval decisions synchronize back to run state metadata', () => {
  const seeded = seedApprovalRequest();
  const approved = writeApprovalDecision(
    seeded.core,
    {
      taskId: seeded.approvalTaskId,
      status: 'approved',
      action: 'approve',
      decidedByActorId: 'owner:local',
    },
    new Date('2026-04-25T15:10:00.000Z'),
  );
  const approvedSync = applySupervisionApprovalDecision({
    core: approved.core,
    approvalTaskId: seeded.approvalTaskId,
    fallbackPolicy: 'retry',
    now: new Date('2026-04-25T15:10:00.000Z'),
  });
  const approvedRun = approvedSync.core.runs.find((run) => run.id === seeded.runId);
  const approvedRunState = (
    approvedRun?.metadata.supervision as Record<string, unknown> | undefined
  )?.runState as Record<string, unknown> | undefined;
  const approvedRequests = approvedRunState?.approvalRequests as Array<
    Record<string, unknown>
  > | undefined;

  assert.equal(approvedSync.approvalRequest.state, 'approved');
  assert.equal(approvedRun?.status, 'running');
  assert.equal(approvedRunState?.primaryState, 'running');
  assert.equal(approvedRequests?.[0]?.state, 'approved');

  const deniedSeed = seedApprovalRequest();
  const rejected = writeApprovalDecision(
    deniedSeed.core,
    {
      taskId: deniedSeed.approvalTaskId,
      status: 'rejected',
      action: 'reject',
      decidedByActorId: 'owner:local',
    },
    new Date('2026-04-25T15:11:00.000Z'),
  );
  const deniedSync = applySupervisionApprovalDecision({
    core: rejected.core,
    approvalTaskId: deniedSeed.approvalTaskId,
    fallbackPolicy: 'ask_human',
    now: new Date('2026-04-25T15:11:00.000Z'),
  });
  const deniedRun = deniedSync.core.runs.find((run) => run.id === deniedSeed.runId);
  const deniedRunState = (
    deniedRun?.metadata.supervision as Record<string, unknown> | undefined
  )?.runState as Record<string, unknown> | undefined;

  assert.equal(deniedSync.approvalRequest.state, 'denied');
  assert.equal(deniedRun?.status, 'failed');
  assert.equal(deniedRunState?.primaryState, 'failed');
  assert.equal(
    deniedRunState?.terminalCause,
    `approval denied: ${deniedSeed.approvalRequestId}`,
  );
});

test('core approvals route synchronizes supervision approval decisions to runs', async (t) => {
  const seeded = seedApprovalRequest();
  const coreStore = new MemoryCoreStore(seeded.core);
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const handled = await routeCoreApprovalsApi({
      request,
      response,
      url,
      method: request.method ?? 'GET',
      dependencies: {
        coreStore,
        now: () => new Date('2026-04-25T15:12:00.000Z'),
      },
    });

    if (!handled) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not found' }));
    }
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const response = await fetch(`http://127.0.0.1:${address.port}/api/core/approvals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      taskId: seeded.approvalTaskId,
      status: 'approved',
      action: 'approve',
      decidedByActorId: 'owner:local',
      supervisionFallbackPolicy: 'retry',
    }),
  });
  const payload = await response.json();
  const core = await coreStore.readCore();
  const run = core.runs.find((candidate) => candidate.id === seeded.runId);
  const runState = (
    run?.metadata.supervision as Record<string, unknown> | undefined
  )?.runState as Record<string, unknown> | undefined;

  assert.equal(response.status, 200);
  assert.deepEqual(payload.supervisionApprovalSync, {
    runId: seeded.runId,
    approvalRequestId: seeded.approvalRequestId,
    state: 'approved',
  });
  assert.equal(runState?.primaryState, 'running');
});

function seedApprovalRequest(): {
  core: ReturnType<typeof createDefaultCoreState>;
  runId: string;
  approvalTaskId: string;
  approvalRequestId: string;
} {
  let core = createDefaultCoreState();
  seedCounter += 1;
  const runId = `run-supervision-decision-${seedCounter}`;
  const approvalRequestId = `${runId}:action-approval:approval`;
  core = upsertCoreRun(
    core,
    {
      id: runId,
      title: 'Run with approval decision',
      status: 'running',
      conversationId: 'conversation-supervision-decision',
      createdAt: '2026-04-25T15:09:00.000Z',
    },
    new Date('2026-04-25T15:09:00.000Z'),
  ).core;
  const persisted = persistSupervisionApprovalRequest({
    core,
    runId,
    approvalRequestId,
    actionId: 'action-approval',
    toolName: 'work.approval_gated.apply',
    summary: 'Apply approval-gated Work change.',
    requestedByActorId: 'agent:boss',
    now: new Date('2026-04-25T15:09:30.000Z'),
  });

  return {
    core: persisted.core,
    runId,
    approvalTaskId: persisted.task.id,
    approvalRequestId,
  };
}

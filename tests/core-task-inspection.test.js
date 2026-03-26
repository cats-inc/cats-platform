import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendCoreActivity,
  appendCoreTrace,
  buildApprovalQueue,
  createDefaultCoreState,
  upsertCoreCheckpoint,
  upsertCoreOutcome,
  upsertCoreRun,
  upsertCoreTask,
  writeApprovalDecision,
} from '../dist-server/core/model/index.js';
import { buildCoreTaskInspectionView } from '../dist-server/core/taskInspection.js';
import {
  buildOrchestratorDispatchReplayRequest,
  writeOrchestratorDispatchReplayMetadata,
} from '../dist-server/platform/orchestration/dispatchReplay.js';

test('buildCoreTaskInspectionView combines governance, workflow, and recovery details', () => {
  const now = new Date('2026-03-26T14:00:00.000Z');
  let core = createDefaultCoreState();

  core = upsertCoreTask(
    core,
    {
      id: 'task-inspection',
      title: 'Inspect one task',
      status: 'pending_approval',
      conversationId: 'conversation-channel-inspection',
      createdAt: '2026-03-26T13:50:00.000Z',
      metadata: writeOrchestratorDispatchReplayMetadata(
        {
          effectiveDeliveryMode: 'commit_only',
          effectiveDeliveryGates: ['owner_approval_required'],
        },
        buildOrchestratorDispatchReplayRequest({
          channelId: 'channel-inspection',
          body: 'Retry the blocked rollout after approval.',
          recordedAt: '2026-03-26T13:55:00.000Z',
        }),
        {
          replayState: 'failed',
          replayTrigger: 'retry',
          replayAttemptAt: '2026-03-26T13:56:00.000Z',
          replayError: 'rate limited',
          sourceMessageId: 'message-inspection',
        },
      ),
    },
    now,
  ).core;
  core = writeApprovalDecision(
    core,
    {
      taskId: 'task-inspection',
      status: 'pending',
      requestedByActorId: 'actor-orchestrator-global',
      notes: 'Need approval before retrying.',
    },
    now,
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-inspection',
      title: 'Inspect run',
      status: 'blocked',
      conversationId: 'conversation-channel-inspection',
      taskId: 'task-inspection',
      summary: 'Blocked waiting for approval.',
      createdAt: '2026-03-26T13:57:00.000Z',
      metadata: {
        workflowStageId: 'continuation_handoff',
        workflowShape: 'sequential',
        dispatchCount: 1,
        continuationCount: 1,
        targetCount: 1,
      },
    },
    now,
  ).core;
  core = upsertCoreCheckpoint(
    core,
    {
      id: 'checkpoint-inspection',
      label: 'owner-gate',
      status: 'open',
      conversationId: 'conversation-channel-inspection',
      taskId: 'task-inspection',
      runId: 'run-inspection',
      summary: 'Awaiting approval.',
      createdAt: '2026-03-26T13:58:00.000Z',
    },
    now,
  ).core;
  core = upsertCoreOutcome(
    core,
    {
      id: 'outcome-inspection',
      title: 'Blocked',
      status: 'blocked',
      conversationId: 'conversation-channel-inspection',
      taskId: 'task-inspection',
      runId: 'run-inspection',
      summary: 'Blocked before retry.',
      recordedAt: '2026-03-26T13:59:00.000Z',
    },
    now,
  ).core;
  core = appendCoreTrace(
    core,
    {
      id: 'trace-inspection',
      traceId: 'trace-inspection',
      kind: 'approval',
      conversationId: 'conversation-channel-inspection',
      taskId: 'task-inspection',
      runId: 'run-inspection',
      message: 'Approval still pending.',
      createdAt: '2026-03-26T13:59:30.000Z',
    },
    now,
  ).core;
  core = appendCoreActivity(
    core,
    {
      id: 'activity-inspection',
      kind: 'note',
      conversationId: 'conversation-channel-inspection',
      taskId: 'task-inspection',
      runId: 'run-inspection',
      message: 'Replay failed after retry.',
      createdAt: '2026-03-26T13:59:40.000Z',
      metadata: {
        source: 'orchestrator-replay',
        replayPhase: 'replay_failed',
      },
    },
    now,
  ).core;

  const task = core.tasks.find((candidate) => candidate.id === 'task-inspection');
  assert.ok(task);

  const inspection = buildCoreTaskInspectionView(core, task);

  assert.equal(inspection.approvalQueueItem?.taskId, 'task-inspection');
  assert.equal(buildApprovalQueue(core).length, 1);
  assert.equal(inspection.latestRun?.id, 'run-inspection');
  assert.equal(inspection.latestCheckpoint?.id, 'checkpoint-inspection');
  assert.equal(inspection.latestOutcome?.id, 'outcome-inspection');
  assert.equal(inspection.governanceSummary?.approval.pending, true);
  assert.equal(inspection.workflowSummary?.shape, 'sequential');
  assert.equal(inspection.workflowSummary?.dispatchCount, 1);
  assert.equal(inspection.recovery.dispatchReplay?.replayError, 'rate limited');
  assert.equal(inspection.recovery.latestActivity?.phase, 'replay_failed');
  assert.deepEqual(inspection.counts, {
    runs: 1,
    outcomes: 1,
    checkpoints: 1,
    traces: 1,
    activities: 1,
  });
});

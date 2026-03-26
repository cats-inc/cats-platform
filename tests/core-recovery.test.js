import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendCoreActivity,
  createDefaultCoreState,
  upsertCoreTask,
} from '../dist-server/core/model/index.js';
import {
  buildCoreTaskRecoveryView,
  listCoreTaskRecoveryViews,
  queryCoreTaskRecoveryViews,
} from '../dist-server/core/recovery.js';
import {
  buildOrchestratorDispatchReplayRequest,
  writeOrchestratorDispatchReplayMetadata,
} from '../dist-server/platform/orchestration/dispatchReplay.js';
import {
  buildPendingOrchestratorDispatchRequest,
  writePendingOrchestratorDispatchMetadata,
} from '../dist-server/platform/orchestration/pendingDispatch.js';
import {
  buildWorkflowContinuationReplayRequest,
  writeWorkflowContinuationReplayMetadata,
} from '../dist-server/platform/orchestration/workflowContinuationReplay.js';

test('buildCoreTaskRecoveryView normalizes stored replay metadata into one recovery view', () => {
  const now = new Date('2026-03-26T12:00:00.000Z');
  let core = createDefaultCoreState();

  core = upsertCoreTask(
    core,
    {
      id: 'task-recovery-view',
      title: 'Recover blocked orchestrator task',
      status: 'blocked',
      conversationId: 'conversation-channel-recovery',
      approval: {
        status: 'pending',
        requestedAt: '2026-03-26T11:55:00.000Z',
      },
      createdAt: '2026-03-26T11:54:00.000Z',
      metadata: writeWorkflowContinuationReplayMetadata(
        writeOrchestratorDispatchReplayMetadata(
          writePendingOrchestratorDispatchMetadata(
            {},
            buildPendingOrchestratorDispatchRequest({
              channelId: 'channel-recovery',
              body: 'Please continue the blocked workflow with a narrower plan.',
              senderName: 'Owner',
              blockedAt: '2026-03-26T11:56:00.000Z',
            }),
            {
              replayState: 'failed',
              replayTrigger: 'approve',
              replayAttemptAt: '2026-03-26T11:57:00.000Z',
              replayError: 'owner unreachable',
            },
          ),
          buildOrchestratorDispatchReplayRequest({
            channelId: 'channel-recovery',
            body: 'Please continue the blocked workflow with a narrower plan.',
            senderName: 'Owner',
            recordedAt: '2026-03-26T11:56:00.000Z',
          }),
          {
            replayState: 'ready',
            replayTrigger: 'retry',
            replayAttemptAt: '2026-03-26T11:58:00.000Z',
            sourceMessageId: 'message-recovery',
          },
        ),
        buildWorkflowContinuationReplayRequest({
          channelId: 'channel-recovery',
          checkpointId: 'checkpoint-recovery',
          sourceMessageId: 'message-recovery',
          sourceParticipant: {
            participantKind: 'cat',
            participantId: 'cat-inline',
            participantName: 'Inline-Agent',
          },
          targets: [
            {
              participantKind: 'cat',
              participantId: 'cat-followup',
              participantName: 'Followup-Agent',
            },
          ],
          mentionNames: ['Followup-Agent'],
          branchStrategy: 'transplant_context',
          workflowStageId: 'continuation_handoff',
          workflowShape: 'sequential',
          reviewRequired: true,
          continuationSource: 'workflow_recommendation',
          unresolvedTargets: ['Ghost Cat'],
          recordedAt: '2026-03-26T11:59:00.000Z',
        }),
        {
          replayState: 'failed',
          replayTrigger: 'retry',
          replayAttemptAt: '2026-03-26T11:59:30.000Z',
          replayError: 'guard tripped',
        },
      ),
    },
    now,
  ).core;

  core = appendCoreActivity(
    core,
    {
      id: 'activity-recovery-failed',
      kind: 'note',
      conversationId: 'conversation-channel-recovery',
      taskId: 'task-recovery-view',
      message: 'Workflow continuation replay failed after retry.',
      createdAt: '2026-03-26T12:00:30.000Z',
      metadata: {
        source: 'workflow-continuation-replay',
        replayPhase: 'replay_failed',
        replayTrigger: 'retry',
        error: 'guard tripped',
        resultCount: 0,
      },
    },
    now,
  ).core;

  const task = core.tasks.find((candidate) => candidate.id === 'task-recovery-view');
  assert.ok(task);

  const recovery = buildCoreTaskRecoveryView(core, task);

  assert.equal(recovery.recoveryRequired, true);
  assert.equal(recovery.canResumeViaApproval, true);
  assert.equal(recovery.canRetry, true);
  assert.deepEqual(recovery.approvalActions.map((action) => action.kind), [
    'approve',
    'reroute',
    'reject',
  ]);
  assert.deepEqual(recovery.incidentActions.map((action) => action.kind), [
    'retry',
  ]);
  assert.equal(recovery.approval.status, 'pending');
  assert.equal(recovery.pendingDispatch?.blockedReason, 'approval_pending');
  assert.equal(recovery.pendingDispatch?.replayState, 'failed');
  assert.equal(recovery.dispatchReplay?.sourceMessageId, 'message-recovery');
  assert.equal(recovery.dispatchReplay?.replayState, 'ready');
  assert.equal(recovery.workflowContinuationReplay?.checkpointId, 'checkpoint-recovery');
  assert.equal(recovery.workflowContinuationReplay?.reviewRequired, true);
  assert.equal(
    recovery.workflowContinuationReplay?.targets[0]?.participantName,
    'Followup-Agent',
  );
  assert.equal(recovery.latestActivity?.phase, 'replay_failed');
  assert.equal(recovery.latestActivity?.source, 'workflow-continuation-replay');
});

test('listCoreTaskRecoveryViews filters plain tasks and sorts latest recovery first', () => {
  const now = new Date('2026-03-26T13:00:00.000Z');
  let core = createDefaultCoreState();

  core = upsertCoreTask(
    core,
    {
      id: 'task-plain',
      title: 'Plain task',
      status: 'queued',
      conversationId: 'conversation-plain',
      createdAt: '2026-03-26T12:40:00.000Z',
    },
    now,
  ).core;

  core = upsertCoreTask(
    core,
    {
      id: 'task-older-recovery',
      title: 'Older recovery task',
      status: 'blocked',
      createdAt: '2026-03-26T12:41:00.000Z',
      metadata: writePendingOrchestratorDispatchMetadata(
        {},
        buildPendingOrchestratorDispatchRequest({
          channelId: 'channel-older',
          body: 'Older blocked dispatch',
          blockedAt: '2026-03-26T12:42:00.000Z',
        }),
      ),
    },
    now,
  ).core;

  core = upsertCoreTask(
    core,
    {
      id: 'task-newer-recovery',
      title: 'Newer recovery task',
      status: 'failed',
      createdAt: '2026-03-26T12:43:00.000Z',
      metadata: writeOrchestratorDispatchReplayMetadata(
        {},
        buildOrchestratorDispatchReplayRequest({
          channelId: 'channel-newer',
          body: 'Newer blocked dispatch',
          recordedAt: '2026-03-26T12:44:00.000Z',
        }),
        {
          replayState: 'failed',
          replayTrigger: 'retry',
          replayAttemptAt: '2026-03-26T12:45:00.000Z',
          replayError: 'rate limited',
        },
      ),
    },
    now,
  ).core;

  core = appendCoreActivity(
    core,
    {
      id: 'activity-newer-recovery',
      kind: 'note',
      taskId: 'task-newer-recovery',
      message: 'Newest replay activity.',
      createdAt: '2026-03-26T12:46:00.000Z',
      metadata: {
        source: 'orchestrator-replay',
        replayPhase: 'replay_failed',
      },
    },
    now,
  ).core;

  const recoveries = listCoreTaskRecoveryViews(core);

  assert.equal(recoveries.length, 2);
  assert.deepEqual(
    recoveries.map((recovery) => recovery.taskId),
    ['task-newer-recovery', 'task-older-recovery'],
  );
});

test('queryCoreTaskRecoveryViews filters by replay flags and summarizes returned tasks', () => {
  const now = new Date('2026-03-26T13:10:00.000Z');
  let core = createDefaultCoreState();

  core = upsertCoreTask(
    core,
    {
      id: 'task-recovery-dispatch',
      title: 'Dispatch recovery task',
      status: 'blocked',
      conversationId: 'conversation-recovery',
      createdAt: '2026-03-26T13:00:00.000Z',
      metadata: writePendingOrchestratorDispatchMetadata(
        {},
        buildPendingOrchestratorDispatchRequest({
          channelId: 'channel-dispatch',
          body: 'Dispatch recovery body.',
          blockedAt: '2026-03-26T13:01:00.000Z',
        }),
      ),
    },
    now,
  ).core;
  core = upsertCoreTask(
    core,
    {
      id: 'task-recovery-workflow',
      title: 'Workflow recovery task',
      status: 'blocked',
      conversationId: 'conversation-recovery',
      createdAt: '2026-03-26T13:02:00.000Z',
      metadata: writeWorkflowContinuationReplayMetadata(
        {},
        buildWorkflowContinuationReplayRequest({
          channelId: 'channel-workflow',
          checkpointId: 'checkpoint-workflow',
          sourceMessageId: 'message-workflow',
          sourceParticipant: {
            participantKind: 'cat',
            participantId: 'cat-inline',
            participantName: 'Inline-Agent',
          },
          targets: [
            {
              participantKind: 'cat',
              participantId: 'cat-followup',
              participantName: 'Followup-Agent',
            },
          ],
          recordedAt: '2026-03-26T13:03:00.000Z',
          workflowShape: 'sequential',
        }),
      ),
    },
    now,
  ).core;

  const result = queryCoreTaskRecoveryViews(core, {
    conversationIds: ['conversation-recovery'],
    hasWorkflowContinuationReplay: true,
    limit: 1,
  });

  assert.deepEqual(result.recoveries.map((recovery) => recovery.taskId), [
    'task-recovery-workflow',
  ]);
  assert.equal(result.summary.totalAvailable, 2);
  assert.equal(result.summary.matching, 1);
  assert.equal(result.summary.returned, 1);
  assert.equal(result.summary.withWorkflowContinuationReplayCount, 1);
  assert.equal(result.summary.withPendingDispatchCount, 0);
  assert.equal(result.summary.taskStatusCounts.blocked, 1);
});

test('queryCoreTaskRecoveryViews filters by available recovery action kinds', () => {
  const now = new Date('2026-03-26T13:20:00.000Z');
  let core = createDefaultCoreState();

  core = upsertCoreTask(
    core,
    {
      id: 'task-recovery-approval-action',
      title: 'Approval action recovery task',
      status: 'blocked',
      conversationId: 'conversation-recovery-actions',
      approval: {
        status: 'pending',
        requestedAt: '2026-03-26T13:10:00.000Z',
      },
      createdAt: '2026-03-26T13:10:00.000Z',
      metadata: writePendingOrchestratorDispatchMetadata(
        {},
        buildPendingOrchestratorDispatchRequest({
          channelId: 'channel-approval',
          body: 'Blocked pending approval.',
          blockedAt: '2026-03-26T13:11:00.000Z',
        }),
      ),
    },
    now,
  ).core;
  core = upsertCoreTask(
    core,
    {
      id: 'task-recovery-retry-action',
      title: 'Retry action recovery task',
      status: 'blocked',
      conversationId: 'conversation-recovery-actions',
      createdAt: '2026-03-26T13:12:00.000Z',
      metadata: writeOrchestratorDispatchReplayMetadata(
        {},
        buildOrchestratorDispatchReplayRequest({
          channelId: 'channel-retry',
          body: 'Dispatch replay is ready for retry.',
          recordedAt: '2026-03-26T13:13:00.000Z',
        }),
        {
          replayState: 'failed',
          replayTrigger: 'retry',
          replayAttemptAt: '2026-03-26T13:14:00.000Z',
          replayError: 'rate limited',
        },
      ),
    },
    now,
  ).core;

  const approvalResult = queryCoreTaskRecoveryViews(core, {
    conversationIds: ['conversation-recovery-actions'],
    actionKinds: ['approve'],
  });
  const retryResult = queryCoreTaskRecoveryViews(core, {
    conversationIds: ['conversation-recovery-actions'],
    actionKinds: ['retry'],
  });

  assert.deepEqual(
    approvalResult.recoveries.map((recovery) => recovery.taskId),
    ['task-recovery-approval-action'],
  );
  assert.equal(approvalResult.summary.actionKindCounts.approve, 1);
  assert.equal(approvalResult.summary.actionKindCounts.retry, 0);
  assert.deepEqual(
    retryResult.recoveries.map((recovery) => recovery.taskId),
    ['task-recovery-retry-action'],
  );
  assert.equal(retryResult.summary.actionKindCounts.retry, 1);
  assert.equal(retryResult.summary.actionKindCounts.approve, 0);
});

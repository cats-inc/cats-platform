import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendCoreActivity,
  createDefaultCoreState,
  upsertCoreTask,
} from '../build/server/core/model/index.js';
import {
  buildCoreTaskRecoveryView,
  listCoreTaskRecoveryViews,
  queryCoreTaskRecoveryViews,
} from '../build/server/core/recovery.js';
import {
  buildOrchestratorDispatchReplayRequest,
  writeOrchestratorDispatchReplayMetadata,
} from '../build/server/platform/orchestration/dispatchReplay.js';
import {
  buildPendingOrchestratorDispatchRequest,
  writePendingOrchestratorDispatchMetadata,
} from '../build/server/platform/orchestration/pendingDispatch.js';
import {
  buildWorkflowContinuationReplayRequest,
  writeWorkflowContinuationReplayMetadata,
} from '../build/server/platform/orchestration/workflowContinuationReplay.js';

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
            {
              effectiveDeliveryPolicy: {
                mode: 'commit_only',
                gates: ['owner_approval_required'],
                source: 'task_override',
                rationale: 'Safer retry rollout.',
              },
              roomRoutingMode: 'boss_chat',
            },
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
          sourceTurnId: 'turn-recovery',
          sourceLaneId: 'lane-recovery',
          sourceAssistantTurnId: 'assistant-turn-recovery',
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
          blockedReason: 'max_dispatches',
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
        resumeReason: 'target_recovered',
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
  assert.equal(recovery.workflowContinuationReplay?.sourceMessageId, 'message-recovery');
  assert.equal(recovery.workflowContinuationReplay?.sourceTurnId, 'turn-recovery');
  assert.equal(recovery.workflowContinuationReplay?.sourceLaneId, 'lane-recovery');
  assert.equal(
    recovery.workflowContinuationReplay?.sourceAssistantTurnId,
    'assistant-turn-recovery',
  );
  assert.equal(recovery.workflowContinuationReplay?.reviewRequired, true);
  assert.equal(recovery.workflowContinuationReplay?.blockedReason, 'max_dispatches');
  assert.equal(recovery.context?.deliveryMode, 'commit_only');
  assert.equal(recovery.context?.deliverySource, 'task_override');
  assert.deepEqual(recovery.context?.deliveryGates, ['owner_approval_required']);
  assert.deepEqual(recovery.context?.deliveryActions, ['create_commit']);
  assert.equal(recovery.context?.workflowStageId, 'continuation_handoff');
  assert.equal(recovery.context?.workflowShape, 'sequential');
  assert.equal(recovery.context?.workflowReviewRequired, true);
  assert.equal(recovery.context?.workflowConvergeTargetId, null);
  assert.equal(recovery.context?.channelId, 'channel-recovery');
  assert.equal(recovery.context?.transport, 'web');
  assert.equal(recovery.context?.roomMode, 'boss_chat');
  assert.equal(recovery.family.rootTaskId, 'task-recovery-view');
  assert.equal(recovery.family.childCount, 0);
  assert.equal(
    recovery.workflowContinuationReplay?.targets[0]?.participantName,
    'Followup-Agent',
  );
  assert.equal(recovery.latestActivity?.phase, 'replay_failed');
  assert.equal(recovery.latestActivity?.source, 'workflow-continuation-replay');
  assert.equal(recovery.latestActivity?.resumeReason, 'target_recovered');
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
      id: 'task-recovery-root',
      title: 'Recovery root task',
      status: 'in_progress',
      conversationId: 'conversation-recovery',
      createdAt: '2026-03-26T12:59:00.000Z',
    },
    now,
  ).core;
  core = upsertCoreTask(
    core,
    {
      id: 'task-recovery-dispatch',
      title: 'Dispatch recovery task',
      status: 'blocked',
      parentTaskId: 'task-recovery-root',
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
      parentTaskId: 'task-recovery-root',
      conversationId: 'conversation-recovery',
      createdAt: '2026-03-26T13:02:00.000Z',
      metadata: writeWorkflowContinuationReplayMetadata(
        {
          effectiveDeliveryPolicy: {
            mode: 'commit_only',
            gates: ['owner_approval_required'],
            source: 'task_override',
            rationale: 'Workflow retry with owner gate.',
          },
          roomRoutingMode: 'boss_chat',
        },
        buildWorkflowContinuationReplayRequest({
          channelId: 'channel-workflow',
          checkpointId: 'checkpoint-workflow',
          sourceMessageId: 'message-workflow',
          sourceTurnId: 'turn-workflow',
          sourceLaneId: 'lane-workflow',
          sourceAssistantTurnId: 'assistant-turn-workflow',
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
          workflowStageId: 'continuation_handoff',
          workflowShape: 'sequential',
          blockedReason: 'max_dispatches',
        }),
      ),
    },
    now,
  ).core;
  core = appendCoreActivity(
    core,
    {
      id: 'activity-recovery-workflow',
      kind: 'note',
      taskId: 'task-recovery-workflow',
      conversationId: 'conversation-recovery',
      message: 'Workflow replay auto-resumed after the target recovered.',
      createdAt: '2026-03-26T13:03:30.000Z',
      metadata: {
        source: 'workflow-continuation-replay',
        replayTrigger: 'retry',
        replayPhase: 'replay_dispatched',
        resumeReason: 'target_recovered',
        resultCount: 1,
      },
    },
    now,
  ).core;

  const result = queryCoreTaskRecoveryViews(core, {
    conversationIds: ['conversation-recovery'],
    hasWorkflowContinuationReplay: true,
    deliveryModes: ['commit_only'],
    deliveryActions: ['create_commit'],
    workflowStageIds: ['continuation_handoff'],
    workflowShapes: ['sequential'],
    workflowContinuationBlockedReasons: ['max_dispatches'],
    sourceMessageIds: ['message-workflow'],
    sourceTurnIds: ['turn-workflow'],
    sourceLaneIds: ['lane-workflow'],
    sourceAssistantTurnIds: ['assistant-turn-workflow'],
    latestReplaySources: ['workflow-continuation-replay'],
    latestReplayTriggers: ['retry'],
    latestReplayPhases: ['replay_dispatched'],
    latestReplayResumeReasons: ['target_recovered'],
    rootTaskIds: ['task-recovery-root'],
    parentTaskIds: ['task-recovery-root'],
    hasChildren: false,
    hasActiveChildren: false,
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
  assert.equal(result.summary.deliveryModeCounts.commit_only, 1);
  assert.equal(result.summary.deliveryActionCounts.create_commit, 1);
  assert.equal(result.summary.workflowStageCounts.continuation_handoff, 1);
  assert.equal(result.summary.workflowShapeCounts.sequential, 1);
  assert.equal(result.summary.workflowContinuationBlockedReasonCounts.max_dispatches, 1);
  assert.equal(result.summary.latestReplaySourceCounts['workflow-continuation-replay'], 1);
  assert.equal(result.summary.latestReplayTriggerCounts.retry, 1);
  assert.equal(result.summary.latestReplayPhaseCounts.replay_dispatched, 1);
  assert.equal(result.summary.latestReplayResumeReasonCounts.target_recovered, 1);
  assert.equal(result.recoveries[0]?.family.rootTaskId, 'task-recovery-root');
  assert.equal(result.recoveries[0]?.family.parent?.taskId, 'task-recovery-root');
  assert.equal(result.recoveries[0]?.latestActivity?.resumeReason, 'target_recovered');
  assert.equal(result.summary.withChildrenCount, 0);
  assert.equal(result.summary.withActiveChildrenCount, 0);
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

test('queryCoreTaskRecoveryViews filters by replay states and summarizes replay-state counts', () => {
  const now = new Date('2026-03-26T13:30:00.000Z');
  let core = createDefaultCoreState();

  core = upsertCoreTask(
    core,
    {
      id: 'task-recovery-pending-state',
      title: 'Pending dispatch recovery task',
      status: 'blocked',
      conversationId: 'conversation-recovery-states',
      createdAt: '2026-03-26T13:21:00.000Z',
      metadata: writePendingOrchestratorDispatchMetadata(
        {},
        buildPendingOrchestratorDispatchRequest({
          channelId: 'channel-pending-state',
          body: 'Pending dispatch still awaits approval.',
          blockedAt: '2026-03-26T13:22:00.000Z',
        }),
      ),
    },
    now,
  ).core;
  core = upsertCoreTask(
    core,
    {
      id: 'task-recovery-dispatch-state',
      title: 'Dispatch replay recovery task',
      status: 'failed',
      conversationId: 'conversation-recovery-states',
      createdAt: '2026-03-26T13:23:00.000Z',
      metadata: writeOrchestratorDispatchReplayMetadata(
        {},
        buildOrchestratorDispatchReplayRequest({
          channelId: 'channel-dispatch-state',
          body: 'Dispatch replay should be retried.',
          recordedAt: '2026-03-26T13:24:00.000Z',
        }),
        {
          replayState: 'failed',
          replayTrigger: 'retry',
        },
      ),
    },
    now,
  ).core;
  core = upsertCoreTask(
    core,
    {
      id: 'task-recovery-workflow-state',
      title: 'Workflow replay recovery task',
      status: 'blocked',
      conversationId: 'conversation-recovery-states',
      createdAt: '2026-03-26T13:25:00.000Z',
      metadata: writeWorkflowContinuationReplayMetadata(
        {},
        buildWorkflowContinuationReplayRequest({
          channelId: 'channel-workflow-state',
          checkpointId: 'checkpoint-workflow-state',
          sourceMessageId: 'message-workflow-state',
          continuationSource: 'workflow_recommendation',
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
          recordedAt: '2026-03-26T13:26:00.000Z',
          workflowShape: 'converge',
          reviewRequired: true,
          blockedReason: 'anti_ping_pong',
          unresolvedTargets: ['Reviewer'],
        }),
        {
          replayState: 'in_progress',
          replayTrigger: 'retry',
        },
      ),
    },
    now,
  ).core;

  const result = queryCoreTaskRecoveryViews(core, {
    conversationIds: ['conversation-recovery-states'],
    pendingDispatchReplayStates: ['pending'],
    limit: 1,
  });
  const workflowResult = queryCoreTaskRecoveryViews(core, {
    conversationIds: ['conversation-recovery-states'],
    workflowContinuationReplayStates: ['in_progress'],
    workflowReviewRequired: true,
    workflowConvergeTargetIds: ['cat-followup'],
    workflowContinuationSources: ['workflow_recommendation'],
    workflowContinuationBlockedReasons: ['anti_ping_pong'],
    workflowUnresolvedTargets: ['Reviewer'],
    hasUnresolvedWorkflowTargets: true,
  });

  assert.deepEqual(
    result.recoveries.map((recovery) => recovery.taskId),
    ['task-recovery-pending-state'],
  );
  assert.deepEqual(result.summary.pendingDispatchReplayStateCounts, {
    pending: 1,
    in_progress: 0,
    failed: 0,
  });
  assert.deepEqual(result.summary.dispatchReplayStateCounts, {
    ready: 0,
    in_progress: 0,
    failed: 0,
  });
  assert.deepEqual(result.summary.workflowContinuationReplayStateCounts, {
    ready: 0,
    in_progress: 0,
    failed: 0,
  });
  assert.deepEqual(
    workflowResult.recoveries.map((recovery) => recovery.taskId),
    ['task-recovery-workflow-state'],
  );
  assert.deepEqual(workflowResult.summary.workflowContinuationReplayStateCounts, {
    ready: 0,
    in_progress: 1,
    failed: 0,
  });
  assert.deepEqual(workflowResult.summary.workflowContinuationBlockedReasonCounts, {
    max_continuations: 0,
    max_dispatches: 0,
    max_target_visits: 0,
    anti_ping_pong: 1,
    no_valid_targets: 0,
  });
  assert.equal(workflowResult.summary.workflowReviewRequiredCount, 1);
  assert.equal(workflowResult.summary.workflowConvergeTargetCount, 1);
  assert.equal(workflowResult.summary.workflowContinuationSourceCounts.workflow_recommendation, 1);
  assert.equal(workflowResult.summary.withUnresolvedWorkflowTargetsCount, 1);
  assert.equal(workflowResult.recoveries[0]?.context?.workflowReviewRequired, true);
  assert.equal(workflowResult.recoveries[0]?.context?.workflowConvergeTargetId, 'cat-followup');
});

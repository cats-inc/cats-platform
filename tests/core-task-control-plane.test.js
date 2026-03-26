import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreCheckpoint,
  upsertCoreRun,
  upsertCoreTask,
  writeApprovalDecision,
} from '../dist-server/core/model/index.js';
import {
  buildCoreTaskControlPlaneView,
  listCoreTaskControlPlaneViews,
  queryCoreTaskControlPlaneViews,
} from '../dist-server/core/taskControlPlane.js';
import {
  buildOrchestratorDispatchReplayRequest,
  writeOrchestratorDispatchReplayMetadata,
} from '../dist-server/platform/orchestration/dispatchReplay.js';
import {
  buildWorkflowContinuationReplayRequest,
  writeWorkflowContinuationReplayMetadata,
} from '../dist-server/platform/orchestration/workflowContinuationReplay.js';

test('buildCoreTaskControlPlaneView exposes actions, attention, and workflow recommendation signals', () => {
  const now = new Date('2026-03-26T16:00:00.000Z');
  let core = createDefaultCoreState();

  core = upsertCoreTask(
    core,
    {
      id: 'task-control-plane',
      title: 'Control-plane task',
      status: 'pending_approval',
      conversationId: 'conversation-channel-control-plane',
      metadata: writeWorkflowContinuationReplayMetadata(
        writeOrchestratorDispatchReplayMetadata(
          {
            effectiveDeliveryPolicy: {
              mode: 'commit_only',
              gates: ['owner_approval_required'],
              source: 'task_override',
              rationale: 'Owner-gated retry.',
            },
            channelId: 'channel-control-plane',
            transport: 'web',
            roomRoutingMode: 'boss_chat',
          },
          buildOrchestratorDispatchReplayRequest({
            channelId: 'channel-control-plane',
            body: 'Retry the blocked rollout after approval.',
            recordedAt: '2026-03-26T15:50:00.000Z',
          }),
          {
            replayState: 'failed',
            replayTrigger: 'retry',
            replayAttemptAt: '2026-03-26T15:55:00.000Z',
            replayError: 'rate limited',
            sourceMessageId: 'message-control-plane',
          },
        ),
        buildWorkflowContinuationReplayRequest({
          channelId: 'channel-control-plane',
          checkpointId: 'checkpoint-control-plane',
          sourceMessageId: 'message-control-plane',
          sourceParticipant: {
            participantKind: 'orchestrator',
            participantId: 'actor-orchestrator-global',
            participantName: 'Orchestrator',
          },
          targets: [
            {
              participantKind: 'cat',
              participantId: 'cat-reviewer',
              participantName: 'Reviewer',
            },
          ],
          trigger: 'continuation_mention',
          branchStrategy: 'transplant_context',
          workflowStageId: 'continuation_handoff',
          workflowShape: 'converge',
          reviewRequired: true,
          continuationSource: 'workflow_recommendation',
          unresolvedTargets: ['Reviewer'],
          blockedReason: 'anti_ping_pong',
          recordedAt: '2026-03-26T15:53:00.000Z',
        }),
        {
          replayState: 'failed',
          replayTrigger: 'retry',
          replayAttemptAt: '2026-03-26T15:56:00.000Z',
          replayError: 'reviewer offline',
        },
      ),
      createdAt: '2026-03-26T15:45:00.000Z',
    },
    now,
  ).core;
  core = upsertCoreTask(
    core,
    {
      id: 'task-plain',
      title: 'Plain task',
      status: 'draft',
      createdAt: '2026-03-26T15:46:00.000Z',
    },
    now,
  ).core;
  core = writeApprovalDecision(
    core,
    {
      taskId: 'task-control-plane',
      status: 'pending',
      requestedByActorId: 'actor-orchestrator-global',
      notes: 'Need approval before retry.',
    },
    now,
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-control-plane',
      title: 'Blocked run',
      status: 'blocked',
      conversationId: 'conversation-channel-control-plane',
      taskId: 'task-control-plane',
      summary: 'Blocked while waiting for retry.',
      createdAt: '2026-03-26T15:51:00.000Z',
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
      id: 'checkpoint-control-plane',
      label: 'review',
      status: 'open',
      conversationId: 'conversation-channel-control-plane',
      taskId: 'task-control-plane',
      runId: 'run-control-plane',
      summary: 'Review the reroute recommendation.',
      createdAt: '2026-03-26T15:52:00.000Z',
      metadata: {
        continuationSource: 'workflow_recommendation',
        unresolvedTargets: ['Reviewer'],
        workflowRecommendation: {
          source: 'checkpoint',
          workflowShape: 'converge',
          branchStrategy: 'single_target_review',
          rationale: 'Need reviewer signoff before continuing.',
          reviewRequired: true,
          candidateTargets: [
            {
              participantKind: 'cat',
              participantId: 'cat-reviewer',
              participantName: 'Reviewer',
            },
          ],
        },
      },
    },
    now,
  ).core;

  const task = core.tasks.find((candidate) => candidate.id === 'task-control-plane');
  assert.ok(task);

  const view = buildCoreTaskControlPlaneView(core, task);

  assert.equal(view.taskId, 'task-control-plane');
  assert.equal(view.governanceSummary?.approval.pending, true);
  assert.deepEqual(view.approvalActions.map((action) => action.kind), [
    'approve',
    'reroute',
    'reject',
  ]);
  assert.deepEqual(view.incidentActions.map((action) => action.kind), [
    'retry',
    'acknowledge',
  ]);
  assert.deepEqual(view.nextActions.map((action) => action.kind), [
    'approve',
    'reroute',
    'reject',
    'retry',
    'acknowledge',
  ]);
  assert.deepEqual(view.attention.reasons, [
    'approval_pending',
    'run_blocked',
    'retry_available',
    'workflow_review_required',
  ]);
  assert.equal(view.attention.severity, 'attention');
  assert.equal(view.recovery.dispatchReplay?.replayState, 'failed');
  assert.equal(view.latestTimelineItem?.recordId, 'checkpoint-control-plane');
  assert.equal(view.latestTimelineItem?.category, 'workflow');
  assert.equal(view.latestTimelineItem?.summary, 'Review the reroute recommendation.');
  assert.equal(view.latestWorkflowRecommendation?.reviewRequired, true);
  assert.equal(
    view.latestWorkflowRecommendation?.candidateTargets[0]?.participantName,
    'Reviewer',
  );
  assert.equal(view.workflowContinuation?.checkpointId, 'checkpoint-control-plane');
  assert.equal(view.workflowContinuation?.stageId, 'continuation_handoff');
  assert.equal(view.workflowContinuation?.workflowShape, 'converge');
  assert.equal(view.workflowContinuation?.continuationSource, 'workflow_recommendation');
  assert.equal(view.workflowContinuation?.reviewRequired, true);
  assert.equal(view.workflowContinuation?.convergeTargetId, 'cat-reviewer');
  assert.equal(view.workflowContinuation?.blockedReason, 'anti_ping_pong');
  assert.equal(view.workflowContinuation?.targetCount, 1);
  assert.deepEqual(view.workflowContinuation?.targetNames, ['Reviewer']);
  assert.deepEqual(view.workflowContinuation?.unresolvedTargets, ['Reviewer']);
  assert.equal(view.workflowContinuation?.replayState, 'failed');
  assert.equal(view.workflowContinuation?.replayTrigger, 'retry');
  assert.equal(view.workflowContinuation?.replayError, 'reviewer offline');
  assert.equal(view.workflowContinuation?.retryAvailable, true);
  assert.equal(view.runtimeDeliveryIntent?.mode, 'commit_only');
  assert.equal(view.runtimeDeliveryIntent?.source, 'task_override');
  assert.equal(view.runtimeDeliveryIntent?.rationale, 'Owner-gated retry.');
  assert.deepEqual(view.runtimeDeliveryIntent?.gates, ['owner_approval_required']);
  assert.deepEqual(view.runtimeDeliveryIntent?.requestedActions, ['create_commit']);
  assert.equal(view.runtimeDeliveryIntent?.strict, true);
  assert.equal(view.runtimeDeliveryIntent?.requiresOwnerDecision, true);
  assert.equal(view.runtimeDeliveryIntent?.approvalPending, true);
  assert.equal(view.runtimeDeliveryIntent?.channelId, 'channel-control-plane');
  assert.equal(view.runtimeDeliveryIntent?.conversationId, 'conversation-channel-control-plane');
  assert.equal(view.runtimeDeliveryIntent?.taskId, 'task-control-plane');
  assert.equal(view.runtimeDeliveryIntent?.roomMode, 'boss_chat');
  assert.equal(view.runtimeDeliveryIntent?.transport, 'web');
  assert.equal(view.runtimeDeliveryIntent?.workflowStageId, 'continuation_handoff');
  assert.equal(view.runtimeDeliveryIntent?.workflowShape, 'converge');
  assert.deepEqual(view.governanceSummary?.runtimeDeliveryManifest?.requestedActions, [
    'create_commit',
  ]);

  assert.deepEqual(
    listCoreTaskControlPlaneViews(core).map((candidate) => candidate.taskId),
    ['task-control-plane'],
  );
});

test('queryCoreTaskControlPlaneViews filters and summarizes attention views', () => {
  const now = new Date('2026-03-26T16:30:00.000Z');
  let core = createDefaultCoreState();

  core = upsertCoreTask(
    core,
    {
      id: 'task-control-plane-match',
      title: 'Matching task',
      status: 'blocked',
      conversationId: 'conversation-channel-control-plane',
      metadata: writeWorkflowContinuationReplayMetadata(
        writeOrchestratorDispatchReplayMetadata(
          {
            effectiveDeliveryPolicy: {
              mode: 'commit_only',
              gates: ['owner_approval_required'],
              source: 'task_override',
              rationale: 'Retry blocked rollout with owner approval.',
            },
            channelId: 'channel-control-plane',
            transport: 'web',
            roomRoutingMode: 'boss_chat',
          },
          buildOrchestratorDispatchReplayRequest({
            channelId: 'channel-control-plane',
            body: 'Retry the blocked rollout after approval.',
            recordedAt: '2026-03-26T16:10:00.000Z',
          }),
          {
            replayState: 'failed',
            replayTrigger: 'retry',
            replayAttemptAt: '2026-03-26T16:11:00.000Z',
            replayError: 'rate limited',
          },
        ),
        buildWorkflowContinuationReplayRequest({
          channelId: 'channel-control-plane',
          checkpointId: 'checkpoint-control-plane-match',
          sourceMessageId: 'message-control-plane-match',
          sourceParticipant: {
            participantKind: 'cat',
            participantId: 'cat-inline',
            participantName: 'Inline-Agent',
          },
          targets: [
            {
              participantKind: 'cat',
              participantId: 'cat-reviewer',
              participantName: 'Reviewer',
            },
          ],
          workflowStageId: 'continuation_handoff',
          workflowShape: 'converge',
          reviewRequired: true,
          blockedReason: 'max_dispatches',
          recordedAt: '2026-03-26T16:09:00.000Z',
        }),
      ),
      createdAt: '2026-03-26T16:00:00.000Z',
    },
    now,
  ).core;
  core = upsertCoreTask(
    core,
    {
      id: 'task-control-plane-running',
      title: 'Running task',
      status: 'in_progress',
      conversationId: 'conversation-channel-progress',
      createdAt: '2026-03-26T16:01:00.000Z',
    },
    now,
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-control-plane-match',
      title: 'Blocked run',
      status: 'blocked',
      taskId: 'task-control-plane-match',
      conversationId: 'conversation-channel-control-plane',
      metadata: {
        workflowStageId: 'continuation_handoff',
        workflowShape: 'sequential',
      },
      createdAt: '2026-03-26T16:05:00.000Z',
    },
    now,
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-control-plane-running',
      title: 'Running run',
      status: 'running',
      taskId: 'task-control-plane-running',
      conversationId: 'conversation-channel-progress',
      createdAt: '2026-03-26T16:06:00.000Z',
    },
    now,
  ).core;

  const result = queryCoreTaskControlPlaneViews(core, {
    severities: ['attention'],
    nextActions: ['retry'],
    taskStatuses: ['blocked'],
    deliveryModes: ['commit_only'],
    deliveryActions: ['create_commit'],
    workflowStageIds: ['continuation_handoff'],
    workflowShapes: ['converge'],
    workflowReviewRequired: true,
    workflowConvergeTargetIds: ['cat-reviewer'],
    workflowContinuationBlockedReasons: ['max_dispatches'],
    latestTimelineCategories: ['execution'],
    latestTimelineKinds: ['run'],
  });

  assert.deepEqual(result.tasks.map((task) => task.taskId), [
    'task-control-plane-match',
  ]);
  assert.equal(result.summary.totalAvailable, 2);
  assert.equal(result.summary.matching, 1);
  assert.equal(result.summary.returned, 1);
  assert.equal(result.summary.attentionSeverityCounts.attention, 1);
  assert.equal(result.summary.taskStatusCounts.blocked, 1);
  assert.equal(result.summary.reasonCounts.retry_available, 1);
  assert.equal(result.summary.nextActionCounts.retry, 1);
  assert.equal(result.summary.deliveryModeCounts.commit_only, 1);
  assert.equal(result.summary.deliveryActionCounts.create_commit, 1);
  assert.equal(result.summary.workflowStageCounts.continuation_handoff, 1);
  assert.equal(result.summary.workflowShapeCounts.converge, 1);
  assert.equal(result.summary.workflowContinuationBlockedReasonCounts.max_dispatches, 1);
  assert.equal(result.summary.latestTimelineCategoryCounts.execution, 1);
  assert.equal(result.summary.latestTimelineKindCounts.run, 1);
  assert.equal(result.tasks[0]?.workflowContinuation?.convergeTargetId, 'cat-reviewer');
});

test('buildCoreTaskControlPlaneView surfaces waiting parent tasks with active child work', () => {
  const now = new Date('2026-03-26T16:45:00.000Z');
  let core = createDefaultCoreState();

  core = upsertCoreTask(
    core,
    {
      id: 'task-control-plane-parent',
      title: 'Parent task',
      status: 'in_progress',
      conversationId: 'conversation-channel-family',
      createdAt: '2026-03-26T16:00:00.000Z',
    },
    now,
  ).core;
  core = upsertCoreTask(
    core,
    {
      id: 'task-control-plane-child-active',
      title: 'Active child task',
      status: 'in_progress',
      parentTaskId: 'task-control-plane-parent',
      conversationId: 'conversation-channel-family',
      createdAt: '2026-03-26T16:10:00.000Z',
    },
    now,
  ).core;
  core = upsertCoreTask(
    core,
    {
      id: 'task-control-plane-child-done',
      title: 'Completed child task',
      status: 'completed',
      parentTaskId: 'task-control-plane-parent',
      conversationId: 'conversation-channel-family',
      createdAt: '2026-03-26T16:11:00.000Z',
    },
    now,
  ).core;

  const parentTask = core.tasks.find((candidate) => candidate.id === 'task-control-plane-parent');
  assert.ok(parentTask);

  const view = buildCoreTaskControlPlaneView(core, parentTask);
  const query = queryCoreTaskControlPlaneViews(core, {
    reasons: ['child_tasks_in_progress'],
    nextActions: ['wait'],
    rootTaskIds: ['task-control-plane-parent'],
    hasChildren: true,
    hasActiveChildren: true,
  });

  assert.equal(view.family.rootTaskId, 'task-control-plane-parent');
  assert.equal(view.family.childCount, 2);
  assert.equal(view.family.terminalChildCount, 1);
  assert.equal(view.family.allChildrenTerminal, false);
  assert.deepEqual(view.attention.reasons, ['child_tasks_in_progress']);
  assert.equal(view.attention.severity, 'progress');
  assert.equal(view.attention.needsOperatorAttention, false);
  assert.deepEqual(view.nextActions.map((action) => action.kind), ['wait']);
  assert.equal(view.nextActions[0]?.label, 'Wait for child tasks');
  assert.deepEqual(
    query.tasks.map((task) => task.taskId),
    ['task-control-plane-parent'],
  );
  assert.equal(query.summary.reasonCounts.child_tasks_in_progress, 1);
  assert.equal(query.summary.nextActionCounts.wait, 1);
  assert.equal(query.summary.withChildrenCount, 1);
  assert.equal(query.summary.withActiveChildrenCount, 1);
});

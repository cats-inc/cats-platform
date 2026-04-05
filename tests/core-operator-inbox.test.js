import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendCoreActivity,
  createDefaultCoreState,
  upsertCoreCheckpoint,
  upsertCoreRun,
  upsertCoreTask,
  writeApprovalDecision,
} from '../build/server/core/model/index.js';
import {
  listCoreOperatorInboxItems,
  queryCoreOperatorInboxItems,
} from '../build/server/core/operatorInbox.js';
import {
  buildOrchestratorDispatchReplayRequest,
  writeOrchestratorDispatchReplayMetadata,
} from '../build/server/platform/orchestration/dispatchReplay.js';
import {
  buildWorkflowContinuationReplayRequest,
  writeWorkflowContinuationReplayMetadata,
} from '../build/server/platform/orchestration/workflowContinuationReplay.js';
import { writeTaskPlanningMetadata } from '../build/server/shared/taskPlanning.js';

test('listCoreOperatorInboxItems returns actionable task summaries with latest timeline context', () => {
  const now = new Date('2026-03-26T18:00:00.000Z');
  let core = createDefaultCoreState();

  core = upsertCoreTask(
    core,
    {
      id: 'task-inbox',
      title: 'Inbox task',
      status: 'pending_approval',
      conversationId: 'conversation-channel-inbox',
      summary: 'Needs operator review.',
      metadata: writeTaskPlanningMetadata(
        writeOrchestratorDispatchReplayMetadata(
          {},
          buildOrchestratorDispatchReplayRequest({
            channelId: 'channel-inbox',
            body: 'Retry the blocked rollout.',
            recordedAt: '2026-03-26T17:50:00.000Z',
          }),
          {
            replayState: 'failed',
            replayTrigger: 'retry',
            replayAttemptAt: '2026-03-26T17:55:00.000Z',
            replayError: 'rate limited',
          },
        ),
        {
          productHint: 'code',
          strategyHint: 'reflexion',
        },
      ),
      createdAt: '2026-03-26T17:40:00.000Z',
    },
    now,
  ).core;
  core = upsertCoreTask(
    core,
    {
      id: 'task-muted',
      title: 'Muted task',
      status: 'completed',
      createdAt: '2026-03-26T17:41:00.000Z',
    },
    now,
  ).core;
  core = writeApprovalDecision(
    core,
    {
      taskId: 'task-inbox',
      status: 'pending',
      requestedByActorId: 'actor-orchestrator-global',
      notes: 'Need owner approval.',
    },
    now,
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-inbox',
      title: 'Blocked run',
      status: 'blocked',
      taskId: 'task-inbox',
      conversationId: 'conversation-channel-inbox',
      summary: 'Run blocked pending recovery.',
      createdAt: '2026-03-26T17:45:00.000Z',
      metadata: {
        workflowStageId: 'continuation_handoff',
        workflowShape: 'sequential',
      },
    },
    now,
  ).core;
  core = upsertCoreCheckpoint(
    core,
    {
      id: 'checkpoint-inbox',
      label: 'review',
      status: 'open',
      taskId: 'task-inbox',
      runId: 'run-inbox',
      summary: 'Review before continuing.',
      createdAt: '2026-03-26T17:46:00.000Z',
      metadata: {
        continuationSource: 'workflow_recommendation',
        workflowRecommendation: {
          source: 'checkpoint',
          workflowShape: 'converge',
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
  core = appendCoreActivity(
    core,
    {
      id: 'activity-inbox-recovery',
      kind: 'note',
      taskId: 'task-inbox',
      message: 'Dispatch replay failed during startup recovery.',
      createdAt: '2026-03-26T18:01:00.000Z',
      metadata: {
        source: 'orchestrator-startup-recovery',
        replayTrigger: 'retry',
        replayPhase: 'replay_failed',
      },
    },
    now,
  ).core;

  const items = listCoreOperatorInboxItems(core);

  assert.equal(items.length, 1);
  assert.equal(items[0]?.taskId, 'task-inbox');
  assert.equal(items[0]?.taskTitle, 'Inbox task');
  assert.equal(items[0]?.attention.severity, 'attention');
  assert.deepEqual(items[0]?.attention.reasons, [
    'approval_pending',
    'run_blocked',
    'retry_available',
    'workflow_review_required',
  ]);
  assert.equal(items[0]?.family.rootTaskId, 'task-inbox');
  assert.equal(items[0]?.family.childCount, 0);
  assert.equal(items[0]?.latestTimelineItem?.category, 'recovery');
  assert.equal(
    items[0]?.latestTimelineItem?.summary,
    'Dispatch replay failed during startup recovery.',
  );
  assert.equal(items[0]?.planning.effectiveProduct, 'code');
  assert.equal(items[0]?.runtimeBridge.product, 'code');
  assert.equal(items[0]?.runtimeBridge.request.requestedStrategy, 'reflexion');
  assert.deepEqual(
    items[0]?.nextActions.map((action) => action.kind),
    ['approve', 'reroute', 'reject', 'retry', 'acknowledge'],
  );
});

test('queryCoreOperatorInboxItems filters actionable tasks and returns summary counts', () => {
  const now = new Date('2026-03-26T18:10:00.000Z');
  let core = createDefaultCoreState();

  core = upsertCoreTask(
    core,
    {
      id: 'task-inbox-root',
      title: 'Inbox family root',
      status: 'in_progress',
      conversationId: 'conversation-channel-inbox',
      createdAt: '2026-03-26T17:39:00.000Z',
    },
    now,
  ).core;
  core = upsertCoreTask(
    core,
    {
      id: 'task-inbox-match',
      title: 'Matching inbox task',
      status: 'pending_approval',
      parentTaskId: 'task-inbox-root',
      conversationId: 'conversation-channel-inbox',
      metadata: writeTaskPlanningMetadata(
        writeWorkflowContinuationReplayMetadata(
          writeOrchestratorDispatchReplayMetadata(
            {
              effectiveDeliveryPolicy: {
                mode: 'commit_only',
                gates: ['owner_approval_required'],
                source: 'task_override',
                rationale: 'Owner-approved retry.',
              },
              channelId: 'channel-inbox',
              transport: 'web',
              roomRoutingMode: 'boss_chat',
            },
            buildOrchestratorDispatchReplayRequest({
              channelId: 'channel-inbox',
              body: 'Retry the blocked rollout.',
              recordedAt: '2026-03-26T17:50:00.000Z',
            }),
            {
              replayState: 'failed',
              replayTrigger: 'retry',
              replayAttemptAt: '2026-03-26T17:55:00.000Z',
              replayError: 'rate limited',
            },
          ),
          buildWorkflowContinuationReplayRequest({
            channelId: 'channel-inbox',
            checkpointId: 'checkpoint-inbox-match',
            sourceMessageId: 'message-inbox-match',
            continuationSource: 'workflow_recommendation',
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
            unresolvedTargets: ['Reviewer'],
            recordedAt: '2026-03-26T17:49:00.000Z',
          }),
        ),
        {
          productHint: 'code',
          strategyHint: 'reflexion',
        },
      ),
      createdAt: '2026-03-26T17:40:00.000Z',
    },
    now,
  ).core;
  core = upsertCoreTask(
    core,
    {
      id: 'task-inbox-other',
      title: 'Other actionable inbox task',
      status: 'blocked',
      conversationId: 'conversation-channel-inbox',
      metadata: writeOrchestratorDispatchReplayMetadata(
        {},
        buildOrchestratorDispatchReplayRequest({
          channelId: 'channel-inbox',
          body: 'Retry the other blocked rollout.',
          recordedAt: '2026-03-26T17:51:00.000Z',
        }),
        {
          replayState: 'failed',
          replayTrigger: 'retry',
          replayAttemptAt: '2026-03-26T17:56:00.000Z',
          replayError: 'needs operator check',
        },
      ),
      createdAt: '2026-03-26T17:41:00.000Z',
    },
    now,
  ).core;
  core = writeApprovalDecision(
    core,
    {
      taskId: 'task-inbox-match',
      status: 'pending',
      requestedByActorId: 'actor-orchestrator-global',
      notes: 'Need owner approval.',
    },
    now,
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-inbox-match',
      title: 'Blocked run',
      status: 'blocked',
      taskId: 'task-inbox-match',
      conversationId: 'conversation-channel-inbox',
      metadata: {
        workflowStageId: 'continuation_handoff',
        workflowShape: 'sequential',
      },
      createdAt: '2026-03-26T17:45:00.000Z',
    },
    now,
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-inbox-other',
      title: 'Other blocked run',
      status: 'blocked',
      taskId: 'task-inbox-other',
      conversationId: 'conversation-channel-inbox',
      createdAt: '2026-03-26T17:46:00.000Z',
    },
    now,
  ).core;
  core = appendCoreActivity(
    core,
    {
      id: 'activity-inbox-match-recovery',
      kind: 'note',
      taskId: 'task-inbox-match',
      message: 'Dispatch replay failed during startup recovery.',
      createdAt: '2026-03-26T18:01:00.000Z',
      metadata: {
        source: 'orchestrator-startup-recovery',
        replayTrigger: 'retry',
        replayPhase: 'replay_failed',
        resumeReason: 'target_recovered',
      },
    },
    now,
  ).core;

  const result = queryCoreOperatorInboxItems(core, {
    conversationIds: ['conversation-channel-inbox'],
    executionProducts: ['code'],
    requestedStrategies: ['reflexion'],
    nextActions: ['retry'],
    needsOperatorAttention: true,
    deliveryModes: ['commit_only'],
    deliveryActions: ['create_commit'],
    workflowStageIds: ['continuation_handoff'],
    workflowShapes: ['converge'],
    workflowReviewRequired: true,
    workflowConvergeTargetIds: ['cat-reviewer'],
    workflowContinuationSources: ['workflow_recommendation'],
    workflowContinuationBlockedReasons: ['max_dispatches'],
    workflowUnresolvedTargets: ['Reviewer'],
    hasUnresolvedWorkflowTargets: true,
    latestReplaySources: ['orchestrator-startup-recovery'],
    latestReplayTriggers: ['retry'],
    latestReplayPhases: ['replay_failed'],
    latestReplayResumeReasons: ['target_recovered'],
    latestTimelineCategories: ['recovery'],
    latestTimelineKinds: ['activity'],
    rootTaskIds: ['task-inbox-root'],
    parentTaskIds: ['task-inbox-root'],
    hasChildren: false,
    hasActiveChildren: false,
  });

  assert.deepEqual(result.tasks.map((task) => task.taskId), [
    'task-inbox-match',
  ]);
  assert.equal(result.summary.totalAvailable, 2);
  assert.equal(result.summary.matching, 1);
  assert.equal(result.summary.returned, 1);
  assert.equal(result.summary.conversationCount, 1);
  assert.equal(result.summary.executionProductCounts.code, 1);
  assert.equal(result.summary.requestedStrategyCounts.reflexion, 1);
  assert.equal(result.summary.reasonCounts.retry_available, 1);
  assert.equal(result.summary.nextActionCounts.retry, 1);
  assert.equal(result.summary.deliveryModeCounts.commit_only, 1);
  assert.equal(result.summary.deliveryActionCounts.create_commit, 1);
  assert.equal(result.summary.workflowStageCounts.continuation_handoff, 1);
  assert.equal(result.summary.workflowShapeCounts.converge, 1);
  assert.equal(result.summary.workflowReviewRequiredCount, 1);
  assert.equal(result.summary.workflowConvergeTargetCount, 1);
  assert.equal(result.summary.workflowContinuationSourceCounts.workflow_recommendation, 1);
  assert.equal(result.summary.withUnresolvedWorkflowTargetsCount, 1);
  assert.equal(result.summary.workflowContinuationBlockedReasonCounts.max_dispatches, 1);
  assert.equal(result.summary.latestReplaySourceCounts['orchestrator-startup-recovery'], 1);
  assert.equal(result.summary.latestReplayTriggerCounts.retry, 1);
  assert.equal(result.summary.latestReplayPhaseCounts.replay_failed, 1);
  assert.equal(result.summary.latestReplayResumeReasonCounts.target_recovered, 1);
  assert.equal(result.summary.latestTimelineCategoryCounts.recovery, 1);
  assert.equal(result.summary.latestTimelineKindCounts.activity, 1);
  assert.equal(result.tasks[0]?.family.rootTaskId, 'task-inbox-root');
  assert.equal(result.tasks[0]?.family.parent?.taskId, 'task-inbox-root');
  assert.equal(result.tasks[0]?.planning.effectiveProduct, 'code');
  assert.equal(result.tasks[0]?.runtimeBridge.request.requestedStrategy, 'reflexion');
  assert.equal(result.tasks[0]?.workflowContinuation?.convergeTargetId, 'cat-reviewer');
  assert.equal(result.summary.withChildrenCount, 0);
  assert.equal(result.summary.withActiveChildrenCount, 0);
});


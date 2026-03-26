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
      metadata: writeOrchestratorDispatchReplayMetadata(
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
  assert.equal(view.latestWorkflowRecommendation?.reviewRequired, true);
  assert.equal(
    view.latestWorkflowRecommendation?.candidateTargets[0]?.participantName,
    'Reviewer',
  );
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
      metadata: writeOrchestratorDispatchReplayMetadata(
        {},
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
});

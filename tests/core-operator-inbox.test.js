import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendCoreActivity,
  createDefaultCoreState,
  upsertCoreCheckpoint,
  upsertCoreRun,
  upsertCoreTask,
  writeApprovalDecision,
} from '../dist-server/core/model/index.js';
import {
  listCoreOperatorInboxItems,
  queryCoreOperatorInboxItems,
} from '../dist-server/core/operatorInbox.js';
import {
  buildOrchestratorDispatchReplayRequest,
  writeOrchestratorDispatchReplayMetadata,
} from '../dist-server/platform/orchestration/dispatchReplay.js';

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
      metadata: writeOrchestratorDispatchReplayMetadata(
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
        replayPhase: 'dispatch_replay_result',
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
  assert.equal(items[0]?.latestTimelineItem?.category, 'recovery');
  assert.equal(
    items[0]?.latestTimelineItem?.summary,
    'Dispatch replay failed during startup recovery.',
  );
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
      id: 'task-inbox-match',
      title: 'Matching inbox task',
      status: 'pending_approval',
      conversationId: 'conversation-channel-inbox',
      metadata: writeOrchestratorDispatchReplayMetadata(
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
      createdAt: '2026-03-26T17:40:00.000Z',
    },
    now,
  ).core;
  core = upsertCoreTask(
    core,
    {
      id: 'task-inbox-other',
      title: 'Other inbox task',
      status: 'completed',
      conversationId: 'conversation-channel-other',
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
      createdAt: '2026-03-26T17:45:00.000Z',
    },
    now,
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-inbox-other',
      title: 'Completed run',
      status: 'completed',
      taskId: 'task-inbox-other',
      conversationId: 'conversation-channel-other',
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
        replayPhase: 'dispatch_replay_result',
      },
    },
    now,
  ).core;

  const result = queryCoreOperatorInboxItems(core, {
    conversationIds: ['conversation-channel-inbox'],
    nextActions: ['retry'],
    needsOperatorAttention: true,
  });

  assert.deepEqual(result.tasks.map((task) => task.taskId), [
    'task-inbox-match',
  ]);
  assert.equal(result.summary.totalAvailable, 1);
  assert.equal(result.summary.matching, 1);
  assert.equal(result.summary.returned, 1);
  assert.equal(result.summary.conversationCount, 1);
  assert.equal(result.summary.reasonCounts.retry_available, 1);
  assert.equal(result.summary.nextActionCounts.retry, 1);
});

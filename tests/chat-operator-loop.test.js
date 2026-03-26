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
import {
  buildChatOperatorView,
  buildRunInspectorView,
} from '../dist-server/products/chat/shared/operator-loop/index.js';

test('buildChatOperatorView narrows approvals and activity to the selected chat conversation', () => {
  let core = createDefaultCoreState();

  core = upsertCoreTask(
    core,
    {
      id: 'task-channel-room-1',
      title: 'Approve Boss Cat plan',
      status: 'pending_approval',
      conversationId: 'conversation-channel-room-1',
      summary: 'Wait for owner approval before dispatch.',
      createdAt: '2026-03-23T01:00:00.000Z',
      metadata: {
        effectiveDeliveryMode: 'commit_only',
        effectiveDeliveryGates: ['owner_approval_required'],
        effectiveDeliverySource: 'chat_default',
        effectiveBudgetAlertLevel: 'blocked',
        effectiveBudgetAlertSource: 'guardrail_state',
      },
    },
    new Date('2026-03-23T01:00:00.000Z'),
  ).core;
  core = writeApprovalDecision(
    core,
    {
      taskId: 'task-channel-room-1',
      status: 'pending',
      requestedByActorId: 'actor-orchestrator-global',
      notes: 'Need approval before the worker fan-out.',
    },
    new Date('2026-03-23T01:01:00.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-room-1',
      title: 'Boss Cat dispatch',
      status: 'blocked',
      conversationId: 'conversation-channel-room-1',
      taskId: 'task-channel-room-1',
      traceId: 'trace-room-1',
      summary: 'Waiting for approval after hitting a routing guard.',
      createdAt: '2026-03-23T01:02:00.000Z',
      metadata: {
        guard: 'anti_ping_pong',
        dispatchCount: 2,
        continuationCount: 1,
        targetCount: 2,
        workflowStageId: 'parallel_fan_out',
        workflowShape: 'parallel',
        branchStates: [
          {
            id: 'branch-1',
            participant: { participantName: 'Agent-1' },
            status: 'completed',
            handoffReason: 'explicit_mention',
            branchStrategy: 'fresh_no_parent',
            parentCheckpointId: 'checkpoint-room-1',
          },
        ],
      },
    },
    new Date('2026-03-23T01:02:00.000Z'),
  ).core;
  core = appendCoreTrace(
    core,
    {
      id: 'trace-room-1-record',
      traceId: 'trace-room-1',
      kind: 'approval',
      conversationId: 'conversation-channel-room-1',
      runId: 'run-room-1',
      taskId: 'task-channel-room-1',
      actorId: 'actor-orchestrator-global',
      message: 'Owner approval requested for the current plan.',
      createdAt: '2026-03-23T01:03:00.000Z',
      metadata: {
        cooldownLabel: 'Retry after owner review',
      },
    },
    new Date('2026-03-23T01:03:00.000Z'),
  ).core;
  core = upsertCoreCheckpoint(
    core,
    {
      id: 'checkpoint-room-1',
      label: 'owner-gate',
      status: 'open',
      conversationId: 'conversation-channel-room-1',
      runId: 'run-room-1',
      taskId: 'task-channel-room-1',
      sourceTraceId: 'trace-room-1-record',
      summary: 'Awaiting owner approval.',
      createdAt: '2026-03-23T01:04:00.000Z',
      metadata: {
        gate: true,
      },
    },
    new Date('2026-03-23T01:04:00.000Z'),
  ).core;
  core = upsertCoreOutcome(
    core,
    {
      id: 'outcome-room-1',
      title: 'Blocked pending owner',
      status: 'blocked',
      conversationId: 'conversation-channel-room-1',
      runId: 'run-room-1',
      taskId: 'task-channel-room-1',
      summary: 'Blocked pending approval.',
      recordedAt: '2026-03-23T01:05:00.000Z',
      metadata: {
        guard: 'anti_ping_pong',
      },
    },
    new Date('2026-03-23T01:05:00.000Z'),
  ).core;
  core = appendCoreActivity(
    core,
    {
      id: 'activity-room-1',
      kind: 'approval_requested',
      actorId: 'actor-orchestrator-global',
      projectId: null,
      workItemId: null,
      conversationId: 'conversation-channel-room-1',
      taskId: 'task-channel-room-1',
      runId: 'run-room-1',
      artifactId: null,
      message: 'Boss Cat requested approval before continuing.',
      createdAt: '2026-03-23T01:06:00.000Z',
      metadata: {
        source: 'test',
      },
    },
    new Date('2026-03-23T01:06:00.000Z'),
  ).core;

  core = upsertCoreTask(
    core,
    {
      id: 'task-channel-room-2',
      title: 'Unrelated conversation task',
      conversationId: 'conversation-channel-room-2',
      createdAt: '2026-03-23T01:07:00.000Z',
    },
    new Date('2026-03-23T01:07:00.000Z'),
  ).core;

  const snapshot = {
    core,
    approvals: buildApprovalQueue(core),
  };
  const view = buildChatOperatorView(snapshot, 'room-1');
  const inspector = buildRunInspectorView(view, 'run-room-1');

  assert.ok(view);
  assert.equal(view.task?.metadata.effectiveDeliveryMode, 'commit_only');
  assert.equal(view.approvals.length, 1);
  assert.equal(view.runs.length, 1);
  assert.equal(view.guardReason, 'anti_ping_pong');
  assert.equal(view.effectivePolicy?.deliveryMode, 'commit_only');
  assert.equal(view.effectivePolicy?.budgetAlertLevel, 'blocked');
  assert.equal(view.governanceSummary?.approval.pending, true);
  assert.deepEqual(
    view.governanceSummary?.runtimeDeliveryManifest?.requestedActions,
    ['create_commit'],
  );
  assert.equal(view.workflowSummary?.shape, 'parallel');
  assert.equal(view.workflowSummary?.branchStatusCounts.completed, 1);
  assert.deepEqual(
    view.approvalActions.map((action) => action.kind),
    ['approve', 'reroute', 'reject'],
  );
  assert.equal(view.incidentActions.length, 2);
  assert.ok(
    view.activityFeed.some((item) => item.message.includes('Boss Cat requested approval')),
  );
  assert.ok(
    view.activityFeed.every((item) =>
      item.runId === null || item.runId === 'run-room-1',
    ),
  );

  assert.ok(inspector);
  assert.equal(inspector.metrics.dispatchCount, 2);
  assert.equal(inspector.guardReason, 'anti_ping_pong');
  assert.equal(inspector.cooldownLabel, 'Retry after owner review');
  assert.equal(inspector.approvals.length, 1);
  assert.equal(inspector.checkpoints[0].id, 'checkpoint-room-1');
  assert.equal(inspector.governanceSummary?.approval.pending, true);
  assert.equal(inspector.workflowSummary?.dispatchCount, 2);
  assert.equal(inspector.workflowStageId, 'parallel_fan_out');
  assert.equal(inspector.workflowShape, 'parallel');
  assert.equal(inspector.branchStates[0].participantName, 'Agent-1');
  assert.equal(inspector.approvalActions[1].kind, 'reroute');
  assert.equal(inspector.incidentActions[0].kind, 'retry');
});

test('buildChatOperatorView exposes latest workflow recommendation summaries', () => {
  let core = createDefaultCoreState();

  core = upsertCoreRun(
    core,
    {
      id: 'run-room-recommendation',
      title: 'Workflow recommendation run',
      status: 'running',
      conversationId: 'conversation-channel-room-recommendation',
      taskId: 'task-channel-room-recommendation',
      traceId: 'trace-room-recommendation',
      summary: 'Waiting on the next recommended specialist.',
      createdAt: '2026-03-26T08:00:00.000Z',
      metadata: {
        workflowStageId: 'continuation_handoff',
        workflowShape: 'sequential',
      },
    },
    new Date('2026-03-26T08:00:00.000Z'),
  ).core;
  core = upsertCoreCheckpoint(
    core,
    {
      id: 'checkpoint-room-recommendation',
      label: 'continuation',
      status: 'open',
      conversationId: 'conversation-channel-room-recommendation',
      runId: 'run-room-recommendation',
      taskId: 'task-channel-room-recommendation',
      sourceTraceId: 'trace-room-recommendation',
      summary: 'Recommend Agent-2 for the next implementation step.',
      createdAt: '2026-03-26T08:01:00.000Z',
      metadata: {
        continuationSource: 'workflow_recommendation',
        unresolvedTargets: ['Ghost Cat'],
        workflowRecommendation: {
          source: 'checkpoint',
          workflowShape: 'sequential',
          branchStrategy: 'transplant_context',
          rationale: 'Agent-2 is the current implementer.',
          reviewRequired: false,
          candidateTargets: [
            {
              participantKind: 'cat',
              participantId: 'cat-agent-2',
              participantName: 'Agent-2',
            },
          ],
        },
      },
    },
    new Date('2026-03-26T08:01:00.000Z'),
  ).core;

  const view = buildChatOperatorView(
    {
      core,
      approvals: buildApprovalQueue(core),
    },
    'room-recommendation',
  );
  const inspector = buildRunInspectorView(view, 'run-room-recommendation');

  assert.equal(view?.latestWorkflowRecommendation?.workflowShape, 'sequential');
  assert.equal(view?.latestWorkflowRecommendation?.continuationSource, 'workflow_recommendation');
  assert.equal(view?.latestWorkflowRecommendation?.branchStrategy, 'transplant_context');
  assert.equal(view?.latestWorkflowRecommendation?.candidateTargets[0]?.participantName, 'Agent-2');
  assert.deepEqual(view?.latestWorkflowRecommendation?.unresolvedTargets, ['Ghost Cat']);
  assert.equal(inspector?.latestWorkflowRecommendation?.rationale, 'Agent-2 is the current implementer.');
});

test('buildChatOperatorView filters invalid effective policy metadata enum values', () => {
  let core = createDefaultCoreState();

  core = upsertCoreTask(
    core,
    {
      id: 'task-channel-room-invalid-policy',
      title: 'Invalid policy metadata',
      conversationId: 'conversation-channel-room-invalid-policy',
      createdAt: '2026-03-23T02:00:00.000Z',
      metadata: {
        effectiveDeliveryMode: 'bogus_mode',
        effectiveDeliveryGates: ['owner_approval_required', 'bogus_gate'],
        effectiveDeliverySource: 'bogus_source',
        effectiveBudgetAlertLevel: 'bogus_level',
        effectiveBudgetAlertSource: 'bogus_budget_source',
      },
    },
    new Date('2026-03-23T02:00:00.000Z'),
  ).core;

  const view = buildChatOperatorView(
    {
      core,
      approvals: buildApprovalQueue(core),
    },
    'room-invalid-policy',
  );

  assert.ok(view);
  assert.equal(view.effectivePolicy?.deliveryMode, null);
  assert.deepEqual(view.effectivePolicy?.deliveryGates, ['owner_approval_required']);
  assert.equal(view.effectivePolicy?.deliverySource, null);
  assert.equal(view.effectivePolicy?.budgetAlertLevel, null);
  assert.equal(view.effectivePolicy?.budgetAlertSource, null);
});

test('buildChatOperatorView keeps retry available after a failed replay attempt', () => {
  let core = createDefaultCoreState();

  core = upsertCoreTask(
    core,
    {
      id: 'task-channel-room-retry-failed',
      title: 'Retry failed task',
      status: 'blocked',
      conversationId: 'conversation-channel-room-retry-failed',
      createdAt: '2026-03-26T01:00:00.000Z',
      metadata: {
        operatorRetryRequestedAt: '2026-03-26T01:03:00.000Z',
        orchestratorDispatchReplay: {
          channelId: 'room-retry-failed',
          body: 'Retry the blocked routing loop.',
          transport: 'web',
          recordedAt: '2026-03-26T01:01:00.000Z',
          replayTrigger: 'retry',
          replayState: 'failed',
          replayAttemptAt: '2026-03-26T01:03:00.000Z',
          replayError: 'rate limited',
          sourceMessageId: 'message-room-retry-failed',
        },
      },
    },
    new Date('2026-03-26T01:00:00.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-room-retry-failed',
      title: 'Retry failed run',
      status: 'blocked',
      conversationId: 'conversation-channel-room-retry-failed',
      taskId: 'task-channel-room-retry-failed',
      summary: 'Blocked after a failed recovery replay.',
      createdAt: '2026-03-26T01:01:00.000Z',
      metadata: {},
    },
    new Date('2026-03-26T01:02:00.000Z'),
  ).core;
  core = upsertCoreOutcome(
    core,
    {
      id: 'outcome-room-retry-failed',
      title: 'Blocked outcome',
      status: 'blocked',
      conversationId: 'conversation-channel-room-retry-failed',
      runId: 'run-room-retry-failed',
      taskId: 'task-channel-room-retry-failed',
      summary: 'Still blocked after retry.',
      recordedAt: '2026-03-26T01:03:00.000Z',
      metadata: {},
    },
    new Date('2026-03-26T01:03:00.000Z'),
  ).core;

  const view = buildChatOperatorView(
    {
      core,
      approvals: buildApprovalQueue(core),
    },
    'room-retry-failed',
  );

  assert.ok(view);
  assert.equal(view.incidentActions[0].kind, 'retry');
  assert.equal(view.incidentActions[0].label, 'Retry Again');
  assert.equal(view.incidentActions[0].disabled, false);
  assert.match(view.incidentActions[0].statusLabel ?? '', /retry failed/i);
});

test('buildChatOperatorView filters invalid embedded governance summary enum values', () => {
  let core = createDefaultCoreState();

  core = upsertCoreTask(
    core,
    {
      id: 'task-channel-room-invalid-governance',
      title: 'Invalid governance summary metadata',
      conversationId: 'conversation-channel-room-invalid-governance',
      createdAt: '2026-03-23T03:00:00.000Z',
      metadata: {
        governanceSummary: {
          approval: {
            status: 'pending',
            requiresOwnerDecision: true,
            pending: true,
            latestDecisionAction: 'bogus_action',
          },
          runtimeDeliveryManifest: {
            requestedActions: ['create_commit', 'bogus_action'],
            gates: ['owner_approval_required', 'bogus_gate'],
            context: {
              channelId: 'room-invalid-governance',
              conversationId: 'conversation-channel-room-invalid-governance',
              taskId: 'task-channel-room-invalid-governance',
              roomMode: 'boss_chat',
              transport: null,
              workflowStageId: null,
              workflowShape: null,
            },
            strict: true,
          },
        },
      },
    },
    new Date('2026-03-23T03:00:00.000Z'),
  ).core;

  const view = buildChatOperatorView(
    {
      core,
      approvals: buildApprovalQueue(core),
    },
    'room-invalid-governance',
  );

  assert.ok(view);
  assert.equal(view.governanceSummary?.approval.status, 'pending');
  assert.equal(view.governanceSummary?.approval.latestDecisionAction, null);
  assert.deepEqual(
    view.governanceSummary?.runtimeDeliveryManifest?.requestedActions,
    ['create_commit'],
  );
  assert.deepEqual(
    view.governanceSummary?.runtimeDeliveryManifest?.gates,
    ['owner_approval_required'],
  );
});

test('buildChatOperatorView classifies orchestrator replay lifecycle notes for operator feeds', () => {
  let core = createDefaultCoreState();

  core = upsertCoreTask(
    core,
    {
      id: 'task-channel-room-replay-audit',
      title: 'Replay audit task',
      conversationId: 'conversation-channel-room-replay-audit',
      createdAt: '2026-03-26T03:00:00.000Z',
    },
    new Date('2026-03-26T03:00:00.000Z'),
  ).core;
  core = appendCoreActivity(
    core,
    {
      id: 'activity-replay-failed',
      kind: 'note',
      actorId: null,
      conversationId: 'conversation-channel-room-replay-audit',
      taskId: 'task-channel-room-replay-audit',
      runId: null,
      message: 'Replay failed note.',
      createdAt: '2026-03-26T03:01:00.000Z',
      metadata: {
        source: 'orchestrator-replay',
        replayPhase: 'replay_failed',
        replayTrigger: 'retry',
      },
    },
    new Date('2026-03-26T03:01:00.000Z'),
  ).core;
  core = appendCoreActivity(
    core,
    {
      id: 'activity-recovery-note',
      kind: 'note',
      actorId: null,
      conversationId: 'conversation-channel-room-replay-audit',
      taskId: 'task-channel-room-replay-audit',
      runId: null,
      message: 'Startup recovery note.',
      createdAt: '2026-03-26T03:02:00.000Z',
      metadata: {
        source: 'orchestrator-startup-recovery',
        replayPhase: 'startup_recovered',
      },
    },
    new Date('2026-03-26T03:02:00.000Z'),
  ).core;

  const view = buildChatOperatorView(
    {
      core,
      approvals: buildApprovalQueue(core),
    },
    'room-replay-audit',
  );

  assert.ok(view);
  const replayItem = view.activityFeed.find((item) => item.id === 'activity:activity-replay-failed');
  const recoveryItem = view.activityFeed.find((item) => item.id === 'activity:activity-recovery-note');
  assert.ok(replayItem);
  assert.equal(replayItem?.label, 'Replay');
  assert.equal(replayItem?.severity, 'error');
  assert.ok(recoveryItem);
  assert.equal(recoveryItem?.label, 'Recovery');
  assert.equal(recoveryItem?.severity, 'attention');
});

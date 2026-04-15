import {
  deriveCoreGovernanceSummary,
  deriveCoreWorkflowSummary,
} from '../../../../core/governance.js';
import { buildCoreTaskControlPlaneView } from '../../../../core/taskControlPlane.js';
import {
  buildActivityFeed,
  buildApprovalActions,
  buildEffectivePolicyView,
  buildIncidentActions,
} from './actions.js';
import {
  buildActorNameById,
  buildBranchStates,
  compareIsoDesc,
  metricsForRun,
  resolveCooldownLabel,
  resolveGuardReason,
  resolveLatestWorkflowRecommendation,
} from './metadata.js';
import { buildChatConversationId } from '../../../../shared/chatCoreIds.js';
import type {
  ChatNextActionView,
  ChatOperatorAttentionView,
  ChatOperatorChannelIdentity,
  ChatOperatorSnapshot,
  ChatOperatorView,
  ChatRunInspectorView,
  ChatRuntimeDeliveryIntentView,
} from './types.js';

export type {
  ChatApprovalActionView,
  ChatEffectivePolicyView,
  ChatOperatorActionView,
  ChatOperatorActivityItem,
  ChatOperatorSeverity,
  ChatOperatorSnapshot,
  ChatNextActionView,
  ChatOperatorView,
  ChatRunInspectorView,
  ChatRunMetrics,
  ChatOperatorAttentionView,
  ChatWorkflowBranchView,
  ChatWorkflowContinuationView,
  ChatRuntimeDeliveryIntentView,
  ChatWorkflowRecommendationView,
} from './types.js';

export function resolveChatConversationId(channelId: string): string {
  return buildChatConversationId(channelId);
}

function readChatOperatorChannelIdentity(
  channel: ChatOperatorChannelIdentity,
): {
  channelId: string;
  conversationId: string;
} {
  if (typeof channel === 'string') {
    return {
      channelId: channel,
      conversationId: resolveChatConversationId(channel),
    };
  }

  return {
    channelId: channel.id,
    conversationId: channel.conversationId?.trim() || resolveChatConversationId(channel.id),
  };
}

export function buildChatOperatorView(
  snapshot: ChatOperatorSnapshot | null,
  channel: ChatOperatorChannelIdentity,
): ChatOperatorView | null {
  if (!snapshot) {
    return null;
  }

  const { channelId, conversationId } = readChatOperatorChannelIdentity(channel);
  const taskId = `task-channel-${channelId}`;
  const actorNameById = buildActorNameById(snapshot.core);
  const task = snapshot.core.tasks.find((candidate) => candidate.id === taskId) ?? null;
  const approvals = snapshot.approvals
    .filter((approval) =>
      approval.conversationId === conversationId || approval.taskId === taskId,
    )
    .sort((left, right) =>
      compareIsoDesc(left.requestedAt ?? left.decidedAt ?? '', right.requestedAt ?? right.decidedAt ?? ''),
    );
  const runs = snapshot.core.runs
    .filter((run) => run.conversationId === conversationId)
    .sort((left, right) => compareIsoDesc(left.updatedAt, right.updatedAt));
  const traces = snapshot.core.traces
    .filter((trace) => trace.conversationId === conversationId)
    .sort((left, right) => compareIsoDesc(left.createdAt, right.createdAt));
  const checkpoints = snapshot.core.checkpoints
    .filter((checkpoint) => checkpoint.conversationId === conversationId)
    .sort((left, right) => compareIsoDesc(left.updatedAt, right.updatedAt));
  const outcomes = snapshot.core.outcomes
    .filter((outcome) => outcome.conversationId === conversationId)
    .sort((left, right) => compareIsoDesc(left.updatedAt, right.updatedAt));
  const activities = snapshot.core.activities
    .filter((activity) => activity.conversationId === conversationId)
    .sort((left, right) => compareIsoDesc(left.createdAt, right.createdAt));
  const latestRun = runs[0] ?? null;
  const latestOutcome = outcomes[0] ?? null;
  const latestCheckpoint = checkpoints[0] ?? null;
  const latestApproval = approvals[0] ?? null;
  const guardReason = resolveGuardReason(latestRun, latestOutcome, latestCheckpoint, traces);
  const cooldownLabel = resolveCooldownLabel(latestRun, latestOutcome, latestCheckpoint, traces);
  const controlPlane = task
    ? buildCoreTaskControlPlaneView(snapshot.core, task)
    : null;
  const effectivePolicy = buildEffectivePolicyView(task);
  const workflowSummary = deriveCoreWorkflowSummary(latestRun);
  const latestWorkflowRecommendation = controlPlane?.latestWorkflowRecommendation
    ?? resolveLatestWorkflowRecommendation({
      latestCheckpoint,
      latestOutcome,
      latestRun,
      traces,
    });
  const governanceSummary = deriveCoreGovernanceSummary(task, latestRun);
  const approvalActions = buildApprovalActions(latestApproval);
  const activityFeed = buildActivityFeed(
    activities,
    traces,
    checkpoints,
    outcomes,
    actorNameById,
  );
  const nextActions: ChatNextActionView[] = controlPlane?.nextActions.map((action) => ({
    kind: action.kind,
    label: action.label,
    blocking: action.blocking,
    action: action.action
      ? {
          method: action.action.method,
          path: action.action.path,
          body: structuredClone(action.action.body),
        }
      : null,
  })) ?? [];
  const attention: ChatOperatorAttentionView | null = controlPlane
    ? {
        severity: controlPlane.attention.severity,
        reasons: [...controlPlane.attention.reasons],
        needsOperatorAttention: controlPlane.attention.needsOperatorAttention,
      }
    : null;
  const runtimeDeliveryIntent: ChatRuntimeDeliveryIntentView | null = controlPlane?.runtimeDeliveryIntent
    ? {
        mode: controlPlane.runtimeDeliveryIntent.mode,
        source: controlPlane.runtimeDeliveryIntent.source,
        rationale: controlPlane.runtimeDeliveryIntent.rationale,
        gates: [...controlPlane.runtimeDeliveryIntent.gates],
        requestedActions: [...controlPlane.runtimeDeliveryIntent.requestedActions],
        strict: controlPlane.runtimeDeliveryIntent.strict,
        requiresOwnerDecision: controlPlane.runtimeDeliveryIntent.requiresOwnerDecision,
        approvalPending: controlPlane.runtimeDeliveryIntent.approvalPending,
        channelId: controlPlane.runtimeDeliveryIntent.channelId,
        containerId: controlPlane.runtimeDeliveryIntent.containerId,
        conversationId: controlPlane.runtimeDeliveryIntent.conversationId,
        taskId: controlPlane.runtimeDeliveryIntent.taskId,
        roomMode: controlPlane.runtimeDeliveryIntent.roomMode,
        transport: controlPlane.runtimeDeliveryIntent.transport,
        workflowStageId: controlPlane.runtimeDeliveryIntent.workflowStageId,
        workflowShape: controlPlane.runtimeDeliveryIntent.workflowShape,
      }
    : null;

  return {
    channelId,
    conversationId,
    actorNameById,
    task,
    approvals,
    runs,
    traces,
    checkpoints,
    outcomes,
    activityFeed,
    latestRun,
    latestOutcome,
    latestCheckpoint,
    latestApproval,
    guardReason,
    cooldownLabel,
    effectivePolicy,
    governanceSummary,
    workflowSummary,
    latestWorkflowRecommendation,
    workflowContinuation: controlPlane?.workflowContinuation ?? null,
    runtimeDeliveryIntent,
    attention,
    nextActions,
    approvalActions,
    incidentActions: buildIncidentActions(
      task,
      latestRun,
      latestOutcome,
      latestCheckpoint,
      guardReason,
      cooldownLabel,
    ),
  };
}

export function buildRunInspectorView(
  operatorView: ChatOperatorView | null,
  runId: string | null | undefined,
): ChatRunInspectorView | null {
  if (!operatorView) {
    return null;
  }

  const run = operatorView.runs.find((candidate) => candidate.id === runId)
    ?? operatorView.latestRun;
  if (!run) {
    return null;
  }

  const traces = operatorView.traces
    .filter((trace) => trace.runId === run.id)
    .sort((left, right) => compareIsoDesc(left.createdAt, right.createdAt));
  const checkpoints = operatorView.checkpoints
    .filter((checkpoint) => checkpoint.runId === run.id)
    .sort((left, right) => compareIsoDesc(left.updatedAt, right.updatedAt));
  const outcomes = operatorView.outcomes
    .filter((outcome) => outcome.runId === run.id)
    .sort((left, right) => compareIsoDesc(left.updatedAt, right.updatedAt));
  const approvals = operatorView.approvals.filter((approval) => approval.taskId === run.taskId);
  const latestOutcome = outcomes[0] ?? null;
  const latestCheckpoint = checkpoints[0] ?? null;
  const guardReason = resolveGuardReason(run, latestOutcome, latestCheckpoint, traces);
  const cooldownLabel = resolveCooldownLabel(run, latestOutcome, latestCheckpoint, traces);
  const workflowSummary = deriveCoreWorkflowSummary(run);
  const latestWorkflowRecommendation = resolveLatestWorkflowRecommendation({
    latestCheckpoint,
    latestOutcome,
    latestRun: run,
    traces,
  });
  const isLatestTaskRun = operatorView.latestRun?.id === run.id;
  const governanceSummary = deriveCoreGovernanceSummary(operatorView.task, run);
  const latestApproval = approvals[0] ?? operatorView.latestApproval;

  return {
    run,
    traces,
    checkpoints,
    outcomes,
    approvals,
    latestOutcome,
    latestCheckpoint,
    guardReason,
    cooldownLabel,
    metrics: metricsForRun(run),
    workflowSummary,
    governanceSummary,
    workflowStageId: workflowSummary?.stageId ?? null,
    workflowShape: workflowSummary?.shape ?? null,
    reviewRequired: workflowSummary?.reviewRequired ?? false,
    branchStates: buildBranchStates(run),
    latestWorkflowRecommendation,
    workflowContinuation: isLatestTaskRun
      ? operatorView.workflowContinuation
      : null,
    runtimeDeliveryIntent: isLatestTaskRun
      ? operatorView.runtimeDeliveryIntent
      : null,
    attention: isLatestTaskRun
      ? operatorView.attention
      : null,
    nextActions: isLatestTaskRun
      ? operatorView.nextActions.map((action) => ({
          kind: action.kind,
          label: action.label,
          blocking: action.blocking,
          action: action.action
            ? {
                method: action.action.method,
                path: action.action.path,
                body: structuredClone(action.action.body),
              }
            : null,
        }))
      : [],
    approvalActions: buildApprovalActions(latestApproval),
    incidentActions: buildIncidentActions(
      operatorView.task,
      run,
      latestOutcome,
      latestCheckpoint,
      guardReason,
      cooldownLabel,
    ),
  };
}

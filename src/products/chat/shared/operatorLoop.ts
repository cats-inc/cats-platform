import {
  deriveCoreGovernanceSummary,
  deriveCoreWorkflowSummary,
} from '../../../core/governance.js';
import {
  buildActivityFeed,
  buildApprovalActions,
  buildEffectivePolicyView,
  buildIncidentActions,
} from './operatorLoopActions.js';
import {
  buildActorNameById,
  buildBranchStates,
  compareIsoDesc,
  metricsForRun,
  resolveCooldownLabel,
  resolveGuardReason,
} from './operatorLoopMetadata.js';
import type {
  ChatOperatorSnapshot,
  ChatOperatorView,
  ChatRunInspectorView,
} from './operatorLoopTypes.js';

export type {
  ChatApprovalActionView,
  ChatEffectivePolicyView,
  ChatOperatorActionView,
  ChatOperatorActivityItem,
  ChatOperatorSeverity,
  ChatOperatorSnapshot,
  ChatOperatorView,
  ChatRunInspectorView,
  ChatRunMetrics,
  ChatWorkflowBranchView,
} from './operatorLoopTypes.js';

export function resolveChatConversationId(channelId: string): string {
  return `conversation-channel-${channelId}`;
}

export function buildChatOperatorView(
  snapshot: ChatOperatorSnapshot | null,
  channelId: string,
): ChatOperatorView | null {
  if (!snapshot) {
    return null;
  }

  const conversationId = resolveChatConversationId(channelId);
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
  const effectivePolicy = buildEffectivePolicyView(task);
  const workflowSummary = deriveCoreWorkflowSummary(latestRun);
  const governanceSummary = deriveCoreGovernanceSummary(task, latestRun);
  const approvalActions = buildApprovalActions(latestApproval);
  const activityFeed = buildActivityFeed(
    activities,
    traces,
    checkpoints,
    outcomes,
    actorNameById,
  );

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

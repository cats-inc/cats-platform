import type {
  CoreActivityRecord,
  CoreApprovalQueueItem,
  CoreCheckpointRecord,
  CoreDeliveryGate,
  CoreOrchestrationOutcomeRecord,
  CoreRunRecord,
  CoreTaskRecord,
  CoreTraceRecord,
} from '../../../core/types.js';
import {
  readCoreEffectiveBudgetPolicy,
  readCoreEffectiveDeliveryPolicy,
} from '../../../core/governance.js';
import type {
  ChatApprovalActionView,
  ChatEffectivePolicyView,
  ChatOperatorActionView,
  ChatOperatorActivityItem,
} from './types.js';
import {
  compareIsoDesc,
  labelForActivity,
  labelForTrace,
  readMetadataRecord,
  readMetadataString,
  severityForActivity,
  severityForCheckpoint,
  severityForOutcome,
  severityForTrace,
  uniqueActivityItems,
} from './metadata.js';

const CORE_DELIVERY_GATE_SET = new Set<string>([
  'manual_review_required',
  'owner_approval_required',
  'publish_artifact_required',
]);

export function buildEffectivePolicyView(task: CoreTaskRecord | null): ChatEffectivePolicyView | null {
  if (!task) {
    return null;
  }

  const metadata = readMetadataRecord(task.metadata);
  const delivery = readCoreEffectiveDeliveryPolicy(metadata);
  const budget = readCoreEffectiveBudgetPolicy(metadata);
  return {
    deliveryMode: delivery?.mode ?? null,
    deliveryGates: delivery?.gates
      ?? (Array.isArray(metadata?.effectiveDeliveryGates)
        ? metadata.effectiveDeliveryGates.filter((gate): gate is CoreDeliveryGate =>
            typeof gate === 'string' && CORE_DELIVERY_GATE_SET.has(gate),
          )
        : []),
    deliverySource: delivery?.source ?? null,
    deliveryRationale: delivery?.rationale ?? null,
    budgetAlertLevel: budget?.alertLevel ?? null,
    budgetAlertSource: budget?.source ?? null,
    budgetRationale: budget?.rationale ?? null,
  };
}

export function buildApprovalActions(
  latestApproval: CoreApprovalQueueItem | null,
): ChatApprovalActionView[] {
  if (!latestApproval || latestApproval.status !== 'pending' || !latestApproval.requiresOwnerDecision) {
    return [];
  }

  return latestApproval.decisionOptions.map((option) => ({
    kind: option.action,
    label: option.label,
    description: option.description,
    disabled: false,
    taskId: latestApproval.taskId,
    approvalId: latestApproval.id,
    status: latestApproval.status,
  }));
}

export function buildIncidentActions(
  task: CoreTaskRecord | null,
  run: CoreRunRecord | null,
  latestOutcome: CoreOrchestrationOutcomeRecord | null,
  latestCheckpoint: CoreCheckpointRecord | null,
  guardReason: string | null,
  cooldownLabel: string | null,
): ChatOperatorActionView[] {
  if (!run) {
    return [];
  }

  const needsIncidentAction = run.status === 'blocked'
    || run.status === 'failed'
    || Boolean(guardReason)
    || Boolean(cooldownLabel);
  if (!needsIncidentAction) {
    return [];
  }

  const taskMetadata = readMetadataRecord(task?.metadata);
  const runMetadata = readMetadataRecord(run.metadata);
  const metadata = runMetadata ?? {};
  const replay = readMetadataRecord(taskMetadata?.orchestratorDispatchReplay);
  const incidentUpdatedAt = latestOutcome?.updatedAt ?? latestCheckpoint?.updatedAt ?? run.updatedAt;
  const acknowledgedAt = readMetadataString(metadata, 'operatorAcknowledgedAt');
  const retryRequestedAt = readMetadataString(taskMetadata, 'operatorRetryRequestedAt')
    ?? readMetadataString(metadata, 'operatorRetryRequestedAt');
  const acknowledgedFresh = Boolean(
    acknowledgedAt && acknowledgedAt.localeCompare(incidentUpdatedAt) >= 0,
  );
  const retryFresh = Boolean(
    retryRequestedAt && retryRequestedAt.localeCompare(incidentUpdatedAt) >= 0,
  );
  const retryReplayTrigger = readMetadataString(replay, 'replayTrigger');
  const retryReplayState = readMetadataString(replay, 'replayState');
  const retryReplayError = readMetadataString(replay, 'replayError');
  const retryStatusLabel = retryFresh && retryReplayTrigger === 'retry'
    ? retryReplayState === 'in_progress'
      ? 'Retry in progress'
      : retryReplayState === 'failed'
        ? retryReplayError
          ? `Retry failed: ${retryReplayError}`
          : 'Retry failed'
        : 'Retry dispatched'
    : retryFresh
      ? 'Retry requested'
      : null;
  const retryDisabled = retryFresh && retryReplayState !== 'failed';
  const retryLabel = retryFresh && retryReplayState === 'failed'
    ? 'Retry Again'
    : retryFresh && retryReplayState === 'in_progress'
      ? 'Retrying'
      : retryFresh
        ? 'Retry Requested'
        : 'Request Retry';
  const retryDescription = retryReplayState === 'failed'
    ? 'Retry failed. Operators can request another replay of the stored dispatch.'
    : 'Record that the operator wants this blocked or failed run retried.';

  return [
    {
      kind: 'retry',
      label: retryLabel,
      description: retryDescription,
      disabled: retryDisabled,
      statusLabel: retryStatusLabel,
      taskId: task?.id ?? run.taskId,
      runId: run.id,
      checkpointId: latestCheckpoint?.id ?? null,
      outcomeId: latestOutcome?.id ?? null,
    },
    {
      kind: 'acknowledge',
      label: acknowledgedFresh ? 'Acknowledged' : 'Acknowledge',
      description: 'Record that the operator has seen the current guardrail or incident state.',
      disabled: acknowledgedFresh,
      statusLabel: acknowledgedFresh ? 'Acknowledged' : null,
      taskId: task?.id ?? run.taskId,
      runId: run.id,
      checkpointId: latestCheckpoint?.id ?? null,
      outcomeId: latestOutcome?.id ?? null,
    },
  ];
}

export function buildActivityFeed(
  activities: CoreActivityRecord[],
  traces: CoreTraceRecord[],
  checkpoints: CoreCheckpointRecord[],
  outcomes: CoreOrchestrationOutcomeRecord[],
  actorNameById: Record<string, string>,
): ChatOperatorActivityItem[] {
  const activityItems = activities.map((activity) => ({
    id: `activity:${activity.id}`,
    label: labelForActivity(activity),
    message: activity.message,
    createdAt: activity.createdAt,
    actorId: activity.actorId,
    actorName: activity.actorId ? actorNameById[activity.actorId] ?? null : null,
    runId: activity.runId,
    taskId: activity.taskId,
    severity: severityForActivity(activity),
    source: 'activity' as const,
  }));

  const traceItems = traces
    .filter((trace) => trace.kind === 'status' || trace.kind === 'approval' || trace.kind === 'error')
    .map((trace) => ({
      id: `trace:${trace.id}`,
      label: labelForTrace(trace),
      message: trace.message,
      createdAt: trace.createdAt,
      actorId: trace.actorId,
      actorName: trace.actorId ? actorNameById[trace.actorId] ?? null : null,
      runId: trace.runId,
      taskId: trace.taskId,
      severity: severityForTrace(trace),
      source: 'trace' as const,
    }));

  const checkpointItems = checkpoints.map((checkpoint) => ({
    id: `checkpoint:${checkpoint.id}`,
    label: 'Checkpoint',
    message: checkpoint.summary ?? checkpoint.label,
    createdAt: checkpoint.updatedAt,
    actorId: null,
    actorName: null,
    runId: checkpoint.runId,
    taskId: checkpoint.taskId,
    severity: severityForCheckpoint(checkpoint),
    source: 'checkpoint' as const,
  }));

  const outcomeItems = outcomes.map((outcome) => ({
    id: `outcome:${outcome.id}`,
    label: 'Outcome',
    message: outcome.summary ?? outcome.title,
    createdAt: outcome.updatedAt,
    actorId: null,
    actorName: null,
    runId: outcome.runId,
    taskId: outcome.taskId,
    severity: severityForOutcome(outcome),
    source: 'outcome' as const,
  }));

  return uniqueActivityItems(
    [...activityItems, ...traceItems, ...checkpointItems, ...outcomeItems].sort((left, right) =>
      compareIsoDesc(left.createdAt, right.createdAt),
    ),
  );
}

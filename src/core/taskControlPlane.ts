import { buildApprovalQueue } from './model/index.js';
import { buildCoreTaskRecoveryView, type CoreTaskRecoveryView } from './recovery.js';
import { buildCoreTaskInspectionView } from './taskInspection.js';
import type {
  CatsCoreState,
  CoreApprovalDecisionAction,
  CoreApprovalQueueItem,
  CoreApprovalStatus,
  CoreGovernanceSummary,
  CoreOrchestrationOutcomeRecord,
  CoreRecordMetadata,
  CoreRunRecord,
  CoreTaskRecord,
  CoreTraceRecord,
  CoreWorkflowSummary,
} from './types.js';

export type CoreTaskControlPlaneSeverity =
  | 'muted'
  | 'progress'
  | 'attention'
  | 'error'
  | 'success';

export type CoreTaskControlPlaneReason =
  | 'approval_pending'
  | 'run_blocked'
  | 'run_failed'
  | 'retry_available'
  | 'workflow_review_required';

export interface CoreTaskControlPlaneActionEnvelope {
  method: 'POST';
  path: string;
  body: Record<string, unknown>;
}

export interface CoreTaskControlPlaneApprovalAction {
  kind: CoreApprovalDecisionAction;
  label: string;
  description: string;
  disabled: boolean;
  status: CoreApprovalStatus;
  action: CoreTaskControlPlaneActionEnvelope;
}

export interface CoreTaskControlPlaneIncidentAction {
  kind: 'retry' | 'acknowledge';
  label: string;
  description: string;
  disabled: boolean;
  statusLabel: string | null;
  action: CoreTaskControlPlaneActionEnvelope;
}

export interface CoreTaskControlPlaneNextAction {
  kind: 'approve' | 'reroute' | 'reject' | 'retry' | 'acknowledge' | 'wait' | 'complete';
  label: string;
  blocking: boolean;
  action: CoreTaskControlPlaneActionEnvelope | null;
}

export interface CoreTaskControlPlaneAttention {
  severity: CoreTaskControlPlaneSeverity;
  reasons: CoreTaskControlPlaneReason[];
  needsOperatorAttention: boolean;
}

export interface CoreTaskControlPlaneWorkflowRecommendationTargetView {
  participantKind: 'orchestrator' | 'cat' | null;
  participantId: string | null;
  participantName: string | null;
}

export interface CoreTaskControlPlaneWorkflowRecommendationView {
  source: 'checkpoint' | 'boss_replan' | 'system_inference' | null;
  workflowShape: 'sequential' | 'parallel' | 'converge' | null;
  continuationSource: 'explicit_mentions' | 'workflow_recommendation' | null;
  branchStrategy: string | null;
  rationale: string | null;
  reviewRequired: boolean;
  candidateTargets: CoreTaskControlPlaneWorkflowRecommendationTargetView[];
  unresolvedTargets: string[];
}

export interface CoreTaskControlPlaneView {
  taskId: string;
  conversationId: string | null;
  taskStatus: CoreTaskRecord['status'];
  lastUpdatedAt: string;
  latestRunId: string | null;
  latestCheckpointId: string | null;
  latestOutcomeId: string | null;
  governanceSummary: CoreGovernanceSummary | null;
  workflowSummary: CoreWorkflowSummary | null;
  recovery: CoreTaskRecoveryView;
  latestWorkflowRecommendation: CoreTaskControlPlaneWorkflowRecommendationView | null;
  approvalActions: CoreTaskControlPlaneApprovalAction[];
  incidentActions: CoreTaskControlPlaneIncidentAction[];
  nextActions: CoreTaskControlPlaneNextAction[];
  attention: CoreTaskControlPlaneAttention;
}

function asRecord(value: unknown): CoreRecordMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as CoreRecordMetadata;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function readMetadataRecord(
  metadata: CoreRecordMetadata | null | undefined,
  key: string,
): CoreRecordMetadata | null {
  return asRecord(metadata?.[key]);
}

function buildApprovalActionEnvelope(
  taskId: string,
  action: CoreApprovalDecisionAction,
): CoreTaskControlPlaneActionEnvelope {
  return {
    method: 'POST',
    path: '/api/core/approvals',
    body: {
      taskId,
      status: action === 'approve' ? 'approved' : 'rejected',
      action,
    },
  };
}

function buildIncidentActionEnvelope(input: {
  action: 'retry' | 'acknowledge';
  taskId: string;
  runId: string | null;
  checkpointId: string | null;
  outcomeId: string | null;
}): CoreTaskControlPlaneActionEnvelope {
  return {
    method: 'POST',
    path: '/api/core/operator-actions',
    body: {
      action: input.action,
      taskId: input.taskId,
      runId: input.runId,
      checkpointId: input.checkpointId,
      outcomeId: input.outcomeId,
    },
  };
}

function buildApprovalActions(
  approval: CoreApprovalQueueItem | null,
): CoreTaskControlPlaneApprovalAction[] {
  if (!approval || approval.status !== 'pending' || !approval.requiresOwnerDecision) {
    return [];
  }

  return approval.decisionOptions.map((option) => ({
    kind: option.action,
    label: option.label,
    description: option.description,
    disabled: false,
    status: approval.status,
    action: buildApprovalActionEnvelope(approval.taskId, option.action),
  }));
}

function buildIncidentActions(input: {
  task: CoreTaskRecord;
  latestRun: CoreRunRecord | null;
  latestOutcome: CoreOrchestrationOutcomeRecord | null;
  latestCheckpointId: string | null;
  recovery: CoreTaskRecoveryView;
}): CoreTaskControlPlaneIncidentAction[] {
  const { latestRun, latestOutcome, latestCheckpointId, recovery, task } = input;
  if (!latestRun) {
    return [];
  }

  const needsIncidentAction = latestRun.status === 'blocked'
    || latestRun.status === 'failed'
    || recovery.canRetry;
  if (!needsIncidentAction) {
    return [];
  }

  const taskMetadata = asRecord(task.metadata);
  const runMetadata = asRecord(latestRun.metadata);
  const incidentUpdatedAt = latestOutcome?.updatedAt ?? latestRun.updatedAt;
  const acknowledgedAt = readString(runMetadata?.operatorAcknowledgedAt)
    ?? readString(taskMetadata?.operatorAcknowledgedAt);
  const retryRequestedAt = readString(taskMetadata?.operatorRetryRequestedAt)
    ?? readString(runMetadata?.operatorRetryRequestedAt);
  const acknowledgedFresh = Boolean(
    acknowledgedAt && acknowledgedAt.localeCompare(incidentUpdatedAt) >= 0,
  );
  const retryReplayState = recovery.workflowContinuationReplay?.replayState
    ?? recovery.dispatchReplay?.replayState
    ?? null;
  const retryReplayError = recovery.workflowContinuationReplay?.replayError
    ?? recovery.dispatchReplay?.replayError
    ?? null;
  const retryFresh = Boolean(
    retryRequestedAt && retryRequestedAt.localeCompare(incidentUpdatedAt) >= 0,
  );
  const retryStatusLabel = retryFresh
    ? retryReplayState === 'in_progress'
      ? 'Retry in progress'
      : retryReplayState === 'failed'
        ? retryReplayError
          ? `Retry failed: ${retryReplayError}`
          : 'Retry failed'
        : retryReplayState
          ? 'Retry dispatched'
          : 'Retry requested'
    : null;
  const retryDisabled = retryFresh && retryReplayState !== 'failed';
  const retryLabel = retryFresh && retryReplayState === 'failed'
    ? 'Retry Again'
    : retryFresh && retryReplayState === 'in_progress'
      ? 'Retrying'
      : retryFresh
        ? 'Retry Requested'
        : 'Request Retry';

  return [
    {
      kind: 'retry',
      label: retryLabel,
      description: retryReplayState === 'failed'
        ? 'Retry failed. Operators can request another replay of the stored dispatch.'
        : 'Record that the operator wants this blocked or failed task retried.',
      disabled: retryDisabled,
      statusLabel: retryStatusLabel,
      action: buildIncidentActionEnvelope({
        action: 'retry',
        taskId: task.id,
        runId: latestRun.id,
        checkpointId: latestCheckpointId,
        outcomeId: latestOutcome?.id ?? null,
      }),
    },
    {
      kind: 'acknowledge',
      label: acknowledgedFresh ? 'Acknowledged' : 'Acknowledge',
      description: 'Record that the operator has seen the current blocked or failed state.',
      disabled: acknowledgedFresh,
      statusLabel: acknowledgedFresh ? 'Acknowledged' : null,
      action: buildIncidentActionEnvelope({
        action: 'acknowledge',
        taskId: task.id,
        runId: latestRun.id,
        checkpointId: latestCheckpointId,
        outcomeId: latestOutcome?.id ?? null,
      }),
    },
  ];
}

function buildNextActions(input: {
  task: CoreTaskRecord;
  approvalActions: CoreTaskControlPlaneApprovalAction[];
  incidentActions: CoreTaskControlPlaneIncidentAction[];
  latestRun: CoreRunRecord | null;
}): CoreTaskControlPlaneNextAction[] {
  const actions: CoreTaskControlPlaneNextAction[] = [
    ...input.approvalActions.map((action) => ({
      kind: action.kind,
      label: action.label,
      blocking: true,
      action: action.action,
    })),
    ...input.incidentActions.map((action) => ({
      kind: action.kind,
      label: action.label,
      blocking: action.kind === 'retry',
      action: action.disabled ? null : action.action,
    })),
  ];

  if (actions.length > 0) {
    return actions;
  }

  if (input.latestRun?.status === 'running') {
    return [
      {
        kind: 'wait',
        label: 'Wait for active run',
        blocking: false,
        action: null,
      },
    ];
  }

  if (input.task.status === 'completed') {
    return [
      {
        kind: 'complete',
        label: 'Task completed',
        blocking: false,
        action: null,
      },
    ];
  }

  return [];
}

function readWorkflowRecommendationFromMetadata(
  metadata: CoreRecordMetadata | null | undefined,
): CoreTaskControlPlaneWorkflowRecommendationView | null {
  const recommendation = readMetadataRecord(metadata, 'workflowRecommendation');
  if (!recommendation) {
    return null;
  }

  const workflowShape = readString(recommendation.workflowShape);
  const source = readString(recommendation.source);
  const continuationSource = readString(metadata?.continuationSource);
  const candidateTargets = Array.isArray(recommendation.candidateTargets)
    ? recommendation.candidateTargets
      .map((target) => asRecord(target))
      .filter((target): target is CoreRecordMetadata => target !== null)
      .map((target) => ({
        participantKind: (() => {
          const participantKind = readString(target.participantKind);
          if (participantKind === 'orchestrator' || participantKind === 'cat') {
            return participantKind as 'orchestrator' | 'cat';
          }
          return null;
        })(),
        participantId: readString(target.participantId),
        participantName: readString(target.participantName),
      }))
    : [];

  return {
    source:
      source === 'checkpoint' || source === 'boss_replan' || source === 'system_inference'
        ? source
        : null,
    workflowShape:
      workflowShape === 'sequential'
      || workflowShape === 'parallel'
      || workflowShape === 'converge'
        ? workflowShape
        : null,
    continuationSource:
      continuationSource === 'explicit_mentions'
      || continuationSource === 'workflow_recommendation'
        ? continuationSource
        : null,
    branchStrategy: readString(recommendation.branchStrategy),
    rationale: readString(recommendation.rationale),
    reviewRequired: readBoolean(recommendation.reviewRequired),
    candidateTargets,
    unresolvedTargets: readStringArray(metadata?.unresolvedTargets),
  };
}

function resolveLatestWorkflowRecommendation(input: {
  latestCheckpointMetadata: CoreRecordMetadata | null | undefined;
  latestOutcomeMetadata: CoreRecordMetadata | null | undefined;
  latestRunMetadata: CoreRecordMetadata | null | undefined;
  traces: CoreTraceRecord[];
}): CoreTaskControlPlaneWorkflowRecommendationView | null {
  return readWorkflowRecommendationFromMetadata(input.latestCheckpointMetadata)
    ?? readWorkflowRecommendationFromMetadata(input.latestOutcomeMetadata)
    ?? readWorkflowRecommendationFromMetadata(input.latestRunMetadata)
    ?? input.traces
      .map((trace) => readWorkflowRecommendationFromMetadata(trace.metadata))
      .find((recommendation): recommendation is CoreTaskControlPlaneWorkflowRecommendationView =>
        Boolean(recommendation),
      )
    ?? null;
}

function buildAttention(input: {
  task: CoreTaskRecord;
  latestRun: CoreRunRecord | null;
  workflowSummary: CoreWorkflowSummary | null;
  recovery: CoreTaskRecoveryView;
  latestWorkflowRecommendation: CoreTaskControlPlaneWorkflowRecommendationView | null;
}): CoreTaskControlPlaneAttention {
  const reasons: CoreTaskControlPlaneReason[] = [];

  if (input.task.approval.status === 'pending') {
    reasons.push('approval_pending');
  }
  if (input.latestRun?.status === 'failed') {
    reasons.push('run_failed');
  } else if (input.latestRun?.status === 'blocked') {
    reasons.push('run_blocked');
  }
  if (input.recovery.canRetry) {
    reasons.push('retry_available');
  }
  if (
    input.latestWorkflowRecommendation?.reviewRequired
    || input.workflowSummary?.reviewRequired
  ) {
    reasons.push('workflow_review_required');
  }

  let severity: CoreTaskControlPlaneSeverity = 'muted';
  if (reasons.includes('run_failed')) {
    severity = 'error';
  } else if (reasons.length > 0) {
    severity = 'attention';
  } else if (input.latestRun?.status === 'running') {
    severity = 'progress';
  } else if (input.task.status === 'completed') {
    severity = 'success';
  }

  return {
    severity,
    reasons,
    needsOperatorAttention: severity === 'attention' || severity === 'error',
  };
}

function hasGovernanceSignal(summary: CoreGovernanceSummary | null): boolean {
  if (!summary) {
    return false;
  }

  return summary.approval.pending
    || summary.approval.requiresOwnerDecision
    || summary.approval.latestDecisionAction !== null
    || summary.delivery !== null
    || summary.budget !== null
    || summary.runtimeDeliveryManifest !== null
    || summary.latestOperatorAction !== null;
}

function hasVisibleControlPlaneSignal(view: CoreTaskControlPlaneView): boolean {
  return view.attention.severity !== 'muted'
    || view.approvalActions.length > 0
    || view.incidentActions.length > 0
    || view.latestWorkflowRecommendation !== null
    || view.workflowSummary !== null
    || view.recovery.recoveryRequired
    || hasGovernanceSignal(view.governanceSummary);
}

function compareControlPlaneViews(
  left: CoreTaskControlPlaneView,
  right: CoreTaskControlPlaneView,
): number {
  const leftTimestamp = left.recovery.latestActivity?.createdAt
    ?? left.recovery.workflowContinuationReplay?.replayAttemptAt
    ?? left.recovery.dispatchReplay?.replayAttemptAt
    ?? left.recovery.pendingDispatch?.replayAttemptAt
    ?? left.lastUpdatedAt;
  const rightTimestamp = right.recovery.latestActivity?.createdAt
    ?? right.recovery.workflowContinuationReplay?.replayAttemptAt
    ?? right.recovery.dispatchReplay?.replayAttemptAt
    ?? right.recovery.pendingDispatch?.replayAttemptAt
    ?? right.lastUpdatedAt;

  const severityRank = (value: CoreTaskControlPlaneSeverity): number => {
    switch (value) {
      case 'error':
        return 4;
      case 'attention':
        return 3;
      case 'progress':
        return 2;
      case 'success':
        return 1;
      case 'muted':
      default:
        return 0;
    }
  };

  const severityDiff = severityRank(right.attention.severity) - severityRank(left.attention.severity);
  if (severityDiff !== 0) {
    return severityDiff;
  }

  return rightTimestamp.localeCompare(leftTimestamp);
}

export function buildCoreTaskControlPlaneView(
  core: CatsCoreState,
  task: CoreTaskRecord,
): CoreTaskControlPlaneView {
  const inspection = buildCoreTaskInspectionView(core, task);
  const approval = buildApprovalQueue(core).find((candidate) => candidate.taskId === task.id) ?? null;
  const approvalActions = buildApprovalActions(approval);
  const latestWorkflowRecommendation = resolveLatestWorkflowRecommendation({
    latestCheckpointMetadata: inspection.latestCheckpoint?.metadata,
    latestOutcomeMetadata: inspection.latestOutcome?.metadata,
    latestRunMetadata: inspection.latestRun?.metadata,
    traces: core.traces
      .filter((candidate) => candidate.taskId === task.id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  });
  const incidentActions = buildIncidentActions({
    task,
    latestRun: inspection.latestRun,
    latestOutcome: inspection.latestOutcome,
    latestCheckpointId: inspection.latestCheckpoint?.id ?? null,
    recovery: inspection.recovery,
  });
  const nextActions = buildNextActions({
    task,
    approvalActions,
    incidentActions,
    latestRun: inspection.latestRun,
  });
  const attention = buildAttention({
    task,
    latestRun: inspection.latestRun,
    workflowSummary: inspection.workflowSummary,
    recovery: inspection.recovery,
    latestWorkflowRecommendation,
  });

  return {
    taskId: task.id,
    conversationId: task.conversationId,
    taskStatus: task.status,
    lastUpdatedAt:
      inspection.latestOutcome?.updatedAt
      ?? inspection.latestCheckpoint?.updatedAt
      ?? inspection.latestRun?.updatedAt
      ?? task.updatedAt,
    latestRunId: inspection.latestRun?.id ?? null,
    latestCheckpointId: inspection.latestCheckpoint?.id ?? null,
    latestOutcomeId: inspection.latestOutcome?.id ?? null,
    governanceSummary: inspection.governanceSummary,
    workflowSummary: inspection.workflowSummary,
    recovery: inspection.recovery,
    latestWorkflowRecommendation,
    approvalActions,
    incidentActions,
    nextActions,
    attention,
  };
}

export function listCoreTaskControlPlaneViews(
  core: CatsCoreState,
): CoreTaskControlPlaneView[] {
  return core.tasks
    .map((task) => buildCoreTaskControlPlaneView(core, task))
    .filter(hasVisibleControlPlaneSignal)
    .sort(compareControlPlaneViews);
}

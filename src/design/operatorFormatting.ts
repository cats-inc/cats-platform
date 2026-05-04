import type { MessageKey } from '../shared/i18n/messageKeys.js';
import { messageKeys } from '../shared/i18n/index.js';

import type {
  CoreCheckpointRecord,
  CoreOrchestrationOutcomeRecord,
  CoreRunRecord,
  CoreTraceRecord,
} from '../core/types.js';
import type { RoomWorkflowTargetStatus } from '../shared/roomRouting.js';

export type OperatorSeverity = 'muted' | 'progress' | 'attention' | 'error' | 'success';
type OperatorTranslate = (key: MessageKey, params?: Record<string, unknown>) => string;
const fallbackOperatorTranslate: OperatorTranslate = (key) => {
  const fallback: Partial<Record<MessageKey, string>> = {
    [messageKeys.sharedOperatorNoTimestamp]: 'No timestamp',
    [messageKeys.sharedOperatorRunStatusRunning]: 'Running',
    [messageKeys.sharedOperatorRunStatusBlocked]: 'Blocked',
    [messageKeys.sharedOperatorRunStatusCompleted]: 'Completed',
    [messageKeys.sharedOperatorRunStatusFailed]: 'Failed',
    [messageKeys.sharedOperatorRunStatusCancelled]: 'Cancelled',
    [messageKeys.sharedOperatorRunStatusQueued]: 'Queued',
    [messageKeys.sharedOperatorBranchStatusPending]: 'Pending',
    [messageKeys.sharedOperatorBranchStatusRunning]: 'Running',
    [messageKeys.sharedOperatorBranchStatusCompleted]: 'Completed',
    [messageKeys.sharedOperatorBranchStatusFailed]: 'Failed',
    [messageKeys.sharedOperatorBranchStatusBlocked]: 'Blocked',
    [messageKeys.sharedOperatorBranchStatusCancelled]: 'Cancelled',
    [messageKeys.sharedOperatorBranchStatusWaitingForConverge]: 'Waiting for converge',
    [messageKeys.sharedOperatorCheckpointStatusCompleted]: 'Completed',
    [messageKeys.sharedOperatorCheckpointStatusCancelled]: 'Cancelled',
    [messageKeys.sharedOperatorCheckpointStatusOpen]: 'Open',
    [messageKeys.sharedOperatorOutcomeStatusSucceeded]: 'Succeeded',
    [messageKeys.sharedOperatorOutcomeStatusBlocked]: 'Blocked',
    [messageKeys.sharedOperatorOutcomeStatusFailed]: 'Failed',
    [messageKeys.sharedOperatorOutcomeStatusCancelled]: 'Cancelled',
    [messageKeys.sharedOperatorTraceKindApproval]: 'Approval',
    [messageKeys.sharedOperatorTraceKindCheckpoint]: 'Checkpoint',
    [messageKeys.sharedOperatorTraceKindDispatch]: 'Dispatch',
    [messageKeys.sharedOperatorTraceKindError]: 'Error',
    [messageKeys.sharedOperatorTraceKindOutcome]: 'Outcome',
    [messageKeys.sharedOperatorTraceKindStatus]: 'Status',
    [messageKeys.sharedOperatorTraceKindNote]: 'Note',
    [messageKeys.sharedOperatorActivityLabelRecovery]: 'Recovery',
    [messageKeys.sharedOperatorActivityLabelReplay]: 'Replay',
    [messageKeys.sharedOperatorActivityLabelDecision]: 'Decision',
    [messageKeys.sharedOperatorActivityLabelAction]: 'Action',
    [messageKeys.sharedOperatorActivityLabelArtifact]: 'Artifact',
    [messageKeys.sharedOperatorActivityLabelUpdate]: 'Update',
    [messageKeys.sharedOperatorActivityLabelTrace]: 'Trace',
    [messageKeys.sharedOperatorDeliveryModeArtifactOnly]: 'Artifact only',
    [messageKeys.sharedOperatorDeliveryModeCommitOnly]: 'Commit only',
    [messageKeys.sharedOperatorDeliveryModeDeployPreview]: 'Deploy preview',
    [messageKeys.sharedOperatorDeliveryModePrWithChecks]: 'Pull request with checks',
    [messageKeys.sharedOperatorDeliveryModePushBranch]: 'Push branch',
    [messageKeys.sharedOperatorGateManualReviewRequired]: 'Manual review required',
    [messageKeys.sharedOperatorGateOwnerApprovalRequired]: 'Owner approval required',
    [messageKeys.sharedOperatorGatePublishArtifactRequired]: 'Publish artifact required',
    [messageKeys.sharedOperatorBudgetLevelNormal]: 'Normal',
    [messageKeys.sharedOperatorBudgetLevelWarning]: 'Warning',
    [messageKeys.sharedOperatorBudgetLevelBlocked]: 'Blocked',
    [messageKeys.sharedOperatorWorkflowShapeSequential]: 'Sequential',
    [messageKeys.sharedOperatorWorkflowShapeConcurrent]: 'Concurrent',
    [messageKeys.sharedOperatorWorkflowShapeConverge]: 'Converge',
    [messageKeys.sharedOperatorBranchStrategyForkIfPossible]: 'Fork if possible',
    [messageKeys.sharedOperatorBranchStrategyFreshNoParent]:
      'Fresh branch without parent',
    [messageKeys.sharedOperatorBranchStrategySingleTargetReview]:
      'Single-target review',
    [messageKeys.sharedOperatorBranchStrategyTransplantContext]: 'Transplant context',
  };

  return fallback[key] ?? String(key);
};

const OPERATOR_ACTIVITY_LABEL_KEYS: Record<string, MessageKey> = {
  Approval: messageKeys.sharedOperatorTraceKindApproval,
  Checkpoint: messageKeys.sharedOperatorTraceKindCheckpoint,
  Dispatch: messageKeys.sharedOperatorTraceKindDispatch,
  Error: messageKeys.sharedOperatorTraceKindError,
  Outcome: messageKeys.sharedOperatorTraceKindOutcome,
  Status: messageKeys.sharedOperatorTraceKindStatus,
  Note: messageKeys.sharedOperatorTraceKindNote,
  Recovery: messageKeys.sharedOperatorActivityLabelRecovery,
  Replay: messageKeys.sharedOperatorActivityLabelReplay,
  Decision: messageKeys.sharedOperatorActivityLabelDecision,
  Action: messageKeys.sharedOperatorActivityLabelAction,
  Artifact: messageKeys.sharedOperatorActivityLabelArtifact,
  Update: messageKeys.sharedOperatorActivityLabelUpdate,
  Trace: messageKeys.sharedOperatorActivityLabelTrace,
};

export function formatOperatorTimestamp(
  timestamp: string | null,
  t: OperatorTranslate = fallbackOperatorTranslate,
): string {
  if (!timestamp) {
    return t(messageKeys.sharedOperatorNoTimestamp);
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function operatorSeverityClassName(severity: OperatorSeverity): string {
  switch (severity) {
    case 'progress':
      return 'isProgress';
    case 'attention':
      return 'isAttention';
    case 'error':
      return 'isError';
    case 'success':
      return 'isSuccess';
    default:
      return 'isMuted';
  }
}

export function runStatusLabel(
  status: CoreRunRecord['status'],
  t: OperatorTranslate = fallbackOperatorTranslate,
): string {
  switch (status) {
    case 'running':
      return t(messageKeys.sharedOperatorRunStatusRunning);
    case 'blocked':
      return t(messageKeys.sharedOperatorRunStatusBlocked);
    case 'completed':
      return t(messageKeys.sharedOperatorRunStatusCompleted);
    case 'failed':
      return t(messageKeys.sharedOperatorRunStatusFailed);
    case 'cancelled':
      return t(messageKeys.sharedOperatorRunStatusCancelled);
    default:
      return t(messageKeys.sharedOperatorRunStatusQueued);
  }
}

export function runStatusSeverity(status: CoreRunRecord['status']): OperatorSeverity {
  switch (status) {
    case 'running':
      return 'progress';
    case 'blocked':
      return 'attention';
    case 'failed':
      return 'error';
    case 'completed':
      return 'success';
    default:
      return 'muted';
  }
}

export function branchStatusLabel(
  status: RoomWorkflowTargetStatus,
  t: OperatorTranslate = fallbackOperatorTranslate,
): string {
  switch (status) {
    case 'pending':
      return t(messageKeys.sharedOperatorBranchStatusPending);
    case 'running':
      return t(messageKeys.sharedOperatorBranchStatusRunning);
    case 'completed':
      return t(messageKeys.sharedOperatorBranchStatusCompleted);
    case 'failed':
      return t(messageKeys.sharedOperatorBranchStatusFailed);
    case 'blocked':
      return t(messageKeys.sharedOperatorBranchStatusBlocked);
    case 'cancelled':
      return t(messageKeys.sharedOperatorBranchStatusCancelled);
    default:
      return t(messageKeys.sharedOperatorBranchStatusWaitingForConverge);
  }
}

export function checkpointStatusLabel(
  status: CoreCheckpointRecord['status'],
  t: OperatorTranslate = fallbackOperatorTranslate,
): string {
  switch (status) {
    case 'completed':
      return t(messageKeys.sharedOperatorCheckpointStatusCompleted);
    case 'cancelled':
      return t(messageKeys.sharedOperatorCheckpointStatusCancelled);
    default:
      return t(messageKeys.sharedOperatorCheckpointStatusOpen);
  }
}

export function checkpointStatusSeverity(
  status: CoreCheckpointRecord['status'],
): OperatorSeverity {
  switch (status) {
    case 'completed':
      return 'success';
    case 'cancelled':
      return 'muted';
    default:
      return 'attention';
  }
}

export function outcomeStatusLabel(
  status: CoreOrchestrationOutcomeRecord['status'],
  t: OperatorTranslate = fallbackOperatorTranslate,
): string {
  switch (status) {
    case 'succeeded':
      return t(messageKeys.sharedOperatorOutcomeStatusSucceeded);
    case 'blocked':
      return t(messageKeys.sharedOperatorOutcomeStatusBlocked);
    case 'failed':
      return t(messageKeys.sharedOperatorOutcomeStatusFailed);
    default:
      return t(messageKeys.sharedOperatorOutcomeStatusCancelled);
  }
}

export function outcomeStatusSeverity(
  status: CoreOrchestrationOutcomeRecord['status'],
): OperatorSeverity {
  switch (status) {
    case 'succeeded':
      return 'success';
    case 'blocked':
      return 'attention';
    case 'failed':
      return 'error';
    default:
      return 'muted';
  }
}

export function traceKindLabel(
  kind: CoreTraceRecord['kind'],
  t: OperatorTranslate = fallbackOperatorTranslate,
): string {
  switch (kind) {
    case 'approval':
      return t(messageKeys.sharedOperatorTraceKindApproval);
    case 'checkpoint':
      return t(messageKeys.sharedOperatorTraceKindCheckpoint);
    case 'dispatch':
      return t(messageKeys.sharedOperatorTraceKindDispatch);
    case 'error':
      return t(messageKeys.sharedOperatorTraceKindError);
    case 'outcome':
      return t(messageKeys.sharedOperatorTraceKindOutcome);
    case 'status':
      return t(messageKeys.sharedOperatorTraceKindStatus);
    default:
      return t(messageKeys.sharedOperatorTraceKindNote);
  }
}

export function operatorActivityLabel(
  label: string,
  t: OperatorTranslate = fallbackOperatorTranslate,
): string {
  const key = OPERATOR_ACTIVITY_LABEL_KEYS[label];
  return key ? t(key) : label;
}

const OPERATOR_DELIVERY_MODE_KEYS: Record<string, MessageKey> = {
  artifact_only: messageKeys.sharedOperatorDeliveryModeArtifactOnly,
  commit_only: messageKeys.sharedOperatorDeliveryModeCommitOnly,
  deploy_preview: messageKeys.sharedOperatorDeliveryModeDeployPreview,
  pr_with_checks: messageKeys.sharedOperatorDeliveryModePrWithChecks,
  push_branch: messageKeys.sharedOperatorDeliveryModePushBranch,
};

const OPERATOR_DELIVERY_GATE_KEYS: Record<string, MessageKey> = {
  manual_review_required: messageKeys.sharedOperatorGateManualReviewRequired,
  owner_approval_required: messageKeys.sharedOperatorGateOwnerApprovalRequired,
  publish_artifact_required: messageKeys.sharedOperatorGatePublishArtifactRequired,
};

const OPERATOR_BUDGET_LEVEL_KEYS: Record<string, MessageKey> = {
  blocked: messageKeys.sharedOperatorBudgetLevelBlocked,
  normal: messageKeys.sharedOperatorBudgetLevelNormal,
  warning: messageKeys.sharedOperatorBudgetLevelWarning,
};

const OPERATOR_WORKFLOW_SHAPE_KEYS: Record<string, MessageKey> = {
  concurrent: messageKeys.sharedOperatorWorkflowShapeConcurrent,
  converge: messageKeys.sharedOperatorWorkflowShapeConverge,
  parallel: messageKeys.sharedOperatorWorkflowShapeConcurrent,
  sequential: messageKeys.sharedOperatorWorkflowShapeSequential,
};

const OPERATOR_BRANCH_STRATEGY_KEYS: Record<string, MessageKey> = {
  fork_if_possible: messageKeys.sharedOperatorBranchStrategyForkIfPossible,
  fresh_no_parent: messageKeys.sharedOperatorBranchStrategyFreshNoParent,
  single_target_review: messageKeys.sharedOperatorBranchStrategySingleTargetReview,
  transplant_context: messageKeys.sharedOperatorBranchStrategyTransplantContext,
};

function normalizeOperatorToken(value: string): string {
  return value.trim().toLowerCase().replace(/-/gu, '_');
}

function formatUnknownOperatorToken(value: string): string {
  return value
    .trim()
    .replace(/[_-]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function formatOperatorToken(
  value: string,
  keys: Record<string, MessageKey>,
  t: OperatorTranslate,
): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }
  const key = keys[normalizeOperatorToken(trimmed)];
  return key ? t(key) : formatUnknownOperatorToken(trimmed);
}

export function operatorDeliveryModeLabel(
  mode: string,
  t: OperatorTranslate = fallbackOperatorTranslate,
): string {
  return formatOperatorToken(mode, OPERATOR_DELIVERY_MODE_KEYS, t);
}

export function operatorDeliveryGateLabel(
  gate: string,
  t: OperatorTranslate = fallbackOperatorTranslate,
): string {
  return formatOperatorToken(gate, OPERATOR_DELIVERY_GATE_KEYS, t);
}

export function operatorBudgetAlertLevelLabel(
  level: string,
  t: OperatorTranslate = fallbackOperatorTranslate,
): string {
  return formatOperatorToken(level, OPERATOR_BUDGET_LEVEL_KEYS, t);
}

export function operatorWorkflowShapeLabel(
  shape: string,
  t: OperatorTranslate = fallbackOperatorTranslate,
): string {
  return formatOperatorToken(shape, OPERATOR_WORKFLOW_SHAPE_KEYS, t);
}

export function operatorBranchStrategyLabel(
  strategy: string,
  t: OperatorTranslate = fallbackOperatorTranslate,
): string {
  return formatOperatorToken(strategy, OPERATOR_BRANCH_STRATEGY_KEYS, t);
}

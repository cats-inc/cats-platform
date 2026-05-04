import type { MessageKey } from '../shared/i18n/messageKeys.js';
import { messageKeys } from '../shared/i18n/index.js';

import type {
  CoreCheckpointRecord,
  CoreOrchestrationOutcomeRecord,
  CoreRunRecord,
  CoreTraceRecord,
} from '../core/types.js';

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

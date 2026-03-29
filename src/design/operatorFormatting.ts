import type {
  CoreCheckpointRecord,
  CoreOrchestrationOutcomeRecord,
  CoreRunRecord,
  CoreTraceRecord,
} from '../core/types.js';

export type OperatorSeverity = 'muted' | 'progress' | 'attention' | 'error' | 'success';

export function formatOperatorTimestamp(timestamp: string | null): string {
  if (!timestamp) {
    return 'No timestamp';
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

export function runStatusLabel(status: CoreRunRecord['status']): string {
  switch (status) {
    case 'running':
      return 'Running';
    case 'blocked':
      return 'Blocked';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Queued';
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

export function checkpointStatusLabel(status: CoreCheckpointRecord['status']): string {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Open';
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
): string {
  switch (status) {
    case 'succeeded':
      return 'Succeeded';
    case 'blocked':
      return 'Blocked';
    case 'failed':
      return 'Failed';
    default:
      return 'Cancelled';
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

export function traceKindLabel(kind: CoreTraceRecord['kind']): string {
  switch (kind) {
    case 'approval':
      return 'Approval';
    case 'checkpoint':
      return 'Checkpoint';
    case 'dispatch':
      return 'Dispatch';
    case 'error':
      return 'Error';
    case 'outcome':
      return 'Outcome';
    case 'status':
      return 'Status';
    default:
      return 'Note';
  }
}

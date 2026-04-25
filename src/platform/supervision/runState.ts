import type {
  CancellationReasonCode,
  RunBlocker,
  RunPrimaryState,
  SupervisionFallbackPolicy,
} from './contracts.js';

export type RunLifecycleState = 'queued' | 'active' | 'completed' | 'failed' | 'cancelled';
export type RunApprovalState = 'pending' | 'approved' | 'denied' | 'cancelled';

export interface RunApprovalRequestState {
  requestId: string;
  state: RunApprovalState;
  gating: boolean;
}

export interface RunStateEvaluationInput {
  lifecycle: RunLifecycleState;
  blockers?: RunBlocker[];
  approvalRequests?: RunApprovalRequestState[];
  terminalCause?: string;
}

export interface RunStateEvaluation {
  primaryState: RunPrimaryState;
  blockers: RunBlocker[];
  approvalRequests: RunApprovalRequestState[];
  terminalCause?: string;
}

export interface ApprovalDeniedInput {
  current: RunStateEvaluationInput;
  requestId: string;
  fallbackPolicy: SupervisionFallbackPolicy;
}

export interface OperatorCancellationInput {
  current: RunStateEvaluationInput;
  requestedAt: string;
  requestedBy: string;
  reasonCode: CancellationReasonCode;
  reasonNote?: string;
}

export interface OperatorCancellationResult extends RunStateEvaluation {
  cancelAudit: {
    requestedAt: string;
    requestedBy: string;
    reasonCode: CancellationReasonCode;
    reasonNote?: string;
  };
}

export interface RunStateMetadataSnapshot extends RunStateEvaluation {
  evaluatedAt: string;
}

export function writeRunStateMetadata(input: {
  metadata?: Record<string, unknown> | null;
  evaluation: RunStateEvaluation;
  evaluatedAt: string;
}): Record<string, unknown> {
  const metadata = asRecord(input.metadata);
  const supervision = asRecord(metadata.supervision);

  return {
    ...metadata,
    supervision: {
      ...supervision,
      runState: {
        evaluatedAt: input.evaluatedAt,
        primaryState: input.evaluation.primaryState,
        blockers: input.evaluation.blockers,
        approvalRequests: input.evaluation.approvalRequests,
        ...(input.evaluation.terminalCause === undefined
          ? {}
          : { terminalCause: input.evaluation.terminalCause }),
      } satisfies RunStateMetadataSnapshot,
    },
  };
}

export function deriveRunState(input: RunStateEvaluationInput): RunStateEvaluation {
  const blockers = input.blockers ?? [];
  const approvalRequests = input.approvalRequests ?? [];
  const terminalState = deriveTerminalState(input.lifecycle);

  if (terminalState !== undefined) {
    return {
      primaryState: terminalState,
      blockers,
      approvalRequests,
      terminalCause: input.terminalCause,
    };
  }
  if (approvalRequests.some((approval) => approval.gating && approval.state === 'pending')) {
    return {
      primaryState: 'waiting_for_approval',
      blockers,
      approvalRequests,
      terminalCause: input.terminalCause,
    };
  }
  if (blockers.length > 0) {
    return {
      primaryState: 'blocked',
      blockers,
      approvalRequests,
      terminalCause: input.terminalCause,
    };
  }

  return {
    primaryState: input.lifecycle === 'queued' ? 'queued' : 'running',
    blockers,
    approvalRequests,
    terminalCause: input.terminalCause,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function applyApprovalDenied(input: ApprovalDeniedInput): RunStateEvaluation {
  const approvalRequests = (input.current.approvalRequests ?? []).map((approval) =>
    approval.requestId === input.requestId
      ? { ...approval, state: 'denied' as const }
      : approval,
  );

  if (!canFallbackContinueWithoutDeniedAction(input.fallbackPolicy)) {
    return deriveRunState({
      ...input.current,
      lifecycle: 'failed',
      approvalRequests,
      terminalCause: `approval denied: ${input.requestId}`,
    });
  }

  return deriveRunState({
    ...input.current,
    approvalRequests,
  });
}

export function applyOperatorCancellation(
  input: OperatorCancellationInput,
): OperatorCancellationResult {
  const approvalRequests = (input.current.approvalRequests ?? []).map((approval) =>
    approval.state === 'pending'
      ? { ...approval, state: 'cancelled' as const }
      : approval,
  );
  const evaluation = deriveRunState({
    ...input.current,
    lifecycle: 'cancelled',
    approvalRequests,
    terminalCause: `cancelled: ${input.reasonCode}`,
  });

  return {
    ...evaluation,
    cancelAudit: {
      requestedAt: input.requestedAt,
      requestedBy: input.requestedBy,
      reasonCode: input.reasonCode,
      reasonNote: input.reasonNote,
    },
  };
}

export function canFallbackContinueWithoutDeniedAction(
  fallbackPolicy: SupervisionFallbackPolicy,
): boolean {
  return fallbackPolicy === 'retry' ||
    fallbackPolicy === 'escalate_model' ||
    fallbackPolicy === 'delegate_other';
}

function deriveTerminalState(lifecycle: RunLifecycleState): RunPrimaryState | undefined {
  switch (lifecycle) {
    case 'cancelled':
      return 'cancelled';
    case 'failed':
      return 'failed';
    case 'completed':
      return 'completed';
    case 'queued':
    case 'active':
      return undefined;
    default: {
      const exhaustive: never = lifecycle;
      return exhaustive;
    }
  }
}

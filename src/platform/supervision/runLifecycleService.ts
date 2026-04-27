import type {
  CancellationReasonCode,
  RunBlocker,
  RunPrimaryState,
  SupervisionFallbackPolicy,
  SupervisedToolManifest,
  CancellationEffectLanded,
  CancellationContext,
} from './contracts.js';
import {
  buildCancellationContext as buildToolCancellationContext,
} from './cancellation.js';
import {
  applyApprovalDenied,
  applyOperatorCancellation,
  deriveRunState,
  writeRunStateMetadata,
  type RunApprovalRequestState,
  type RunLifecycleState,
  type OperatorCancellationResult,
  type RunStateEvaluation,
} from './runState.js';

export interface SupervisedRunLifecycleRecord {
  runId: string;
  lifecycle: RunLifecycleState;
  blockers: RunBlocker[];
  approvalRequests: RunApprovalRequestState[];
  primaryState: RunStateEvaluation['primaryState'];
  terminalCause?: string;
  cancelAudit?: OperatorCancellationResult['cancelAudit'];
  cancellationRequest?: SupervisedRunCancellationRequest;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface CreateSupervisedRunLifecycleInput {
  runId: string;
  lifecycle?: Extract<RunLifecycleState, 'queued' | 'active'>;
  blockers?: RunBlocker[];
  approvalRequests?: RunApprovalRequestState[];
  metadata?: Record<string, unknown> | null;
}

export interface TransitionSupervisedRunLifecycleInput {
  lifecycle?: RunLifecycleState;
  blockers?: RunBlocker[];
  approvalRequests?: RunApprovalRequestState[];
  terminalCause?: string;
  metadata?: Record<string, unknown> | null;
}

export interface DenySupervisedRunApprovalInput {
  requestId: string;
  fallbackPolicy: SupervisionFallbackPolicy;
}

export interface CancelSupervisedRunInput {
  requestedBy: string;
  reasonCode: CancellationReasonCode;
  reasonNote?: string;
}

export interface SupervisedRunCancellationRequest {
  requestedAt: string;
  requestedBy: string;
  reasonCode: CancellationReasonCode;
  runStateAtRequest: Exclude<RunPrimaryState, 'completed' | 'failed' | 'cancelled'>;
  reasonNote?: string;
}

export interface TimeoutSupervisedRunInput {
  timeoutId: string;
  hardStop?: boolean;
  message?: string;
}

export interface ResumeSupervisedRunInput {
  approvalRequests?: RunApprovalRequestState[];
}

export interface RetrySupervisedRunInput {
  reason: string;
  approvalRequests?: RunApprovalRequestState[];
}

export interface BuildLifecycleCancellationContextInput {
  manifest: Pick<SupervisedToolManifest, 'cancellation'>;
  effectLanded?: CancellationEffectLanded;
}

export interface SupervisedRunLifecycleService {
  create(input: CreateSupervisedRunLifecycleInput): SupervisedRunLifecycleRecord;
  transition(
    current: SupervisedRunLifecycleRecord,
    input: TransitionSupervisedRunLifecycleInput,
  ): SupervisedRunLifecycleRecord;
  denyApproval(
    current: SupervisedRunLifecycleRecord,
    input: DenySupervisedRunApprovalInput,
  ): SupervisedRunLifecycleRecord;
  cancel(
    current: SupervisedRunLifecycleRecord,
    input: CancelSupervisedRunInput,
  ): SupervisedRunLifecycleRecord;
  timeout(
    current: SupervisedRunLifecycleRecord,
    input: TimeoutSupervisedRunInput,
  ): SupervisedRunLifecycleRecord;
  resume(
    current: SupervisedRunLifecycleRecord,
    input?: ResumeSupervisedRunInput,
  ): SupervisedRunLifecycleRecord;
  retry(
    current: SupervisedRunLifecycleRecord,
    input: RetrySupervisedRunInput,
  ): SupervisedRunLifecycleRecord;
  buildCancellationContext(
    current: SupervisedRunLifecycleRecord,
    input: BuildLifecycleCancellationContextInput,
  ): CancellationContext;
}

export function createSupervisedRunLifecycleService(options: {
  now?: () => Date;
} = {}): SupervisedRunLifecycleService {
  const now = () => (options.now?.() ?? new Date()).toISOString();

  function materialize(input: {
    runId: string;
    lifecycle: RunLifecycleState;
    blockers?: RunBlocker[];
    approvalRequests?: RunApprovalRequestState[];
    terminalCause?: string;
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, unknown> | null;
    evaluation?: RunStateEvaluation;
    cancelAudit?: OperatorCancellationResult['cancelAudit'];
    cancellationRequest?: SupervisedRunCancellationRequest;
  }): SupervisedRunLifecycleRecord {
    const blockers = input.blockers ?? [];
    const approvalRequests = input.approvalRequests ?? [];
    const evaluation = input.evaluation ?? deriveRunState({
      lifecycle: input.lifecycle,
      blockers,
      approvalRequests,
      terminalCause: input.terminalCause,
    });

    return {
      runId: input.runId,
      lifecycle: input.lifecycle,
      blockers,
      approvalRequests,
      primaryState: evaluation.primaryState,
      terminalCause: evaluation.terminalCause,
      cancelAudit: input.cancelAudit,
      cancellationRequest: input.cancellationRequest,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      metadata: writeRunStateMetadata({
        metadata: input.metadata,
        evaluation,
        evaluatedAt: input.updatedAt,
      }),
    };
  }

  return {
    create(input) {
      const timestamp = now();
      return materialize({
        runId: input.runId,
        lifecycle: input.lifecycle ?? 'queued',
        blockers: input.blockers,
        approvalRequests: input.approvalRequests,
        createdAt: timestamp,
        updatedAt: timestamp,
        metadata: input.metadata,
      });
    },
    transition(current, input) {
      return materialize({
        runId: current.runId,
        lifecycle: input.lifecycle ?? current.lifecycle,
        blockers: input.blockers ?? current.blockers,
        approvalRequests: input.approvalRequests ?? current.approvalRequests,
        terminalCause: input.terminalCause ?? current.terminalCause,
        createdAt: current.createdAt,
        updatedAt: now(),
        metadata: input.metadata ?? current.metadata,
      });
    },
    denyApproval(current, input) {
      const timestamp = now();
      const evaluation = applyApprovalDenied({
        current: {
          lifecycle: current.lifecycle,
          blockers: current.blockers,
          approvalRequests: current.approvalRequests,
          terminalCause: current.terminalCause,
        },
        requestId: input.requestId,
        fallbackPolicy: input.fallbackPolicy,
      });

      return materialize({
        runId: current.runId,
        lifecycle: evaluation.primaryState === 'failed' ? 'failed' : current.lifecycle,
        blockers: evaluation.blockers,
        approvalRequests: evaluation.approvalRequests,
        terminalCause: evaluation.terminalCause,
        createdAt: current.createdAt,
        updatedAt: timestamp,
        metadata: current.metadata,
        evaluation,
      });
    },
    cancel(current, input) {
      const timestamp = now();
      const runStateAtRequest = toCancellablePrimaryState(current.primaryState);
      if (!runStateAtRequest) {
        throw new Error(`Cannot cancel terminal run ${current.runId}.`);
      }
      const evaluation = applyOperatorCancellation({
        current: {
          lifecycle: current.lifecycle,
          blockers: current.blockers,
          approvalRequests: current.approvalRequests,
          terminalCause: current.terminalCause,
        },
        requestedAt: timestamp,
        requestedBy: input.requestedBy,
        reasonCode: input.reasonCode,
        reasonNote: input.reasonNote,
      });

      return materialize({
        runId: current.runId,
        lifecycle: 'cancelled',
        blockers: evaluation.blockers,
        approvalRequests: evaluation.approvalRequests,
        terminalCause: evaluation.terminalCause,
        createdAt: current.createdAt,
        updatedAt: timestamp,
        metadata: current.metadata,
        evaluation,
        cancelAudit: evaluation.cancelAudit,
        cancellationRequest: {
          requestedAt: timestamp,
          requestedBy: input.requestedBy,
          reasonCode: input.reasonCode,
          runStateAtRequest,
          reasonNote: input.reasonNote,
        },
      });
    },
    timeout(current, input) {
      const timestamp = now();
      if (input.hardStop === true) {
        return materialize({
          runId: current.runId,
          lifecycle: 'failed',
          blockers: current.blockers,
          approvalRequests: current.approvalRequests,
          terminalCause: `timeout: ${input.timeoutId}`,
          createdAt: current.createdAt,
          updatedAt: timestamp,
          metadata: current.metadata,
        });
      }

      return materialize({
        runId: current.runId,
        lifecycle: current.lifecycle,
        blockers: [
          ...current.blockers,
          {
            code: 'TIMEOUT',
            message: input.message ?? 'Run timed out waiting for progress.',
            details: { timeoutId: input.timeoutId },
          },
        ],
        approvalRequests: current.approvalRequests,
        createdAt: current.createdAt,
        updatedAt: timestamp,
        metadata: current.metadata,
      });
    },
    resume(current, input = {}) {
      return materialize({
        runId: current.runId,
        lifecycle: 'active',
        blockers: [],
        approvalRequests: input.approvalRequests ?? current.approvalRequests,
        createdAt: current.createdAt,
        updatedAt: now(),
        metadata: current.metadata,
      });
    },
    retry(current, input) {
      return materialize({
        runId: current.runId,
        lifecycle: 'active',
        blockers: [],
        approvalRequests: input.approvalRequests ?? current.approvalRequests,
        createdAt: current.createdAt,
        updatedAt: now(),
        metadata: writeRetryMetadata(current.metadata, input.reason),
      });
    },
    buildCancellationContext(current, input) {
      const cancellationRequest = current.cancellationRequest;
      if (!cancellationRequest) {
        throw new Error(`Run ${current.runId} has no cancellation request.`);
      }

      return buildToolCancellationContext({
        manifest: input.manifest,
        requestedAt: cancellationRequest.requestedAt,
        requestedBy: cancellationRequest.requestedBy,
        runStateAtRequest: cancellationRequest.runStateAtRequest,
        reasonCode: cancellationRequest.reasonCode,
        reasonNote: cancellationRequest.reasonNote,
        effectLanded: input.effectLanded,
      });
    },
  };
}

function toCancellablePrimaryState(
  state: RunPrimaryState,
): Exclude<RunPrimaryState, 'completed' | 'failed' | 'cancelled'> | null {
  return state === 'completed' || state === 'failed' || state === 'cancelled'
    ? null
    : state;
}

function writeRetryMetadata(
  metadata: Record<string, unknown>,
  reason: string,
): Record<string, unknown> {
  const supervision = metadata.supervision &&
    typeof metadata.supervision === 'object' &&
    !Array.isArray(metadata.supervision)
    ? metadata.supervision as Record<string, unknown>
    : {};

  return {
    ...metadata,
    supervision: {
      ...supervision,
      lifecycleRetry: {
        reason,
      },
    },
  };
}

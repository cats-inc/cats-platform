import type {
  RunBlocker,
} from './contracts.js';
import {
  deriveRunState,
  writeRunStateMetadata,
  type RunApprovalRequestState,
  type RunLifecycleState,
  type RunStateEvaluation,
} from './runState.js';

export interface SupervisedRunLifecycleRecord {
  runId: string;
  lifecycle: RunLifecycleState;
  blockers: RunBlocker[];
  approvalRequests: RunApprovalRequestState[];
  primaryState: RunStateEvaluation['primaryState'];
  terminalCause?: string;
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

export interface SupervisedRunLifecycleService {
  create(input: CreateSupervisedRunLifecycleInput): SupervisedRunLifecycleRecord;
  transition(
    current: SupervisedRunLifecycleRecord,
    input: TransitionSupervisedRunLifecycleInput,
  ): SupervisedRunLifecycleRecord;
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
  }): SupervisedRunLifecycleRecord {
    const blockers = input.blockers ?? [];
    const approvalRequests = input.approvalRequests ?? [];
    const evaluation = deriveRunState({
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
  };
}

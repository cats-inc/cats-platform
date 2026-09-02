/**
 * Golden-path stage projection (ADR-112 section 2, SPEC-114 FR-49).
 *
 * This is a pure derivation from authoritative Cats Core records plus transport
 * receipts. It holds no state of its own, which is what keeps it from becoming
 * the second state machine ADR-112 forbids: every call recomputes the stage
 * from scratch, so it cannot drift away from Core.
 */

import type {
  CoreApprovalStatus,
  CoreArtifactRecord,
  CoreDeliveryGate,
  CoreDeliveryMode,
  CoreOrchestrationOutcomeRecord,
  CoreRunRecord,
  CoreTaskRecord,
  CoreWorkItemRecord,
} from '../../../core/types.js';
import type {
  TransportWorkAction,
  TransportWorkProposalV1,
  TransportWorkStage,
} from './contracts.js';
import type { TransportWorkDeliveryV1 } from './contracts.js';

export interface TransportWorkStageInput {
  workItem: CoreWorkItemRecord;
  proposal: TransportWorkProposalV1 | null;
  task: CoreTaskRecord | null;
  run: CoreRunRecord | null;
  outcome: CoreOrchestrationOutcomeRecord | null;
  artifacts: readonly CoreArtifactRecord[];
  /** Commit evidence for `commit_only`; null when the mode does not need it. */
  commitId: string | null;
  /** Gates that still require an owner decision before publication. */
  outstandingGates: readonly CoreDeliveryGate[];
  deliveryRows: readonly TransportWorkDeliveryV1[];
  /** True when the supervised run is waiting on an owner decision. */
  awaitingOwnerDecision: boolean;
}

export interface TransportWorkStageProjection {
  stage: TransportWorkStage;
  /** Why the stage is what it is; surfaced in Desktop and diagnostics. */
  rationale: string;
  allowedActions: TransportWorkAction[];
  deliveryMode: CoreDeliveryMode | null;
  outstandingGates: CoreDeliveryGate[];
}

function hasSentResult(rows: readonly TransportWorkDeliveryV1[]): boolean {
  return rows.some((row) =>
    row.state === 'sent'
    && (row.purpose === 'result' || row.purpose === 'publish_result'),
  );
}

function hasAcceptedResultEvidence(input: TransportWorkStageInput): boolean {
  if (input.outcome === null || input.outcome.status !== 'succeeded') {
    return false;
  }
  if (input.proposal?.deliveryMode === 'commit_only') {
    return input.commitId !== null;
  }
  return input.artifacts.some((artifact) =>
    artifact.status === 'ready' || artifact.status === 'published',
  );
}

function isOwnerApproved(status: CoreApprovalStatus | undefined): boolean {
  return status === 'approved';
}

/**
 * Derives the owner-visible stage.
 *
 * Order matters: terminal states win over progress states, and a persisted
 * delivery receipt wins over everything, because `delivered` is defined by the
 * receipt rather than by the Run (ADR-112 section 6).
 */
export function projectTransportWorkStage(
  input: TransportWorkStageInput,
): TransportWorkStageProjection {
  const deliveryMode = input.proposal?.deliveryMode ?? null;
  const outstandingGates = [...input.outstandingGates];

  const base = {
    deliveryMode,
    outstandingGates,
  };

  if (hasSentResult(input.deliveryRows)) {
    return {
      ...base,
      stage: 'delivered',
      rationale: 'A result message reached the source binding and its receipt is persisted.',
      allowedActions: ['view'],
    };
  }

  if (input.run?.status === 'cancelled' || input.task?.status === 'cancelled') {
    return {
      ...base,
      stage: 'cancelled',
      rationale: 'The authoritative Task or Run is cancelled.',
      allowedActions: ['view'],
    };
  }

  if (input.run?.status === 'failed' || input.outcome?.status === 'failed') {
    return {
      ...base,
      stage: 'failed',
      rationale: 'The authoritative Run or Outcome recorded a terminal failure.',
      allowedActions: ['retry', 'cancel', 'view'],
    };
  }

  if (hasAcceptedResultEvidence(input)) {
    if (outstandingGates.length === 0) {
      return {
        ...base,
        stage: 'publish_authorized',
        rationale: 'Result evidence is accepted and no delivery gate remains outstanding.',
        allowedActions: ['view'],
      };
    }
    return {
      ...base,
      stage: 'result_ready',
      rationale: 'Result evidence is accepted but a delivery gate still requires an owner decision.',
      allowedActions: ['publish', 'deny', 'adjust', 'cancel', 'view'],
    };
  }

  if (input.awaitingOwnerDecision || input.run?.status === 'blocked') {
    return {
      ...base,
      stage: 'decision_needed',
      rationale: 'The supervised Run is blocked on an owner decision.',
      allowedActions: ['approve', 'deny', 'retry', 'cancel', 'view'],
    };
  }

  if (input.run?.status === 'running') {
    return {
      ...base,
      stage: 'running',
      rationale: 'The supervised Run is active.',
      // `resume` is offered because a Run can be `running` with nothing driving
      // it — the usual cause being a host restart mid-flight.
      allowedActions: ['resume', 'cancel', 'view'],
    };
  }

  if (input.run?.status === 'queued') {
    return {
      ...base,
      stage: 'admitted',
      rationale: 'An approved Task and a queued supervised Run exist.',
      allowedActions: ['cancel', 'view'],
    };
  }

  // No Run yet. An approved Task means the owner authorized this revision and
  // admission is mid-flight or was interrupted; that is deliberately distinct
  // from `admitted`, which requires the Run to exist.
  if (input.task !== null && isOwnerApproved(input.task.approval.status)) {
    return {
      ...base,
      stage: 'execution_authorized',
      rationale: 'The owner approved this proposal revision; the supervised Run is not queued yet.',
      allowedActions: ['view'],
    };
  }

  if (input.proposal !== null) {
    return {
      ...base,
      stage: 'scope_proposed',
      rationale: 'A versioned scope proposal is visible and awaiting owner authorization.',
      allowedActions: ['start_work', 'adjust', 'cancel', 'view'],
    };
  }

  return {
    ...base,
    stage: 'received',
    rationale: 'The source update was accepted and a durable intake anchor exists.',
    allowedActions: ['cancel', 'view'],
  };
}

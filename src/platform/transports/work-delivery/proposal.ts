/**
 * Versioned scope proposals (SPEC-114 FR-15..FR-19).
 *
 * The digest is the load-bearing part. An owner confirms a specific block of
 * text; binding the authorization to a hash of exactly the execution-relevant
 * fields is what makes "Start work" mean "run *that*" rather than "run whatever
 * the work item says now".
 */

import { createHash } from 'node:crypto';

import type { CoreDeliveryGate, CoreDeliveryMode } from '../../../core/types.js';
import type { TransportWorkProposalV1 } from './contracts.js';

export interface BuildTransportWorkProposalInput {
  revision: number;
  goal: string;
  targetLabel: string;
  projectId: string | null;
  workspacePath: string | null;
  acceptanceCriteria: readonly string[];
  deliveryMode: CoreDeliveryMode;
  deliveryGates: readonly CoreDeliveryGate[];
  sideEffects: readonly string[];
  openQuestion: string | null;
  createdAt: Date;
}

/**
 * Fields that change what actually executes.
 *
 * `createdAt` and `openQuestion` are excluded on purpose: re-rendering the same
 * scope at a later time, or resolving a question without changing the plan,
 * must not invalidate a confirmation the owner already saw.
 */
function buildDigestSource(input: BuildTransportWorkProposalInput): string {
  return JSON.stringify([
    input.goal.trim(),
    input.targetLabel.trim(),
    input.projectId,
    input.workspacePath,
    [...input.acceptanceCriteria].map((criterion) => criterion.trim()),
    input.deliveryMode,
    [...input.deliveryGates].sort(),
    [...input.sideEffects].map((effect) => effect.trim()).sort(),
  ]);
}

export function buildTransportWorkProposalDigest(
  input: BuildTransportWorkProposalInput,
): string {
  return createHash('sha256')
    .update(buildDigestSource(input))
    .digest('hex')
    .slice(0, 32);
}

export function buildTransportWorkProposal(
  input: BuildTransportWorkProposalInput,
): TransportWorkProposalV1 {
  return {
    version: 1,
    revision: input.revision,
    digest: buildTransportWorkProposalDigest(input),
    goal: input.goal.trim(),
    targetLabel: input.targetLabel.trim(),
    projectId: input.projectId,
    workspacePath: input.workspacePath,
    acceptanceCriteria: [...input.acceptanceCriteria].map((criterion) => criterion.trim()),
    deliveryMode: input.deliveryMode,
    deliveryGates: [...input.deliveryGates],
    sideEffects: [...input.sideEffects],
    openQuestion: input.openQuestion,
    createdAt: input.createdAt.toISOString(),
  };
}

/**
 * True when a new proposal changes what would execute, which is the trigger for
 * bumping the revision and invalidating outstanding action tokens (FR-17).
 */
export function isTransportWorkProposalMateriallyChanged(
  previous: TransportWorkProposalV1 | null,
  next: TransportWorkProposalV1,
): boolean {
  return previous === null || previous.digest !== next.digest;
}

/**
 * Completion-evidence evaluation (SPEC-114 FR-30, FR-31).
 *
 * The rule this module exists to enforce: a provider returning a final
 * assistant message is evidence that an execution *step* returned, not that the
 * requested outcome happened. Cats accepts terminal completion only against the
 * approved acceptance criteria plus mode-appropriate delivery evidence.
 */

import type { CoreArtifactRecord, CoreDeliveryMode } from '../../../core/types.js';

export const WORK_COMPLETION_EVIDENCE_GAPS = [
  'no_outcome_recorded',
  'outcome_not_successful',
  'no_ready_artifact',
  'no_commit_evidence',
  'no_validation_evidence',
  'acceptance_criteria_unmet',
] as const;

export type WorkCompletionEvidenceGap = (typeof WORK_COMPLETION_EVIDENCE_GAPS)[number];

export interface WorkCommitEvidence {
  /** Immutable commit id. A branch name or "HEAD" is not acceptable. */
  commitId: string;
  changeSummary: string;
  /** Validation the run performed (test command, typecheck, lint). */
  validation: { command: string; passed: boolean } | null;
}

export interface WorkCompletionEvidenceInput {
  deliveryMode: CoreDeliveryMode;
  acceptanceCriteria: readonly string[];
  /** Criteria the supervised run reported as satisfied, by exact text. */
  satisfiedCriteria: readonly string[];
  outcomeStatus: 'succeeded' | 'blocked' | 'failed' | 'cancelled' | null;
  artifacts: readonly CoreArtifactRecord[];
  commit: WorkCommitEvidence | null;
}

export interface WorkCompletionEvidenceResult {
  accepted: boolean;
  gaps: WorkCompletionEvidenceGap[];
  /** Criteria still outstanding, for the decision/result message. */
  unmetCriteria: string[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * A commit id must look like a real object id. This is what stops a run from
 * "delivering" `commit_only` by reporting a branch name it never wrote.
 */
function isImmutableCommitId(commitId: string): boolean {
  return /^[0-9a-f]{7,40}$/u.test(commitId.trim());
}

export function evaluateWorkCompletionEvidence(
  input: WorkCompletionEvidenceInput,
): WorkCompletionEvidenceResult {
  const gaps: WorkCompletionEvidenceGap[] = [];

  if (input.outcomeStatus === null) {
    gaps.push('no_outcome_recorded');
  } else if (input.outcomeStatus !== 'succeeded') {
    gaps.push('outcome_not_successful');
  }

  const satisfied = new Set(input.satisfiedCriteria.map(normalize));
  const unmetCriteria = input.acceptanceCriteria.filter(
    (criterion) => !satisfied.has(normalize(criterion)),
  );
  if (unmetCriteria.length > 0) {
    gaps.push('acceptance_criteria_unmet');
  }

  if (input.deliveryMode === 'commit_only') {
    if (input.commit === null || !isImmutableCommitId(input.commit.commitId)) {
      gaps.push('no_commit_evidence');
    } else if (input.commit.validation === null || !input.commit.validation.passed) {
      gaps.push('no_validation_evidence');
    }
  } else {
    const hasReadyArtifact = input.artifacts.some(
      (artifact) => artifact.status === 'ready' || artifact.status === 'published',
    );
    if (!hasReadyArtifact) {
      gaps.push('no_ready_artifact');
    }
  }

  return { accepted: gaps.length === 0, gaps, unmetCriteria };
}

/**
 * Publish-gate resolution for the golden path (SPEC-114 FR-40..FR-41).
 *
 * Execution authorization and publication authorization are separate risk
 * boundaries (ADR-112 section 3). Confirming "Start work" says the owner
 * accepted the scope; it never says they accepted a side effect that only
 * became visible while the work ran.
 */

import type { CoreDeliveryGate, CoreDeliveryMode } from '../../../core/types.js';

/**
 * Modes whose external side effects always need a separate result-preview
 * authorization in the first slice, whatever the configured gates say.
 */
const HIGH_SIDE_EFFECT_MODES: ReadonlySet<CoreDeliveryMode> = new Set([
  'push_branch',
  'pr_with_checks',
  'deploy_preview',
]);

export interface ResolveOutstandingDeliveryGatesInput {
  deliveryMode: CoreDeliveryMode;
  /** Gates from the effective Core delivery policy. */
  effectiveGates: readonly CoreDeliveryGate[];
  /** Gates an owner has already decided for this exact proposal revision. */
  satisfiedGates: readonly CoreDeliveryGate[];
  /** True when the result would publish an Artifact beyond the local host. */
  publishesPublicArtifact: boolean;
}

/**
 * Returns the gates that still block publication.
 *
 * An empty result means the golden path may proceed to delivery; it does not
 * mean governance was skipped, only that every applicable gate is satisfied.
 */
export function resolveOutstandingDeliveryGates(
  input: ResolveOutstandingDeliveryGatesInput,
): CoreDeliveryGate[] {
  const required = new Set<CoreDeliveryGate>(input.effectiveGates);

  if (HIGH_SIDE_EFFECT_MODES.has(input.deliveryMode)) {
    required.add('owner_approval_required');
  }
  if (input.publishesPublicArtifact) {
    required.add('publish_artifact_required');
  }

  for (const satisfied of input.satisfiedGates) {
    required.delete(satisfied);
  }

  return [...required];
}

/**
 * True when the mode may deliver without a second owner event, given no
 * outstanding gates. `artifact_only` and `commit_only` are local-only, which is
 * exactly why they are the two proof modes for the first slice.
 */
export function isFirstSliceDeliveryMode(mode: CoreDeliveryMode): boolean {
  return mode === 'artifact_only' || mode === 'commit_only';
}

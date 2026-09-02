/**
 * Shared delegation-readiness evaluator (SPEC-114 FR-1..FR-5, PLAN-105 Phase 1).
 *
 * Telegram and Desktop must answer "can this binding accept work right now?"
 * with the same reason codes. Duplicating the rules in a transport handler and
 * again in a settings page is how a bot ends up claiming work is queued while
 * Desktop shows a missing provider, so both call this.
 */

import type { CoreDeliveryGate, CoreDeliveryMode } from '../../../core/types.js';
import type {
  TransportWorkPermissionEnvelope,
  TransportWorkPermissionReason,
} from './permissionEnvelope.js';
import type {
  TransportWorkReadiness,
  TransportWorkReadinessBlocker,
  TransportWorkReadinessReason,
} from './contracts.js';

/**
 * Facts the evaluator needs. Every field is a resolved observation rather than
 * a service handle, so the evaluator stays pure and both callers can assemble
 * it from whatever they already hold.
 */
export interface TransportWorkReadinessInput {
  bindingEnabled: boolean;
  /** Polling or webhook ingress is currently healthy. */
  bindingHealthy: boolean;
  /** The external user is the authorized owner for this binding. */
  ownerAuthorized: boolean;
  boundCatId: string | null;
  /** Resolved provider/model execution target for the bound Cat. */
  executionTargetId: string | null;
  /** A provider capability profile has been resolved (not merely defaulted). */
  capabilityProfileResolved: boolean;
  /** Absolute workspace/project root the work would run against. */
  workspacePath: string | null;
  /**
   * The resolved permission envelope, not a summary of it. Its reasons become
   * blockers directly so Desktop can say *which* prerequisite is missing
   * instead of "permissions".
   */
  permission: TransportWorkPermissionEnvelope;
  deliveryMode: CoreDeliveryMode | null;
  deliveryGates: readonly CoreDeliveryGate[] | null;
  /**
   * Desktop background service is running. A local-first binding cannot honour
   * work while the host is asleep, and FR-5 forbids implying otherwise.
   */
  backgroundServiceAvailable: boolean;
}

/**
 * Remediation copy is referenced by key, never inlined: FR-3 requires localized
 * remediation, and a raw English string here would bypass product i18n.
 */
const REMEDIATION: Record<
  TransportWorkReadinessReason,
  { remediationKey: string; remediationPath: string | null }
> = {
  binding_disabled: {
    remediationKey: 'workDelivery.readiness.bindingDisabled',
    remediationPath: '/settings/chat',
  },
  binding_unhealthy: {
    remediationKey: 'workDelivery.readiness.bindingUnhealthy',
    remediationPath: '/settings/chat',
  },
  owner_not_authorized: {
    remediationKey: 'workDelivery.readiness.ownerNotAuthorized',
    remediationPath: '/settings/work',
  },
  cat_not_bound: {
    remediationKey: 'workDelivery.readiness.catNotBound',
    remediationPath: '/settings/chat',
  },
  execution_target_missing: {
    remediationKey: 'workDelivery.readiness.executionTargetMissing',
    remediationPath: '/settings/assistants',
  },
  capability_profile_missing: {
    remediationKey: 'workDelivery.readiness.capabilityProfileMissing',
    remediationPath: '/settings/assistants',
  },
  workspace_missing: {
    remediationKey: 'workDelivery.readiness.workspaceMissing',
    remediationPath: '/settings/work',
  },
  workspace_unreachable: {
    remediationKey: 'workDelivery.readiness.workspaceUnreachable',
    remediationPath: '/settings/work',
  },
  workspace_not_a_repository: {
    remediationKey: 'workDelivery.readiness.workspaceNotARepository',
    remediationPath: '/settings/work',
  },
  workspace_not_clean: {
    remediationKey: 'workDelivery.readiness.workspaceNotClean',
    remediationPath: '/workspaces',
  },
  delivery_policy_unresolved: {
    remediationKey: 'workDelivery.readiness.deliveryPolicyUnresolved',
    remediationPath: '/settings/work',
  },
  background_service_unavailable: {
    remediationKey: 'workDelivery.readiness.backgroundServiceUnavailable',
    remediationPath: '/settings/desktop',
  },
};

/**
 * Permission reasons are readiness blockers in their own right. Collapsing them
 * into one "permissions" code is what made the old surface unactionable.
 */
const PERMISSION_BLOCKERS: Record<
  TransportWorkPermissionReason,
  TransportWorkReadinessReason
> = {
  workspace_not_configured: 'workspace_missing',
  workspace_unreachable: 'workspace_unreachable',
  workspace_not_a_repository: 'workspace_not_a_repository',
  workspace_not_clean: 'workspace_not_clean',
};

function blocker(reason: TransportWorkReadinessReason): TransportWorkReadinessBlocker {
  return { reason, ...REMEDIATION[reason] };
}

/**
 * Evaluates every prerequisite and reports *all* blockers rather than the first.
 *
 * Reporting one at a time turns setup into a guessing game where each fix
 * reveals the next missing piece.
 */
export function evaluateTransportWorkReadiness(
  input: TransportWorkReadinessInput,
): TransportWorkReadiness {
  const blockers: TransportWorkReadinessBlocker[] = [];

  if (!input.bindingEnabled) {
    blockers.push(blocker('binding_disabled'));
  } else if (!input.bindingHealthy) {
    // Only meaningful for an enabled binding; a disabled one is not "unhealthy".
    blockers.push(blocker('binding_unhealthy'));
  }
  if (!input.ownerAuthorized) {
    blockers.push(blocker('owner_not_authorized'));
  }
  if (input.boundCatId === null) {
    blockers.push(blocker('cat_not_bound'));
  }
  if (input.executionTargetId === null) {
    blockers.push(blocker('execution_target_missing'));
  }
  if (!input.capabilityProfileResolved) {
    blockers.push(blocker('capability_profile_missing'));
  }
  for (const reason of input.permission.reasons) {
    blockers.push(blocker(PERMISSION_BLOCKERS[reason]));
  }
  if (input.deliveryMode === null || input.deliveryGates === null) {
    blockers.push(blocker('delivery_policy_unresolved'));
  }
  if (!input.backgroundServiceAvailable) {
    blockers.push(blocker('background_service_unavailable'));
  }

  return { ready: blockers.length === 0, blockers };
}

/**
 * Default delivery mode for a target (PLAN-105 Phase 0 open question, resolved
 * by owner direction): a repo workspace commits, anything else produces an
 * artifact. The proposal must still show the resolved mode before confirmation,
 * so this is a default and never a silent decision.
 */
export function resolveDefaultDeliveryMode(input: {
  workspacePath: string | null;
  isRepo: boolean;
}): CoreDeliveryMode {
  return input.workspacePath !== null && input.isRepo ? 'commit_only' : 'artifact_only';
}

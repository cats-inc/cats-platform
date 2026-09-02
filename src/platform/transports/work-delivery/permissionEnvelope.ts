/**
 * The permission envelope a transport-originated run executes under
 * (SPEC-114 FR-4, PLAN-105 Phase 1 / gate G1).
 *
 * This replaces the placeholder that treated "a workspace path is configured"
 * as the whole permission model. Two things were wrong with it, and the second
 * one mattered more than the first:
 *
 *  1. The configured path was never checked against reality. An operator could
 *     name a directory that does not exist, or claim a plain folder is a repo,
 *     and the run only discovered it deep inside a provider turn.
 *
 *  2. It granted `broad_write`, which classifies as externally-visible,
 *     destructive, and expensive tools. That silently contradicted the design's
 *     own rule that execution authorization must not clear a publish gate: the
 *     provider could have pushed or deployed through its own tools while Cats
 *     still believed publication was waiting on an owner approval.
 *
 * So the envelope here is capped at `narrow_write` — local workspace state — for
 * every delivery mode. External effects (push, pull request, preview deploy)
 * never travel on provider tools; they run through the gated delivery API after
 * an approval, carrying that approval's id. A mode with bigger side effects
 * needs a *gate*, not a wider grant.
 */

import type { CoreDeliveryMode } from '../../../core/types.js';
import type { SupervisionToolScope } from '../../supervision/contracts.js';

/** What the runtime actually observed about the configured workspace. */
export interface TransportWorkWorkspaceCapability {
  /** The runtime could inspect the path at all. */
  reachable: boolean;
  /** The path is a git repository. */
  repository: boolean;
}

export const TRANSPORT_WORK_PERMISSION_REASONS = [
  'workspace_not_configured',
  'workspace_unreachable',
  'workspace_not_a_repository',
] as const;

export type TransportWorkPermissionReason =
  (typeof TRANSPORT_WORK_PERMISSION_REASONS)[number];

export interface TransportWorkPermissionEnvelope {
  /** Granted to the supervision boundary. Never wider than `narrow_write`. */
  toolScope: SupervisionToolScope;
  sufficient: boolean;
  reasons: TransportWorkPermissionReason[];
}

export interface TransportWorkPermissionEnvelopeInput {
  workspacePath: string | null;
  /**
   * The runtime's observation, or `null` when it could not be obtained — an
   * unreachable runtime is reported as an unusable workspace rather than
   * optimistically assumed usable.
   */
  workspace: TransportWorkWorkspaceCapability | null;
  deliveryMode: CoreDeliveryMode | null;
}

/**
 * Delivery modes whose evidence is a commit, and which therefore cannot run
 * against a directory that is not a repository.
 */
const REPO_BACKED_MODES: ReadonlySet<CoreDeliveryMode> = new Set([
  'commit_only',
  'pr_with_checks',
  'deploy_preview',
]);

export function resolveTransportWorkPermissionEnvelope(
  input: TransportWorkPermissionEnvelopeInput,
): TransportWorkPermissionEnvelope {
  if (input.workspacePath === null) {
    return { toolScope: 'none', sufficient: false, reasons: ['workspace_not_configured'] };
  }
  if (input.workspace === null || !input.workspace.reachable) {
    // A path we cannot inspect is a path we must not hand write tools for.
    return { toolScope: 'none', sufficient: false, reasons: ['workspace_unreachable'] };
  }
  if (input.deliveryMode !== null
    && REPO_BACKED_MODES.has(input.deliveryMode)
    && !input.workspace.repository) {
    // Readable, so the run could still be inspected, but it can never produce
    // the commit this mode's completion evidence requires.
    return {
      toolScope: 'read_only',
      sufficient: false,
      reasons: ['workspace_not_a_repository'],
    };
  }
  return { toolScope: 'narrow_write', sufficient: true, reasons: [] };
}

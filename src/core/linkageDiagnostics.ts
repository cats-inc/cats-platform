// Aggregate canonical linkage diagnostics across the entire core state.
//
// Existing per-record helpers (`validateMissionLinkage`,
// `validateRunLinkage`, `resolveTransportBindingDirectLane`) cover one
// record at a time. Audit tools, replay verifiers, and operator
// inspection panels often need the platform-wide picture: "what is
// currently broken across the canonical record set?"
//
// Scope discipline: this report flags **canonical record breakage**
// only — references that point to records the rest of the core does
// not contain. Operator-intentional states (a transport binding that
// is `disabled` or `archived`) are NOT broken; they should not show
// up here. Bindings whose `direction` is not `inbound` also do not
// participate in direct-lane ingress, so failing the direct-lane
// resolver against them would only produce noise.
//
// Direct-lane *ingress readiness* (which is a separate concern — it
// asks "can this transport binding accept inbound messages right now?"
// and includes operator-state diagnostics) lives in
// `transportBindingDirectLane.ts` via `resolveTransportBindingDirectLane`.
// Callers that need the broader view should compose both.

import {
  findOrphanedMissionLinkages,
  findOrphanedRunLinkages,
  type MissionLinkageDiagnostic,
  type RunLinkageDiagnostic,
} from './missionLinkageValidation.js';
import {
  resolveTransportBindingDirectLane,
  type TransportDirectLaneStatus,
} from './transportBindingDirectLane.js';
import type {
  CatsCoreState,
  TransportBindingRecord,
} from './types.js';

/** Transport-binding statuses that this canonical report treats as
 *  "broken anchor" rather than "intentional operator state". */
export type TransportBindingBrokenStatus =
  | 'no_conversation_linked'
  | 'conversation_not_direct_lane';

export interface TransportBindingDiagnostic {
  transportBindingId: string;
  status: TransportBindingBrokenStatus;
  reason: string | null;
}

export interface CoreLinkageDiagnosticsSummary {
  missionDiagnosticCount: number;
  runDiagnosticCount: number;
  transportBindingDiagnosticCount: number;
  totalDiagnosticCount: number;
}

export interface CoreLinkageDiagnosticsReport {
  summary: CoreLinkageDiagnosticsSummary;
  missions: MissionLinkageDiagnostic[];
  runs: RunLinkageDiagnostic[];
  transportBindings: TransportBindingDiagnostic[];
}

const BROKEN_DIRECT_LANE_STATUSES: ReadonlySet<TransportDirectLaneStatus> = new Set([
  'no_conversation_linked',
  'conversation_not_direct_lane',
]);

function isDirectLaneProjectionBinding(binding: TransportBindingRecord): boolean {
  // `createDirectLaneTransportBindings` in
  // `src/products/chat/state/core-projection/entities.ts` stamps
  // `metadata.channelKind: 'direct_message'` on every binding it
  // produces. Bot bindings (`createBotTransportBindings`) write
  // `metadata.bindingId` / `botName` / `inboundMode` but no
  // `channelKind`, so this signal cleanly separates the two without
  // depending on direction (both writers use `bidirectional`).
  return binding.metadata.channelKind === 'direct_message';
}

function shouldRunDirectLaneCheckOn(binding: TransportBindingRecord): boolean {
  // Operator-intentional states do not represent canonical record
  // breakage and should not appear in this aggregate report.
  if (binding.status !== 'active') {
    return false;
  }
  // The direct-lane resolver was designed for direct-lane projections
  // specifically (they stamp `metadata.channelKind = "direct_message"`
  // — see `createDirectLaneTransportBindings`). Other inbound shapes
  // (telegram bot bindings, future external transports targeting
  // group / external-transport conversations) will resolve into
  // `conversation_not_direct_lane` and surface as false-positive
  // canonical breakage. New inbound transports that want their own
  // ingress-readiness diagnostics should ship transport-specific
  // helpers rather than reusing the direct-lane resolver here.
  return isDirectLaneProjectionBinding(binding);
}

function summarizeTransportBindingDirectLane(
  binding: TransportBindingRecord,
  core: CatsCoreState,
): TransportBindingDiagnostic | null {
  if (!shouldRunDirectLaneCheckOn(binding)) {
    return null;
  }
  const resolution = resolveTransportBindingDirectLane(core, binding.id);
  if (!BROKEN_DIRECT_LANE_STATUSES.has(resolution.status)) {
    return null;
  }
  return {
    transportBindingId: binding.id,
    status: resolution.status as TransportBindingBrokenStatus,
    reason: resolution.reason,
  };
}

export function buildCoreLinkageDiagnostics(
  core: CatsCoreState,
): CoreLinkageDiagnosticsReport {
  const missions = findOrphanedMissionLinkages(core);
  const runs = findOrphanedRunLinkages(core);

  const transportBindings: TransportBindingDiagnostic[] = [];
  for (const binding of core.transportBindings) {
    const diagnostic = summarizeTransportBindingDirectLane(binding, core);
    if (diagnostic !== null) {
      transportBindings.push(diagnostic);
    }
  }

  const summary: CoreLinkageDiagnosticsSummary = {
    missionDiagnosticCount: missions.length,
    runDiagnosticCount: runs.length,
    transportBindingDiagnosticCount: transportBindings.length,
    totalDiagnosticCount: missions.length + runs.length + transportBindings.length,
  };

  return { summary, missions, runs, transportBindings };
}

export function isCoreLinkageHealthy(report: CoreLinkageDiagnosticsReport): boolean {
  return report.summary.totalDiagnosticCount === 0;
}

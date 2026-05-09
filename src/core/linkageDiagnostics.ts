// Aggregate linkage diagnostics across the entire core state.
//
// Existing per-record helpers (`validateMissionLinkage`,
// `validateRunLinkage`, `resolveTransportBindingDirectLane`) cover one
// record at a time. Audit tools, replay verifiers, and operator
// inspection panels often need the platform-wide picture: "what is
// currently broken across the canonical record set?"
//
// `buildCoreLinkageDiagnostics` walks every mission, run, and
// transport binding once and produces one structured report grouped by
// record family. Each section preserves the original diagnostic shape
// so consumers do not lose detail; the report adds a top-level
// summary for quick triage.

import {
  findOrphanedMissionLinkages,
  findOrphanedRunLinkages,
  type MissionLinkageDiagnostic,
  type RunLinkageDiagnostic,
} from './missionLinkageValidation.js';
import {
  resolveTransportBindingDirectLane,
  type TransportDirectLaneResolution,
  type TransportDirectLaneStatus,
} from './transportBindingDirectLane.js';
import type { CatsCoreState } from './types.js';

export interface TransportBindingDiagnostic {
  transportBindingId: string;
  status: TransportDirectLaneStatus;
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

const TRANSPORT_BINDING_HEALTHY_STATUSES: ReadonlySet<TransportDirectLaneStatus> = new Set([
  'resolved',
]);

function summarizeTransportBindingResolution(
  resolution: TransportDirectLaneResolution,
): TransportBindingDiagnostic | null {
  if (TRANSPORT_BINDING_HEALTHY_STATUSES.has(resolution.status)) {
    return null;
  }
  if (!resolution.binding) {
    return null;
  }
  return {
    transportBindingId: resolution.binding.id,
    status: resolution.status,
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
    const resolution = resolveTransportBindingDirectLane(core, binding.id);
    const diagnostic = summarizeTransportBindingResolution(resolution);
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

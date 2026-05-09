// One-stop "show me everything about this mission" helper that joins the
// scattered mission helpers (linkage validation, visibility, provenance,
// promotion, lineage, runs) into a single read-only inspection result.
//
// Useful for debugging, audit tooling, replay verification, and any UI
// or projection that needs a coherent snapshot of mission state without
// composing six separate helper calls.

import {
  validateMissionLinkage,
  type MissionLinkageDiagnostic,
} from './missionLinkageValidation.js';
import {
  buildMissionProvenance,
  findMissionLineage,
  type MissionLineageResult,
  type MissionProvenanceSummary,
} from './missionProvenance.js';
import { resolveRunsForMission } from './missionRunResolution.js';
import { isActiveRun, isTerminalRun } from './missionStatus.js';
import {
  classifyMissionVisibility,
  suggestMissionPromotion,
  type MissionPromotionDecision,
  type MissionVisibility,
} from './missionVisibility.js';
import type {
  CatsCoreState,
  CoreRunRecord,
  CoreWorkItemRecord,
  MissionId,
  MissionRecord,
} from './types.js';

export interface MissionInspectionResult {
  mission: MissionRecord;
  visibility: MissionVisibility;
  provenance: MissionProvenanceSummary;
  linkageDiagnostics: MissionLinkageDiagnostic[];
  managedWork: CoreWorkItemRecord | null;
  runs: CoreRunRecord[];
  activeRuns: CoreRunRecord[];
  terminalRuns: CoreRunRecord[];
  promotion: MissionPromotionDecision;
  lineage: MissionLineageResult;
}

export function inspectMission(
  core: CatsCoreState,
  missionId: MissionId,
): MissionInspectionResult | null {
  const mission = core.missions.find((candidate) => candidate.id === missionId) ?? null;
  if (mission === null) {
    return null;
  }
  const managedWork = mission.managedWorkId
    ? core.workItems.find((candidate) => candidate.id === mission.managedWorkId) ?? null
    : null;
  const runs = resolveRunsForMission(core.runs, mission);
  const activeRuns = runs.filter(isActiveRun);
  const terminalRuns = runs.filter(isTerminalRun);

  return {
    mission,
    visibility: classifyMissionVisibility(mission),
    provenance: buildMissionProvenance(mission),
    linkageDiagnostics: validateMissionLinkage(core, mission),
    managedWork,
    runs,
    activeRuns,
    terminalRuns,
    promotion: suggestMissionPromotion(mission),
    lineage: findMissionLineage(core, missionId),
  };
}

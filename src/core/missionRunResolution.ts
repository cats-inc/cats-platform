// Shared mission <-> run resolution helper.
//
// Two directions are both legal anchor patterns in this rollout:
//
//   - `mission.metadata.runId === run.id` (mission claims a run)
//   - `run.metadata.missionId === mission.id` (run claims a mission)
//
// Earlier projections only used the first direction, so a run that
// only points back via `run.metadata.missionId` would be invisible to
// `hasRun` / `runIds` filters and to `linkedRun`. This helper returns
// every matching run, deduplicated, with the mission-claimed run first
// so legacy callers that adopt `runs[0]` keep their existing
// "primary run" semantics.

import type { CoreRunRecord, MissionRecord } from './types.js';

export function readMissionMetadataRunId(mission: MissionRecord): string | null {
  const value = mission.metadata.runId;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function readRunMetadataMissionId(run: CoreRunRecord): string | null {
  const value = run.metadata.missionId;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Returns every run anchored on the given mission via either anchor
 * direction, deduplicated. The mission-claimed run (if any) appears
 * first so callers that pick `runs[0]` get the same "primary run"
 * the legacy projection used to surface as `linkedRun`.
 */
export function resolveRunsForMission(
  runs: ReadonlyArray<CoreRunRecord>,
  mission: MissionRecord,
): CoreRunRecord[] {
  const result: CoreRunRecord[] = [];
  const seen = new Set<string>();
  const claimedRunId = readMissionMetadataRunId(mission);
  if (claimedRunId !== null) {
    const claimedRun = runs.find((run) => run.id === claimedRunId) ?? null;
    if (claimedRun !== null) {
      result.push(claimedRun);
      seen.add(claimedRun.id);
    }
  }
  for (const run of runs) {
    if (seen.has(run.id)) {
      continue;
    }
    if (readRunMetadataMissionId(run) === mission.id) {
      result.push(run);
      seen.add(run.id);
    }
  }
  return result;
}

/**
 * The "primary" run for a mission: the mission-claimed run if any,
 * otherwise the first back-referencing run, otherwise null. Suitable
 * as a drop-in replacement for legacy single-run anchors.
 */
export function resolvePrimaryRunForMission(
  runs: ReadonlyArray<CoreRunRecord>,
  mission: MissionRecord,
): CoreRunRecord | null {
  return resolveRunsForMission(runs, mission)[0] ?? null;
}

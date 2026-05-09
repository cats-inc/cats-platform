// Shared mission and run status taxonomy. Keep all "what does active /
// terminal mean" decisions in one place so projections (`MyCatsProjection`,
// `MissionRunProjection`) and dispatch helpers cannot drift apart.

import type {
  CoreRunRecord,
  CoreRunStatus,
  MissionRecord,
  MissionRecordStatus,
} from './types.js';

export const MISSION_PRE_LAUNCH_STATUSES: ReadonlySet<MissionRecordStatus> = new Set([
  'draft',
  'planned',
]);

export const MISSION_ACTIVE_STATUSES: ReadonlySet<MissionRecordStatus> = new Set([
  'planned',
  'queued',
  'running',
]);

export const MISSION_TERMINAL_STATUSES: ReadonlySet<MissionRecordStatus> = new Set([
  'completed',
  'failed',
  'cancelled',
]);

export const RUN_ACTIVE_STATUSES: ReadonlySet<CoreRunStatus> = new Set([
  'queued',
  'running',
]);

export const RUN_TERMINAL_STATUSES: ReadonlySet<CoreRunStatus> = new Set([
  'completed',
  'failed',
  'cancelled',
]);

export function isPreLaunchMission(mission: MissionRecord): boolean {
  return MISSION_PRE_LAUNCH_STATUSES.has(mission.status);
}

export function isActiveMission(mission: MissionRecord): boolean {
  return MISSION_ACTIVE_STATUSES.has(mission.status);
}

export function isTerminalMission(mission: MissionRecord): boolean {
  return MISSION_TERMINAL_STATUSES.has(mission.status);
}

export function isActiveRun(run: CoreRunRecord): boolean {
  return RUN_ACTIVE_STATUSES.has(run.status);
}

export function isTerminalRun(run: CoreRunRecord): boolean {
  return RUN_TERMINAL_STATUSES.has(run.status);
}

/**
 * `blocked` is intentionally neither active nor terminal: a blocked run
 * is paused waiting on an external signal and may resume into either
 * `running` or a terminal status. Callers that need to surface blocked
 * runs should test the status directly.
 */
export function isBlockedRun(run: CoreRunRecord): boolean {
  return run.status === 'blocked';
}

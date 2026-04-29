import { resolvePlatformSurfaceRoutePrefix } from '../../../shared/platformProducts.js';

export const WORK_ROUTE_PREFIX = resolvePlatformSurfaceRoutePrefix('work');
export const WORK_WAR_ROOM_PATH = `${WORK_ROUTE_PREFIX}/war-room`;
export const WORK_PROJECTS_PATH = `${WORK_ROUTE_PREFIX}/projects`;
export const WORK_TASKS_PATH = `${WORK_ROUTE_PREFIX}/tasks`;
export const WORK_WORK_ITEMS_PATH = `${WORK_ROUTE_PREFIX}/work-items`;
export const WORK_RUNS_PATH = `${WORK_ROUTE_PREFIX}/runs`;
export const WORK_MISSIONS_PATH = `${WORK_ROUTE_PREFIX}/missions`;
export const WORK_SCHEDULES_PATH = `${WORK_ROUTE_PREFIX}/schedules`;
export const WORK_SYSTEM_MAP_PATH = `${WORK_ROUTE_PREFIX}/system-map`;
export const WORK_COCKPIT_PATH = `${WORK_ROUTE_PREFIX}/cockpit`;
export const WORK_BROKEN_LINKS_PATH = `${WORK_ROUTE_PREFIX}/broken-links`;

export function buildWorkProjectPath(projectId?: string | null): string {
  const normalized = projectId?.trim();
  return normalized
    ? `${WORK_PROJECTS_PATH}/${encodeURIComponent(normalized)}`
    : WORK_PROJECTS_PATH;
}

export function buildWorkTaskPath(taskId?: string | null): string {
  const normalized = taskId?.trim();
  return normalized
    ? `${WORK_TASKS_PATH}/${encodeURIComponent(normalized)}`
    : WORK_TASKS_PATH;
}

export function buildWorkWorkItemPath(workItemId?: string | null): string {
  const normalized = workItemId?.trim();
  return normalized
    ? `${WORK_WORK_ITEMS_PATH}/${encodeURIComponent(normalized)}`
    : WORK_WORK_ITEMS_PATH;
}

/**
 * Run drill-down lives nested under its task — the natural anchor.
 * For a run with no task (rare; only via direct Core write), the
 * caller falls back to passing taskId="orphan".
 */
export function buildWorkRunPath(taskId: string, runId: string): string {
  const t = taskId.trim() || 'orphan';
  const r = runId.trim();
  return `${WORK_TASKS_PATH}/${encodeURIComponent(t)}/runs/${encodeURIComponent(r)}`;
}

export function buildWorkMissionPath(missionId?: string | null): string {
  const normalized = missionId?.trim();
  return normalized
    ? `${WORK_MISSIONS_PATH}/${encodeURIComponent(normalized)}`
    : WORK_MISSIONS_PATH;
}

export function buildWorkSchedulePath(scheduleId?: string | null): string {
  const normalized = scheduleId?.trim();
  return normalized
    ? `${WORK_SCHEDULES_PATH}/${encodeURIComponent(normalized)}`
    : WORK_SCHEDULES_PATH;
}

export function isWorkWarRoomPath(pathname: string): boolean {
  return pathname.startsWith(WORK_WAR_ROOM_PATH);
}

export function isWorkTasksPath(pathname: string): boolean {
  return pathname === WORK_TASKS_PATH || pathname.startsWith(`${WORK_TASKS_PATH}/`);
}

export function isWorkProjectsPath(pathname: string): boolean {
  return pathname.startsWith(WORK_PROJECTS_PATH);
}

export function isWorkWorkItemsPath(pathname: string): boolean {
  return pathname.startsWith(WORK_WORK_ITEMS_PATH);
}

export function isWorkSystemMapPath(pathname: string): boolean {
  return pathname.startsWith(WORK_SYSTEM_MAP_PATH);
}

export function isWorkCockpitPath(pathname: string): boolean {
  return pathname.startsWith(WORK_COCKPIT_PATH);
}

export function isWorkBrokenLinksPath(pathname: string): boolean {
  return pathname.startsWith(WORK_BROKEN_LINKS_PATH);
}

export function isWorkRunsPath(pathname: string): boolean {
  if (pathname === WORK_RUNS_PATH || pathname.startsWith(`${WORK_RUNS_PATH}/`)) {
    return true;
  }
  // Run detail nests under its task — `/work/tasks/:taskId/runs/:runId`.
  // Treat that path as a Run-context location so the Runs sidebar entry
  // highlights (and Tasks de-highlights via its own exclusion) when
  // drilling into a run.
  return (
    pathname.startsWith(`${WORK_TASKS_PATH}/`) && /\/runs\//.test(pathname)
  );
}

export function isWorkMissionsPath(pathname: string): boolean {
  return pathname === WORK_MISSIONS_PATH || pathname.startsWith(`${WORK_MISSIONS_PATH}/`);
}

export function isWorkSchedulesPath(pathname: string): boolean {
  return pathname === WORK_SCHEDULES_PATH || pathname.startsWith(`${WORK_SCHEDULES_PATH}/`);
}

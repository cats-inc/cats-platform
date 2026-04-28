import { resolvePlatformSurfaceRoutePrefix } from '../../../shared/platformProducts.js';

export const WORK_ROUTE_PREFIX = resolvePlatformSurfaceRoutePrefix('work');
export const WORK_WAR_ROOM_PATH = `${WORK_ROUTE_PREFIX}/war-room`;
export const WORK_INTAKE_PATH = `${WORK_ROUTE_PREFIX}/intake`;
export const WORK_PROJECTS_PATH = `${WORK_ROUTE_PREFIX}/projects`;
export const WORK_TASKS_PATH = `${WORK_ROUTE_PREFIX}/tasks`;
export const WORK_WORK_ITEMS_PATH = `${WORK_ROUTE_PREFIX}/work-items`;
export const WORK_SYSTEM_MAP_PATH = `${WORK_ROUTE_PREFIX}/system-map`;
export const WORK_COCKPIT_PATH = `${WORK_ROUTE_PREFIX}/cockpit`;
export const WORK_BROKEN_LINKS_PATH = `${WORK_ROUTE_PREFIX}/broken-links`;

export function buildWorkIntakePath(projectId?: string | null): string {
  const normalized = projectId?.trim();
  return normalized
    ? `${WORK_INTAKE_PATH}/${encodeURIComponent(normalized)}`
    : WORK_INTAKE_PATH;
}

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

export function isWorkIntakePath(pathname: string): boolean {
  return pathname === WORK_INTAKE_PATH || pathname.startsWith(`${WORK_INTAKE_PATH}/`);
}

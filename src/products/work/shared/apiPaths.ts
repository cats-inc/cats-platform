import { PLATFORM_WORK_API_BASE } from '../../../shared/platformSurfaceApi.js';

function normalizeApiPathToken(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function buildWorkApiDetailPath(
  basePath: string,
  id: string | null | undefined,
): string {
  const normalizedId = normalizeApiPathToken(id);
  if (!normalizedId) {
    return basePath;
  }

  return `${basePath}/${encodeURIComponent(normalizedId)}`;
}

export const WORK_API_PREFIX = PLATFORM_WORK_API_BASE;
export const WORK_API_PROJECTS_PATH = `${WORK_API_PREFIX}/projects`;
export const WORK_API_TASKS_PATH = `${WORK_API_PREFIX}/tasks`;
export const WORK_API_WORK_ITEMS_PATH = `${WORK_API_PREFIX}/work-items`;
export const WORK_API_RUNS_PATH = `${WORK_API_PREFIX}/runs`;
export const WORK_API_MISSIONS_PATH = `${WORK_API_PREFIX}/missions`;
export const WORK_API_SCHEDULES_PATH = `${WORK_API_PREFIX}/schedules`;
export const WORK_API_WAR_ROOM_PATH = `${WORK_API_PREFIX}/war-room`;
export const WORK_API_LINKS_PATH = `${WORK_API_PREFIX}/links`;
export const WORK_API_GRAPH_PATH = `${WORK_API_PREFIX}/graph`;
export const WORK_API_RAW_PROJECTS_PATH = `${WORK_API_PREFIX}/raw/projects`;
export const WORK_API_RAW_WORK_ITEMS_PATH = `${WORK_API_PREFIX}/raw/work-items`;
export const WORK_API_RAW_TASKS_PATH = `${WORK_API_PREFIX}/raw/tasks`;

export const WORK_API_PROJECT_DETAIL_PATH_TEMPLATE = `${WORK_API_PROJECTS_PATH}/:projectId`;
export const WORK_API_TASK_DETAIL_PATH_TEMPLATE = `${WORK_API_TASKS_PATH}/:taskId`;
export const WORK_API_TASK_SUPERVISED_RUN_PATH_TEMPLATE =
  `${WORK_API_TASK_DETAIL_PATH_TEMPLATE}/supervised-run`;
export const WORK_API_TASK_SUPERVISED_RUN_ACTION_PATH_TEMPLATE =
  `${WORK_API_TASK_SUPERVISED_RUN_PATH_TEMPLATE}/:action`;
export const WORK_API_WORK_ITEM_DETAIL_PATH_TEMPLATE = `${WORK_API_WORK_ITEMS_PATH}/:workItemId`;
export const WORK_API_SCHEDULE_DETAIL_PATH_TEMPLATE = `${WORK_API_SCHEDULES_PATH}/:scheduleId`;
export const WORK_API_SCHEDULE_TEST_FIRE_PATH_TEMPLATE =
  `${WORK_API_SCHEDULE_DETAIL_PATH_TEMPLATE}/test-fire`;
export const WORK_API_RUN_DETAIL_PATH_TEMPLATE = `${WORK_API_RUNS_PATH}/:runId`;
export const WORK_API_RUN_STOP_PATH_TEMPLATE =
  `${WORK_API_RUN_DETAIL_PATH_TEMPLATE}/stop`;
export const WORK_API_MISSION_DETAIL_PATH_TEMPLATE =
  `${WORK_API_MISSIONS_PATH}/:missionId`;
export const WORK_API_MISSION_CANCEL_PATH_TEMPLATE =
  `${WORK_API_MISSION_DETAIL_PATH_TEMPLATE}/cancel`;

export const WORK_API_PROJECT_DETAIL_PATTERN = /^\/api\/work\/projects\/([^/]+)$/u;
export const WORK_API_TASK_DETAIL_PATTERN = /^\/api\/work\/tasks\/([^/]+)$/u;
export const WORK_API_TASK_SUPERVISED_RUN_PATTERN =
  /^\/api\/work\/tasks\/([^/]+)\/supervised-run$/u;
export const WORK_API_TASK_SUPERVISED_RUN_ACTION_PATTERN =
  /^\/api\/work\/tasks\/([^/]+)\/supervised-run\/(resume|retry|cancel)$/u;
export const WORK_API_WORK_ITEM_DETAIL_PATTERN = /^\/api\/work\/work-items\/([^/]+)$/u;
export const WORK_API_SCHEDULE_DETAIL_PATTERN = /^\/api\/work\/schedules\/([^/]+)$/u;
export const WORK_API_SCHEDULE_TEST_FIRE_PATTERN =
  /^\/api\/work\/schedules\/([^/]+)\/test-fire$/u;
export const WORK_API_RUN_STOP_PATTERN =
  /^\/api\/work\/runs\/([^/]+)\/stop$/u;
export const WORK_API_MISSION_CANCEL_PATTERN =
  /^\/api\/work\/missions\/([^/]+)\/cancel$/u;
export const WORK_API_LINK_DETAIL_PATTERN = /^\/api\/work\/links\/([^/]+)$/u;
export const WORK_API_LINK_DETAIL_PATH_TEMPLATE = `${WORK_API_LINKS_PATH}/:linkId`;

export function buildWorkApiLinkPath(linkId?: string | null): string {
  return buildWorkApiDetailPath(WORK_API_LINKS_PATH, linkId);
}

export function buildWorkApiProjectPath(projectId?: string | null): string {
  return buildWorkApiDetailPath(WORK_API_PROJECTS_PATH, projectId);
}

export function buildWorkApiTaskPath(taskId?: string | null): string {
  return buildWorkApiDetailPath(WORK_API_TASKS_PATH, taskId);
}

export function buildWorkApiTaskSupervisedRunPath(taskId: string): string {
  return `${buildWorkApiTaskPath(taskId)}/supervised-run`;
}

export function buildWorkApiTaskSupervisedRunActionPath(
  taskId: string,
  action: 'resume' | 'retry' | 'cancel',
): string {
  return `${buildWorkApiTaskSupervisedRunPath(taskId)}/${action}`;
}

export function buildWorkApiWorkItemPath(workItemId?: string | null): string {
  return buildWorkApiDetailPath(WORK_API_WORK_ITEMS_PATH, workItemId);
}

export function buildWorkApiSchedulePath(scheduleId?: string | null): string {
  return buildWorkApiDetailPath(WORK_API_SCHEDULES_PATH, scheduleId);
}

export function buildWorkApiScheduleTestFirePath(scheduleId: string): string {
  return `${buildWorkApiSchedulePath(scheduleId)}/test-fire`;
}

export function buildWorkApiRunStopPath(runId: string): string {
  return `${buildWorkApiDetailPath(WORK_API_RUNS_PATH, runId)}/stop`;
}

export function buildWorkApiMissionCancelPath(missionId: string): string {
  return `${buildWorkApiDetailPath(WORK_API_MISSIONS_PATH, missionId)}/cancel`;
}

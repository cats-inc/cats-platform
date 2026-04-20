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

export const WORK_API_PREFIX = '/api/work';
export const WORK_API_PROJECTS_PATH = `${WORK_API_PREFIX}/projects`;
export const WORK_API_TASKS_PATH = `${WORK_API_PREFIX}/tasks`;
export const WORK_API_WORK_ITEMS_PATH = `${WORK_API_PREFIX}/work-items`;
export const WORK_API_TEMPLATES_PATH = `${WORK_API_PREFIX}/templates`;
export const WORK_API_INTAKE_PATH = `${WORK_API_PREFIX}/intake`;
export const WORK_API_WAR_ROOM_PATH = `${WORK_API_PREFIX}/war-room`;

export const WORK_API_PROJECT_DETAIL_PATH_TEMPLATE = `${WORK_API_PROJECTS_PATH}/:projectId`;
export const WORK_API_TASK_DETAIL_PATH_TEMPLATE = `${WORK_API_TASKS_PATH}/:taskId`;
export const WORK_API_WORK_ITEM_DETAIL_PATH_TEMPLATE = `${WORK_API_WORK_ITEMS_PATH}/:workItemId`;
export const WORK_API_INTAKE_PLAN_PATH_TEMPLATE = `${WORK_API_INTAKE_PATH}/:projectId/plan`;
export const WORK_API_INTAKE_APPROVE_PATH_TEMPLATE = `${WORK_API_INTAKE_PATH}/:projectId/approve`;
export const WORK_API_INTAKE_REJECT_PATH_TEMPLATE = `${WORK_API_INTAKE_PATH}/:projectId/reject`;

export const WORK_API_PROJECT_DETAIL_PATTERN = /^\/api\/work\/projects\/([^/]+)$/u;
export const WORK_API_TASK_DETAIL_PATTERN = /^\/api\/work\/tasks\/([^/]+)$/u;
export const WORK_API_WORK_ITEM_DETAIL_PATTERN = /^\/api\/work\/work-items\/([^/]+)$/u;
export const WORK_API_INTAKE_PLAN_PATTERN = /^\/api\/work\/intake\/([^/]+)\/plan$/u;
export const WORK_API_INTAKE_APPROVE_PATTERN = /^\/api\/work\/intake\/([^/]+)\/approve$/u;
export const WORK_API_INTAKE_REJECT_PATTERN = /^\/api\/work\/intake\/([^/]+)\/reject$/u;

export function buildWorkApiProjectPath(projectId?: string | null): string {
  return buildWorkApiDetailPath(WORK_API_PROJECTS_PATH, projectId);
}

export function buildWorkApiTaskPath(taskId?: string | null): string {
  return buildWorkApiDetailPath(WORK_API_TASKS_PATH, taskId);
}

export function buildWorkApiWorkItemPath(workItemId?: string | null): string {
  return buildWorkApiDetailPath(WORK_API_WORK_ITEMS_PATH, workItemId);
}

export function buildWorkApiIntakePath(projectId?: string | null): string {
  return buildWorkApiDetailPath(WORK_API_INTAKE_PATH, projectId);
}

export function buildWorkApiIntakePlanPath(projectId: string): string {
  return `${buildWorkApiIntakePath(projectId)}/plan`;
}

export function buildWorkApiIntakeApprovePath(projectId: string): string {
  return `${buildWorkApiIntakePath(projectId)}/approve`;
}

export function buildWorkApiIntakeRejectPath(projectId: string): string {
  return `${buildWorkApiIntakePath(projectId)}/reject`;
}

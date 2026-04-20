import { expectJson } from './http.js';

import type {
  WorkDashboardProjection,
  WorkProjectListProjection,
  WorkProjectDetailProjection,
  WorkTaskListProjection,
  WorkTaskDetailProjection,
  WorkWorkItemListProjection,
  WorkWorkItemDetailProjection,
} from '../../api/projection.js';
import {
  buildWorkApiProjectPath,
  buildWorkApiTaskPath,
  buildWorkApiWorkItemPath,
  WORK_API_PREFIX,
  WORK_API_PROJECTS_PATH,
  WORK_API_TASKS_PATH,
  WORK_API_WORK_ITEMS_PATH,
} from '../../shared/apiPaths.js';

export async function fetchWorkDashboard(
  signal?: AbortSignal,
): Promise<WorkDashboardProjection> {
  const response = await fetch(WORK_API_PREFIX, { signal });
  return expectJson<WorkDashboardProjection>(response, 'Failed to load work dashboard');
}

export async function fetchWorkTaskDetail(
  taskId: string,
  signal?: AbortSignal,
): Promise<WorkTaskDetailProjection> {
  const response = await fetch(buildWorkApiTaskPath(taskId), { signal });
  return expectJson<WorkTaskDetailProjection>(response, 'Failed to load work task detail');
}

export async function fetchWorkTaskList(
  signal?: AbortSignal,
): Promise<WorkTaskListProjection> {
  const response = await fetch(WORK_API_TASKS_PATH, { signal });
  return expectJson<WorkTaskListProjection>(response, 'Failed to load work tasks');
}

export async function fetchWorkProjectDetail(
  projectId: string,
  signal?: AbortSignal,
): Promise<WorkProjectDetailProjection> {
  const response = await fetch(buildWorkApiProjectPath(projectId), { signal });
  return expectJson<WorkProjectDetailProjection>(response, 'Failed to load work project detail');
}

export async function fetchWorkProjectList(
  signal?: AbortSignal,
): Promise<WorkProjectListProjection> {
  const response = await fetch(WORK_API_PROJECTS_PATH, { signal });
  return expectJson<WorkProjectListProjection>(response, 'Failed to load work projects');
}

export async function fetchWorkItemDetail(
  workItemId: string,
  signal?: AbortSignal,
): Promise<WorkWorkItemDetailProjection> {
  const response = await fetch(buildWorkApiWorkItemPath(workItemId), { signal });
  return expectJson<WorkWorkItemDetailProjection>(response, 'Failed to load work item detail');
}

export async function fetchWorkItemList(
  signal?: AbortSignal,
): Promise<WorkWorkItemListProjection> {
  const response = await fetch(WORK_API_WORK_ITEMS_PATH, { signal });
  return expectJson<WorkWorkItemListProjection>(response, 'Failed to load work items');
}

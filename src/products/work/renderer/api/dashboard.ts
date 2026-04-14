import { expectJson } from './http.js';

import type {
  WorkDashboardProjection,
  WorkProjectListProjection,
  WorkProjectDetailProjection,
  WorkTaskDetailProjection,
  WorkWorkItemListProjection,
  WorkWorkItemDetailProjection,
} from '../../api/projection.js';

export async function fetchWorkDashboard(
  signal?: AbortSignal,
): Promise<WorkDashboardProjection> {
  const response = await fetch('/api/work', { signal });
  return expectJson<WorkDashboardProjection>(response, 'Failed to load work dashboard');
}

export async function fetchWorkTaskDetail(
  taskId: string,
  signal?: AbortSignal,
): Promise<WorkTaskDetailProjection> {
  const response = await fetch(`/api/work/tasks/${encodeURIComponent(taskId)}`, { signal });
  return expectJson<WorkTaskDetailProjection>(response, 'Failed to load work task detail');
}

export async function fetchWorkProjectDetail(
  projectId: string,
  signal?: AbortSignal,
): Promise<WorkProjectDetailProjection> {
  const response = await fetch(`/api/work/projects/${encodeURIComponent(projectId)}`, { signal });
  return expectJson<WorkProjectDetailProjection>(response, 'Failed to load work project detail');
}

export async function fetchWorkProjectList(
  signal?: AbortSignal,
): Promise<WorkProjectListProjection> {
  const response = await fetch('/api/work/projects', { signal });
  return expectJson<WorkProjectListProjection>(response, 'Failed to load work projects');
}

export async function fetchWorkItemDetail(
  workItemId: string,
  signal?: AbortSignal,
): Promise<WorkWorkItemDetailProjection> {
  const response = await fetch(`/api/work/work-items/${encodeURIComponent(workItemId)}`, { signal });
  return expectJson<WorkWorkItemDetailProjection>(response, 'Failed to load work item detail');
}

export async function fetchWorkItemList(
  signal?: AbortSignal,
): Promise<WorkWorkItemListProjection> {
  const response = await fetch('/api/work/work-items', { signal });
  return expectJson<WorkWorkItemListProjection>(response, 'Failed to load work items');
}

import { expectJson } from './http.js';

import type {
  WorkDashboardProjection,
  WorkTaskDetailProjection,
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

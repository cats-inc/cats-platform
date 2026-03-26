import type {
  WorkDashboardProjection,
  WorkTaskDetailProjection,
} from '../api/projection';

export async function fetchWorkDashboard(): Promise<WorkDashboardProjection> {
  const response = await fetch('/api/work');
  if (!response.ok) {
    throw new Error(`cats work dashboard returned ${response.status}`);
  }
  return response.json() as Promise<WorkDashboardProjection>;
}

export async function fetchWorkTaskDetail(taskId: string): Promise<WorkTaskDetailProjection> {
  const response = await fetch(`/api/work/tasks/${encodeURIComponent(taskId)}`);
  if (!response.ok) {
    throw new Error(`cats work task detail returned ${response.status}`);
  }
  return response.json() as Promise<WorkTaskDetailProjection>;
}

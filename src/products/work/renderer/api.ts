import type {
  WorkDashboardProjection,
  WorkProjectDetailProjection,
  WorkTaskDetailProjection,
  WorkWorkItemDetailProjection,
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

export async function fetchWorkProjectDetail(projectId: string): Promise<WorkProjectDetailProjection> {
  const response = await fetch(`/api/work/projects/${encodeURIComponent(projectId)}`);
  if (!response.ok) {
    throw new Error(`cats work project detail returned ${response.status}`);
  }
  return response.json() as Promise<WorkProjectDetailProjection>;
}

export async function fetchWorkWorkItemDetail(
  workItemId: string,
): Promise<WorkWorkItemDetailProjection> {
  const response = await fetch(`/api/work/work-items/${encodeURIComponent(workItemId)}`);
  if (!response.ok) {
    throw new Error(`cats work work-item detail returned ${response.status}`);
  }
  return response.json() as Promise<WorkWorkItemDetailProjection>;
}

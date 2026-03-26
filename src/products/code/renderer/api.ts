import type {
  CodeArtifactDetailProjection,
  CodeDashboardProjection,
  CodeTaskDetailProjection,
} from '../api/projection';

async function requireJson<TPayload>(path: string, label: string): Promise<TPayload> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`${label} returned ${response.status}`);
  }
  return response.json() as Promise<TPayload>;
}

export async function fetchCodeDashboard(): Promise<CodeDashboardProjection> {
  return requireJson<CodeDashboardProjection>('/api/code', 'cats code dashboard');
}

export async function fetchCodeTaskDetail(taskId: string): Promise<CodeTaskDetailProjection> {
  return requireJson<CodeTaskDetailProjection>(`/api/code/tasks/${taskId}`, 'cats code task detail');
}

export async function fetchCodeArtifactDetail(
  artifactId: string,
): Promise<CodeArtifactDetailProjection> {
  return requireJson<CodeArtifactDetailProjection>(
    `/api/code/artifacts/${artifactId}`,
    'cats code artifact detail',
  );
}

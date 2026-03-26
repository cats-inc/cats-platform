import type { CodeDashboardProjection } from '../api/projection';

export async function fetchCodeDashboard(): Promise<CodeDashboardProjection> {
  const response = await fetch('/api/code');
  if (!response.ok) {
    throw new Error(`cats code dashboard returned ${response.status}`);
  }
  return response.json() as Promise<CodeDashboardProjection>;
}

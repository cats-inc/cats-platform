import { expectJson } from './http.js';

import type { WorkDashboardProjection } from '../../api/projection.js';
import { WORK_API_PREFIX } from '../../shared/apiPaths.js';

export async function fetchWorkDashboard(
  errorMessage: string,
  signal?: AbortSignal,
): Promise<WorkDashboardProjection> {
  const response = await fetch(WORK_API_PREFIX, { signal });
  return expectJson<WorkDashboardProjection>(response, errorMessage);
}

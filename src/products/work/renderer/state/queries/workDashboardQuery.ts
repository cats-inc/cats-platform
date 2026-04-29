import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { fetchWorkDashboard } from "../../api/dashboard.js";
import type { WorkDashboardProjection } from "../../../api/projection.js";

export const WORK_DASHBOARD_QUERY_KEY = ["workDashboard"] as const;

export function useWorkDashboardQuery(): UseQueryResult<WorkDashboardProjection> {
  return useQuery({
    queryKey: WORK_DASHBOARD_QUERY_KEY,
    queryFn: ({ signal }) => fetchWorkDashboard(signal),
  });
}

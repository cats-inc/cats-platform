import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { buildWorkApiSchedulePath } from "../../../shared/apiPaths.js";
import { expectJson } from "../../api/http.js";
import {
  listWorkSchedules,
  type WorkScheduleListResponse,
  type WorkScheduleRuleResponse,
} from "../../api/schedules.js";

export const SCHEDULES_QUERY_KEY = ["schedules"] as const;

export function scheduleDetailQueryKey(scheduleId: string): readonly [
  "schedules",
  string,
] {
  return ["schedules", scheduleId];
}

export function useSchedulesQuery(): UseQueryResult<WorkScheduleListResponse> {
  return useQuery({
    queryKey: SCHEDULES_QUERY_KEY,
    queryFn: ({ signal }) => listWorkSchedules(signal),
  });
}

export function useScheduleDetailQuery(
  scheduleId: string | undefined,
): UseQueryResult<WorkScheduleRuleResponse> {
  return useQuery({
    queryKey: scheduleId ? scheduleDetailQueryKey(scheduleId) : ["schedules", "_unknown"],
    enabled: typeof scheduleId === "string" && scheduleId.length > 0,
    queryFn: async ({ signal }) => {
      const response = await fetch(buildWorkApiSchedulePath(scheduleId!), { signal });
      return expectJson<WorkScheduleRuleResponse>(
        response,
        "Failed to load schedule.",
      );
    },
  });
}

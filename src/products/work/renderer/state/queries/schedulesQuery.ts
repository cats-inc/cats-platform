import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { useI18n } from "../../../../../app/renderer/i18n/index.js";
import { messageKeys } from "../../../../../shared/i18n/messageKeys.js";
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
  const { t } = useI18n();
  return useQuery({
    queryKey: SCHEDULES_QUERY_KEY,
    queryFn: ({ signal }) => listWorkSchedules(
      signal,
      t(messageKeys.workSchedulesListLoadErrorFallback),
    ),
  });
}

export function useScheduleDetailQuery(
  scheduleId: string | undefined,
): UseQueryResult<WorkScheduleRuleResponse> {
  const { t } = useI18n();
  return useQuery({
    queryKey: scheduleId ? scheduleDetailQueryKey(scheduleId) : ["schedules", "_unknown"],
    enabled: typeof scheduleId === "string" && scheduleId.length > 0,
    queryFn: async ({ signal }) => {
      const response = await fetch(buildWorkApiSchedulePath(scheduleId!), { signal });
      return expectJson<WorkScheduleRuleResponse>(
        response,
        t(messageKeys.workScheduleLoadFailed),
      );
    },
  });
}

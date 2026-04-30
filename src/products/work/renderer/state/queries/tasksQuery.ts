import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { useI18n } from "../../../../../app/renderer/i18n/index.js";
import type {
  WorkTaskListItem,
  WorkTaskListProjection,
} from "../../../api/projection.js";
import { WORK_API_TASKS_PATH } from "../../../shared/apiPaths.js";
import {
  createWorkQueryHttpError,
  type WorkQueryTranslator,
} from "./queryErrorFormatting.js";

export const TASKS_QUERY_KEY = ["tasks"] as const;

async function fetchWorkTaskList(t: WorkQueryTranslator): Promise<WorkTaskListProjection> {
  const response = await fetch(WORK_API_TASKS_PATH, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw createWorkQueryHttpError(response, t);
  }
  return (await response.json()) as WorkTaskListProjection;
}

export function useTasksQuery(): UseQueryResult<WorkTaskListProjection> {
  const { t } = useI18n();
  return useQuery({
    queryKey: TASKS_QUERY_KEY,
    queryFn: () => fetchWorkTaskList(t),
  });
}

export type { WorkTaskListItem, WorkTaskListProjection };

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import type {
  WorkTaskListItem,
  WorkTaskListProjection,
} from "../../../api/projection.js";
import { WORK_API_TASKS_PATH } from "../../../shared/apiPaths.js";

export const TASKS_QUERY_KEY = ["tasks"] as const;

async function fetchWorkTaskList(): Promise<WorkTaskListProjection> {
  const response = await fetch(WORK_API_TASKS_PATH, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      `GET ${WORK_API_TASKS_PATH} failed: ${response.status} ${response.statusText}`,
    );
  }
  return (await response.json()) as WorkTaskListProjection;
}

export function useTasksQuery(): UseQueryResult<WorkTaskListProjection> {
  return useQuery({
    queryKey: TASKS_QUERY_KEY,
    queryFn: fetchWorkTaskList,
  });
}

export type { WorkTaskListItem, WorkTaskListProjection };

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import type {
  WorkRunListItem,
  WorkRunListProjection,
} from "../../../api/projection.js";
import { WORK_API_RUNS_PATH } from "../../../shared/apiPaths.js";

export const RUNS_QUERY_KEY = ["runs"] as const;

async function fetchWorkRunList(): Promise<WorkRunListProjection> {
  const response = await fetch(WORK_API_RUNS_PATH, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      `GET ${WORK_API_RUNS_PATH} failed: ${response.status} ${response.statusText}`,
    );
  }
  return (await response.json()) as WorkRunListProjection;
}

export function useRunsQuery(): UseQueryResult<WorkRunListProjection> {
  return useQuery({
    queryKey: RUNS_QUERY_KEY,
    queryFn: fetchWorkRunList,
  });
}

export type { WorkRunListItem, WorkRunListProjection };

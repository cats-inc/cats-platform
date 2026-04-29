import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import type {
  WorkProjectListItem,
  WorkProjectListProjection,
} from "../../../api/projection.js";
import { WORK_API_PROJECTS_PATH } from "../../../shared/apiPaths.js";

export const PROJECTS_QUERY_KEY = ["projects"] as const;

async function fetchWorkProjectList(): Promise<WorkProjectListProjection> {
  const response = await fetch(WORK_API_PROJECTS_PATH, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      `GET ${WORK_API_PROJECTS_PATH} failed: ${response.status} ${response.statusText}`,
    );
  }
  return (await response.json()) as WorkProjectListProjection;
}

export function useProjectsQuery(): UseQueryResult<WorkProjectListProjection> {
  return useQuery({
    queryKey: PROJECTS_QUERY_KEY,
    queryFn: fetchWorkProjectList,
  });
}

export type { WorkProjectListItem, WorkProjectListProjection };

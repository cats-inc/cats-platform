import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import type {
  WorkMissionListItem,
  WorkMissionListProjection,
} from "../../../api/projection.js";
import { WORK_API_MISSIONS_PATH } from "../../../shared/apiPaths.js";

export const MISSIONS_QUERY_KEY = ["missions"] as const;

async function fetchWorkMissionList(): Promise<WorkMissionListProjection> {
  const response = await fetch(WORK_API_MISSIONS_PATH, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      `GET ${WORK_API_MISSIONS_PATH} failed: ${response.status} ${response.statusText}`,
    );
  }
  return (await response.json()) as WorkMissionListProjection;
}

export function useMissionsQuery(): UseQueryResult<WorkMissionListProjection> {
  return useQuery({
    queryKey: MISSIONS_QUERY_KEY,
    queryFn: fetchWorkMissionList,
  });
}

export type { WorkMissionListItem, WorkMissionListProjection };

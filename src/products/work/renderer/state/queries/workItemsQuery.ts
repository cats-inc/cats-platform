import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import type {
  WorkWorkItemListItem,
  WorkWorkItemListProjection,
} from "../../../api/projection.js";
import { WORK_API_WORK_ITEMS_PATH } from "../../../shared/apiPaths.js";

export const WORK_ITEMS_QUERY_KEY = ["workItems"] as const;

async function fetchWorkItemList(): Promise<WorkWorkItemListProjection> {
  const response = await fetch(WORK_API_WORK_ITEMS_PATH, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      `GET ${WORK_API_WORK_ITEMS_PATH} failed: ${response.status} ${response.statusText}`,
    );
  }
  return (await response.json()) as WorkWorkItemListProjection;
}

export function useWorkItemsQuery(): UseQueryResult<WorkWorkItemListProjection> {
  return useQuery({
    queryKey: WORK_ITEMS_QUERY_KEY,
    queryFn: fetchWorkItemList,
  });
}

export type { WorkWorkItemListItem, WorkWorkItemListProjection };

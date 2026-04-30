import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { useI18n } from "../../../../../app/renderer/i18n/index.js";
import type {
  WorkWorkItemListItem,
  WorkWorkItemListProjection,
} from "../../../api/projection.js";
import { WORK_API_WORK_ITEMS_PATH } from "../../../shared/apiPaths.js";
import {
  createWorkQueryHttpError,
  type WorkQueryTranslator,
} from "./queryErrorFormatting.js";

export const WORK_ITEMS_QUERY_KEY = ["workItems"] as const;

async function fetchWorkItemList(t: WorkQueryTranslator): Promise<WorkWorkItemListProjection> {
  const response = await fetch(WORK_API_WORK_ITEMS_PATH, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw createWorkQueryHttpError(response, t);
  }
  return (await response.json()) as WorkWorkItemListProjection;
}

export function useWorkItemsQuery(): UseQueryResult<WorkWorkItemListProjection> {
  const { t } = useI18n();
  return useQuery({
    queryKey: WORK_ITEMS_QUERY_KEY,
    queryFn: () => fetchWorkItemList(t),
  });
}

export type { WorkWorkItemListItem, WorkWorkItemListProjection };

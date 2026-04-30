import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { useI18n } from "../../../../../app/renderer/i18n/index.js";
import type {
  WorkRunListItem,
  WorkRunListProjection,
} from "../../../api/projection.js";
import { WORK_API_RUNS_PATH } from "../../../shared/apiPaths.js";
import {
  createWorkQueryHttpError,
  type WorkQueryTranslator,
} from "./queryErrorFormatting.js";

export const RUNS_QUERY_KEY = ["runs"] as const;

async function fetchWorkRunList(t: WorkQueryTranslator): Promise<WorkRunListProjection> {
  const response = await fetch(WORK_API_RUNS_PATH, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw createWorkQueryHttpError(response, t);
  }
  return (await response.json()) as WorkRunListProjection;
}

export function useRunsQuery(): UseQueryResult<WorkRunListProjection> {
  const { t } = useI18n();
  return useQuery({
    queryKey: RUNS_QUERY_KEY,
    queryFn: () => fetchWorkRunList(t),
  });
}

export type { WorkRunListItem, WorkRunListProjection };

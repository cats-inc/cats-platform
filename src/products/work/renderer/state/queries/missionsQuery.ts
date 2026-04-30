import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { useI18n } from "../../../../../app/renderer/i18n/index.js";
import type {
  WorkMissionListItem,
  WorkMissionListProjection,
} from "../../../api/projection.js";
import { WORK_API_MISSIONS_PATH } from "../../../shared/apiPaths.js";
import {
  createWorkQueryHttpError,
  type WorkQueryTranslator,
} from "./queryErrorFormatting.js";

export const MISSIONS_QUERY_KEY = ["missions"] as const;

async function fetchWorkMissionList(t: WorkQueryTranslator): Promise<WorkMissionListProjection> {
  const response = await fetch(WORK_API_MISSIONS_PATH, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw createWorkQueryHttpError(response, t);
  }
  return (await response.json()) as WorkMissionListProjection;
}

export function useMissionsQuery(): UseQueryResult<WorkMissionListProjection> {
  const { t } = useI18n();
  return useQuery({
    queryKey: MISSIONS_QUERY_KEY,
    queryFn: () => fetchWorkMissionList(t),
  });
}

export type { WorkMissionListItem, WorkMissionListProjection };

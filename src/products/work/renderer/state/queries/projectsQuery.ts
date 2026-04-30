import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { useI18n } from "../../../../../app/renderer/i18n/index.js";
import type {
  WorkProjectListItem,
  WorkProjectListProjection,
} from "../../../api/projection.js";
import { WORK_API_PROJECTS_PATH } from "../../../shared/apiPaths.js";
import {
  createWorkQueryHttpError,
  type WorkQueryTranslator,
} from "./queryErrorFormatting.js";

export const PROJECTS_QUERY_KEY = ["projects"] as const;

async function fetchWorkProjectList(t: WorkQueryTranslator): Promise<WorkProjectListProjection> {
  const response = await fetch(WORK_API_PROJECTS_PATH, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw createWorkQueryHttpError(response, t);
  }
  return (await response.json()) as WorkProjectListProjection;
}

export function useProjectsQuery(): UseQueryResult<WorkProjectListProjection> {
  const { t } = useI18n();
  return useQuery({
    queryKey: PROJECTS_QUERY_KEY,
    queryFn: () => fetchWorkProjectList(t),
  });
}

export type { WorkProjectListItem, WorkProjectListProjection };

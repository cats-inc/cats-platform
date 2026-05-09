import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { useI18n } from "../../../../../app/renderer/i18n/index.js";
import type {
  WorkMissionDetailProjection,
  WorkMissionListItem,
  WorkMissionListProjection,
} from "../../../api/projection.js";
import {
  WORK_API_MISSIONS_PATH,
  buildWorkApiMissionPath,
} from "../../../shared/apiPaths.js";
import {
  createWorkQueryHttpError,
  type WorkQueryTranslator,
} from "./queryErrorFormatting.js";

export const MISSIONS_QUERY_KEY = ["missions"] as const;
export const MISSION_DETAIL_QUERY_KEY = (missionId: string) =>
  ["missions", "detail", missionId] as const;

async function fetchWorkMissionList(t: WorkQueryTranslator): Promise<WorkMissionListProjection> {
  const response = await fetch(WORK_API_MISSIONS_PATH, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw createWorkQueryHttpError(response, t);
  }
  return (await response.json()) as WorkMissionListProjection;
}

async function fetchWorkMissionDetail(
  missionId: string,
  t: WorkQueryTranslator,
): Promise<WorkMissionDetailProjection | null> {
  const response = await fetch(buildWorkApiMissionPath(missionId), {
    headers: { accept: "application/json" },
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw createWorkQueryHttpError(response, t);
  }
  return (await response.json()) as WorkMissionDetailProjection;
}

export function useMissionsQuery(): UseQueryResult<WorkMissionListProjection> {
  const { t } = useI18n();
  return useQuery({
    queryKey: MISSIONS_QUERY_KEY,
    queryFn: () => fetchWorkMissionList(t),
  });
}

export function useMissionDetailQuery(
  missionId: string | undefined | null,
): UseQueryResult<WorkMissionDetailProjection | null> {
  const { t } = useI18n();
  return useQuery({
    queryKey: missionId ? MISSION_DETAIL_QUERY_KEY(missionId) : ["missions", "detail", "__none__"],
    queryFn: () => {
      if (!missionId) {
        return Promise.resolve(null);
      }
      return fetchWorkMissionDetail(missionId, t);
    },
    enabled: Boolean(missionId),
  });
}

export type {
  WorkMissionDetailProjection,
  WorkMissionListItem,
  WorkMissionListProjection,
};

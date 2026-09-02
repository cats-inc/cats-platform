import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { useI18n } from "../../../../../app/renderer/i18n/index.js";
import type { WorkGoldenPathDetailProjection } from "../../../api/goldenPathProjection.js";
import type { WorkTaskDetailProjection } from "../../../api/projection.js";
import { WORK_API_TASKS_PATH } from "../../../shared/apiPaths.js";
import {
  createWorkQueryHttpError,
  type WorkQueryTranslator,
} from "./queryErrorFormatting.js";

export const TASK_GOLDEN_PATH_QUERY_KEY = ["task-golden-path"] as const;

/**
 * Reads the transport golden-path view for one Task (SPEC-114 FR-49).
 *
 * It rides on the existing Task detail endpoint rather than adding a second
 * one, so Desktop always sees the golden path and the Task from the same read.
 */
async function fetchTaskGoldenPath(
  taskId: string,
  t: WorkQueryTranslator,
): Promise<WorkGoldenPathDetailProjection | null> {
  const response = await fetch(`${WORK_API_TASKS_PATH}/${encodeURIComponent(taskId)}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw createWorkQueryHttpError(response, t);
  }
  const payload = (await response.json()) as WorkTaskDetailProjection;
  return payload.goldenPath;
}

export function useTaskGoldenPathQuery(
  taskId: string | undefined,
): UseQueryResult<WorkGoldenPathDetailProjection | null> {
  const { t } = useI18n();
  return useQuery({
    queryKey: [...TASK_GOLDEN_PATH_QUERY_KEY, taskId],
    queryFn: () => fetchTaskGoldenPath(taskId!, t),
    enabled: typeof taskId === "string" && taskId.length > 0,
  });
}

export type { WorkGoldenPathDetailProjection };

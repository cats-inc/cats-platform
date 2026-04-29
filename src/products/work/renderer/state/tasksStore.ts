import {
  createWorkTask,
  removeWorkTask,
  type CoreTaskStatus,
} from "../api/workRecords.js";
import { sharedQueryClient } from "../../../shared/renderer/queryClient.js";
import type { TaskPriority } from "../../shared/workGraphTypes.js";
import { TASKS_QUERY_KEY } from "./queries/tasksQuery.js";

export type { TaskPriority } from "../../shared/workGraphTypes.js";

const TASK_RENDERER_METADATA_KEY = "workRenderer";

export interface CreateTaskInput {
  title: string;
  summary?: string | null;
  status?: CoreTaskStatus;
  priority?: TaskPriority | null;
  ownerRole?: string | null;
  assigneeName?: string | null;
  nextAction?: string | null;
  acceptanceCriteria?: string | null;
  linkedProjectId?: string | null;
  linkedWorkItemId?: string | null;
  parentTaskId?: string | null;
}

export const tasksStore = {
  async remove(id: string): Promise<void> {
    await removeWorkTask(id);
    await sharedQueryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
  },
  async createTask(input: CreateTaskInput): Promise<{ id: string }> {
    const rendererExtras: Record<string, unknown> = {};
    if (input.priority) rendererExtras.priority = input.priority;
    const assigneeName = input.assigneeName?.trim();
    if (assigneeName) rendererExtras.assigneeName = assigneeName;
    const acceptanceCriteria = input.acceptanceCriteria?.trim();
    if (acceptanceCriteria) rendererExtras.acceptanceCriteria = acceptanceCriteria;
    const metadata =
      Object.keys(rendererExtras).length > 0
        ? { [TASK_RENDERER_METADATA_KEY]: rendererExtras }
        : undefined;

    const result = await createWorkTask({
      title: input.title.trim(),
      summary: input.summary?.trim() || null,
      status: input.status,
      parentTaskId: input.parentTaskId || null,
      metadata,
    });
    return { id: result.task.id };
  },
};

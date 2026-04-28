import { useMemo } from "react";

import {
  createWorkTask,
  removeWorkTask,
  type CoreTaskStatus,
} from "../api/workRecords.js";
import type { WorkGraphObjectSummary } from "../components/topdown/types";
import { triggerWorkGraphRefresh, useWorkGraph } from "./workGraphStore";

export type TaskPriority = "urgent" | "high" | "medium" | "low";

const TASK_RENDERER_METADATA_KEY = "workRenderer";

/**
 * Renderer-side Task display shape. Extends WorkGraphObjectSummary so
 * the SPEC-090 LinkageSection / Phase 5 producer pipeline can resolve
 * a task as a link endpoint without a separate adapter. Adds
 * Paperclip-inspired display fields (priority / assignee / parent /
 * acceptance criteria) — these are persisted in CoreTaskRecord.metadata
 * under the `workRenderer` key.
 */
export interface TaskItem extends WorkGraphObjectSummary {
  kind: "task";
  priority: TaskPriority | null;
  assigneeName: string | null;
  parentTaskId: string | null;
  acceptanceCriteria: string | null;
}

export interface TasksSnapshot {
  allTasks: readonly TaskItem[];
  deletedIds: ReadonlySet<string>;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
}

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

function asTaskRendererExtras(
  raw: unknown,
): {
  priority: TaskPriority | null;
  assigneeName: string | null;
  acceptanceCriteria: string | null;
  parentTaskIdMetadata: string | null;
} {
  if (!raw || typeof raw !== "object") {
    return {
      priority: null,
      assigneeName: null,
      acceptanceCriteria: null,
      parentTaskIdMetadata: null,
    };
  }
  const record = raw as Record<string, unknown>;
  const priority = record.priority;
  const validPriority =
    priority === "urgent" || priority === "high" || priority === "medium" || priority === "low";
  return {
    priority: validPriority ? (priority as TaskPriority) : null,
    assigneeName:
      typeof record.assigneeName === "string" ? record.assigneeName : null,
    acceptanceCriteria:
      typeof record.acceptanceCriteria === "string"
        ? record.acceptanceCriteria
        : null,
    parentTaskIdMetadata: null,
  };
}

function summaryToTaskItem(o: WorkGraphObjectSummary): TaskItem {
  const extras = asTaskRendererExtras(o.metadata?.[TASK_RENDERER_METADATA_KEY]);
  return {
    ...o,
    kind: "task",
    priority: extras.priority,
    assigneeName: extras.assigneeName,
    parentTaskId: o.linkedTaskId ?? null,
    acceptanceCriteria: extras.acceptanceCriteria,
  };
}

export const tasksStore = {
  async remove(id: string): Promise<void> {
    await removeWorkTask(id);
    await triggerWorkGraphRefresh();
  },
  async createTask(input: CreateTaskInput): Promise<TaskItem> {
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
    await triggerWorkGraphRefresh();
    return {
      id: result.task.id,
      kind: "task",
      structuralLayer: "execution",
      sourceRecordFamily: "task",
      sourceRecordId: result.task.id,
      title: result.task.title,
      status: result.task.status,
      summary: result.task.summary,
      attention: "none",
      ownerRole: null,
      nextAction: null,
      linkedConversationId: result.task.conversationId,
      linkedProjectId: input.linkedProjectId || null,
      linkedWorkItemId: input.linkedWorkItemId || null,
      linkedTaskId: result.task.parentTaskId ?? null,
      linkedRunId: null,
      updatedAt: result.task.updatedAt,
      priority: input.priority ?? null,
      assigneeName: assigneeName || null,
      parentTaskId: result.task.parentTaskId ?? null,
      acceptanceCriteria: acceptanceCriteria || null,
    };
  },
};

export function useTasks(): TasksSnapshot {
  const { graph, status, error } = useWorkGraph();
  return useMemo(() => {
    const allTasks = graph.objects
      .filter((obj): obj is WorkGraphObjectSummary => obj.kind === "task")
      .map(summaryToTaskItem);
    return {
      allTasks,
      deletedIds: new Set<string>(),
      status,
      error,
    };
  }, [graph, status, error]);
}

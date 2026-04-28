import { useMemo } from "react";

import {
  createWorkItem as apiCreateWorkItem,
  removeWorkItem as apiRemoveWorkItem,
  type CoreWorkItemStatus,
} from "../api/workRecords.js";
import type { WorkGraphObjectSummary } from "../components/topdown/types";
import { triggerWorkGraphRefresh, useWorkGraph } from "./workGraphStore";

export interface WorkItemsSnapshot {
  allWorkItems: readonly WorkGraphObjectSummary[];
  deletedIds: ReadonlySet<string>;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
}

export interface CreateWorkItemInput {
  title: string;
  summary?: string | null;
  status?: CoreWorkItemStatus;
  ownerRole?: string | null;
  nextAction?: string | null;
  linkedProjectId?: string | null;
}

export const workItemsStore = {
  async remove(id: string): Promise<void> {
    await apiRemoveWorkItem(id);
    await triggerWorkGraphRefresh();
  },
  async createWorkItem(input: CreateWorkItemInput): Promise<WorkGraphObjectSummary> {
    const result = await apiCreateWorkItem({
      title: input.title.trim(),
      summary: input.summary?.trim() || null,
      status: input.status,
      projectId: input.linkedProjectId || null,
    });
    await triggerWorkGraphRefresh();
    return {
      id: result.workItem.id,
      kind: "work_item",
      structuralLayer: "planning",
      sourceRecordFamily: "work_item",
      sourceRecordId: result.workItem.id,
      title: result.workItem.title,
      status: result.workItem.status,
      summary: result.workItem.summary,
      attention: "none",
      ownerRole: null,
      nextAction: null,
      linkedConversationId: result.workItem.conversationId,
      linkedProjectId: result.workItem.projectId,
      linkedWorkItemId: result.workItem.parentWorkItemId,
      linkedTaskId: result.workItem.taskId,
      linkedRunId: null,
      updatedAt: result.workItem.updatedAt,
    };
  },
};

export function useWorkItems(): WorkItemsSnapshot {
  const { graph, status, error } = useWorkGraph();
  return useMemo(() => {
    const allWorkItems = graph.objects.filter(
      (obj): obj is WorkGraphObjectSummary => obj.kind === "work_item",
    );
    return {
      allWorkItems,
      deletedIds: new Set<string>(),
      status,
      error,
    };
  }, [graph, status, error]);
}

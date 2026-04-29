import {
  createWorkItem as apiCreateWorkItem,
  removeWorkItem as apiRemoveWorkItem,
  type CoreWorkItemStatus,
} from "../api/workRecords.js";
import { sharedQueryClient } from "../../../shared/renderer/queryClient.js";
import { WORK_ITEMS_QUERY_KEY } from "./queries/workItemsQuery.js";

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
    await sharedQueryClient.invalidateQueries({ queryKey: WORK_ITEMS_QUERY_KEY });
  },
  async createWorkItem(input: CreateWorkItemInput): Promise<{ id: string }> {
    const result = await apiCreateWorkItem({
      title: input.title.trim(),
      summary: input.summary?.trim() || null,
      status: input.status,
      projectId: input.linkedProjectId || null,
    });
    return { id: result.workItem.id };
  },
};

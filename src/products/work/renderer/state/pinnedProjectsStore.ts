import { useMemo } from "react";

import {
  createWorkProject,
  removeWorkProject,
  type CoreProjectStatus,
} from "../api/workRecords.js";
import type { WorkGraphObjectSummary } from "../components/topdown/types";
import { triggerWorkGraphRefresh, useWorkGraph } from "./workGraphStore";

const STORAGE_KEY_UNPINNED = "cats-work:unpinned-projects";

const unpinned = new Set<string>(loadStringSet(STORAGE_KEY_UNPINNED));
const listeners = new Set<() => void>();

function loadStringSet(key: string): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function saveStringSet(key: string, set: Set<string>): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify([...set]));
  } catch {
    // ignore
  }
}

function notify(): void {
  for (const l of listeners) l();
}

export interface PinnedProjectsSnapshot {
  allProjects: readonly WorkGraphObjectSummary[];
  pinnedIds: ReadonlySet<string>;
  deletedIds: ReadonlySet<string>;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
}

export interface CreateProjectInput {
  title: string;
  summary?: string | null;
  status?: CoreProjectStatus;
  ownerRole?: string | null;
  nextAction?: string | null;
}

export const pinnedProjectsStore = {
  isPinned(id: string): boolean {
    return !unpinned.has(id);
  },
  pin(id: string): void {
    if (!unpinned.has(id)) return;
    unpinned.delete(id);
    saveStringSet(STORAGE_KEY_UNPINNED, unpinned);
    notify();
  },
  unpin(id: string): void {
    if (unpinned.has(id)) return;
    unpinned.add(id);
    saveStringSet(STORAGE_KEY_UNPINNED, unpinned);
    notify();
  },
  async remove(id: string): Promise<void> {
    await removeWorkProject(id);
    await triggerWorkGraphRefresh();
  },
  async createProject(input: CreateProjectInput): Promise<WorkGraphObjectSummary> {
    const result = await createWorkProject({
      title: input.title.trim(),
      summary: input.summary?.trim() || null,
      status: input.status,
    });
    await triggerWorkGraphRefresh();
    return {
      id: result.project.id,
      kind: "project",
      structuralLayer: "planning",
      sourceRecordFamily: "project",
      sourceRecordId: result.project.id,
      title: result.project.title,
      status: result.project.status,
      summary: result.project.summary,
      attention: "none",
      ownerRole: null,
      nextAction: null,
      linkedConversationId: result.project.primaryConversationId,
      linkedProjectId: null,
      linkedWorkItemId: null,
      linkedTaskId: null,
      linkedRunId: null,
      updatedAt: result.project.updatedAt,
    };
  },
};

export function usePinnedProjects(): PinnedProjectsSnapshot {
  const { graph, status, error } = useWorkGraph();
  return useMemo(() => {
    const allProjects = graph.objects.filter(
      (obj): obj is WorkGraphObjectSummary => obj.kind === "project",
    );
    const pinnedIds = new Set<string>();
    for (const project of allProjects) {
      if (unpinned.has(project.id)) continue;
      pinnedIds.add(project.id);
    }
    return {
      allProjects,
      pinnedIds,
      deletedIds: new Set<string>(),
      status,
      error,
    };
  }, [graph, status, error]);
}

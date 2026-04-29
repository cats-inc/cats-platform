import { useSyncExternalStore } from "react";

import { sharedQueryClient } from "../../../shared/renderer/queryClient.js";
import {
  createWorkProject,
  removeWorkProject,
  type CoreProjectStatus,
} from "../api/workRecords.js";
import { PROJECTS_QUERY_KEY } from "./queries/projectsQuery.js";

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

let pinSnapshot: ReadonlySet<string> = readPinnedSnapshot();

function readPinnedSnapshot(): ReadonlySet<string> {
  return new Set<string>(unpinned);
}

function refreshSnapshot(): void {
  pinSnapshot = readPinnedSnapshot();
  notify();
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
    refreshSnapshot();
  },
  unpin(id: string): void {
    if (unpinned.has(id)) return;
    unpinned.add(id);
    saveStringSet(STORAGE_KEY_UNPINNED, unpinned);
    refreshSnapshot();
  },
  async remove(id: string): Promise<void> {
    await removeWorkProject(id);
    await sharedQueryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
  },
  async createProject(input: CreateProjectInput): Promise<{ id: string }> {
    // The dialog wraps this call in useMutation; its onSuccess
    // invalidates the projects query, so we don't double-invalidate
    // here. `remove` keeps the call inline because it has no
    // useMutation wrapper (it's invoked from a Sidebar overflow menu).
    const result = await createWorkProject({
      title: input.title.trim(),
      summary: input.summary?.trim() || null,
      status: input.status,
    });
    return { id: result.project.id };
  },
};

/**
 * Subscribe to localStorage-backed unpinned-set changes. Returns a Set of
 * project ids the user has explicitly unpinned. A project is pinned iff
 * its id is NOT in this set; pin defaults to true for unknown ids.
 */
export function useUnpinnedIds(): ReadonlySet<string> {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => pinSnapshot,
    () => pinSnapshot,
  );
}

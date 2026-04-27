import { useSyncExternalStore } from "react";

import { MOCK_WORK_GRAPH } from "../components/topdown/mock";
import type { WorkGraphObjectSummary } from "../components/topdown/types";

const STORAGE_KEY_DELETED = "cats-work:deleted-projects";
const STORAGE_KEY_UNPINNED = "cats-work:unpinned-projects";
const STORAGE_KEY_CREATED = "cats-work:created-projects";

const unpinned = new Set<string>(loadStringSet(STORAGE_KEY_UNPINNED));
const deleted = new Set<string>(loadStringSet(STORAGE_KEY_DELETED));
const createdProjects: WorkGraphObjectSummary[] = loadCreatedProjects();
const listeners = new Set<() => void>();
let snapshotVersion = 0;
let cachedSnapshot: PinnedProjectsSnapshot | null = null;

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
    // ignore storage errors (private mode, quota, etc.)
  }
}

function loadCreatedProjects(): WorkGraphObjectSummary[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY_CREATED);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as WorkGraphObjectSummary[];
  } catch {
    return [];
  }
}

function saveCreatedProjects(): void {
  try {
    globalThis.localStorage?.setItem(
      STORAGE_KEY_CREATED,
      JSON.stringify(createdProjects),
    );
  } catch {
    // ignore
  }
}

function notify(): void {
  snapshotVersion += 1;
  cachedSnapshot = null;
  for (const l of listeners) l();
}

export interface PinnedProjectsSnapshot {
  version: number;
  allProjects: readonly WorkGraphObjectSummary[];
  pinnedIds: ReadonlySet<string>;
  deletedIds: ReadonlySet<string>;
}

function buildSnapshot(): PinnedProjectsSnapshot {
  if (cachedSnapshot) return cachedSnapshot;
  const mockProjects = MOCK_WORK_GRAPH.objects.filter(
    (obj): obj is WorkGraphObjectSummary => obj.kind === "project",
  );
  const allProjects = [...mockProjects, ...createdProjects];
  const pinnedIds = new Set<string>();
  for (const project of allProjects) {
    if (deleted.has(project.id)) continue;
    if (unpinned.has(project.id)) continue;
    pinnedIds.add(project.id);
  }
  cachedSnapshot = {
    version: snapshotVersion,
    allProjects,
    pinnedIds,
    deletedIds: new Set(deleted),
  };
  return cachedSnapshot;
}

export interface CreateProjectInput {
  title: string;
  summary?: string | null;
  status?: string;
  ownerRole?: string | null;
  nextAction?: string | null;
}

function generateProjectId(): string {
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `proj-${stamp}-${random}`;
}

export const pinnedProjectsStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot(): PinnedProjectsSnapshot {
    return buildSnapshot();
  },
  isPinned(id: string): boolean {
    return !unpinned.has(id) && !deleted.has(id);
  },
  isDeleted(id: string): boolean {
    return deleted.has(id);
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
  remove(id: string): void {
    if (deleted.has(id)) return;
    deleted.add(id);
    saveStringSet(STORAGE_KEY_DELETED, deleted);
    notify();
  },
  createProject(input: CreateProjectInput): WorkGraphObjectSummary {
    const now = new Date().toISOString();
    const project: WorkGraphObjectSummary = {
      id: generateProjectId(),
      kind: "project",
      structuralLayer: "planning",
      title: input.title.trim(),
      status: input.status ?? "planned",
      summary: input.summary?.trim() || null,
      attention: "none",
      ownerRole: input.ownerRole?.trim() || null,
      nextAction: input.nextAction?.trim() || null,
      linkedConversationId: null,
      linkedProjectId: null,
      linkedWorkItemId: null,
      linkedTaskId: null,
      linkedRunId: null,
      updatedAt: now,
    };
    createdProjects.push(project);
    saveCreatedProjects();
    notify();
    return project;
  },
};

export function usePinnedProjects(): PinnedProjectsSnapshot {
  return useSyncExternalStore(
    pinnedProjectsStore.subscribe,
    pinnedProjectsStore.getSnapshot,
    pinnedProjectsStore.getSnapshot,
  );
}

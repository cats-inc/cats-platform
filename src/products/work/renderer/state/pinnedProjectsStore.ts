import { useEffect, useSyncExternalStore } from "react";

import {
  createWorkProject,
  listWorkProjects,
  removeWorkProject,
  type CoreProjectRecord,
  type CoreProjectStatus,
} from "../api/workRecords.js";
import { MOCK_WORK_GRAPH } from "../components/topdown/mock";
import type { WorkGraphObjectSummary } from "../components/topdown/types";

const STORAGE_KEY_DELETED = "cats-work:deleted-projects";
const STORAGE_KEY_UNPINNED = "cats-work:unpinned-projects";

type FetchStatus = "idle" | "loading" | "ready" | "error";

const unpinned = new Set<string>(loadStringSet(STORAGE_KEY_UNPINNED));
const rendererHidden = new Set<string>(loadStringSet(STORAGE_KEY_DELETED));

let coreProjects: WorkGraphObjectSummary[] = [];
let fetchStatus: FetchStatus = "idle";
let fetchError: string | null = null;
let inflight: Promise<void> | null = null;

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
  status: FetchStatus;
  error: string | null;
}

function projectRecordToSummary(p: CoreProjectRecord): WorkGraphObjectSummary {
  return {
    id: p.id,
    kind: "project",
    structuralLayer: "planning",
    sourceRecordFamily: "project",
    sourceRecordId: p.id,
    title: p.title,
    status: p.status,
    summary: p.summary,
    attention: "none",
    ownerRole: null,
    nextAction: null,
    linkedConversationId: p.primaryConversationId,
    linkedProjectId: null,
    linkedWorkItemId: null,
    linkedTaskId: null,
    linkedRunId: null,
    updatedAt: p.updatedAt,
  };
}

function buildSnapshot(): PinnedProjectsSnapshot {
  if (cachedSnapshot) return cachedSnapshot;
  const mockProjects = MOCK_WORK_GRAPH.objects.filter(
    (obj): obj is WorkGraphObjectSummary => obj.kind === "project",
  );
  // Core wins on id collision (post-migration source of truth).
  const byId = new Map<string, WorkGraphObjectSummary>();
  for (const project of mockProjects) byId.set(project.id, project);
  for (const project of coreProjects) byId.set(project.id, project);
  const allProjects = Array.from(byId.values());

  const pinnedIds = new Set<string>();
  for (const project of allProjects) {
    if (rendererHidden.has(project.id)) continue;
    if (unpinned.has(project.id)) continue;
    pinnedIds.add(project.id);
  }
  cachedSnapshot = {
    version: snapshotVersion,
    allProjects,
    pinnedIds,
    deletedIds: new Set(rendererHidden),
    status: fetchStatus,
    error: fetchError,
  };
  return cachedSnapshot;
}

async function fetchOnce(): Promise<void> {
  if (inflight) return inflight;
  fetchStatus = "loading";
  fetchError = null;
  notify();
  inflight = (async () => {
    try {
      const records = await listWorkProjects();
      coreProjects = records.map(projectRecordToSummary);
      fetchStatus = "ready";
      fetchError = null;
    } catch (err) {
      fetchStatus = "error";
      fetchError = err instanceof Error ? err.message : "Failed to load projects.";
    } finally {
      inflight = null;
      notify();
    }
  })();
  return inflight;
}

export interface CreateProjectInput {
  title: string;
  summary?: string | null;
  status?: CoreProjectStatus;
  ownerRole?: string | null;
  nextAction?: string | null;
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
  refresh(): Promise<void> {
    fetchStatus = "idle";
    notify();
    return fetchOnce();
  },
  isPinned(id: string): boolean {
    return !unpinned.has(id) && !rendererHidden.has(id);
  },
  isDeleted(id: string): boolean {
    return rendererHidden.has(id);
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
    if (rendererHidden.has(id)) return;
    const isCoreRecord = coreProjects.some((p) => p.id === id);
    if (isCoreRecord) {
      try {
        await removeWorkProject(id);
        coreProjects = coreProjects.filter((p) => p.id !== id);
      } catch {
        // If the server delete failed, fall back to renderer-side hide
        // so the UI still feels responsive.
        rendererHidden.add(id);
        saveStringSet(STORAGE_KEY_DELETED, rendererHidden);
      }
    } else {
      // Mock-seeded record — hide via renderer-only set.
      rendererHidden.add(id);
      saveStringSet(STORAGE_KEY_DELETED, rendererHidden);
    }
    notify();
  },
  async createProject(input: CreateProjectInput): Promise<WorkGraphObjectSummary> {
    const result = await createWorkProject({
      title: input.title.trim(),
      summary: input.summary?.trim() || null,
      status: input.status,
    });
    const summary = projectRecordToSummary(result.project);
    coreProjects = [...coreProjects.filter((p) => p.id !== summary.id), summary];
    notify();
    return summary;
  },
};

export function usePinnedProjects(): PinnedProjectsSnapshot {
  const snapshot = useSyncExternalStore(
    pinnedProjectsStore.subscribe,
    pinnedProjectsStore.getSnapshot,
    pinnedProjectsStore.getSnapshot,
  );
  useEffect(() => {
    if (snapshot.status === "idle") {
      void fetchOnce();
    }
  }, [snapshot.status]);
  return snapshot;
}

/** Test-only escape hatch — resets the singleton state. */
export function __resetPinnedProjectsStoreForTest(): void {
  coreProjects = [];
  fetchStatus = "idle";
  fetchError = null;
  inflight = null;
  rendererHidden.clear();
  unpinned.clear();
  notify();
}

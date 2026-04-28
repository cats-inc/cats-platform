import { useEffect, useSyncExternalStore } from "react";

import {
  createWorkItem as apiCreateWorkItem,
  listWorkItems,
  removeWorkItem as apiRemoveWorkItem,
  type CoreWorkItemRecord,
  type CoreWorkItemStatus,
} from "../api/workRecords.js";
import { MOCK_WORK_GRAPH } from "../components/topdown/mock";
import type { WorkGraphObjectSummary } from "../components/topdown/types";

const STORAGE_KEY_DELETED = "cats-work:deleted-work-items";

type FetchStatus = "idle" | "loading" | "ready" | "error";

const rendererHidden = new Set<string>(loadStringSet(STORAGE_KEY_DELETED));
let coreWorkItems: WorkGraphObjectSummary[] = [];
let fetchStatus: FetchStatus = "idle";
let fetchError: string | null = null;
let inflight: Promise<void> | null = null;

const listeners = new Set<() => void>();
let snapshotVersion = 0;
let cachedSnapshot: WorkItemsSnapshot | null = null;

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

export interface WorkItemsSnapshot {
  version: number;
  allWorkItems: readonly WorkGraphObjectSummary[];
  deletedIds: ReadonlySet<string>;
  status: FetchStatus;
  error: string | null;
}

function workItemRecordToSummary(w: CoreWorkItemRecord): WorkGraphObjectSummary {
  return {
    id: w.id,
    kind: "work_item",
    structuralLayer: "planning",
    sourceRecordFamily: "work_item",
    sourceRecordId: w.id,
    title: w.title,
    status: w.status,
    summary: w.summary,
    attention: "none",
    ownerRole: null,
    nextAction: null,
    linkedConversationId: w.conversationId,
    linkedProjectId: w.projectId,
    linkedWorkItemId: w.parentWorkItemId,
    linkedTaskId: w.taskId,
    linkedRunId: null,
    updatedAt: w.updatedAt,
  };
}

function buildSnapshot(): WorkItemsSnapshot {
  if (cachedSnapshot) return cachedSnapshot;
  const mockWorkItems = MOCK_WORK_GRAPH.objects.filter(
    (obj): obj is WorkGraphObjectSummary => obj.kind === "work_item",
  );
  const byId = new Map<string, WorkGraphObjectSummary>();
  for (const wi of mockWorkItems) byId.set(wi.id, wi);
  for (const wi of coreWorkItems) byId.set(wi.id, wi);
  cachedSnapshot = {
    version: snapshotVersion,
    allWorkItems: Array.from(byId.values()),
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
      const records = await listWorkItems();
      coreWorkItems = records.map(workItemRecordToSummary);
      fetchStatus = "ready";
      fetchError = null;
    } catch (err) {
      fetchStatus = "error";
      fetchError = err instanceof Error ? err.message : "Failed to load work items.";
    } finally {
      inflight = null;
      notify();
    }
  })();
  return inflight;
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
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot(): WorkItemsSnapshot {
    return buildSnapshot();
  },
  refresh(): Promise<void> {
    fetchStatus = "idle";
    notify();
    return fetchOnce();
  },
  isDeleted(id: string): boolean {
    return rendererHidden.has(id);
  },
  async remove(id: string): Promise<void> {
    if (rendererHidden.has(id)) return;
    const isCoreRecord = coreWorkItems.some((w) => w.id === id);
    if (isCoreRecord) {
      try {
        await apiRemoveWorkItem(id);
        coreWorkItems = coreWorkItems.filter((w) => w.id !== id);
      } catch {
        rendererHidden.add(id);
        saveStringSet(STORAGE_KEY_DELETED, rendererHidden);
      }
    } else {
      rendererHidden.add(id);
      saveStringSet(STORAGE_KEY_DELETED, rendererHidden);
    }
    notify();
  },
  async createWorkItem(input: CreateWorkItemInput): Promise<WorkGraphObjectSummary> {
    const result = await apiCreateWorkItem({
      title: input.title.trim(),
      summary: input.summary?.trim() || null,
      status: input.status,
      projectId: input.linkedProjectId || null,
    });
    const summary = workItemRecordToSummary(result.workItem);
    coreWorkItems = [...coreWorkItems.filter((w) => w.id !== summary.id), summary];
    notify();
    return summary;
  },
};

export function useWorkItems(): WorkItemsSnapshot {
  const snapshot = useSyncExternalStore(
    workItemsStore.subscribe,
    workItemsStore.getSnapshot,
    workItemsStore.getSnapshot,
  );
  useEffect(() => {
    if (snapshot.status === "idle") {
      void fetchOnce();
    }
  }, [snapshot.status]);
  return snapshot;
}

/** Test-only escape hatch — resets the singleton state. */
export function __resetWorkItemsStoreForTest(): void {
  coreWorkItems = [];
  fetchStatus = "idle";
  fetchError = null;
  inflight = null;
  rendererHidden.clear();
  notify();
}

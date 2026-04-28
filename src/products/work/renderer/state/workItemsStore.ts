import { useSyncExternalStore } from "react";

import { MOCK_WORK_GRAPH } from "../components/topdown/mock";
import type { WorkGraphObjectSummary } from "../components/topdown/types";

const STORAGE_KEY_DELETED = "cats-work:deleted-work-items";
const STORAGE_KEY_CREATED = "cats-work:created-work-items";

const deleted = new Set<string>(loadStringSet(STORAGE_KEY_DELETED));
const createdWorkItems: WorkGraphObjectSummary[] = loadCreatedWorkItems();
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

function loadCreatedWorkItems(): WorkGraphObjectSummary[] {
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

function saveCreatedWorkItems(): void {
  try {
    globalThis.localStorage?.setItem(
      STORAGE_KEY_CREATED,
      JSON.stringify(createdWorkItems),
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

export interface WorkItemsSnapshot {
  version: number;
  allWorkItems: readonly WorkGraphObjectSummary[];
  deletedIds: ReadonlySet<string>;
}

function buildSnapshot(): WorkItemsSnapshot {
  if (cachedSnapshot) return cachedSnapshot;
  const mockWorkItems = MOCK_WORK_GRAPH.objects.filter(
    (obj): obj is WorkGraphObjectSummary => obj.kind === "work_item",
  );
  cachedSnapshot = {
    version: snapshotVersion,
    allWorkItems: [...mockWorkItems, ...createdWorkItems],
    deletedIds: new Set(deleted),
  };
  return cachedSnapshot;
}

export interface CreateWorkItemInput {
  title: string;
  summary?: string | null;
  status?: string;
  ownerRole?: string | null;
  nextAction?: string | null;
  linkedProjectId?: string | null;
}

function generateWorkItemId(): string {
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `wi-${stamp}-${random}`;
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
  isDeleted(id: string): boolean {
    return deleted.has(id);
  },
  remove(id: string): void {
    if (deleted.has(id)) return;
    deleted.add(id);
    saveStringSet(STORAGE_KEY_DELETED, deleted);
    notify();
  },
  createWorkItem(input: CreateWorkItemInput): WorkGraphObjectSummary {
    const now = new Date().toISOString();
    const id = generateWorkItemId();
    const workItem: WorkGraphObjectSummary = {
      id,
      kind: "work_item",
      structuralLayer: "planning",
      sourceRecordFamily: "work_item",
      sourceRecordId: id,
      title: input.title.trim(),
      status: input.status ?? "planned",
      summary: input.summary?.trim() || null,
      attention: "none",
      ownerRole: input.ownerRole?.trim() || null,
      nextAction: input.nextAction?.trim() || null,
      linkedConversationId: null,
      linkedProjectId: input.linkedProjectId || null,
      linkedWorkItemId: null,
      linkedTaskId: null,
      linkedRunId: null,
      updatedAt: now,
    };
    createdWorkItems.push(workItem);
    saveCreatedWorkItems();
    notify();
    return workItem;
  },
};

export function useWorkItems(): WorkItemsSnapshot {
  return useSyncExternalStore(
    workItemsStore.subscribe,
    workItemsStore.getSnapshot,
    workItemsStore.getSnapshot,
  );
}

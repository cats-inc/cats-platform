import { useSyncExternalStore } from "react";

import { MOCK_WORK_GRAPH } from "../components/topdown/mock";

const STORAGE_KEY_DELETED = "cats-work:deleted-projects";
const STORAGE_KEY_UNPINNED = "cats-work:unpinned-projects";

const unpinned = new Set<string>(loadFromStorage(STORAGE_KEY_UNPINNED));
const deleted = new Set<string>(loadFromStorage(STORAGE_KEY_DELETED));
const listeners = new Set<() => void>();
let snapshotVersion = 0;

function loadFromStorage(key: string): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function saveToStorage(key: string, set: Set<string>): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify([...set]));
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }
}

function notify(): void {
  snapshotVersion += 1;
  cachedSnapshot = null;
  for (const l of listeners) l();
}

export interface PinnedProjectsSnapshot {
  version: number;
  pinnedIds: ReadonlySet<string>;
  deletedIds: ReadonlySet<string>;
}

let cachedSnapshot: PinnedProjectsSnapshot | null = null;

function buildSnapshot(): PinnedProjectsSnapshot {
  if (cachedSnapshot) return cachedSnapshot;
  const pinnedIds = new Set<string>();
  for (const obj of MOCK_WORK_GRAPH.objects) {
    if (obj.kind !== "project") continue;
    if (deleted.has(obj.id)) continue;
    if (unpinned.has(obj.id)) continue;
    pinnedIds.add(obj.id);
  }
  cachedSnapshot = {
    version: snapshotVersion,
    pinnedIds,
    deletedIds: new Set(deleted),
  };
  return cachedSnapshot;
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
    saveToStorage(STORAGE_KEY_UNPINNED, unpinned);
    notify();
  },
  unpin(id: string): void {
    if (unpinned.has(id)) return;
    unpinned.add(id);
    saveToStorage(STORAGE_KEY_UNPINNED, unpinned);
    notify();
  },
  remove(id: string): void {
    if (deleted.has(id)) return;
    deleted.add(id);
    saveToStorage(STORAGE_KEY_DELETED, deleted);
    notify();
  },
};

export function usePinnedProjects(): PinnedProjectsSnapshot {
  return useSyncExternalStore(
    pinnedProjectsStore.subscribe,
    pinnedProjectsStore.getSnapshot,
    pinnedProjectsStore.getSnapshot,
  );
}

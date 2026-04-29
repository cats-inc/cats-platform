import { useSyncExternalStore } from "react";

const STORAGE_KEY = "cats-work:unpinned-projects";

const unpinned = new Set<string>(loadIds());
const listeners = new Set<() => void>();

let snapshot: ReadonlySet<string> = readSnapshot();

function loadIds(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function persist(): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify([...unpinned]));
  } catch {
    // ignore — pin preference is best-effort.
  }
}

function readSnapshot(): ReadonlySet<string> {
  return new Set<string>(unpinned);
}

function refresh(): void {
  snapshot = readSnapshot();
  for (const listener of listeners) listener();
}

/** Mark a project's id as unpinned (pin defaults to true for unknown ids). */
export function unpinProject(id: string): void {
  if (unpinned.has(id)) return;
  unpinned.add(id);
  persist();
  refresh();
}

/**
 * Subscribe to the unpinned-id set. A project is pinned iff its id is
 * NOT in this set; pin defaults to true so newly created projects are
 * pinned without any localStorage write.
 */
export function useUnpinnedProjectIds(): ReadonlySet<string> {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => snapshot,
    () => snapshot,
  );
}

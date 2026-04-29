import { useEffect, useSyncExternalStore } from 'react';

import {
  fetchCodeWorkspaces,
  type CodeWorkspaceListItemSummary,
} from '../api/codeTask.js';

const listeners = new Set<() => void>();

export interface CodeWorkspacesSnapshot {
  workspaces: readonly CodeWorkspaceListItemSummary[];
  pinnedIds: ReadonlySet<string>;
  loading: boolean;
  error: string | null;
}

const EMPTY_CODE_WORKSPACES_SNAPSHOT: CodeWorkspacesSnapshot = Object.freeze({
  workspaces: Object.freeze([]) as readonly CodeWorkspaceListItemSummary[],
  pinnedIds: new Set<string>() as ReadonlySet<string>,
  loading: false,
  error: null,
}) as CodeWorkspacesSnapshot;

export function createEmptyCodeWorkspacesSnapshot(): CodeWorkspacesSnapshot {
  return EMPTY_CODE_WORKSPACES_SNAPSHOT;
}

let currentWorkspaces: readonly CodeWorkspaceListItemSummary[] = [];
let loading = false;
let error: string | null = null;
let cachedSnapshot: CodeWorkspacesSnapshot | null = null;
let refreshPromise: Promise<void> | null = null;

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function rebuildSnapshot(): CodeWorkspacesSnapshot {
  return {
    workspaces: currentWorkspaces,
    pinnedIds: new Set(currentWorkspaces.map((workspace) => workspace.id)),
    loading,
    error,
  };
}

function getSnapshot(): CodeWorkspacesSnapshot {
  if (!cachedSnapshot) {
    cachedSnapshot = rebuildSnapshot();
  }
  return cachedSnapshot;
}

function invalidate(): void {
  cachedSnapshot = null;
  notify();
}

export function refreshCodeWorkspaces(): Promise<void> {
  if (refreshPromise) {
    return refreshPromise;
  }

  loading = true;
  error = null;
  invalidate();

  refreshPromise = fetchCodeWorkspaces()
    .then((payload) => {
      currentWorkspaces = payload.workspaces;
      error = null;
    })
    .catch((fetchError: unknown) => {
      error = fetchError instanceof Error
        ? fetchError.message
        : 'Failed to load codespaces.';
    })
    .finally(() => {
      loading = false;
      refreshPromise = null;
      invalidate();
    });

  return refreshPromise;
}

export function useCodeWorkspaces(): CodeWorkspacesSnapshot {
  const snapshot = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    getSnapshot,
    getSnapshot,
  );

  useEffect(() => {
    void refreshCodeWorkspaces();
  }, []);

  return snapshot;
}

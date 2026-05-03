import { useEffect, useSyncExternalStore } from 'react';

import {
  createTranslator,
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../../shared/i18n/index.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import {
  fetchCodeWorkspaces,
  type CodeWorkspaceListItemSummary,
} from '../api/codeTask.js';

const listeners = new Set<() => void>();
const defaultCodeWorkspacesTranslator = createTranslator('en');

type CodeWorkspacesTranslator = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

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

export function refreshCodeWorkspaces(options: {
  t?: CodeWorkspacesTranslator;
} = {}): Promise<void> {
  if (refreshPromise) {
    return refreshPromise;
  }

  const t = options.t ?? defaultCodeWorkspacesTranslator;
  loading = true;
  error = null;
  invalidate();

  refreshPromise = fetchCodeWorkspaces(t(messageKeys.codeWorkspacesLoadError))
    .then((payload) => {
      currentWorkspaces = payload.workspaces;
      error = null;
    })
    .catch((fetchError: unknown) => {
      error = fetchError instanceof Error
        ? fetchError.message
        : t(messageKeys.codeWorkspacesLoadError);
    })
    .finally(() => {
      loading = false;
      refreshPromise = null;
      invalidate();
    });

  return refreshPromise;
}

export function useCodeWorkspaces(): CodeWorkspacesSnapshot {
  const { t } = useI18n();
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
    void refreshCodeWorkspaces({ t });
  }, [t]);

  return snapshot;
}

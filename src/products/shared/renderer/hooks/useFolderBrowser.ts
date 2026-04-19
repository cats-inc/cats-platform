import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  browseDirectories,
  type BrowseDirectoryEntry,
  updateFolderBrowsePreference,
} from '../api/index.js';
import {
  browseFolderWithHomeFallback,
  normalizeFolderBrowsePreferences,
  readFolderBrowseRememberedPath,
  writeFolderBrowseRememberedPath,
  type FolderBrowsePreferenceScope,
  type FolderBrowsePreferenceSurface,
  type FolderBrowsePreferences,
} from '../../folderBrowsePreferences.js';

const FOLDER_BROWSE_PERSIST_DELAY_MS = 300;

interface ScopedPathEntry {
  scope: FolderBrowsePreferenceScope;
  path: string | null;
}

function scopeKey(scope: FolderBrowsePreferenceScope): string {
  return scope.surface === 'chat' && scope.directLaneCatId
    ? `chat:${scope.directLaneCatId}`
    : scope.surface;
}

export function useFolderBrowser(options: {
  onSelectPath: (path: string) => void;
  surface: FolderBrowsePreferenceSurface;
  directLaneCatId?: string | null;
  initialPreferences?: FolderBrowsePreferences | null;
}) {
  const {
    onSelectPath,
    surface,
    directLaneCatId = null,
  } = options;
  const [folderBrowsePath, setFolderBrowsePath] = useState('');
  const [folderBrowseCurrentPath, setFolderBrowseCurrentPath] = useState('');
  const [folderBrowseParentPath, setFolderBrowseParentPath] = useState('');
  const [folderBrowseEntries, setFolderBrowseEntries] = useState<BrowseDirectoryEntry[]>([]);
  const [folderBrowseLoading, setFolderBrowseLoading] = useState(false);
  const [folderBrowseError, setFolderBrowseError] = useState('');
  const preferencesRef = useRef<FolderBrowsePreferences>(
    normalizeFolderBrowsePreferences(options.initialPreferences),
  );
  // Each entry carries the scope it was recorded under, so later scope changes
  // (surface / directLaneCatId) cannot misroute a PATCH to another cat's lane.
  const pendingWritesRef = useRef<Map<string, ScopedPathEntry>>(new Map());
  const inflightWritesRef = useRef<Map<string, ScopedPathEntry>>(new Map());
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const overlayOptimisticPaths = useCallback(
    (base: FolderBrowsePreferences): FolderBrowsePreferences => {
      let next = base;
      for (const entry of inflightWritesRef.current.values()) {
        next = writeFolderBrowseRememberedPath(next, entry.scope, entry.path);
      }
      for (const entry of pendingWritesRef.current.values()) {
        next = writeFolderBrowseRememberedPath(next, entry.scope, entry.path);
      }
      return next;
    },
    [],
  );

  useEffect(() => {
    const normalized = normalizeFolderBrowsePreferences(options.initialPreferences);
    preferencesRef.current = overlayOptimisticPaths(normalized);
  }, [options.initialPreferences, overlayOptimisticPaths]);

  const flushPendingWrites = useCallback((): void => {
    for (const [key, entry] of pendingWritesRef.current) {
      if (inflightWritesRef.current.has(key)) {
        continue;
      }
      pendingWritesRef.current.delete(key);
      inflightWritesRef.current.set(key, entry);
      updateFolderBrowsePreference({
        surface: entry.scope.surface,
        directLaneCatId: entry.scope.directLaneCatId ?? null,
        path: entry.path,
      })
        .catch(() => {})
        .finally(() => {
          if (inflightWritesRef.current.get(key) === entry) {
            inflightWritesRef.current.delete(key);
          }
          if (pendingWritesRef.current.has(key)) {
            flushPendingWrites();
          }
        });
    }
  }, []);

  const scheduleFlush = useCallback((immediate: boolean) => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    if (immediate) {
      flushPendingWrites();
      return;
    }
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      flushPendingWrites();
    }, FOLDER_BROWSE_PERSIST_DELAY_MS);
  }, [flushPendingWrites]);

  const rememberPath = useCallback((path: string | null, immediate = false) => {
    const scope: FolderBrowsePreferenceScope = { surface, directLaneCatId };
    const key = scopeKey(scope);
    const currentPath = readFolderBrowseRememberedPath(preferencesRef.current, scope);
    const hasPending = pendingWritesRef.current.has(key);

    if (currentPath === path && !hasPending) {
      return;
    }

    preferencesRef.current = writeFolderBrowseRememberedPath(
      preferencesRef.current,
      scope,
      path,
    );
    pendingWritesRef.current.set(key, { scope, path });
    scheduleFlush(immediate);
  }, [directLaneCatId, scheduleFlush, surface]);

  useEffect(() => () => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    flushPendingWrites();
  }, [flushPendingWrites]);

  const browseFolder = useCallback(async (targetPath?: string): Promise<void> => {
    setFolderBrowseLoading(true);
    setFolderBrowseError('');
    try {
      const result = await browseDirectories(targetPath);
      setFolderBrowseCurrentPath(result.current);
      setFolderBrowseParentPath(result.parent);
      setFolderBrowsePath(result.current);
      setFolderBrowseEntries(result.entries);
      setFolderBrowseError(result.error ?? '');
      if (!result.error) {
        rememberPath(result.current);
      }
    } catch (error) {
      setFolderBrowseError(error instanceof Error ? error.message : 'Failed to load folders.');
      setFolderBrowseEntries([]);
      if (targetPath) {
        setFolderBrowsePath(targetPath);
      }
    } finally {
      setFolderBrowseLoading(false);
    }
  }, [rememberPath]);

  const openFolderBrowser = useCallback(async (targetPath?: string | null): Promise<void> => {
    const rememberedPath = readFolderBrowseRememberedPath(preferencesRef.current, {
      surface,
      directLaneCatId,
    });
    const initialPath = targetPath?.trim() ? targetPath : rememberedPath;
    setFolderBrowseLoading(true);
    setFolderBrowseError('');
    setFolderBrowsePath(initialPath ?? '');
    try {
      const result = await browseFolderWithHomeFallback({
        browse: browseDirectories,
        requestedPath: targetPath ?? null,
        rememberedPath,
      });
      setFolderBrowseCurrentPath(result.current);
      setFolderBrowseParentPath(result.parent);
      setFolderBrowsePath(result.current);
      setFolderBrowseEntries(result.entries);
      setFolderBrowseError(result.error ?? '');
      if (!result.error) {
        rememberPath(result.current);
      }
    } catch (error) {
      setFolderBrowseError(error instanceof Error ? error.message : 'Failed to load folders.');
      setFolderBrowseEntries([]);
    } finally {
      setFolderBrowseLoading(false);
    }
  }, [directLaneCatId, rememberPath, surface]);

  const selectCurrentFolder = useCallback(() => {
    if (!folderBrowseCurrentPath || folderBrowseError) {
      return;
    }

    rememberPath(folderBrowseCurrentPath, true);
    onSelectPath(folderBrowseCurrentPath);
  }, [folderBrowseCurrentPath, folderBrowseError, onSelectPath, rememberPath]);

  return {
    browseFolder,
    folderBrowseCurrentPath,
    folderBrowseEntries,
    folderBrowseError,
    folderBrowseLoading,
    folderBrowseParentPath,
    folderBrowsePath,
    openFolderBrowser,
    selectCurrentFolder,
    setFolderBrowsePath,
  };
}

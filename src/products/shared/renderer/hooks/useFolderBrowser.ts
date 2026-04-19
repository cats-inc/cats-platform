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
  type FolderBrowsePreferenceSurface,
  type FolderBrowsePreferences,
} from '../../folderBrowsePreferences.js';

const FOLDER_BROWSE_PERSIST_DELAY_MS = 300;
const NO_PENDING_REMEMBER_PATH = Symbol('NO_PENDING_REMEMBER_PATH');

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
  const pendingRememberPathRef =
    useRef<string | null | typeof NO_PENDING_REMEMBER_PATH>(NO_PENDING_REMEMBER_PATH);
  const inflightRememberPathRef =
    useRef<string | null | typeof NO_PENDING_REMEMBER_PATH>(NO_PENDING_REMEMBER_PATH);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistRequestRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const scope = { surface, directLaneCatId };
    const normalized = normalizeFolderBrowsePreferences(options.initialPreferences);
    const optimisticPath =
      pendingRememberPathRef.current !== NO_PENDING_REMEMBER_PATH
        ? pendingRememberPathRef.current
        : inflightRememberPathRef.current;
    preferencesRef.current =
      optimisticPath === NO_PENDING_REMEMBER_PATH
        ? normalized
        : writeFolderBrowseRememberedPath(normalized, scope, optimisticPath);
  }, [directLaneCatId, options.initialPreferences, surface]);

  const flushRememberPath = useCallback((): Promise<void> => {
    if (persistRequestRef.current) {
      return persistRequestRef.current;
    }
    if (pendingRememberPathRef.current === NO_PENDING_REMEMBER_PATH) {
      return Promise.resolve();
    }

    const path = pendingRememberPathRef.current;
    pendingRememberPathRef.current = NO_PENDING_REMEMBER_PATH;
    inflightRememberPathRef.current = path;
    const request = updateFolderBrowsePreference({
      surface,
      directLaneCatId,
      path,
    })
      .then(() => {})
      .catch(() => {})
      .finally(() => {
        if (persistRequestRef.current === request) {
          persistRequestRef.current = null;
        }
        if (
          inflightRememberPathRef.current === path
          && pendingRememberPathRef.current === NO_PENDING_REMEMBER_PATH
        ) {
          inflightRememberPathRef.current = NO_PENDING_REMEMBER_PATH;
        }
        if (pendingRememberPathRef.current !== NO_PENDING_REMEMBER_PATH) {
          void flushRememberPath();
        }
      });
    persistRequestRef.current = request;
    return request;
  }, [directLaneCatId, surface]);

  const scheduleRememberPathPersist = useCallback((path: string | null, immediate: boolean) => {
    pendingRememberPathRef.current = path;
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    if (immediate) {
      void flushRememberPath();
      return;
    }

    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      void flushRememberPath();
    }, FOLDER_BROWSE_PERSIST_DELAY_MS);
  }, [flushRememberPath]);

  const rememberPath = useCallback((path: string | null, immediate = false) => {
    const scope = { surface, directLaneCatId };
    const currentPreferences = preferencesRef.current;
    const currentPath = readFolderBrowseRememberedPath(currentPreferences, scope);
    if (currentPath === path) {
      if (immediate && pendingRememberPathRef.current !== NO_PENDING_REMEMBER_PATH) {
        scheduleRememberPathPersist(path, true);
      }
      return;
    }

    preferencesRef.current = writeFolderBrowseRememberedPath(currentPreferences, scope, path);
    scheduleRememberPathPersist(path, immediate);
  }, [directLaneCatId, scheduleRememberPathPersist, surface]);

  useEffect(() => () => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    void flushRememberPath();
  }, [flushRememberPath]);

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

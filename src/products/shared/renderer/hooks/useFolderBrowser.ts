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
  type FolderBrowsePreferences,
} from '../../folderBrowsePreferences.js';

export function useFolderBrowser(options: {
  onSelectPath: (path: string) => void;
  scope: FolderBrowsePreferenceScope;
  initialPreferences?: FolderBrowsePreferences | null;
}) {
  const { onSelectPath, scope } = options;
  const [folderBrowsePath, setFolderBrowsePath] = useState('');
  const [folderBrowseCurrentPath, setFolderBrowseCurrentPath] = useState('');
  const [folderBrowseParentPath, setFolderBrowseParentPath] = useState('');
  const [folderBrowseEntries, setFolderBrowseEntries] = useState<BrowseDirectoryEntry[]>([]);
  const [folderBrowseLoading, setFolderBrowseLoading] = useState(false);
  const [folderBrowseError, setFolderBrowseError] = useState('');
  const [preferences, setPreferences] = useState<FolderBrowsePreferences>(
    () => normalizeFolderBrowsePreferences(options.initialPreferences),
  );
  const preferencesRef = useRef(preferences);
  const hydratedInitialPreferencesRef = useRef(options.initialPreferences !== undefined);

  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  useEffect(() => {
    if (hydratedInitialPreferencesRef.current || options.initialPreferences === undefined) {
      return;
    }
    const normalized = normalizeFolderBrowsePreferences(options.initialPreferences);
    hydratedInitialPreferencesRef.current = true;
    preferencesRef.current = normalized;
    setPreferences(normalized);
  }, [options.initialPreferences]);

  const rememberPath = useCallback((path: string | null) => {
    const currentPreferences = preferencesRef.current;
    const currentPath = readFolderBrowseRememberedPath(currentPreferences, scope);
    if (currentPath === path) {
      return;
    }

    const nextPreferences = writeFolderBrowseRememberedPath(currentPreferences, scope, path);
    preferencesRef.current = nextPreferences;
    setPreferences(nextPreferences);
    void updateFolderBrowsePreference({
      surface: scope.surface,
      directLaneCatId: scope.directLaneCatId ?? null,
      path,
    }).catch(() => {});
  }, [scope]);

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
    const rememberedPath = readFolderBrowseRememberedPath(preferencesRef.current, scope);
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
  }, [rememberPath, scope]);

  const selectCurrentFolder = useCallback(() => {
    if (!folderBrowseCurrentPath || folderBrowseError) {
      return;
    }

    rememberPath(folderBrowseCurrentPath);
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

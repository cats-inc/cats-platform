import {
  useCallback,
  useState,
} from 'react';

import {
  browseDirectories,
  type BrowseDirectoryEntry,
} from '../api';

export function useFolderBrowser(options: {
  onSelectPath: (path: string) => void;
}) {
  const { onSelectPath } = options;
  const [folderBrowsePath, setFolderBrowsePath] = useState('');
  const [folderBrowseCurrentPath, setFolderBrowseCurrentPath] = useState('');
  const [folderBrowseParentPath, setFolderBrowseParentPath] = useState('');
  const [folderBrowseEntries, setFolderBrowseEntries] = useState<BrowseDirectoryEntry[]>([]);
  const [folderBrowseLoading, setFolderBrowseLoading] = useState(false);
  const [folderBrowseError, setFolderBrowseError] = useState('');

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
    } catch (error) {
      setFolderBrowseError(error instanceof Error ? error.message : 'Failed to load folders.');
      setFolderBrowseEntries([]);
      if (targetPath) {
        setFolderBrowsePath(targetPath);
      }
    } finally {
      setFolderBrowseLoading(false);
    }
  }, []);

  const openFolderBrowser = useCallback(async (targetPath?: string | null): Promise<void> => {
    setFolderBrowsePath(targetPath ?? '');
    await browseFolder(targetPath ?? undefined);
  }, [browseFolder]);

  const selectCurrentFolder = useCallback(() => {
    if (!folderBrowseCurrentPath || folderBrowseError) {
      return;
    }

    onSelectPath(folderBrowseCurrentPath);
  }, [folderBrowseCurrentPath, folderBrowseError, onSelectPath]);

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

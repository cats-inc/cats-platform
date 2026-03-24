import {
  useCallback,
  useEffect,
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
  const [folderBrowserOpen, setFolderBrowserOpen] = useState(false);
  const [folderBrowsePath, setFolderBrowsePath] = useState('');
  const [folderBrowseCurrentPath, setFolderBrowseCurrentPath] = useState('');
  const [folderBrowseParentPath, setFolderBrowseParentPath] = useState('');
  const [folderBrowseEntries, setFolderBrowseEntries] = useState<BrowseDirectoryEntry[]>([]);
  const [folderBrowseLoading, setFolderBrowseLoading] = useState(false);
  const [folderBrowseError, setFolderBrowseError] = useState('');

  useEffect(() => {
    if (!folderBrowserOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setFolderBrowserOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown as never);
    return () => document.removeEventListener('keydown', handleKeyDown as never);
  }, [folderBrowserOpen]);

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
    setFolderBrowserOpen(true);
    await browseFolder(targetPath ?? undefined);
  }, [browseFolder]);

  const closeFolderBrowser = useCallback(() => {
    setFolderBrowserOpen(false);
    setFolderBrowseError('');
  }, []);

  const selectCurrentFolder = useCallback(() => {
    if (!folderBrowseCurrentPath || folderBrowseError) {
      return;
    }

    onSelectPath(folderBrowseCurrentPath);
    setFolderBrowserOpen(false);
  }, [folderBrowseCurrentPath, folderBrowseError, onSelectPath]);

  return {
    browseFolder,
    closeFolderBrowser,
    folderBrowserOpen,
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

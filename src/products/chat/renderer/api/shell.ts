import { expectJson } from './shared.js';

export interface BrowseDirectoryEntry {
  name: string;
  path: string;
}

export interface BrowseDirectoriesResult {
  current: string;
  parent: string;
  entries: BrowseDirectoryEntry[];
  error?: string;
}

export async function browseDirectories(
  targetPath?: string,
  signal?: AbortSignal,
): Promise<BrowseDirectoriesResult> {
  const query = targetPath ? `?path=${encodeURIComponent(targetPath)}` : '';
  const response = await fetch(`/api/shell/browse${query}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });
  return expectJson<BrowseDirectoriesResult>(
    response,
    `directory browse returned ${response.status}`,
  );
}

export async function openFolderInExplorer(folderPath: string): Promise<void> {
  await fetch('/api/shell/open-folder', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: folderPath }),
  });
}

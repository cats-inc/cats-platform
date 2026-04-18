export interface VisibleChatChannelLike {
  id: string;
}

export function resolveVisibleChatChannelId(
  selectedChannel: VisibleChatChannelLike | null,
  directLaneChannel: VisibleChatChannelLike | null,
): string | null {
  return selectedChannel?.id ?? directLaneChannel?.id ?? null;
}

export function resolveVisibleChatChannel<TChannel>(
  selectedChannel: TChannel | null,
  directLaneChannel: TChannel | null,
): TChannel | null {
  return selectedChannel ?? directLaneChannel;
}

export interface FolderBrowserContentPropsOptions<TEntry> {
  folderBrowsePath: string;
  folderBrowseCurrentPath: string | null;
  folderBrowseParentPath: string | null;
  folderBrowseEntries: ReadonlyArray<TEntry>;
  folderBrowseLoading: boolean;
  folderBrowseError: string;
  onPathChange: (path: string) => void;
  browseFolder: (path: string) => Promise<unknown> | void;
  selectCurrentFolder: () => void;
}

export function buildFolderBrowserContentProps<TEntry>({
  folderBrowsePath,
  folderBrowseCurrentPath,
  folderBrowseParentPath,
  folderBrowseEntries,
  folderBrowseLoading,
  folderBrowseError,
  onPathChange,
  browseFolder,
  selectCurrentFolder,
}: FolderBrowserContentPropsOptions<TEntry>) {
  return {
    folderBrowsePath,
    folderBrowseCurrentPath: folderBrowseCurrentPath ?? '',
    folderBrowseParentPath: folderBrowseParentPath ?? '',
    folderBrowseEntries: [...folderBrowseEntries],
    folderBrowseLoading,
    folderBrowseError,
    onPathChange,
    onBrowse: (path: string) => {
      void browseFolder(path);
    },
    onSelect: selectCurrentFolder,
  };
}

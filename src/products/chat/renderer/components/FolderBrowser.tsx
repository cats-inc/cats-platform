import type { BrowseDirectoryEntry } from '../api';

// --- Inline content (used inside accordion side panel) ---

export interface FolderBrowserContentProps {
  folderBrowsePath: string;
  folderBrowseCurrentPath: string;
  folderBrowseParentPath: string;
  folderBrowseEntries: BrowseDirectoryEntry[];
  folderBrowseLoading: boolean;
  folderBrowseError: string;
  onPathChange: (path: string) => void;
  onBrowse: (path: string) => void;
  onSelect: () => void;
}

export function FolderBrowserContent({
  folderBrowsePath,
  folderBrowseCurrentPath,
  folderBrowseParentPath,
  folderBrowseEntries,
  folderBrowseLoading,
  folderBrowseError,
  onPathChange,
  onBrowse,
  onSelect,
}: FolderBrowserContentProps) {
  return (
    <div className="folderBrowserInline">
      <div className="folderBrowserPathRow">
        <input
          className="folderBrowserPathInput"
          type="text"
          value={folderBrowsePath}
          onChange={(event) => onPathChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onBrowse(folderBrowsePath);
            }
          }}
          placeholder="Enter a path"
        />
        <button
          className="folderBrowserNavButton"
          type="button"
          onClick={() => onBrowse(folderBrowsePath)}
          disabled={folderBrowseLoading}
          aria-label="Go"
          data-tooltip="Go"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8h10" />
            <path d="M9 4l4 4-4 4" />
          </svg>
        </button>
      </div>
      <div className="folderBrowserToolbar">
        <button
          className="folderBrowserNavButton"
          type="button"
          onClick={() => onBrowse(folderBrowseParentPath)}
          disabled={folderBrowseLoading || !folderBrowseParentPath || folderBrowseParentPath === folderBrowseCurrentPath}
          aria-label="Up one level"
          data-tooltip="Up one level"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 13V3" />
            <path d="M3 7l5-5 5 5" />
          </svg>
        </button>
        <button
          className="folderBrowserNavButton"
          type="button"
          onClick={() => onBrowse(folderBrowseCurrentPath)}
          disabled={folderBrowseLoading || !folderBrowseCurrentPath}
          aria-label="Refresh"
          data-tooltip="Refresh"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13.5 2.5v4h-4" />
            <path d="M2.5 8a5.5 5.5 0 0 1 9.37-3.87L13.5 6.5" />
            <path d="M2.5 13.5v-4h4" />
            <path d="M13.5 8a5.5 5.5 0 0 1-9.37 3.87L2.5 9.5" />
          </svg>
        </button>
        <span className="folderBrowserCurrentPath" data-tooltip={folderBrowseCurrentPath}>
          {folderBrowseCurrentPath || 'Loading...'}
        </span>
      </div>
      <div className="folderBrowserListScroll" role="list">
        {folderBrowseLoading ? (
          <div className="folderBrowserStatus">Loading folders&#x2026;</div>
        ) : folderBrowseEntries.length > 0 ? (
          folderBrowseEntries.map((entry) => (
            <button
              key={entry.path}
              className="folderBrowserEntry"
              type="button"
              onClick={() => onBrowse(entry.path)}
              role="listitem"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 4v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8L6.5 3H3a1 1 0 0 0-1 1z" />
              </svg>
              <span>{entry.name}</span>
            </button>
          ))
        ) : (
          <div className="folderBrowserStatus">
            {folderBrowseError || 'No subdirectories in this folder.'}
          </div>
        )}
      </div>
      {folderBrowseError ? (
        <p className="folderBrowserError">{folderBrowseError}</p>
      ) : null}
      <div className="folderBrowserFooter folderBrowserFooterSticky">
        <button
          className="folderBrowserPrimaryButton"
          type="button"
          onClick={onSelect}
          disabled={!folderBrowseCurrentPath || Boolean(folderBrowseError)}
        >
          Use this folder
        </button>
      </div>
    </div>
  );
}

// --- Legacy overlay wrapper (used until all callers migrate) ---

export interface FolderBrowserProps extends FolderBrowserContentProps {
  onClose: () => void;
}

export function FolderBrowser({
  onClose,
  ...contentProps
}: FolderBrowserProps) {
  return (
    <div
      className="folderBrowserOverlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="folderBrowserModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="folder-browser-title"
      >
        <div className="folderBrowserHeader">
          <div>
            <h2 id="folder-browser-title">Select working directory</h2>
            <p>Choose the folder that should become this chat&apos;s working directory.</p>
          </div>
          <button
            className="folderBrowserClose"
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <FolderBrowserContent {...contentProps} />
      </div>
    </div>
  );
}

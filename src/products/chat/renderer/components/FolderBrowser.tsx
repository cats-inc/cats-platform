import type { BrowseDirectoryEntry } from '../api';

export interface FolderBrowserProps {
  folderBrowsePath: string;
  folderBrowseCurrentPath: string;
  folderBrowseParentPath: string;
  folderBrowseEntries: BrowseDirectoryEntry[];
  folderBrowseLoading: boolean;
  folderBrowseError: string;
  onPathChange: (path: string) => void;
  onBrowse: (path: string) => void;
  onClose: () => void;
  onSelect: () => void;
}

export function FolderBrowser({
  folderBrowsePath,
  folderBrowseCurrentPath,
  folderBrowseParentPath,
  folderBrowseEntries,
  folderBrowseLoading,
  folderBrowseError,
  onPathChange,
  onBrowse,
  onClose,
  onSelect,
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
            placeholder="Enter a path or browse below"
          />
          <button
            className="folderBrowserPathButton"
            type="button"
            onClick={() => onBrowse(folderBrowsePath)}
            disabled={folderBrowseLoading}
          >
            Go
          </button>
        </div>
        <div className="folderBrowserToolbar">
          <button
            className="folderBrowserNavButton"
            type="button"
            onClick={() => onBrowse(folderBrowseParentPath)}
            disabled={folderBrowseLoading || !folderBrowseParentPath || folderBrowseParentPath === folderBrowseCurrentPath}
          >
            Up one level
          </button>
          <button
            className="folderBrowserNavButton"
            type="button"
            onClick={() => onBrowse(folderBrowseCurrentPath)}
            disabled={folderBrowseLoading || !folderBrowseCurrentPath}
          >
            Refresh
          </button>
          <span className="folderBrowserCurrentPath" title={folderBrowseCurrentPath}>
            {folderBrowseCurrentPath || 'Loading...'}
          </span>
        </div>
        <div className="folderBrowserList" role="list">
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
        <div className="folderBrowserFooter">
          <button
            className="folderBrowserSecondaryButton"
            type="button"
            onClick={onClose}
          >
            Cancel
          </button>
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
    </div>
  );
}

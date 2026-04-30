import type { BrowseDirectoryEntry } from '../api/index.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';

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
  const { t } = useI18n();

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
          placeholder={t('sharedFolderBrowserEnterPath')}
        />
        <button
          className="folderBrowserNavButton"
          type="button"
          onClick={() => onBrowse(folderBrowsePath)}
          disabled={folderBrowseLoading}
          aria-label={t('sharedFolderBrowserGo')}
          data-tooltip={t('sharedFolderBrowserGo')}
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
          aria-label={t('sharedFolderBrowserUpOneLevel')}
          data-tooltip={t('sharedFolderBrowserUpOneLevel')}
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
          aria-label={t('sharedFolderBrowserRefresh')}
          data-tooltip={t('sharedFolderBrowserRefresh')}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13.5 2.5v4h-4" />
            <path d="M2.5 8a5.5 5.5 0 0 1 9.37-3.87L13.5 6.5" />
            <path d="M2.5 13.5v-4h4" />
            <path d="M13.5 8a5.5 5.5 0 0 1-9.37 3.87L2.5 9.5" />
          </svg>
        </button>
        <span className="folderBrowserCurrentPath" data-tooltip={folderBrowseCurrentPath}>
          {folderBrowseCurrentPath || t('sharedFolderBrowserLoading')}
        </span>
      </div>
        <div className="folderBrowserListScroll" role="list">
        {folderBrowseLoading ? (
          <div className="folderBrowserStatus">{t('sharedFolderBrowserLoading')}</div>
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
            {folderBrowseError || t('sharedFolderBrowserNoSubdirectories')}
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
          {t('sharedFolderBrowserUseThisFolder')}
        </button>
      </div>
    </div>
  );
}

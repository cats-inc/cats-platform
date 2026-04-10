import type { PlatformSurfaceId } from '../../../shared/platform-contract.js';
import { PlatformSurfaceSwitcher } from '../../../design/components/PlatformSurfaceSwitcher.js';
import type { ConversationSidebarAction } from './ConversationSidebar.js';

interface ConversationSidebarNavigationProps {
  activeSurface: PlatformSurfaceId;
  sidebarOpen: boolean;
  primaryActions: readonly ConversationSidebarAction[];
  onToggleSidebar: () => void;
  onSwitchProduct: (surface: PlatformSurfaceId) => void;
}

export function ConversationSidebarNavigation({
  activeSurface,
  sidebarOpen,
  primaryActions,
  onToggleSidebar,
  onSwitchProduct,
}: ConversationSidebarNavigationProps) {
  return (
    <>
      <div className="brandRow">
        <div className="brandCopy">
          <PlatformSurfaceSwitcher
            activeSurface={activeSurface}
            onSelectSurface={onSwitchProduct}
          />
        </div>
        <button
          className="chromeButton"
          type="button"
          aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          onClick={onToggleSidebar}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="1" y="2" width="14" height="12" rx="2" />
            <path d="M6 2v12" />
          </svg>
        </button>
      </div>

      <nav className="navGroup" aria-label="Primary">
        {primaryActions.map((item) => (
          <button
            key={item.key}
            className={item.active ? 'navItem navItemActive' : 'navItem'}
            onClick={item.onClick}
            type="button"
          >
            <span className="navGlyph" aria-hidden="true">
              {item.icon}
            </span>
            <span className="navLabel">{item.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}

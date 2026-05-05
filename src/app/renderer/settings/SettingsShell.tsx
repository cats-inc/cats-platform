import {
  useCallback,
  useEffect,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { Outlet } from 'react-router-dom';

// Settings runs on the same appshell chrome chat / code / work / Cats
// Directory use — `screen claudeShell` outer grid (260px sidebar /
// fluid canvas) plus the `.sidebar` flex column with its own
// scrollable middle. Those rules live in the chat-side stylesheet
// bundle that historically only loaded once a product surface
// mounted; pulling them in here lets `/settings/*` paint with the
// same width / collapse / footer behaviour without re-implementing.
import '../../../products/shared/renderer/styles/chat-shell-base.css';
import '../../../products/shared/renderer/styles/chat-thread-base.css';
import '../../../products/shared/renderer/styles/extras.css';

import type { PlatformHostEnvelope } from '../../../shared/platform-contract.js';
import {
  readSidebarOpenPreference,
  writeSidebarOpenPreference,
} from '../../../shared/sidebarPreference.js';
import { SettingsAppShellSidebar } from './SettingsAppShellSidebar.js';

/**
 * Workspace shell for `/settings/*`. Mirrors `EntitiesShell` so
 * Settings and Cats Directory share one chrome contract — same
 * `screen claudeShell` outer grid, same `.sidebar` flex column, same
 * `cats.sidebar-open` localStorage key for collapse persistence, same
 * `claudeShellSidebarCollapsed` lockstep behaviour. Surface-specific
 * differences (sidebar nav, exit memory) live in
 * `SettingsAppShellSidebar` and `settingsExitMemory`.
 *
 * Earlier revisions nested Settings inside whichever product chrome
 * the user came from (`renderProductSurface(shellSurface)`). That
 * required a `platformShellSurface` nav-state hint to pick the right
 * wrapping product, which produced the well-known "open Settings,
 * end up in Chat chrome" bug whenever the hint was missing or stale.
 * Promoting Settings to its own surface kills that whole class of
 * bug — there is no product chrome to "borrow" anymore.
 */
export function SettingsShell({
  envelope,
}: {
  envelope: PlatformHostEnvelope;
}) {
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() =>
    readSidebarOpenPreference(
      typeof window === 'undefined' ? null : window.localStorage,
    ),
  );

  useEffect(() => {
    writeSidebarOpenPreference(
      typeof window === 'undefined' ? null : window.localStorage,
      sidebarOpen,
    );
  }, [sidebarOpen]);

  const onToggleSidebar = useCallback(() => {
    setSidebarOpen((current) => !current);
  }, []);

  const onCollapsedSidebarClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (sidebarOpen) {
        return;
      }
      const target = event.target as HTMLElement;
      if (
        target.closest('button, a, input, textarea, select, [role="button"]')
        || target.closest('.accountMenu')
      ) {
        return;
      }
      setSidebarOpen(true);
    },
    [sidebarOpen],
  );

  return (
    <div
      className={
        sidebarOpen
          ? 'screen claudeShell'
          : 'screen claudeShell claudeShellSidebarCollapsed'
      }
    >
      <SettingsAppShellSidebar
        envelope={envelope}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={onToggleSidebar}
        onCollapsedSidebarClick={onCollapsedSidebarClick}
      />
      <main className="canvas">
        <Outlet />
      </main>
    </div>
  );
}

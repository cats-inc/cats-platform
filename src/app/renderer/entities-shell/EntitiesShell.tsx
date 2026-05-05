import {
  useCallback,
  useEffect,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { Outlet } from 'react-router-dom';

import {
  ConfirmDialog,
  useConfirmDialog,
} from '../../../design/components/ConfirmDialog.js';

// The Entities workspace mounts the same appshell layout
// chat / code / work do — `screen claudeShell` outer grid (260px
// sidebar / fluid canvas) and the `.sidebar` flex column with its own
// scrollable middle. Those rules live in the chat-side stylesheet
// bundle and were previously only loaded once a product surface
// rendered. Pull the bundle in here so /entities/* routes
// render with the same chrome before any product is mounted.
//
// `chat-thread-base.css` carries the `.catAvatar` / `.catAvatarBoss`
// primitives the sidebar's MyCatRowItem uses (28×28 disc, boss-cat
// outline, default tint). Without it the avatars in the MY CATS
// section collapse to 0×0 spans. We pull just the base file (not the
// per-product `chat-thread.css`) since we don't render thread / message
// chrome on entity drill-down routes.
import '../../../products/shared/renderer/styles/chat-shell-base.css';
import '../../../products/shared/renderer/styles/chat-thread-base.css';
import '../../../products/shared/renderer/styles/extras.css';

import type { PlatformHostEnvelope } from '../../../shared/platform-contract.js';
import {
  readSidebarOpenPreference,
  writeSidebarOpenPreference,
} from '../../../shared/sidebarPreference.js';
import { EntitiesAppShellSidebar } from './EntitiesAppShellSidebar.js';

/**
 * Workspace shell for entity-domain routes under `/entities`.
 *
 * Layout matches chat / code / work exactly: outer `screen claudeShell`
 * grid, sidebar on the left with surface switcher, Back to Lobby
 * affordance / three lens sections / GuideCatDock + identity pill,
 * `<main className="canvas">` on the right hosting the matched
 * route's content. There is no separate top bar — the sidebar is the
 * appshell chrome.
 *
 * Sidebar-open state lives here so the outer `.claudeShell` grid can
 * flip its column track (260px → 48px) via
 * `claudeShellSidebarCollapsed` in lockstep with the sidebar's own
 * `.sidebarCollapsed` modifier. The state is persisted to localStorage
 * with the SAME `cats.sidebar-open` key chat / code / work use (see
 * `useAppChrome` + `shared/sidebarPreference.ts`) so a refresh keeps
 * the user's last toggle and the choice carries across products.
 *
 * `onCollapsedSidebarClick` mirrors the product chrome's affordance
 * for "click any non-interactive area while collapsed to expand" —
 * otherwise the only way back is the toggle button.
 */
export function EntitiesShell({
  envelope,
}: {
  envelope: PlatformHostEnvelope;
}) {
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() =>
    readSidebarOpenPreference(
      typeof window === 'undefined' ? null : window.localStorage,
    ),
  );

  // App-level confirm dialog plumbed down to the sidebar so destructive
  // actions (Archive cat) use the in-app modal instead of `window.confirm`.
  const {
    dialog: confirmDialog,
    confirm,
    handleClose: onConfirmClose,
  } = useConfirmDialog();

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
      <EntitiesAppShellSidebar
        envelope={envelope}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={onToggleSidebar}
        onCollapsedSidebarClick={onCollapsedSidebarClick}
        confirmDialog={confirm}
      />
      <main className="canvas">
        <Outlet />
      </main>
      <ConfirmDialog dialog={confirmDialog} onClose={onConfirmClose} />
    </div>
  );
}

import { Outlet } from 'react-router-dom';

import { messageKeys } from '../../../shared/i18n/index.js';
import type { PlatformHostEnvelope } from '../../../shared/platform-contract.js';
import { useI18n } from '../i18n/index.js';
import { LobbyAppShellSidebar } from './LobbyAppShellSidebar.js';

/**
 * Workspace shell for the Lobby drill-down entity routes (/cats,
 * /clowders, /catteries and their `/:id` / `/:id/:tab` variants).
 *
 * Layout mirrors the chat / code / work appshell exactly: the
 * sidebar (top: surface switcher → "Open Lobby" gets back to /lobby;
 * middle: three lens sections; bottom: GuideCatDock + identity pill)
 * sits at the left, the matched route renders inside the
 * `<Outlet />` on the right. There is no separate "back to Lobby"
 * top bar — the surface switcher provides the navigation back, just
 * like chat / code / work do.
 *
 * Per PLAN-091 phase 7, `/lobby` itself does NOT mount this shell —
 * it is the bare landing page that drills into the entity routes.
 */
export function EntitiesShell({
  envelope,
}: {
  envelope: PlatformHostEnvelope;
}) {
  const { t } = useI18n();
  return (
    <div
      className="screen entitiesShellScreen"
      aria-label={t(messageKeys.entitiesShellAriaLabel)}
    >
      <LobbyAppShellSidebar envelope={envelope} />
      <main className="entitiesShellContent">
        <Outlet />
      </main>
    </div>
  );
}

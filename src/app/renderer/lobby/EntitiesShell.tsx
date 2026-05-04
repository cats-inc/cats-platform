import { Outlet } from 'react-router-dom';

// The Lobby drill-down workspace mounts the same appshell layout
// chat / code / work do — `screen claudeShell` outer grid (260px
// sidebar / fluid canvas) and the `.sidebar` flex column with its own
// scrollable middle. Those rules live in the chat-side stylesheet
// bundle and were previously only loaded once a product surface
// rendered. Pull the bundle in here so /cats, /clowders, /catteries
// render with the same chrome before any product is mounted.
import '../../../products/shared/renderer/styles/chat-shell-base.css';
import '../../../products/shared/renderer/styles/extras.css';

import type { PlatformHostEnvelope } from '../../../shared/platform-contract.js';
import { LobbyAppShellSidebar } from './LobbyAppShellSidebar.js';

/**
 * Workspace shell for the Lobby drill-down entity routes (/cats,
 * /clowders, /catteries and their `/:id` / `/:id/:tab` variants).
 *
 * Layout matches chat / code / work exactly: outer `screen claudeShell`
 * grid, sidebar on the left with surface switcher → "Open Lobby"
 * affordance / three lens sections / GuideCatDock + identity pill,
 * `<main className="canvas">` on the right hosting the matched
 * route's content. There is no separate top bar — the sidebar is the
 * appshell chrome.
 */
export function EntitiesShell({
  envelope,
}: {
  envelope: PlatformHostEnvelope;
}) {
  return (
    <div className="screen claudeShell">
      <LobbyAppShellSidebar envelope={envelope} />
      <main className="canvas">
        <Outlet />
      </main>
    </div>
  );
}

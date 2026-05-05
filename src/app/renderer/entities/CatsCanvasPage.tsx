import { useEffect, useState } from 'react';

import type { AppShellPayload } from '../../../products/shared/api/workspaceContracts.js';
import { fetchAppShell } from '../../../products/shared/renderer/api/index.js';
import { WorkspaceCatsCanvas } from '../../../products/shared/renderer/components/cats/Cats.js';
// The cats canvas was originally Settings-only, so its styling lives
// in `products/shared/renderer/styles/settings.css`. Pull it in here
// so the canvas renders correctly when mounted from the lobby
// drill-down `/entities/cats` route (the chat product surface no longer hosts
// it for this path).
import '../../../products/shared/renderer/styles/settings.css';
import {
  IDLE_BUSY_STATE,
  type WorkspaceBusyState,
} from '../../../shared/workspaceBusy.js';

/**
 * Platform-level page for `/entities/cats`. Mounts the
 * `WorkspaceCatsCanvas` (the same canvas the Settings shell hosts at
 * `/settings/cats`) but inside the lobby drill-down EntitiesShell, so
 * the sidebar is the platform-level lobby sidebar — not chat's
 * Direct Messages sidebar.
 *
 * `WorkspaceCatsCanvas` needs the chat-product `AppShellPayload` to
 * mutate cats (rename, archive, model selection, …). Platform-level
 * doesn't have that payload sitting around, so this page fetches it
 * once via `fetchAppShell()` and owns the resulting state in local
 * `useState`. Mutations from the canvas land back through
 * `onPayloadUpdate`, which `useSettingsCatsRegistryActions` already
 * keeps refreshed after each successful API call.
 */
export function CatsCanvasPage() {
  const [payload, setPayload] = useState<AppShellPayload | null>(null);
  const [busy, setBusy] = useState<WorkspaceBusyState>(IDLE_BUSY_STATE);
  // Feedback strings are shown via the canvas's internal toast
  // surface, but the canvas still requires a setter; we wire it to
  // local state so upstream-of-canvas chrome could read it later.
  const [, setFeedback] = useState('');

  useEffect(() => {
    let cancelled = false;
    void fetchAppShell()
      .then((next) => {
        if (!cancelled) setPayload(next);
      })
      .catch(() => {
        // Swallow — the chat product's own background refresh keeps
        // the platform envelope alive elsewhere; for /cats the user
        // can hit refresh if the initial fetch fails.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!payload) {
    return <div className="catsCanvasPageBoot" />;
  }

  return (
    <WorkspaceCatsCanvas
      payload={payload}
      busy={busy}
      onPayloadUpdate={setPayload}
      onFeedback={setFeedback}
      onBusy={setBusy}
    />
  );
}

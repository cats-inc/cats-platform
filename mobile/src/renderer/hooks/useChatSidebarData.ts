import { useEffect, useState } from 'react';

import { createMobileApiClient, MobileApiError } from '../../api/client';
import { loadConnectionConfig } from '../../api/persistence';
import {
  type MobileAppShellPayload,
  type MobileChatSidebarData,
  selectMobileChatSidebar,
} from '../../../../src/mobile/index.js';

/**
 * State machine for the live chat sidebar fetch. Phases:
 *
 *   - `loading` — initial mount, or a refetch is in flight
 *   - `unconfigured` — no `baseUrl` in persisted ConnectionConfig
 *     (the user has not set a desktop URL in Settings yet)
 *   - `error` — fetch failed (`MobileApiError` with status + body)
 *   - `data` — last successful fetch's selector output
 *
 * The shape is intentionally explicit so the chat tab screen can
 * render distinct empty / loading / error states instead of
 * collapsing them into a generic `data | null`.
 */
export type ChatSidebarState =
  | { kind: 'loading' }
  | { kind: 'unconfigured' }
  | { kind: 'error'; error: MobileApiError }
  | { kind: 'data'; data: MobileChatSidebarData };

export interface ChatSidebarHook {
  state: ChatSidebarState;
  refetch: () => void;
}

const APP_SHELL_PATH = '/api/app-shell';

/**
 * Fetches `/api/app-shell` from the desktop cats and projects the
 * payload through `selectMobileChatSidebar` so the screen receives
 * the mobile sidebar UX shape directly. PLAN-084 Phase 4b lives here.
 */
export function useChatSidebarData(): ChatSidebarHook {
  const [state, setState] = useState<ChatSidebarState>({ kind: 'loading' });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ kind: 'loading' });
    (async () => {
      try {
        const config = await loadConnectionConfig();
        if (!active) {
          return;
        }
        if (!config.baseUrl) {
          setState({ kind: 'unconfigured' });
          return;
        }
        const client = createMobileApiClient(config);
        const payload = await client.get<MobileAppShellPayload>(APP_SHELL_PATH);
        if (!active) {
          return;
        }
        const data = selectMobileChatSidebar(payload);
        setState({ kind: 'data', data });
      } catch (error) {
        if (!active) {
          return;
        }
        if (error instanceof MobileApiError) {
          setState({ kind: 'error', error });
        } else {
          setState({
            kind: 'error',
            error: new MobileApiError(
              error instanceof Error ? error.message : 'Unknown error.',
              null,
              error,
            ),
          });
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [version]);

  const refetch = () => {
    setVersion((current) => current + 1);
  };

  return { state, refetch };
}

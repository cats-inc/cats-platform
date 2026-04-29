import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { createMobileApiClient, MobileApiError } from '../../api/client';
import { loadConnectionConfig } from '../../api/persistence';
import type { MobileAppShellPayload } from '../../../../src/mobile/index.js';

/**
 * Shared hook that fetches `/api/app-shell` and exposes the explicit
 * state machine the screens consume. Other hooks
 * (`useChatSidebarData`, `useMyCatsLens`, `useProductRecents`) compose
 * this one so the desktop is hit at most once per screen mount, not
 * once per derived selector.
 *
 * NB: hooks that need *both* the app-shell and another endpoint (e.g.
 * `useChannelMessages`) intentionally do their own combined fetch
 * via `Promise.all` — they cannot reuse this hook without losing the
 * parallel-fetch property.
 */

export type MobileAppShellState =
  | { kind: 'loading' }
  | { kind: 'unconfigured' }
  | { kind: 'error'; error: MobileApiError }
  | { kind: 'data'; payload: MobileAppShellPayload };

export interface MobileAppShellHook {
  state: MobileAppShellState;
  refetch: () => void;
}

const APP_SHELL_PATH = '/api/app-shell';

export function useMobileAppShell(): MobileAppShellHook {
  const [state, setState] = useState<MobileAppShellState>({ kind: 'loading' });
  const [version, setVersion] = useState(0);
  const initialFocusRef = useRef(true);

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
        setState({ kind: 'data', payload });
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

  // Re-fetch on every screen focus _after_ the initial mount, so the
  // user setting a desktop base URL in Settings and returning to a
  // tab triggers a fresh load instead of leaving the tab stuck in its
  // pre-config state. The initial focus skips because the mount-time
  // useEffect already covers it.
  useFocusEffect(
    useCallback(() => {
      if (initialFocusRef.current) {
        initialFocusRef.current = false;
        return;
      }
      setVersion((current) => current + 1);
    }, []),
  );

  const refetch = useCallback(() => {
    setVersion((current) => current + 1);
  }, []);

  return { state, refetch };
}

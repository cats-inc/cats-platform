import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { createMobileApiClient, MobileApiError } from '../../api/client';
import {
  type ChatEventStreamHandle,
  openChatEventStream,
} from '../../api/eventStream';
import { loadConnectionConfig } from '../../api/persistence';
import {
  getMobileApiCopy,
  resolveDefaultMobileLocale,
  type MobileAppShellPayload,
  type MobileChatEventKind,
} from '../../../../src/mobile/index.js';

/**
 * Shared hook that fetches `/api/app-shell` and exposes the explicit
 * state machine the screens consume. Other hooks
 * (`useProductSidebarData`, `useCatsDirectoryTab`) compose this one
 * so the desktop is hit at most once per screen mount, not once per
 * derived selector.
 *
 * **Sync model** mirrors web's
 * `src/products/shared/renderer/hooks/useWorkspaceChatEvents.ts`:
 *
 *   - On mount: fetch `/api/app-shell` (or pull from the persisted
 *     `unconfigured` / `error` state machine).
 *   - During the lifetime of the hook: open an SSE subscription to
 *     `/api/events/chat`. Every server-published mutation
 *     (`room_updated`, `recents_changed`, `unread_changed`,
 *     `transport_ingress`) bumps the internal `version` so the next
 *     effect re-runs the fetch. The `keepPreviousData` branch in
 *     the fetch effect keeps the existing payload visible during
 *     the round trip — no flicker.
 *
 * Mutations (`useDeleteRecent` and friends) therefore do NOT need
 * to call `refetch()` after they succeed; the server-side
 * `publishChannelMutationEvents` already emits the SSE event that
 * drives the refetch. The explicit `refetch` is still exported for
 * pull-to-refresh, focus-recovery, and the rare case where the
 * server can't be the source of truth (e.g. mid-pairing).
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
  const copy = getMobileApiCopy(resolveDefaultMobileLocale());

  useEffect(() => {
    let active = true;
    // Don't flush a previously successful fetch back to `loading`
    // when the user (or another hook) bumps `version` — flushing
    // makes every refetch flicker the consuming list to empty for
    // the duration of the round trip. Behaviour matches React
    // Query's `keepPreviousData` and the equivalent web pattern: the
    // stale payload stays on screen until the new one arrives. We
    // still show the loading state on first mount and after an
    // error (where there is no previous payload to keep), so the
    // initial-load and recover-from-error UX are unchanged.
    setState((current) =>
      current.kind === 'data' ? current : { kind: 'loading' },
    );
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
              error instanceof Error ? error.message : copy.unknownError,
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
  }, [copy, version]);

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

  // Subscribe to the desktop's `/api/events/chat` SSE stream so any
  // mutation (delete, rename, message-add, etc.) on the desktop side
  // — whether triggered from this device or another — bumps `version`
  // and refetches. Mirrors web's `useWorkspaceChatEvents` behaviour
  // exactly: same set of subscribed kinds, same "merge into state on
  // arrival" model. The existing `keepPreviousData` fetch branch
  // covers the no-flicker requirement.
  //
  // We do NOT subscribe to `transport_outbound` / `session_state_changed`
  // here — those don't change the app-shell projection.
  useEffect(() => {
    let cancelled = false;
    let handle: ChatEventStreamHandle | null = null;
    const SHELL_INVALIDATING_KINDS: ReadonlySet<MobileChatEventKind> = new Set([
      'room_updated',
      'recents_changed',
      'unread_changed',
      'transport_ingress',
    ]);

    (async () => {
      try {
        const config = await loadConnectionConfig();
        if (cancelled || !config.baseUrl) {
          return;
        }
        handle = openChatEventStream(config, (event) => {
          if (SHELL_INVALIDATING_KINDS.has(event.type)) {
            setVersion((current) => current + 1);
          }
        });
      } catch {
        // SSE is best-effort; the focus refetch + manual refetch
        // remain as fallback paths if the stream can't open.
      }
    })();

    return () => {
      cancelled = true;
      handle?.close();
      handle = null;
    };
  }, []);

  const refetch = useCallback(() => {
    setVersion((current) => current + 1);
  }, []);

  return { state, refetch };
}

import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from 'react';

import type { AppShellPayload } from '../../api/workspaceContracts.js';
import { fetchAppShell as fetchWorkspaceAppShell } from '../api/index.js';
import { entitySubscriptionHub } from '../entitySubscriptionHub.js';
import {
  mergeAppShellPreservingActiveEntityState,
  type MergeableAppShellPayload,
} from '../mergeAppShellPreservingActiveEntityState.js';
import {
  preservePendingOptimisticSendsAfterWorkspaceRefresh,
} from '../optimisticRefresh.js';

type LoadStateLike<TPayload> =
  | { status: 'loading' }
  | { status: 'ready'; payload: TPayload }
  | { status: 'error'; message: string };

export function shouldApplyWorkspaceChatEventRefresh(
  currentGeneratedAt: string | null | undefined,
  nextGeneratedAt: string | null | undefined,
): boolean {
  const currentTimestamp = currentGeneratedAt ? Date.parse(currentGeneratedAt) : Number.NaN;
  const nextTimestamp = nextGeneratedAt ? Date.parse(nextGeneratedAt) : Number.NaN;
  if (Number.isNaN(currentTimestamp) || Number.isNaN(nextTimestamp)) {
    return true;
  }

  return nextTimestamp >= currentTimestamp;
}

export interface UseWorkspaceChatEventsResult {
  // Mutation-driven flows (e.g. companion wake/sleep, settings saves) can
  // call this to force a refresh after a server-side action without losing
  // the timestamp guard, single-flight, or active-entity merge that the SSE
  // refresher already enforces. Pre-refactor (commit 8316bab30^) the chat
  // App used `useChatAppShellRefresh` to expose the same hardened refresher;
  // surfacing it here keeps that contract intact for the unified shell.
  refreshAppShell: () => void;
}

export function useWorkspaceChatEvents<
  TPayload extends MergeableAppShellPayload & { metadata: { generatedAt: string | null } } =
    AppShellPayload,
>(options: {
  state: LoadStateLike<TPayload>;
  setState: Dispatch<SetStateAction<LoadStateLike<TPayload>>>;
  enabled?: boolean;
  fetchAppShell?: (signal: AbortSignal) => Promise<TPayload>;
}): UseWorkspaceChatEventsResult {
  const {
    enabled = true,
    fetchAppShell = fetchWorkspaceAppShell as unknown as (
      signal: AbortSignal,
    ) => Promise<TPayload>,
    setState,
    state,
  } = options;
  const latestPayloadRef = useRef<TPayload | null>(
    state.status === 'ready' ? state.payload : null,
  );
  const refreshControllerRef = useRef<AbortController | null>(null);
  const refreshInFlightRef = useRef(false);
  const queuedRefreshRef = useRef(false);

  useEffect(() => {
    latestPayloadRef.current = state.status === 'ready' ? state.payload : null;
  }, [state]);

  const refreshAppShell = useCallback(() => {
    if (refreshInFlightRef.current) {
      queuedRefreshRef.current = true;
      return;
    }

    const controller = new AbortController();
    refreshControllerRef.current = controller;
    refreshInFlightRef.current = true;

    const runQueuedRefresh = () => {
      refreshInFlightRef.current = false;
      if (refreshControllerRef.current === controller) {
        refreshControllerRef.current = null;
      }
      if (!queuedRefreshRef.current) {
        return;
      }
      queuedRefreshRef.current = false;
      refreshAppShell();
    };

    void fetchAppShell(controller.signal)
      .then((nextPayload) => {
        if (
          controller.signal.aborted
          || !shouldApplyWorkspaceChatEventRefresh(
            latestPayloadRef.current?.metadata.generatedAt,
            nextPayload.metadata.generatedAt,
          )
        ) {
          return;
        }

        const currentPayload = latestPayloadRef.current;
        const mergedPayload = currentPayload
          ? mergeAppShellPreservingActiveEntityState(
              currentPayload,
              nextPayload,
              entitySubscriptionHub.getActiveSubscribedIds('channel'),
            )
          : nextPayload;
        const preservedPayload = currentPayload
          ? preservePendingOptimisticSendsAfterWorkspaceRefresh(
              currentPayload as unknown as AppShellPayload,
              mergedPayload as unknown as AppShellPayload,
            ) as unknown as TPayload
          : mergedPayload;
        latestPayloadRef.current = preservedPayload;
        startTransition(() => {
          setState({ status: 'ready', payload: preservedPayload });
        });
      })
      .catch(() => {})
      .finally(runQueuedRefresh);
  }, [fetchAppShell, setState]);

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') {
      return undefined;
    }

    let retryCount = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let source: EventSource | null = null;

    const open = () => {
      source = new EventSource('/api/events/chat');
      source.addEventListener('connected', () => {
        retryCount = 0;
      });
      source.addEventListener('room_updated', refreshAppShell);
      source.addEventListener('recents_changed', refreshAppShell);
      source.addEventListener('unread_changed', refreshAppShell);
      source.addEventListener('transport_ingress', refreshAppShell);
      source.onerror = () => {
        source?.close();
        source = null;
        if (retryCount < 8) {
          const delay = Math.min(150 * 2 ** retryCount, 10_000);
          retryCount += 1;
          retryTimer = setTimeout(open, delay);
        }
      };
    };

    open();

    return () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      source?.close();
      source = null;
      refreshControllerRef.current?.abort();
      refreshControllerRef.current = null;
      refreshInFlightRef.current = false;
      queuedRefreshRef.current = false;
    };
  }, [enabled, refreshAppShell]);

  return { refreshAppShell };
}

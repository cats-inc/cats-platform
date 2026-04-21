import {
  useCallback,
  useEffect,
  useRef,
} from 'react';

import type { AppShellPayload } from '../../api/contracts.js';
import { fetchAppShell } from '../api/index.js';
import { useChatEvents } from './useChatEvents.js';
import { entitySubscriptionHub } from '../../../shared/renderer/entitySubscriptionHub.js';
import {
  mergeAppShellPreservingActiveEntityState,
} from '../../../shared/renderer/mergeAppShellPreservingActiveEntityState.js';

type LoadStateLike =
  | { status: 'loading' }
  | { status: 'ready'; payload: AppShellPayload }
  | { status: 'error'; message: string };

export function shouldApplyRefreshedAppShell(
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

export interface EventDrivenAppShellRefresherState {
  controller: AbortController | null;
  inFlight: boolean;
  queued: boolean;
  disposed: boolean;
}

export function createEventDrivenAppShellRefresher<
  TPayload extends { metadata: { generatedAt: string | null | undefined } },
>(
  refreshState: EventDrivenAppShellRefresherState,
  fetchShell: (signal: AbortSignal) => Promise<TPayload>,
  readCurrentGeneratedAt: () => string | null,
  applyPayload: (payload: TPayload) => void,
): () => void {
  const runRefresh = (): void => {
    if (refreshState.disposed) {
      return;
    }

    if (refreshState.inFlight) {
      refreshState.queued = true;
      return;
    }

    const controller = new AbortController();
    refreshState.controller = controller;
    refreshState.inFlight = true;

    void fetchShell(controller.signal)
      .then((payload) => {
        if (
          controller.signal.aborted
          || !shouldApplyRefreshedAppShell(
            readCurrentGeneratedAt(),
            payload.metadata.generatedAt,
          )
        ) {
          return;
        }

        applyPayload(payload);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
      })
      .finally(() => {
        if (refreshState.controller === controller) {
          refreshState.controller = null;
        }
        refreshState.inFlight = false;

        if (refreshState.disposed || !refreshState.queued) {
          return;
        }

        refreshState.queued = false;
        runRefresh();
      });
  };

  return runRefresh;
}

export function useChatAppShellRefresh(options: {
  state: LoadStateLike;
  updatePayload: (payload: AppShellPayload) => void;
  setPayloadImmediate?: (payload: AppShellPayload) => void;
}): {
  refreshAppShell: () => void;
} {
  const {
    state,
    updatePayload,
    setPayloadImmediate,
  } = options;
  const latestPayloadGeneratedAtRef = useRef<string | null>(
    state.status === 'ready' ? state.payload.metadata.generatedAt : null,
  );
  const latestPayloadRef = useRef<AppShellPayload | null>(
    state.status === 'ready' ? state.payload : null,
  );
  const refreshStateRef = useRef<EventDrivenAppShellRefresherState>({
    controller: null,
    inFlight: false,
    queued: false,
    disposed: false,
  });

  useEffect(() => {
    latestPayloadGeneratedAtRef.current = state.status === 'ready'
      ? state.payload.metadata.generatedAt
      : null;
    latestPayloadRef.current = state.status === 'ready' ? state.payload : null;
  }, [state]);

  useEffect(() => {
    refreshStateRef.current.disposed = false;
    return () => {
      refreshStateRef.current.disposed = true;
      refreshStateRef.current.queued = false;
      refreshStateRef.current.controller?.abort();
      refreshStateRef.current.controller = null;
      refreshStateRef.current.inFlight = false;
    };
  }, []);

  const refreshAppShell = useCallback(() => {
    createEventDrivenAppShellRefresher(
      refreshStateRef.current,
      fetchAppShell,
      () => latestPayloadGeneratedAtRef.current,
      (payload) => {
        const currentPayload = latestPayloadRef.current;
        // ADR-041 refetches collection-tier chat state; ADR-075 entity
        // subscriptions own the mounted channel slice and must survive refetch.
        const mergedPayload = currentPayload
          ? mergeAppShellPreservingActiveEntityState(
              currentPayload,
              payload,
              entitySubscriptionHub.getActiveSubscribedIds('channel'),
            )
          : payload;
        latestPayloadGeneratedAtRef.current = mergedPayload.metadata.generatedAt;
        latestPayloadRef.current = mergedPayload;
        if (setPayloadImmediate) {
          setPayloadImmediate(mergedPayload);
          return;
        }
        updatePayload(mergedPayload);
      },
    )();
  }, [setPayloadImmediate, updatePayload]);

  useChatEvents({
    onRoomUpdated: refreshAppShell,
    onRecentsChanged: refreshAppShell,
    onUnreadChanged: refreshAppShell,
    onTransportIngress: refreshAppShell,
  }, state.status === 'ready');

  return {
    refreshAppShell,
  };
}

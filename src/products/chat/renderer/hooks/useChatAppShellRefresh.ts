import {
  useCallback,
  useEffect,
  useRef,
} from 'react';

import type { AppShellPayload } from '../../api/contracts.js';
import { fetchAppShell } from '../api/index.js';
import { useChatEvents } from './useChatEvents.js';

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
        latestPayloadGeneratedAtRef.current = payload.metadata.generatedAt;
        if (setPayloadImmediate) {
          setPayloadImmediate(payload);
          return;
        }
        updatePayload(payload);
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

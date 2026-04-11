import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { AppShellPayload } from '../../api/contracts.js';
import { activateChatChannel, fetchAppShell } from '../api/index.js';
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

export function useCompanionMode(options: {
  routeMyCatId: string | null;
  state: LoadStateLike;
  updatePayload: (payload: AppShellPayload) => void;
}) {
  const {
    routeMyCatId,
    state,
    updatePayload,
  } = options;
  const [companionMode, setCompanionMode] = useState(false);
  const previousMyCatIdRef = useRef(routeMyCatId);
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
    if (previousMyCatIdRef.current !== routeMyCatId) {
      previousMyCatIdRef.current = routeMyCatId;
      setCompanionMode(false);
    }
  }, [routeMyCatId]);

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

  const companionCat = companionMode && routeMyCatId && state.status === 'ready'
    ? state.payload.chat.cats.find((cat) => cat.id === routeMyCatId) ?? null
    : null;

  const onToggleCompanionMode = useCallback(() => {
    setCompanionMode((prev) => !prev);
  }, []);

  const refreshAppShell = useCallback(() => {
    createEventDrivenAppShellRefresher(
      refreshStateRef.current,
      fetchAppShell,
      () => latestPayloadGeneratedAtRef.current,
      (payload) => {
        latestPayloadGeneratedAtRef.current = payload.metadata.generatedAt;
        updatePayload(payload);
      },
    )();
  }, [updatePayload]);

  const onCompanionWake = useCallback((catId: string) => {
    const channel = state.status === 'ready'
      ? state.payload.chat.channels.find(
          (ch) =>
            ch.channelKind === 'direct_lane'
            && ch.defaultRecipientCatId === catId,
        )
      : null;
    if (channel) {
      void activateChatChannel(channel.id).then(() => {
        refreshAppShell();
      });
    }
  }, [refreshAppShell, state]);

  const onCompanionSleep = useCallback((catId: string) => {
    // Request deactivation by re-fetching after a brief pause to let the
    // session settle. Full session-discipline (reset/compact) will be exposed
    // through dedicated session-continuity API routes in a follow-up.
    const channel = state.status === 'ready'
      ? state.payload.chat.channels.find(
          (ch) =>
            ch.channelKind === 'direct_lane'
            && ch.defaultRecipientCatId === catId,
        )
      : null;
    if (channel) {
      void fetch(`/api/channels/${encodeURIComponent(channel.id)}/deactivate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      }).catch(() => {
        // Best-effort; session may already be inactive.
      }).then(() => {
        refreshAppShell();
      });
    }
  }, [refreshAppShell, state]);

  useChatEvents({
    onRoomUpdated: refreshAppShell,
    onRecentsChanged: refreshAppShell,
    onUnreadChanged: refreshAppShell,
    onTransportIngress: refreshAppShell,
  }, state.status === 'ready');

  return {
    companionMode,
    companionCat,
    onToggleCompanionMode,
    onCompanionWake,
    onCompanionSleep,
  };
}

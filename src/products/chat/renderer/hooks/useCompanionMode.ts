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

  useEffect(() => {
    if (previousMyCatIdRef.current !== routeMyCatId) {
      previousMyCatIdRef.current = routeMyCatId;
      setCompanionMode(false);
    }
  }, [routeMyCatId]);

  const companionCat = companionMode && routeMyCatId && state.status === 'ready'
    ? state.payload.chat.cats.find((cat) => cat.id === routeMyCatId) ?? null
    : null;

  const onToggleCompanionMode = useCallback(() => {
    setCompanionMode((prev) => !prev);
  }, []);

  const refreshAppShell = useCallback(() => {
    void fetchAppShell().then((payload) => {
      if (payload) {
        updatePayload(payload);
      }
    });
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

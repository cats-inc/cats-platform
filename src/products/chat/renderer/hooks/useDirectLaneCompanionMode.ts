import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { AppShellPayload } from '../../api/contracts.js';
import { activateChatChannel } from '../api/index.js';

type LoadStateLike =
  | { status: 'loading' }
  | { status: 'ready'; payload: AppShellPayload }
  | { status: 'error'; message: string };

export function useDirectLaneCompanionMode(options: {
  routeMyCatId: string | null;
  state: LoadStateLike;
  refreshAppShell: () => void;
}) {
  const {
    routeMyCatId,
    state,
    refreshAppShell,
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

  const onCompanionWake = useCallback((catId: string) => {
    const channel = state.status === 'ready'
      ? state.payload.chat.channels.find(
          (ch) =>
            ch.channelKind === 'direct_message'
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
            ch.channelKind === 'direct_message'
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

  return {
    companionMode,
    companionCat,
    onToggleCompanionMode,
    onCompanionWake,
    onCompanionSleep,
  };
}

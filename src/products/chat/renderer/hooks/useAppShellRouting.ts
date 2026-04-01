import {
  startTransition,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { NavigateFunction } from 'react-router-dom';

import { isComposerBusy } from '../../../../shared/composer.js';
import type { AppShellPayload } from '../../api/contracts';
import {
  fetchAppShell,
  updateSelectedChannel,
} from '../api';
import {
  isOptimisticDraftChannelId,
  NEW_CHAT_PATH,
  resolveVisibleChatPath,
} from '../../shared/channelPaths';
import { shouldWakeRouteChannelOnEntry } from '../../shared/channelEntry';
import { isDirectLaneChannel } from '../../shared/channelTopology';
import type { ChatLifecycleState } from '../../shared/lifecycle';
import {
  preserveCachedOptimisticUserMessageAfterRefresh,
  type SelectedChannelView,
} from '../chatUtils';

type LoadStateLike =
  | { status: 'loading' }
  | { status: 'ready'; payload: AppShellPayload }
  | { status: 'error'; message: string };

export function useAppShellRouting(options: {
  state: LoadStateLike;
  setState: Dispatch<SetStateAction<LoadStateLike>>;
  navigate: NavigateFunction;
  busy: string;
  routeChannelId: string | null;
  routeChannelExists: boolean;
  selectedChannelId: string | null;
  selectedChannelViewId: string | null;
  selectedChannelEntryLifecycle: ChatLifecycleState | null;
  draftLeadCatId: string | null;
  showingMyCatDirectLane: boolean;
  routeDirectLaneSummary: { id: string } | null;
  readySelectedChannel: SelectedChannelView | null;
}) {
  const {
    state,
    setState,
    navigate,
    busy,
    routeChannelId,
    routeChannelExists,
    selectedChannelId,
    selectedChannelViewId,
    selectedChannelEntryLifecycle,
    draftLeadCatId,
    showingMyCatDirectLane,
    routeDirectLaneSummary,
    readySelectedChannel,
  } = options;

  useEffect(() => {
    const controller = new AbortController();

    void fetchAppShell(controller.signal)
      .then((payload) => {
        const nextPayload = routeChannelId
          ? preserveCachedOptimisticUserMessageAfterRefresh(payload, routeChannelId)
          : payload;
        startTransition(() => {
          setState({ status: 'ready', payload: nextPayload });
        });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown renderer error',
          });
        }
      });

    return () => controller.abort();
  }, [routeChannelId, setState]);

  useEffect(() => {
    if (state.status !== 'ready' || !routeChannelId) {
      return;
    }

    if (isComposerBusy(busy)) {
      return;
    }

    if (isOptimisticDraftChannelId(routeChannelId)) {
      return;
    }

    if (!routeChannelExists) {
      navigate(resolveVisibleChatPath(state.payload.chat.channels, selectedChannelId), { replace: true });
      return;
    }

    if (!shouldWakeRouteChannelOnEntry({
      routeChannelId,
      routeChannelExists,
      selectedChannelId,
      selectedChannelViewId,
      entryLifecycleState: selectedChannelEntryLifecycle,
    })) {
      return;
    }

    const controller = new AbortController();
    updateSelectedChannel(routeChannelId, controller.signal)
      .then((payload) => {
        if (!controller.signal.aborted) {
          startTransition(() => setState({
            status: 'ready',
            payload: preserveCachedOptimisticUserMessageAfterRefresh(payload, routeChannelId),
          }));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          navigate(resolveVisibleChatPath(state.payload.chat.channels, selectedChannelId), { replace: true });
        }
      });

    return () => controller.abort();
  }, [
    busy,
    navigate,
    routeChannelExists,
    routeChannelId,
    selectedChannelEntryLifecycle,
    selectedChannelId,
    selectedChannelViewId,
    setState,
    state,
  ]);

  useEffect(() => {
    if (state.status !== 'ready' || !draftLeadCatId) {
      return;
    }

    const catExists = state.payload.chat.cats.some((cat) =>
      cat.id === draftLeadCatId && cat.status === 'active');
    if (!catExists) {
      navigate(
        showingMyCatDirectLane
          ? resolveVisibleChatPath(state.payload.chat.channels, state.payload.chat.selectedChannelId)
          : NEW_CHAT_PATH,
        { replace: true },
      );
    }
  }, [draftLeadCatId, navigate, showingMyCatDirectLane, state]);

  useEffect(() => {
    if (
      state.status !== 'ready'
      || !showingMyCatDirectLane
      || !draftLeadCatId
      || !routeDirectLaneSummary
      || (
        readySelectedChannel
        && isDirectLaneChannel(readySelectedChannel)
        && readySelectedChannel.roomRouting.leadParticipantId === draftLeadCatId
      )
    ) {
      return;
    }

    const controller = new AbortController();
    updateSelectedChannel(routeDirectLaneSummary.id, controller.signal)
      .then((payload) => {
        if (!controller.signal.aborted) {
          startTransition(() => setState({
            status: 'ready',
            payload: preserveCachedOptimisticUserMessageAfterRefresh(
              payload,
              routeDirectLaneSummary.id,
            ),
          }));
        }
      })
      .catch(() => {
        // Keep the route on the in-place lane even if the hidden backing channel
        // could not be reselected; the draft surface remains the fallback.
      });

    return () => controller.abort();
  }, [
    draftLeadCatId,
    readySelectedChannel,
    routeDirectLaneSummary,
    setState,
    showingMyCatDirectLane,
    state.status,
  ]);
}

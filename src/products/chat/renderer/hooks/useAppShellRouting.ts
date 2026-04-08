import {
  startTransition,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { NavigateFunction } from 'react-router-dom';

import { isComposerSelectionBlocked } from '../../../../shared/composer.js';
import type { AppShellPayload } from '../../api/contracts';
import {
  fetchAppShell,
  updateSelectedChannel,
} from '../api';
import {
  resolveDraftRouteContext,
  resolveMissingDraftLeadPath,
} from '../draftParticipants.js';
import {
  isOptimisticDraftChannelId,
  resolveVisibleChatPath,
} from '../../shared/channelPaths';
import { shouldWakeRouteChannelOnEntry } from '../../shared/channelEntry';
import { isDirectLaneChannel } from '../../shared/channelTopology';
import type { ChatLifecycleState } from '../../shared/lifecycle';
import { type SelectedChannelView } from '../chatUtils';

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
  draftDefaultRecipientCatId: string | null;
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
    draftDefaultRecipientCatId,
    showingMyCatDirectLane,
    routeDirectLaneSummary,
    readySelectedChannel,
  } = options;
  const draftRoute = resolveDraftRouteContext({
    draftDefaultRecipientCatId,
    showingMyCatDirectLane,
  });

  useEffect(() => {
    const controller = new AbortController();

    void fetchAppShell(controller.signal)
      .then((payload) => {
        startTransition(() => {
          setState({ status: 'ready', payload });
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

    if (isComposerSelectionBlocked(busy)) {
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
          startTransition(() => setState({ status: 'ready', payload }));
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
    if (state.status !== 'ready' || !draftDefaultRecipientCatId) {
      return;
    }

    const catExists = state.payload.chat.cats.some((cat) =>
      cat.id === draftDefaultRecipientCatId && cat.status === 'active');
    if (!catExists) {
      navigate(resolveMissingDraftLeadPath({
        route: draftRoute,
        channels: state.payload.chat.channels,
        selectedChannelId: state.payload.chat.selectedChannelId,
      }), { replace: true });
    }
  }, [draftDefaultRecipientCatId, draftRoute.isDirectLaneRoute, navigate, state]);

  useEffect(() => {
    if (
      state.status !== 'ready'
      || !showingMyCatDirectLane
      || !draftDefaultRecipientCatId
      || !routeDirectLaneSummary
      || (
        readySelectedChannel
        && isDirectLaneChannel(readySelectedChannel)
        && readySelectedChannel.roomRouting.defaultRecipientId === draftDefaultRecipientCatId
      )
    ) {
      return;
    }

    const controller = new AbortController();
    updateSelectedChannel(routeDirectLaneSummary.id, controller.signal)
      .then((payload) => {
        if (!controller.signal.aborted) {
          startTransition(() => setState({ status: 'ready', payload }));
        }
      })
      .catch(() => {
        // Keep the route on the in-place lane even if the hidden backing channel
        // could not be reselected; the draft surface remains the fallback.
      });

    return () => controller.abort();
  }, [
    draftDefaultRecipientCatId,
    readySelectedChannel,
    routeDirectLaneSummary,
    setState,
    showingMyCatDirectLane,
    state.status,
  ]);
}

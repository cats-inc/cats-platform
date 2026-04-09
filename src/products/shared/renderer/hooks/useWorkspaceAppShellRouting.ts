import {
  startTransition,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { NavigateFunction } from 'react-router-dom';

import { isComposerBusy } from '../../../../shared/composer.js';
import type { AppShellPayload, ChatChannelSummary } from '../../api/workspaceContracts.js';
import {
  fetchAppShell,
  updateSelectedChannel,
} from '../api/index.js';
import {
  buildWorkspaceChannelPath,
  isOptimisticDraftChannelId,
  resolveWorkspaceNewChatPath,
  resolveWorkspaceVisibleChatPath,
} from '../../channelPaths.js';
import { shouldWakeRouteChannelOnEntry, type SelectedChannelView } from '../../channelEntry.js';
import { isDirectLaneChannel } from '../../channelTopology.js';
import type { ChatLifecycleState } from '../../lifecycle.js';

type LoadStateLike =
  | { status: 'loading' }
  | { status: 'ready'; payload: AppShellPayload }
  | { status: 'error'; message: string };

export interface WorkspaceAppShellRoutingOptions {
  state: LoadStateLike;
  setState: Dispatch<SetStateAction<LoadStateLike>>;
  navigate: NavigateFunction;
  busy: string;
  chatPrefix: string;
  routeChannelId: string | null;
  routeChannelExists: boolean;
  selectedChannelId: string | null;
  selectedChannelViewId: string | null;
  selectedChannelEntryLifecycle: ChatLifecycleState | null;
  draftDefaultRecipientCatId: string | null;
  showingMyCatDirectLane: boolean;
  routeDirectLaneSummary: { id: string } | null;
  readySelectedChannel: SelectedChannelView | null;
}

export function useWorkspaceAppShellRouting(options: WorkspaceAppShellRoutingOptions) {
  const {
    state,
    setState,
    navigate,
    busy,
    chatPrefix,
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
  }, [setState]);

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
      navigate(
        resolveWorkspaceVisibleChatPath(
          chatPrefix,
          state.payload.chat.channels as ReadonlyArray<Pick<ChatChannelSummary, 'id' | 'roomMode' | 'channelKind'>>,
          selectedChannelId,
        ),
        { replace: true },
      );
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
          navigate(
            resolveWorkspaceVisibleChatPath(
              chatPrefix,
              state.payload.chat.channels as ReadonlyArray<Pick<ChatChannelSummary, 'id' | 'roomMode' | 'channelKind'>>,
              selectedChannelId,
            ),
            { replace: true },
          );
        }
      });

    return () => controller.abort();
  }, [
    busy,
    chatPrefix,
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
      navigate(
        showingMyCatDirectLane
          ? resolveWorkspaceVisibleChatPath(
              chatPrefix,
              state.payload.chat.channels as ReadonlyArray<Pick<ChatChannelSummary, 'id' | 'roomMode' | 'channelKind'>>,
              state.payload.chat.selectedChannelId,
            )
          : resolveWorkspaceNewChatPath(chatPrefix),
        { replace: true },
      );
    }
  }, [chatPrefix, draftDefaultRecipientCatId, navigate, showingMyCatDirectLane, state]);

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

export function createUseAppShellRouting(chatPrefix: string) {
  return function useAppShellRouting(
    options: Omit<WorkspaceAppShellRoutingOptions, 'chatPrefix'>,
  ) {
    return useWorkspaceAppShellRouting({
      ...options,
      chatPrefix,
    });
  };
}

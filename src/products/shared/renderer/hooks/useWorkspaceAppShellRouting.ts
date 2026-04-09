import {
  startTransition,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { NavigateFunction } from 'react-router-dom';

import {
  isComposerBusy,
} from '../../../../shared/composer.js';
import type { AppShellPayload, ChatChannelSummary } from '../../api/workspaceContracts.js';
import {
  fetchAppShell as fetchWorkspaceAppShell,
  updateSelectedChannel as updateWorkspaceSelectedChannel,
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

type RoutingChannelLike = Pick<ChatChannelSummary, 'id' | 'roomMode' | 'channelKind'>;
type RoutingCatLike = { id: string; status: string };

export interface WorkspaceRoutingPayloadLike {
  chat: {
    channels: ReadonlyArray<RoutingChannelLike>;
    cats: ReadonlyArray<RoutingCatLike>;
    selectedChannelId: string | null;
  };
}

type LoadStateLike<TPayload extends WorkspaceRoutingPayloadLike> =
  | { status: 'loading' }
  | { status: 'ready'; payload: TPayload }
  | { status: 'error'; message: string };

export interface WorkspaceAppShellRoutingOptions<
  TPayload extends WorkspaceRoutingPayloadLike = AppShellPayload,
> {
  state: LoadStateLike<TPayload>;
  setState: Dispatch<SetStateAction<LoadStateLike<TPayload>>>;
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
  fetchAppShell?: (signal: AbortSignal) => Promise<TPayload>;
  updateSelectedChannel?: (channelId: string, signal: AbortSignal) => Promise<TPayload>;
  isRouteSelectionBlocked?: (busy: string | null | undefined) => boolean;
  resolveMissingDraftDefaultRecipientPath?: (input: {
    channels: ReadonlyArray<RoutingChannelLike>;
    selectedChannelId: string | null;
    draftDefaultRecipientCatId: string;
    showingMyCatDirectLane: boolean;
  }) => string;
}

export function useWorkspaceAppShellRouting<
  TPayload extends WorkspaceRoutingPayloadLike = AppShellPayload,
>(options: WorkspaceAppShellRoutingOptions<TPayload>) {
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
    fetchAppShell = fetchWorkspaceAppShell as unknown as (signal: AbortSignal) => Promise<TPayload>,
    updateSelectedChannel = updateWorkspaceSelectedChannel as unknown as (
      channelId: string,
      signal: AbortSignal,
    ) => Promise<TPayload>,
    isRouteSelectionBlocked = isComposerBusy,
    resolveMissingDraftDefaultRecipientPath,
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

    if (isRouteSelectionBlocked(busy)) {
      return;
    }

    if (isOptimisticDraftChannelId(routeChannelId)) {
      return;
    }

    if (!routeChannelExists) {
      navigate(
        resolveWorkspaceVisibleChatPath(
          chatPrefix,
          state.payload.chat.channels,
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
              state.payload.chat.channels,
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
        resolveMissingDraftDefaultRecipientPath?.({
          channels: state.payload.chat.channels,
          selectedChannelId: state.payload.chat.selectedChannelId,
          draftDefaultRecipientCatId,
          showingMyCatDirectLane,
        })
          ?? (
            showingMyCatDirectLane
              ? resolveWorkspaceVisibleChatPath(
                  chatPrefix,
                  state.payload.chat.channels,
                  state.payload.chat.selectedChannelId,
                )
              : resolveWorkspaceNewChatPath(chatPrefix)
          ),
        { replace: true },
      );
    }
  }, [
    chatPrefix,
    draftDefaultRecipientCatId,
    navigate,
    resolveMissingDraftDefaultRecipientPath,
    showingMyCatDirectLane,
    state,
  ]);

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
  return function useAppShellRouting<
    TPayload extends WorkspaceRoutingPayloadLike = AppShellPayload,
  >(
    options: Omit<WorkspaceAppShellRoutingOptions<TPayload>, 'chatPrefix'>,
  ) {
    return useWorkspaceAppShellRouting({
      ...options,
      chatPrefix,
    });
  };
}

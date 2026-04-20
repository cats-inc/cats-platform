import {
  startTransition,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { NavigateFunction } from 'react-router-dom';

import {
  doesComposerSelectionBlockChannelRoute,
} from '../../../../shared/composer.js';
import type { WorkspaceBusyState } from '../../../../shared/workspaceBusy.js';
import type { PlatformSurfaceId } from '../../../../shared/platform-contract.js';
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
import {
  consumeCrossSurfaceNavigationHandoff,
} from '../crossSurfaceNavigationHandoff.js';

const APP_SHELL_BACKGROUND_REFRESH_MS = 5_000;

type RoutingChannelLike = Pick<ChatChannelSummary, 'id' | 'roomMode' | 'channelKind'>;
type RoutingCatLike = { id: string; status: string };

export interface WorkspaceRoutingPayloadLike {
  chat: {
    channels: ReadonlyArray<RoutingChannelLike>;
    cats: ReadonlyArray<RoutingCatLike>;
    selectedChannelId: string | null;
  };
}

interface BackgroundRefreshPayloadLike extends WorkspaceRoutingPayloadLike {
  runtime: AppShellPayload['runtime'];
  runtimeSetup: AppShellPayload['runtimeSetup'];
  metadata: AppShellPayload['metadata'];
  bootstrapAttemptId: AppShellPayload['bootstrapAttemptId'];
}

type LoadStateLike<TPayload extends WorkspaceRoutingPayloadLike> =
  | { status: 'loading' }
  | { status: 'ready'; payload: TPayload }
  | { status: 'error'; message: string };

export interface WorkspaceAppShellRoutingOptions<
  TPayload extends BackgroundRefreshPayloadLike = AppShellPayload,
> {
  state: LoadStateLike<TPayload>;
  setState: Dispatch<SetStateAction<LoadStateLike<TPayload>>>;
  navigate: NavigateFunction;
  busy: WorkspaceBusyState;
  surface: PlatformSurfaceId;
  currentPath: string;
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
  isRouteSelectionBlocked?: (
    busy: WorkspaceBusyState | null | undefined,
    routeChannelId: string | null,
  ) => boolean;
  resolveMissingDraftDefaultRecipientPath?: (input: {
    channels: ReadonlyArray<RoutingChannelLike>;
    selectedChannelId: string | null;
    draftDefaultRecipientCatId: string;
    showingMyCatDirectLane: boolean;
  }) => string;
}

export function useWorkspaceAppShellRouting<
  TPayload extends BackgroundRefreshPayloadLike = AppShellPayload,
>(options: WorkspaceAppShellRoutingOptions<TPayload>) {
  const {
    state,
    setState,
    navigate,
    busy,
    surface,
    currentPath,
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
    fetchAppShell =
      fetchWorkspaceAppShell as unknown as (signal: AbortSignal) => Promise<TPayload>,
    updateSelectedChannel = updateWorkspaceSelectedChannel as unknown as (
      channelId: string,
      signal: AbortSignal,
    ) => Promise<TPayload>,
    isRouteSelectionBlocked = doesComposerSelectionBlockChannelRoute,
    resolveMissingDraftDefaultRecipientPath,
  } = options;
  const readyPayload = state.status === 'ready' ? state.payload : null;
  const routeSelectionVisibleChatPath = readyPayload
    ? resolveWorkspaceVisibleChatPath(
        chatPrefix,
        readyPayload.chat.channels,
        selectedChannelId,
      )
    : resolveWorkspaceNewChatPath(chatPrefix);
  const draftRecipientFallbackPath =
    readyPayload && draftDefaultRecipientCatId
      ? (
          resolveMissingDraftDefaultRecipientPath?.({
            channels: readyPayload.chat.channels,
            selectedChannelId: readyPayload.chat.selectedChannelId,
            draftDefaultRecipientCatId,
            showingMyCatDirectLane,
          })
            ?? (
              showingMyCatDirectLane
                ? resolveWorkspaceVisibleChatPath(
                    chatPrefix,
                    readyPayload.chat.channels,
                    readyPayload.chat.selectedChannelId,
                  )
                : resolveWorkspaceNewChatPath(chatPrefix)
            )
        )
      : null;
  const draftRecipientAvailable = draftDefaultRecipientCatId
    ? readyPayload?.chat.cats.some((cat) =>
      cat.id === draftDefaultRecipientCatId && cat.status === 'active')
    : false;
  const routeDirectLaneSummaryId = routeDirectLaneSummary?.id ?? null;
  const readySelectedDirectLaneRecipientId =
    readySelectedChannel && isDirectLaneChannel(readySelectedChannel)
      ? readySelectedChannel.roomRouting.defaultRecipientId ?? null
      : null;
  const initialNavigationMatchRef = useRef({
    surface,
    path: currentPath,
  });
  const initialHadReadyStateRef = useRef(state.status === 'ready');

  function shouldApplyBackgroundRefresh(
    currentPayload: TPayload,
    nextPayload: TPayload,
  ): boolean {
    const currentGeneratedAt = Date.parse(currentPayload.metadata.generatedAt);
    const nextGeneratedAt = Date.parse(nextPayload.metadata.generatedAt);

    if (Number.isNaN(currentGeneratedAt) || Number.isNaN(nextGeneratedAt)) {
      return true;
    }

    return nextGeneratedAt >= currentGeneratedAt;
  }

  useEffect(() => {
    const controller = new AbortController();
    const warmNavigationHandoff = consumeCrossSurfaceNavigationHandoff({
      surface: initialNavigationMatchRef.current.surface,
      path: initialNavigationMatchRef.current.path,
    });
    const warmPayload =
      warmNavigationHandoff?.snapshot?.appShellPayload as unknown as TPayload | undefined;

    if (warmPayload && !initialHadReadyStateRef.current) {
      startTransition(() => {
        setState({ status: 'ready', payload: warmPayload });
      });
    }

    void fetchAppShell(controller.signal)
      .then((payload) => {
        startTransition(() => {
          setState({ status: 'ready', payload });
        });
      })
      .catch((error: unknown) => {
        if (
          !controller.signal.aborted
          && !warmPayload
          && !initialHadReadyStateRef.current
        ) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown renderer error',
          });
        }
      });

    return () => controller.abort();
  }, [fetchAppShell, setState]);

  useEffect(() => {
    if (
      state.status !== 'ready'
      || typeof window === 'undefined'
      || typeof document === 'undefined'
    ) {
      return;
    }

    let refreshController: AbortController | null = null;

    const refreshRuntimeStatusInBackground = () => {
      if (document.visibilityState === 'hidden' || refreshController) {
        return;
      }

      const controller = new AbortController();
      refreshController = controller;

      void fetchAppShell(controller.signal)
        .then((nextPayload) => {
          if (controller.signal.aborted) {
            return;
          }

          startTransition(() => {
            setState((current) => {
              if (
                current.status !== 'ready'
                || !shouldApplyBackgroundRefresh(current.payload, nextPayload)
              ) {
                return current;
              }

              return {
                status: 'ready',
                payload: {
                  ...current.payload,
                  runtime: nextPayload.runtime,
                  runtimeSetup: nextPayload.runtimeSetup,
                  metadata: nextPayload.metadata,
                  bootstrapAttemptId: nextPayload.bootstrapAttemptId,
                },
              };
            });
          });
        })
        .catch(() => {})
        .finally(() => {
          if (refreshController === controller) {
            refreshController = null;
          }
        });
    };

    const intervalId = window.setInterval(
      refreshRuntimeStatusInBackground,
      APP_SHELL_BACKGROUND_REFRESH_MS,
    );
    const handleFocus = () => {
      refreshRuntimeStatusInBackground();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshRuntimeStatusInBackground();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      if (refreshController) {
        refreshController.abort();
      }
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchAppShell, setState, state.status]);

  useEffect(() => {
    if (!readyPayload || !routeChannelId) {
      return;
    }

    if (isRouteSelectionBlocked(busy, routeChannelId)) {
      return;
    }

    if (isOptimisticDraftChannelId(routeChannelId)) {
      return;
    }

    if (!routeChannelExists) {
      navigate(routeSelectionVisibleChatPath, { replace: true });
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
          navigate(routeSelectionVisibleChatPath, { replace: true });
        }
      });

    return () => controller.abort();
  }, [
    busy,
    chatPrefix,
    navigate,
    routeChannelExists,
    routeChannelId,
    routeSelectionVisibleChatPath,
    selectedChannelEntryLifecycle,
    selectedChannelId,
    selectedChannelViewId,
    setState,
    readyPayload,
  ]);

  useEffect(() => {
    if (!readyPayload || !draftDefaultRecipientCatId) {
      return;
    }

    if (!draftRecipientAvailable && draftRecipientFallbackPath) {
      navigate(draftRecipientFallbackPath, { replace: true });
    }
  }, [
    draftDefaultRecipientCatId,
    draftRecipientAvailable,
    draftRecipientFallbackPath,
    navigate,
    readyPayload,
  ]);

  useEffect(() => {
    if (
      !readyPayload
      || !showingMyCatDirectLane
      || !draftDefaultRecipientCatId
      || !routeDirectLaneSummaryId
      || (
        readySelectedDirectLaneRecipientId
        && readySelectedDirectLaneRecipientId === draftDefaultRecipientCatId
      )
    ) {
      return;
    }

    const controller = new AbortController();
    updateSelectedChannel(routeDirectLaneSummaryId, controller.signal)
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
    readyPayload,
    readySelectedDirectLaneRecipientId,
    routeDirectLaneSummaryId,
    setState,
    showingMyCatDirectLane,
  ]);
}

export function createUseAppShellRouting(chatPrefix: string) {
  return function useAppShellRouting<
    TPayload extends BackgroundRefreshPayloadLike = AppShellPayload,
  >(
    options: Omit<WorkspaceAppShellRoutingOptions<TPayload>, 'chatPrefix'>,
  ) {
    return useWorkspaceAppShellRouting({
      ...options,
      chatPrefix,
    });
  };
}

import {
  startTransition,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { NavigateFunction } from 'react-router-dom';

import type { AppShellPayload as WorkspaceAppShellPayload } from '../../api/workspaceContracts.js';
import type { PlatformSurfaceId } from '../../../../shared/platform-contract.js';
import { resolvePlatformSurfaceRoutePrefix } from '../../../../shared/platformProducts.js';
import {
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../../shared/i18n/index.js';
import {
  buildWorkspaceChannelPath,
  buildWorkspaceNewGroupChatPath,
  buildWorkspaceNewChatPath,
  buildWorkspaceNewParallelChatPath,
  resolveWorkspaceVisibleChatPath,
} from '../../channelPaths.js';
import {
  prefetchCrossSurfaceNavigationTarget,
} from '../crossSurfaceNavigationRegistry.js';
import {
  stageCrossSurfaceConversationNavigationHandoff,
} from '../crossSurfaceConversationNavigation.js';
import {
  buildMyCatPathForPrefix,
  resolveMyCatNavigationTargetForPrefix,
} from '../../../../app/renderer/productShell/myCatNavigation.js';
import type { RoomRoutingMode } from '../../../../shared/roomRouting.js';
import {
  deleteChatChannel as deleteWorkspaceChatChannel,
  deleteGlobalCat as deleteWorkspaceGlobalCat,
  deleteParallelChatGroup as deleteWorkspaceParallelChatGroup,
  renameChatChannel as renameWorkspaceChatChannel,
  renameParallelChatGroup as renameWorkspaceParallelChatGroup,
  resetSetup as resetWorkspaceSetup,
  ungroupParallelChatGroup as ungroupWorkspaceParallelChatGroup,
} from '../api/index.js';
import type { DeleteChatChannelResult } from '../api/chat.js';
import { resetComposerDraftState } from '../composerDraftState.js';
import {
  buildDeleteCatConfirmation,
  buildDeleteParallelChatGroupConfirmation,
} from '../deleteConfirmations.js';
import { formatSettingsCatsRegistryMutationError } from './settingsCatsRegistryErrorLabels.js';
import { formatWorkspaceNavigationMutationError } from './workspaceNavigationErrorLabels.js';
import { syncDesktopHostPlatformShellState } from '../../../../app/renderer/setup/desktopHostBridge.js';
import { clearRememberedExecutionLabels } from '../../../../shared/executionLabel.js';
import {
  clearBusyState,
  createCatBusyState,
  createChannelBusyState,
  createConcurrentGroupBusyState,
  createSetupBusyState,
  type WorkspaceBusyState,
} from '../../../../shared/workspaceBusy.js';
import { type RuntimeSessionPolicy } from '../../../../shared/runtimeSessionPolicy.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';

type WorkspaceNavigationTranslator = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

export interface WorkspaceNavigationChannelRef {
  id: string;
  title?: string | null;
  originSurface?: PlatformSurfaceId | null;
  channelKind?: 'chat_channel' | 'direct_message' | null;
  defaultRecipientCatId?: string | null;
  roomMode?: RoomRoutingMode | null;
}

export interface WorkspaceNavigationPayloadLike {
  bootstrapAttemptId?: string | null;
  setupCompleteAt?: string | null;
  products?: ReadonlyArray<{
    id?: string;
    productName?: string;
    routePrefix?: string;
    installState?: string;
    setup?: {
      selectable?: boolean;
      disabledReason?: string;
    } | null;
  }>;
  chat: {
    channels: ReadonlyArray<WorkspaceNavigationChannelRef>;
    cats?: ReadonlyArray<{
      id: string;
      name?: string | null;
    }>;
    parallelChatGroups?: ReadonlyArray<{
      id: string;
      title: string;
    }>;
    selectedChannelId: string | null;
  };
}

export interface WorkspaceAppNavigationApi<TPayload extends WorkspaceNavigationPayloadLike> {
  deleteChatChannel: (channelId: string) => Promise<TPayload | DeleteChatChannelResult<TPayload>>;
  deleteGlobalCat: (catId: string) => Promise<TPayload>;
  deleteParallelChatGroup: (groupId: string) => Promise<TPayload>;
  renameChatChannel: (channelId: string, title: string) => Promise<TPayload>;
  renameParallelChatGroup: (groupId: string, input: { title?: string }) => Promise<TPayload>;
  resetSetup: () => Promise<TPayload>;
  ungroupParallelChatGroup: (groupId: string) => Promise<TPayload>;
}

const defaultNavigationApi: WorkspaceAppNavigationApi<WorkspaceAppShellPayload> = {
  deleteChatChannel: deleteWorkspaceChatChannel,
  deleteGlobalCat: deleteWorkspaceGlobalCat,
  deleteParallelChatGroup: deleteWorkspaceParallelChatGroup,
  renameChatChannel: renameWorkspaceChatChannel,
  renameParallelChatGroup: renameWorkspaceParallelChatGroup,
  resetSetup: resetWorkspaceSetup,
  ungroupParallelChatGroup: ungroupWorkspaceParallelChatGroup,
};

function isDeleteChatChannelResult<TPayload extends WorkspaceNavigationPayloadLike>(
  value: TPayload | DeleteChatChannelResult<TPayload>,
): value is DeleteChatChannelResult<TPayload> {
  return Boolean(
    value
    && typeof value === 'object'
    && 'payload' in value
    && 'runtimeCleanup' in value,
  );
}

function resolveDeleteChannelFeedback<TPayload extends WorkspaceNavigationPayloadLike>(
  result: TPayload | DeleteChatChannelResult<TPayload>,
  t: WorkspaceNavigationTranslator,
): string {
  if (!isDeleteChatChannelResult(result) || result.runtimeCleanup.retainedSessionCount === 0) {
    return '';
  }

  const count = result.runtimeCleanup.retainedSessionCount;
  return t(
    count === 1
      ? messageKeys.sharedWorkspaceNavigationDeleteChannelRuntimeCleanupFeedbackOne
      : messageKeys.sharedWorkspaceNavigationDeleteChannelRuntimeCleanupFeedbackMany,
    { count },
  );
}

export type WorkspaceNavigationLoadState<
  TPayload extends WorkspaceNavigationPayloadLike = WorkspaceAppShellPayload,
> =
  | { status: 'loading' }
  | { status: 'ready'; payload: TPayload }
  | { status: 'error'; message: string };

export interface UseWorkspaceAppNavigationActionsOptions<
  TExecutionTargetValue,
  TPayload extends WorkspaceNavigationPayloadLike = WorkspaceAppShellPayload,
  TDraftParticipant = never,
> {
  state: WorkspaceNavigationLoadState<TPayload>;
  setState: Dispatch<SetStateAction<WorkspaceNavigationLoadState<TPayload>>>;
  navigate: NavigateFunction;
  platformShellSurface: PlatformSurfaceId;
  setBusy: Dispatch<SetStateAction<WorkspaceBusyState>>;
  setFeedback: Dispatch<SetStateAction<string>>;
  setComposerDraft: Dispatch<SetStateAction<string>>;
  setAccountMenuOpen: Dispatch<SetStateAction<boolean>>;
  setAddCatOpen: Dispatch<SetStateAction<boolean>>;
  setPlusMenuOpen: Dispatch<SetStateAction<boolean>>;
  setChannelPlusMenuOpen: Dispatch<SetStateAction<boolean>>;
  setDraftCwd: Dispatch<SetStateAction<string | null>>;
  setDraftCatIds: Dispatch<SetStateAction<string[]>>;
  setDraftTemporaryParticipants?: Dispatch<SetStateAction<TDraftParticipant[]>>;
  setDraftHighlightedCatId: Dispatch<SetStateAction<string | null>>;
  setDraftCatExecutionTargetOverrides: Dispatch<SetStateAction<Map<string, TExecutionTargetValue>>>;
  setDraftSurface?: Dispatch<SetStateAction<PlatformSurfaceId>>;
  setDraftRuntimeSessionPolicy?: Dispatch<SetStateAction<RuntimeSessionPolicy>>;
  setDraftWorkflowShape?: Dispatch<SetStateAction<'sequential' | 'concurrent'>>;
  setDraftAudienceKeys?: Dispatch<SetStateAction<string[] | null>>;
  resetDraftParallelChatTargets?: (options?: { includeCompareTarget?: boolean }) => void;
  createInitialGroupParticipants?: () => TDraftParticipant[];
  seedInitialGroupParticipants?: boolean;
  setDraftFiles: Dispatch<SetStateAction<File[]>>;
  setChannelFiles: Dispatch<SetStateAction<File[]>>;
  navigationApi?: WorkspaceAppNavigationApi<TPayload>;
  confirm?: (options: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
}

export function useWorkspaceAppNavigationActions<
  TExecutionTargetValue,
  TPayload extends WorkspaceNavigationPayloadLike = WorkspaceAppShellPayload,
  TDraftParticipant = never,
>(
  options: UseWorkspaceAppNavigationActionsOptions<TExecutionTargetValue, TPayload, TDraftParticipant>,
) {
  const {
    state,
    setState,
    navigate,
    platformShellSurface,
    setBusy,
    setFeedback,
    setComposerDraft,
    setAccountMenuOpen,
    setAddCatOpen,
    setPlusMenuOpen,
    setChannelPlusMenuOpen,
    setDraftCwd,
    setDraftCatIds,
    setDraftTemporaryParticipants,
    setDraftHighlightedCatId,
    setDraftCatExecutionTargetOverrides,
    setDraftSurface,
    setDraftRuntimeSessionPolicy,
    setDraftWorkflowShape,
    setDraftAudienceKeys,
    resetDraftParallelChatTargets,
    createInitialGroupParticipants,
    seedInitialGroupParticipants = true,
    setDraftFiles,
    setChannelFiles,
    navigationApi: providedNavigationApi,
    confirm: confirmDialog,
  } = options;
  const { t } = useI18n();
  const chatPrefix = resolvePlatformSurfaceRoutePrefix(platformShellSurface);
  const navigationApi = (
    providedNavigationApi ?? defaultNavigationApi
  ) as WorkspaceAppNavigationApi<TPayload>;

  const clearDraftRouteState = useCallback((options?: {
    includeCompareTarget?: boolean;
  }) => {
    setAddCatOpen(false);
    setPlusMenuOpen(false);
    resetComposerDraftState({
      setDraftCwd,
      setDraftCatIds,
      setDraftTemporaryParticipants,
      setDraftHighlightedCatId,
      setDraftCatExecutionTargetOverrides,
      resetDraftSurface: () => setDraftSurface?.(platformShellSurface),
      setDraftRuntimeSessionPolicy,
      setDraftWorkflowShape,
      setDraftAudienceKeys,
      resetDraftParallelChatTargets: () => {
        resetDraftParallelChatTargets?.({
          includeCompareTarget: options?.includeCompareTarget ?? false,
        });
      },
      setDraftFiles,
      setChannelFiles,
    });
    setChannelPlusMenuOpen(false);
  }, [
    setAddCatOpen,
    setPlusMenuOpen,
    setDraftCwd,
    setDraftCatIds,
    setDraftTemporaryParticipants,
    setDraftHighlightedCatId,
    setDraftCatExecutionTargetOverrides,
    setDraftSurface,
    platformShellSurface,
    setDraftRuntimeSessionPolicy,
    setDraftWorkflowShape,
    setDraftAudienceKeys,
    resetDraftParallelChatTargets,
    setDraftFiles,
    setChannelFiles,
    setChannelPlusMenuOpen,
  ]);

  const onOpenChatsOverview = useCallback((): void => {
    if (state.status !== 'ready') {
      return;
    }

    navigate(
      resolveWorkspaceVisibleChatPath(
        chatPrefix,
        state.payload.chat.channels,
        state.payload.chat.selectedChannelId,
        platformShellSurface,
      ),
    );
    setFeedback('');
    setAddCatOpen(false);
  }, [chatPrefix, navigate, platformShellSurface, setAddCatOpen, setFeedback, state]);

  const onSelect = useCallback((channelId: string): void => {
    const selectedChannel = state.status === 'ready'
      ? state.payload.chat.channels.find((channel) => channel.id === channelId) ?? null
      : null;
    const targetSurface = selectedChannel?.originSurface ?? platformShellSurface;
    const targetRoute = stageCrossSurfaceConversationNavigationHandoff({
      sourceSurface: platformShellSurface,
      targetSurface,
      channelId,
    });
    if (targetRoute) {
      void prefetchCrossSurfaceNavigationTarget(targetSurface);
    }
    navigate(
      targetRoute?.path
        ?? buildWorkspaceChannelPath(
          resolvePlatformSurfaceRoutePrefix(targetSurface),
          channelId,
        ),
    );
    setFeedback('');
    setAddCatOpen(false);
    setChannelFiles([]);
    setChannelPlusMenuOpen(false);
  }, [
    navigate,
    platformShellSurface,
    setAddCatOpen,
    setChannelFiles,
    setChannelPlusMenuOpen,
    setFeedback,
    state,
  ]);

  const onRenameChannel = useCallback(async (channelId: string, title: string): Promise<void> => {
    setBusy(createChannelBusyState('rename', channelId));
    try {
      const payload = await navigationApi.renameChatChannel(channelId, title);
      startTransition(() => {
        setState({ status: 'ready', payload });
        setFeedback('');
      });
    } catch (error) {
      setFeedback(formatWorkspaceNavigationMutationError(
        error,
        t(messageKeys.sharedWorkspaceNavigationRenameChatError),
        t,
      ));
    } finally {
      setBusy(clearBusyState());
    }
  }, [navigationApi, setBusy, setFeedback, setState, t]);

  /* Variant of onDeleteChannel for chat's "Clear" action on a cat's
   * direct-lane row. Same channel-delete API call + state refresh,
   * but the post-delete navigation lands on the cat's DM URL instead
   * of `resolveWorkspaceVisibleChatPath` (which would fall back to
   * `/chat/new` when the just-deleted channel was the active one).
   * The DM route itself renders NewChatDraft when no direct-lane
   * channel exists, so the user stays "on" the cat. */
  const onClearDirectLane = useCallback(async (
    catId: string,
    channelId: string,
  ): Promise<void> => {
    setBusy(createChannelBusyState('delete', channelId));
    try {
      const result = await navigationApi.deleteChatChannel(channelId);
      const payload = isDeleteChatChannelResult(result) ? result.payload : result;
      startTransition(() => {
        setState({ status: 'ready', payload });
        setAddCatOpen(false);
        setFeedback('');
      });
      navigate(buildMyCatPathForPrefix(chatPrefix, catId));
    } catch (error) {
      setFeedback(formatWorkspaceNavigationMutationError(
        error,
        t(messageKeys.sharedWorkspaceNavigationDeleteChatError),
        t,
      ));
    } finally {
      setBusy(clearBusyState());
    }
  }, [
    chatPrefix,
    navigate,
    navigationApi,
    setAddCatOpen,
    setBusy,
    setFeedback,
    setState,
    t,
  ]);

  const onDeleteChannel = useCallback(async (channelId: string): Promise<void> => {
    setBusy(createChannelBusyState('delete', channelId));
    try {
      const result = await navigationApi.deleteChatChannel(channelId);
      const payload = isDeleteChatChannelResult(result) ? result.payload : result;
      const feedback = resolveDeleteChannelFeedback(result, t);
      startTransition(() => {
        setState({ status: 'ready', payload });
        setAddCatOpen(false);
        setFeedback(feedback);
      });
      navigate(
        resolveWorkspaceVisibleChatPath(
          chatPrefix,
          payload.chat.channels,
          payload.chat.selectedChannelId,
          platformShellSurface,
        ),
      );
    } catch (error) {
      setFeedback(formatWorkspaceNavigationMutationError(
        error,
        t(messageKeys.sharedWorkspaceNavigationDeleteChatError),
        t,
      ));
    } finally {
      setBusy(clearBusyState());
    }
  }, [
    chatPrefix,
    navigate,
    navigationApi,
    platformShellSurface,
    setAddCatOpen,
    setBusy,
    setFeedback,
    setState,
    t,
  ]);

  const onRenameParallelChatGroup = useCallback(async (
    groupId: string,
    title: string,
  ): Promise<void> => {
    setBusy(createConcurrentGroupBusyState('rename', groupId));
    try {
      const payload = await navigationApi.renameParallelChatGroup(groupId, { title });
      startTransition(() => {
        setState({ status: 'ready', payload });
        setFeedback('');
      });
    } catch (error) {
      setFeedback(formatWorkspaceNavigationMutationError(
        error,
        t(messageKeys.sharedWorkspaceNavigationRenameParallelChatError),
        t,
      ));
    } finally {
      setBusy(clearBusyState());
    }
  }, [navigationApi, setBusy, setFeedback, setState, t]);

  const onUngroupParallelChatGroup = useCallback(async (groupId: string): Promise<void> => {
    setBusy(createConcurrentGroupBusyState('ungroup', groupId));
    try {
      const payload = await navigationApi.ungroupParallelChatGroup(groupId);
      startTransition(() => {
        setState({ status: 'ready', payload });
        setFeedback('');
      });
    } catch (error) {
      setFeedback(formatWorkspaceNavigationMutationError(
        error,
        t(messageKeys.sharedWorkspaceNavigationUngroupParallelChatError),
        t,
      ));
    } finally {
      setBusy(clearBusyState());
    }
  }, [navigationApi, setBusy, setFeedback, setState, t]);

  const onDeleteParallelChatGroup = useCallback(async (groupId: string): Promise<void> => {
    const fallbackGroupTitle = t(messageKeys.sharedWorkspaceNavigationParallelChatFallbackName);
    const groupTitle = state.status === 'ready'
      ? (
          state.payload.chat.parallelChatGroups?.find((group) => group.id === groupId)?.title
          ?? fallbackGroupTitle
        )
      : fallbackGroupTitle;
    const confirmed = confirmDialog
      ? await confirmDialog(buildDeleteParallelChatGroupConfirmation(groupTitle, t))
      : true;
    if (!confirmed) return;

    setBusy(createConcurrentGroupBusyState('delete', groupId));
    try {
      const payload = await navigationApi.deleteParallelChatGroup(groupId);
      startTransition(() => {
        setState({ status: 'ready', payload });
        setAddCatOpen(false);
        setFeedback('');
      });
      navigate(
        resolveWorkspaceVisibleChatPath(
          chatPrefix,
          payload.chat.channels,
          payload.chat.selectedChannelId,
          platformShellSurface,
        ),
      );
    } catch (error) {
      setFeedback(formatWorkspaceNavigationMutationError(
        error,
        t(messageKeys.sharedWorkspaceNavigationDeleteParallelChatGroupError),
        t,
      ));
    } finally {
      setBusy(clearBusyState());
    }
  }, [
    chatPrefix,
    confirmDialog,
    navigate,
    navigationApi,
    platformShellSurface,
    setAddCatOpen,
    setBusy,
    setFeedback,
    setState,
    state,
    t,
  ]);

  const onDeleteCat = useCallback(async (catId: string): Promise<void> => {
    const catName = state.status === 'ready'
      ? (state.payload.chat.cats?.find((cat) => cat.id === catId)?.name ?? null)
      : null;
    const confirmed = confirmDialog
      ? await confirmDialog(buildDeleteCatConfirmation(catName, t))
      : true;
    if (!confirmed) return;
    setBusy(createCatBusyState('delete', catId));
    try {
      const payload = await navigationApi.deleteGlobalCat(catId);
      startTransition(() => setState({ status: 'ready', payload }));
    } catch (error) {
      setFeedback(formatSettingsCatsRegistryMutationError(
        error,
        t(messageKeys.sharedSettingsCatsDeleteError),
        t,
      ));
    } finally {
      setBusy(clearBusyState());
    }
  }, [confirmDialog, navigationApi, setBusy, setFeedback, setState, state, t]);

  const onNavigateSettings = useCallback((): void => {
    navigate('/settings/general', {
      state: { platformShellSurface },
    });
    setAccountMenuOpen(false);
    setAddCatOpen(false);
    setFeedback('');
  }, [navigate, platformShellSurface, setAccountMenuOpen, setAddCatOpen, setFeedback]);

  const onNavigateRuntime = useCallback((): void => {
    navigate('/settings/runtime', {
      state: { platformShellSurface },
    });
    setAccountMenuOpen(false);
    setAddCatOpen(false);
    setFeedback('');
  }, [navigate, platformShellSurface, setAccountMenuOpen, setAddCatOpen, setFeedback]);

  const onCreateNewCat = useCallback((): void => {
    navigate('/settings/cats/new', {
      state: { platformShellSurface },
    });
    setAccountMenuOpen(false);
    setAddCatOpen(false);
    setFeedback('');
  }, [navigate, platformShellSurface, setAccountMenuOpen, setAddCatOpen, setFeedback]);

  const onDirectChatCat = useCallback(async (catId: string): Promise<void> => {
    if (state.status !== 'ready') {
      return;
    }

    const target = resolveMyCatNavigationTargetForPrefix(
      chatPrefix,
      state.payload.chat.channels.slice(),
      catId,
    );
    setFeedback('');
    clearDraftRouteState();
    navigate(target.path);
  }, [chatPrefix, clearDraftRouteState, navigate, setFeedback, state]);

  const onResetSetup = useCallback(async (): Promise<void> => {
    const confirmed = confirmDialog
      ? await confirmDialog({
          title: t(messageKeys.settingsDataResetAllDataTitle),
          message: t(messageKeys.settingsDataResetAllDataDescription),
          confirmLabel: t(messageKeys.settingsDataResetButtonLabel),
        })
      : true;
    if (!confirmed) return;

    setBusy(createSetupBusyState());
    try {
      const payload = await navigationApi.resetSetup();
      clearRememberedExecutionLabels();
      await syncDesktopHostPlatformShellState({
        bootstrapAttemptId: payload.bootstrapAttemptId ?? null,
        setupCompleteAt: payload.setupCompleteAt ?? null,
        products: Array.isArray(payload.products) ? [...payload.products] : [],
      });
      window.location.href = '/';
    } catch (error) {
      setBusy(clearBusyState());
      throw error;
    }
  }, [confirmDialog, navigationApi, setBusy, t]);

  const onStartNewChat = useCallback(async (): Promise<void> => {
    navigate(buildWorkspaceNewChatPath(chatPrefix, null));
    setComposerDraft('');
    clearDraftRouteState({ includeCompareTarget: false });
    setFeedback('');
  }, [
    chatPrefix,
    clearDraftRouteState,
    navigate,
    setComposerDraft,
    setFeedback,
  ]);

  const onStartNewGroupChat = useCallback(async (): Promise<void> => {
    navigate(buildWorkspaceNewGroupChatPath(chatPrefix));
    setComposerDraft('');
    clearDraftRouteState({ includeCompareTarget: false });
    setFeedback('');
    if (seedInitialGroupParticipants) {
      setDraftTemporaryParticipants?.(createInitialGroupParticipants?.() ?? []);
    }
  }, [
    chatPrefix,
    clearDraftRouteState,
    navigate,
    setComposerDraft,
    setDraftTemporaryParticipants,
    createInitialGroupParticipants,
    seedInitialGroupParticipants,
    setFeedback,
  ]);

  const onStartNewParallelChat = useCallback(async (): Promise<void> => {
    navigate(buildWorkspaceNewParallelChatPath(chatPrefix));
    setComposerDraft('');
    clearDraftRouteState({ includeCompareTarget: true });
    setFeedback('');
  }, [
    chatPrefix,
    clearDraftRouteState,
    navigate,
    setComposerDraft,
    setFeedback,
  ]);

  return {
    onOpenChatsOverview,
    onSelect,
    onRenameChannel,
    onDeleteChannel,
    onClearDirectLane,
    onRenameParallelChatGroup,
    onUngroupParallelChatGroup,
    onDeleteParallelChatGroup,
    onDeleteCat,
    onNavigateSettings,
    onNavigateRuntime,
    onCreateNewCat,
    onDirectChatCat,
    onResetSetup,
    onStartNewChat,
    onStartNewGroupChat,
    onStartNewParallelChat,
  };
}

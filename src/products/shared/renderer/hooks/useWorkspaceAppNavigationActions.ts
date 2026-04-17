import {
  startTransition,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { NavigateFunction } from 'react-router-dom';

import type { AppShellPayload as WorkspaceAppShellPayload } from '../../api/workspaceContracts.js';
import {
  buildWorkspaceChannelPath,
  buildWorkspaceNewGroupChatPath,
  buildWorkspaceNewChatPath,
  buildWorkspaceNewParallelChatPath,
  resolveWorkspaceVisibleChatPath,
} from '../../channelPaths.js';
import { resolveMyCatNavigationTargetForPrefix } from '../../../../app/renderer/productShell/myCatNavigation.js';
import type { RoomRoutingMode } from '../../../../shared/roomRouting.js';
import {
  deleteChatChannel as deleteWorkspaceChatChannel,
  deleteGlobalCat as deleteWorkspaceGlobalCat,
  renameChatChannel as renameWorkspaceChatChannel,
  resetSetup as resetWorkspaceSetup,
} from '../api/index.js';
import { syncDesktopHostPlatformShellState } from '../../../../app/renderer/setup/desktopHostBridge.js';
import { clearRememberedExecutionLabels } from '../../../../shared/executionLabel.js';
import {
  clearBusyState,
  createCatBusyState,
  createChannelBusyState,
  createSetupBusyState,
  type WorkspaceBusyState,
} from '../../../../shared/workspaceBusy.js';
import {
  createDefaultRuntimeSessionPolicy,
  type RuntimeSessionPolicy,
} from '../../../../shared/runtimeSessionPolicy.js';

export interface WorkspaceNavigationChannelRef {
  id: string;
  channelKind?: 'boss_thread' | 'direct_lane' | 'multi_cat_room' | null;
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
    selectedChannelId: string | null;
  };
}

export interface WorkspaceAppNavigationApi<TPayload extends WorkspaceNavigationPayloadLike> {
  deleteChatChannel: (channelId: string) => Promise<TPayload>;
  deleteGlobalCat: (catId: string) => Promise<TPayload>;
  renameChatChannel: (channelId: string, title: string) => Promise<TPayload>;
  resetSetup: () => Promise<TPayload>;
}

const defaultNavigationApi: WorkspaceAppNavigationApi<WorkspaceAppShellPayload> = {
  deleteChatChannel: deleteWorkspaceChatChannel,
  deleteGlobalCat: deleteWorkspaceGlobalCat,
  renameChatChannel: renameWorkspaceChatChannel,
  resetSetup: resetWorkspaceSetup,
};

function resolveWorkspaceChatPrefix(
  platformShellSurface: 'chat' | 'work' | 'code',
): string {
  switch (platformShellSurface) {
    case 'chat':
      return '/chat';
    case 'work':
      return '/work';
    default:
      return '/code';
  }
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
  platformShellSurface: 'chat' | 'work' | 'code';
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
  setDraftRuntimeSessionPolicy?: Dispatch<SetStateAction<RuntimeSessionPolicy>>;
  setDraftWorkflowShape?: Dispatch<SetStateAction<'sequential' | 'concurrent'>>;
  setDraftAudienceKeys?: Dispatch<SetStateAction<string[] | null>>;
  resetDraftParallelChatTargets?: () => void;
  createInitialGroupParticipants?: () => TDraftParticipant[];
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
    setDraftRuntimeSessionPolicy,
    setDraftWorkflowShape,
    setDraftAudienceKeys,
    resetDraftParallelChatTargets,
    createInitialGroupParticipants,
    setDraftFiles,
    setChannelFiles,
    navigationApi: providedNavigationApi,
    confirm: confirmDialog,
  } = options;
  const chatPrefix = resolveWorkspaceChatPrefix(platformShellSurface);
  const navigationApi = (
    providedNavigationApi ?? defaultNavigationApi
  ) as WorkspaceAppNavigationApi<TPayload>;

  const clearDraftRouteState = useCallback(() => {
    setAddCatOpen(false);
    setPlusMenuOpen(false);
    setDraftCwd(null);
    setDraftCatIds([]);
    setDraftTemporaryParticipants?.([]);
    setDraftHighlightedCatId(null);
    setDraftCatExecutionTargetOverrides(new Map());
    setDraftRuntimeSessionPolicy?.(createDefaultRuntimeSessionPolicy());
    setDraftWorkflowShape?.('sequential');
    setDraftAudienceKeys?.(null);
    resetDraftParallelChatTargets?.();
    setDraftFiles([]);
    setChannelPlusMenuOpen(false);
    setChannelFiles([]);
  }, [
    setAddCatOpen,
    setPlusMenuOpen,
    setDraftCwd,
    setDraftCatIds,
    setDraftTemporaryParticipants,
    setDraftHighlightedCatId,
    setDraftCatExecutionTargetOverrides,
    setDraftRuntimeSessionPolicy,
    setDraftWorkflowShape,
    setDraftAudienceKeys,
    resetDraftParallelChatTargets,
    setDraftFiles,
    setChannelPlusMenuOpen,
    setChannelFiles,
  ]);

  const onOpenChatsOverview = useCallback((): void => {
    if (state.status !== 'ready') {
      return;
    }

    navigate(resolveWorkspaceVisibleChatPath(chatPrefix, state.payload.chat.channels, state.payload.chat.selectedChannelId));
    setFeedback('');
    setAddCatOpen(false);
  }, [chatPrefix, navigate, setAddCatOpen, setFeedback, state]);

  const onSelect = useCallback((channelId: string): void => {
    navigate(buildWorkspaceChannelPath(chatPrefix, channelId));
    setFeedback('');
    setAddCatOpen(false);
    setChannelFiles([]);
    setChannelPlusMenuOpen(false);
  }, [
    chatPrefix,
    navigate,
    setAddCatOpen,
    setChannelFiles,
    setChannelPlusMenuOpen,
    setFeedback,
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
      setFeedback(error instanceof Error ? error.message : 'Failed to rename chat.');
    } finally {
      setBusy(clearBusyState());
    }
  }, [navigationApi, setBusy, setFeedback, setState]);

  const onDeleteChannel = useCallback(async (channelId: string): Promise<void> => {
    setBusy(createChannelBusyState('delete', channelId));
    try {
      const payload = await navigationApi.deleteChatChannel(channelId);
      startTransition(() => {
        setState({ status: 'ready', payload });
        setAddCatOpen(false);
        setFeedback('');
      });
      navigate(resolveWorkspaceVisibleChatPath(chatPrefix, payload.chat.channels, payload.chat.selectedChannelId));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to delete chat.');
    } finally {
      setBusy(clearBusyState());
    }
  }, [chatPrefix, navigate, navigationApi, setAddCatOpen, setBusy, setFeedback, setState]);

  const onDeleteCat = useCallback(async (catId: string): Promise<void> => {
    const confirmed = confirmDialog
      ? await confirmDialog({ title: 'Delete cat', message: 'Delete this cat? This cannot be undone.' })
      : true;
    if (!confirmed) return;
    setBusy(createCatBusyState('delete', catId));
    try {
      const payload = await navigationApi.deleteGlobalCat(catId);
      startTransition(() => setState({ status: 'ready', payload }));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to delete cat.');
    } finally {
      setBusy(clearBusyState());
    }
  }, [confirmDialog, navigationApi, setBusy, setFeedback, setState]);

  const onNavigateSettings = useCallback((): void => {
    navigate('/settings/general', {
      state: { platformShellSurface },
    });
    setAccountMenuOpen(false);
    setAddCatOpen(false);
    setFeedback('');
  }, [navigate, platformShellSurface, setAccountMenuOpen, setAddCatOpen, setFeedback]);

  const onCreateNewCat = useCallback((): void => {
    navigate('/settings/cats', {
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
      ? await confirmDialog({ title: 'Reset all data', message: 'This will erase all chats, cats, and settings. Continue?', confirmLabel: 'Reset' })
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
      setFeedback(error instanceof Error ? error.message : 'Failed to reset setup.');
      setBusy(clearBusyState());
    }
  }, [confirmDialog, navigationApi, setBusy, setFeedback]);

  const onStartNewChat = useCallback(async (): Promise<void> => {
    navigate(buildWorkspaceNewChatPath(chatPrefix, null));
    setComposerDraft('');
    clearDraftRouteState();
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
    clearDraftRouteState();
    setFeedback('');
    setDraftTemporaryParticipants?.(createInitialGroupParticipants?.() ?? []);
  }, [
    chatPrefix,
    clearDraftRouteState,
    navigate,
    setComposerDraft,
    setDraftTemporaryParticipants,
    createInitialGroupParticipants,
    setFeedback,
  ]);

  const onStartNewParallelChat = useCallback(async (): Promise<void> => {
    navigate(buildWorkspaceNewParallelChatPath(chatPrefix));
    setComposerDraft('');
    clearDraftRouteState();
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
    onDeleteCat,
    onNavigateSettings,
    onCreateNewCat,
    onDirectChatCat,
    onResetSetup,
    onStartNewChat,
    onStartNewGroupChat,
    onStartNewParallelChat,
  };
}

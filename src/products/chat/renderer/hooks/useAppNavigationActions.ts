import {
  startTransition,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { NavigateFunction } from 'react-router-dom';

import type { AppShellPayload } from '../../api/contracts.js';
import type { ExecutionTargetValue } from '../../../shared/renderer/components/ExecutionTarget.js';
import type { DraftTemporaryParticipant } from '../chatUtils.js';
import {
  buildNewGroupChatPath,
  buildNewParallelChatPath,
  buildNewChatPath,
  resolveVisibleChatPath,
} from '../../shared/channelPaths.js';
import { resolveMyCatNavigationTarget } from '../myCatNavigation.js';
import {
  deleteParallelChatGroup,
  deleteChatChannel,
  deleteGlobalCat,
  renameChatChannel,
  renameParallelChatGroup,
  resetSetup,
  ungroupParallelChatGroup,
  updateCatProfile,
} from '../api/index.js';
import {
  useWorkspaceAppNavigationActions,
  type WorkspaceNavigationLoadState,
} from '../../../shared/renderer/hooks/useWorkspaceAppNavigationActions.js';
import {
  clearBusyState,
  createCatBusyState,
  createConcurrentGroupBusyState,
  type WorkspaceBusyState,
} from '../../../../shared/workspaceBusy.js';

type LoadStateLike = WorkspaceNavigationLoadState<AppShellPayload>;

export function useAppNavigationActions(options: {
  state: LoadStateLike;
  setState: Dispatch<SetStateAction<LoadStateLike>>;
  navigate: NavigateFunction;
  setBusy: Dispatch<SetStateAction<WorkspaceBusyState>>;
  setFeedback: Dispatch<SetStateAction<string>>;
  setComposerDraft: Dispatch<SetStateAction<string>>;
  setAccountMenuOpen: Dispatch<SetStateAction<boolean>>;
  setAddCatOpen: Dispatch<SetStateAction<boolean>>;
  setAddCatTab: Dispatch<SetStateAction<'existing' | 'new'>>;
  setPlusMenuOpen: Dispatch<SetStateAction<boolean>>;
  setChannelPlusMenuOpen: Dispatch<SetStateAction<boolean>>;
  setDraftCwd: Dispatch<SetStateAction<string | null>>;
  setDraftCatIds: Dispatch<SetStateAction<string[]>>;
  setDraftTemporaryParticipants: Dispatch<SetStateAction<DraftTemporaryParticipant[]>>;
  setDraftHighlightedCatId: Dispatch<SetStateAction<string | null>>;
  setDraftCatExecutionTargetOverrides: Dispatch<SetStateAction<Map<string, ExecutionTargetValue>>>;
  setDraftWorkflowShape: Dispatch<SetStateAction<'sequential' | 'concurrent'>>;
  setDraftAudienceKeys: Dispatch<SetStateAction<string[] | null>>;
  resetDraftParallelChatTargets: (options?: { includeCompareTarget?: boolean }) => void;
  createInitialGroupParticipants: () => DraftTemporaryParticipant[];
  seedInitialGroupParticipants?: boolean;
  setDraftFiles: Dispatch<SetStateAction<File[]>>;
  setChannelFiles: Dispatch<SetStateAction<File[]>>;
  confirm?: (options: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
}) {
  const {
    state,
    setState,
    navigate,
    setBusy,
    setFeedback,
    setComposerDraft,
    setAddCatOpen,
    setAddCatTab,
    setPlusMenuOpen,
    setChannelPlusMenuOpen,
    setDraftCwd,
    setDraftCatIds,
    setDraftTemporaryParticipants,
    setDraftHighlightedCatId,
    setDraftCatExecutionTargetOverrides,
    setDraftWorkflowShape,
    setDraftAudienceKeys,
    resetDraftParallelChatTargets,
    createInitialGroupParticipants,
    seedInitialGroupParticipants = true,
    setDraftFiles,
    setChannelFiles,
    confirm: confirmDialog,
  } = options;
  const sharedActions = useWorkspaceAppNavigationActions<
    ExecutionTargetValue,
    AppShellPayload,
    DraftTemporaryParticipant
  >({
    ...options,
    platformShellSurface: 'chat',
    navigationApi: {
      deleteChatChannel,
      deleteGlobalCat,
      renameChatChannel,
      resetSetup,
    },
  });

  const resetFreshDraftState = useCallback((options?: {
    openAddCatPanel?: boolean;
    includeCompareTarget?: boolean;
  }) => {
    setComposerDraft('');
    setFeedback('');
    setAddCatOpen(Boolean(options?.openAddCatPanel));
    setAddCatTab('existing');
    setPlusMenuOpen(false);
    setDraftCwd(null);
    setDraftCatIds([]);
    setDraftTemporaryParticipants([]);
    setDraftHighlightedCatId(null);
    setDraftCatExecutionTargetOverrides(new Map());
    setDraftWorkflowShape('sequential');
    setDraftAudienceKeys(null);
    resetDraftParallelChatTargets({
      includeCompareTarget: options?.includeCompareTarget ?? false,
    });
    setDraftFiles([]);
    setChannelPlusMenuOpen(false);
    setChannelFiles([]);
  }, [
    setComposerDraft,
    setFeedback,
    setAddCatOpen,
    setAddCatTab,
    setPlusMenuOpen,
    setDraftCwd,
    setDraftCatIds,
    setDraftTemporaryParticipants,
    setDraftHighlightedCatId,
    setDraftCatExecutionTargetOverrides,
    setDraftWorkflowShape,
    setDraftAudienceKeys,
    resetDraftParallelChatTargets,
    setDraftFiles,
    setChannelPlusMenuOpen,
    setChannelFiles,
  ]);

  const onRenameParallelChatGroup = useCallback(async (
    groupId: string,
    title: string,
  ): Promise<void> => {
    setBusy(createConcurrentGroupBusyState('rename', groupId));
    try {
      const payload = await renameParallelChatGroup(groupId, { title });
      startTransition(() => {
        setState({ status: 'ready', payload });
        setFeedback('');
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to rename parallel chat.');
    } finally {
      setBusy(clearBusyState());
    }
  }, [setBusy, setFeedback, setState]);

  const onUngroupParallelChatGroup = useCallback(async (groupId: string): Promise<void> => {
    setBusy(createConcurrentGroupBusyState('ungroup', groupId));
    try {
      const payload = await ungroupParallelChatGroup(groupId);
      startTransition(() => {
        setState({ status: 'ready', payload });
        setFeedback('');
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to ungroup parallel chat.');
    } finally {
      setBusy(clearBusyState());
    }
  }, [setBusy, setFeedback, setState]);

  const onDeleteParallelChatGroup = useCallback(async (groupId: string): Promise<void> => {
    const groupTitle = state.status === 'ready'
      ? (state.payload.chat.parallelChatGroups.find((group) => group.id === groupId)?.title ?? 'this parallel chat')
      : 'this parallel chat';
    const confirmed = confirmDialog
      ? await confirmDialog({
          title: 'Delete all chats',
          message: `Delete all chats in "${groupTitle}"? This cannot be undone.`,
          confirmLabel: 'Delete all',
        })
      : true;
    if (!confirmed) return;

    setBusy(createConcurrentGroupBusyState('delete', groupId));
    try {
      const payload = await deleteParallelChatGroup(groupId);
      startTransition(() => {
        setState({ status: 'ready', payload });
        setAddCatOpen(false);
        setFeedback('');
      });
      navigate(resolveVisibleChatPath(payload.chat.channels, payload.chat.selectedChannelId));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to delete all chats.');
    } finally {
      setBusy(clearBusyState());
    }
  }, [confirmDialog, navigate, setAddCatOpen, setBusy, setFeedback, setState, state]);

  const onArchiveCat = useCallback(async (catId: string): Promise<void> => {
    const catName = state.status === 'ready'
      ? (state.payload.chat.cats.find((cat) => cat.id === catId)?.name ?? 'this cat')
      : 'this cat';
    const confirmed = confirmDialog
      ? await confirmDialog({
          title: 'Archive cat',
          message: `Archive "${catName}"? Telegram bot bindings will be removed, but you can still recover the cat later from Settings.`,
          confirmLabel: 'Archive',
        })
      : true;
    if (!confirmed) return;
    setBusy(createCatBusyState('archive', catId));
    try {
      const payload = await updateCatProfile(catId, { archive: true });
      startTransition(() => setState({ status: 'ready', payload }));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to archive cat.');
    } finally {
      setBusy(clearBusyState());
    }
  }, [confirmDialog, setBusy, setFeedback, setState, state]);

  const onDirectChatCat = useCallback(async (catId: string): Promise<void> => {
    if (state.status !== 'ready') {
      return;
    }

    const target = resolveMyCatNavigationTarget(state.payload.chat.channels, catId);
    setFeedback('');
    resetFreshDraftState();
    navigate(target.path);
  }, [navigate, resetFreshDraftState, setFeedback, state]);

  const onStartNewChat = useCallback(async (): Promise<void> => {
    navigate(buildNewChatPath(null));
    resetFreshDraftState({ includeCompareTarget: false });
  }, [
    navigate,
    resetFreshDraftState,
  ]);

  const onStartNewGroupChat = useCallback(async (): Promise<void> => {
    navigate(buildNewGroupChatPath());
    resetFreshDraftState({ includeCompareTarget: false });
    if (seedInitialGroupParticipants) {
      setDraftTemporaryParticipants(createInitialGroupParticipants());
    }
  }, [
    createInitialGroupParticipants,
    navigate,
    resetFreshDraftState,
    seedInitialGroupParticipants,
    setDraftTemporaryParticipants,
  ]);

  const onStartNewParallelChat = useCallback(async (): Promise<void> => {
    navigate(buildNewParallelChatPath());
    resetFreshDraftState({ includeCompareTarget: true });
  }, [
    navigate,
    resetFreshDraftState,
  ]);

  return {
    ...sharedActions,
    onRenameParallelChatGroup,
    onUngroupParallelChatGroup,
    onDeleteParallelChatGroup,
    onArchiveCat,
    onDirectChatCat,
    onStartNewChat,
    onStartNewGroupChat,
    onStartNewParallelChat,
  };
}

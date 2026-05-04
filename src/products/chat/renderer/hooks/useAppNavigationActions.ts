import {
  startTransition,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { NavigateFunction } from 'react-router-dom';

import type { AppShellPayload } from '../../api/contracts.js';
import type { PlatformSurfaceId } from '../../../../shared/platform-contract.js';
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
import { formatSettingsCatsRegistryMutationError } from '../../../shared/renderer/hooks/settingsCatsRegistryErrorLabels.js';
import { formatWorkspaceNavigationMutationError } from '../../../shared/renderer/hooks/workspaceNavigationErrorLabels.js';
import {
  buildDeleteParallelChatGroupConfirmation,
} from '../../../shared/renderer/deleteConfirmations.js';
import {
  clearBusyState,
  createCatBusyState,
  createConcurrentGroupBusyState,
  type WorkspaceBusyState,
} from '../../../../shared/workspaceBusy.js';
import { messageKeys } from '../../../../shared/i18n/messageKeys.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';

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
  setDraftSurface?: Dispatch<SetStateAction<PlatformSurfaceId>>;
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
    setDraftSurface,
    setDraftWorkflowShape,
    setDraftAudienceKeys,
    resetDraftParallelChatTargets,
    createInitialGroupParticipants,
    seedInitialGroupParticipants = true,
    setDraftFiles,
    setChannelFiles,
    confirm: confirmDialog,
  } = options;
  const { t } = useI18n();
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
      deleteParallelChatGroup,
      renameChatChannel,
      renameParallelChatGroup,
      resetSetup,
      ungroupParallelChatGroup,
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
    setDraftSurface?.('chat');
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
    setDraftSurface,
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
      setFeedback(formatWorkspaceNavigationMutationError(
        error,
        t(messageKeys.sharedWorkspaceNavigationRenameParallelChatError),
        t,
      ));
    } finally {
      setBusy(clearBusyState());
    }
  }, [setBusy, setFeedback, setState, t]);

  const onUngroupParallelChatGroup = useCallback(async (groupId: string): Promise<void> => {
    setBusy(createConcurrentGroupBusyState('ungroup', groupId));
    try {
      const payload = await ungroupParallelChatGroup(groupId);
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
  }, [setBusy, setFeedback, setState, t]);

  const onDeleteParallelChatGroup = useCallback(async (groupId: string): Promise<void> => {
    const groupTitle = state.status === 'ready'
      ? (state.payload.chat.parallelChatGroups.find((group) => group.id === groupId)?.title ?? null)
      : null;
    const confirmed = confirmDialog
      ? await confirmDialog(buildDeleteParallelChatGroupConfirmation(groupTitle, t))
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
      setFeedback(formatWorkspaceNavigationMutationError(
        error,
        t(messageKeys.sharedWorkspaceNavigationDeleteParallelChatGroupError),
        t,
      ));
    } finally {
      setBusy(clearBusyState());
    }
  }, [confirmDialog, navigate, setAddCatOpen, setBusy, setFeedback, setState, state, t]);

  const onArchiveCat = useCallback(async (catId: string): Promise<void> => {
    const catName = state.status === 'ready'
      ? (
          state.payload.chat.cats.find((cat) => cat.id === catId)?.name
          ?? t(messageKeys.sharedSettingsCatsFallbackCatName)
        )
      : t(messageKeys.sharedSettingsCatsFallbackCatName);
    const confirmed = confirmDialog
      ? await confirmDialog({
          title: t(messageKeys.sharedSettingsCatsArchiveConfirmTitle),
          message: t(messageKeys.sharedSettingsCatsArchiveWithTelegramConfirmMessage, {
            catName,
          }),
          confirmLabel: t(messageKeys.sharedSettingsCatsArchiveLabel),
        })
      : true;
    if (!confirmed) return;
    setBusy(createCatBusyState('archive', catId));
    try {
      const payload = await updateCatProfile(catId, { archive: true });
      startTransition(() => setState({ status: 'ready', payload }));
    } catch (error) {
      setFeedback(formatSettingsCatsRegistryMutationError(
        error,
        t(messageKeys.sharedSettingsCatsArchiveError),
        t,
      ));
    } finally {
      setBusy(clearBusyState());
    }
  }, [confirmDialog, setBusy, setFeedback, setState, state, t]);

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

import {
  startTransition,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { NavigateFunction } from 'react-router-dom';

import type { AppShellPayload } from '../../api/contracts.js';
import type { ModelSelectorValue } from '../components/ModelSelector.js';
import type { DraftTemporaryParticipant } from '../chatUtils.js';
import {
  buildChannelPath,
  buildNewGroupChatPath,
  buildNewParallelChatPath,
  buildNewChatPath,
  resolveVisibleChatPath,
} from '../../shared/channelPaths.js';
import { resolveMyCatNavigationTarget } from '../myCatNavigation.js';
import {
  deleteConcurrentChatGroup,
  deleteChatChannel,
  deleteGlobalCat,
  renameChatChannel,
  renameConcurrentChatGroup,
  resetSetup,
  ungroupConcurrentChatGroup,
  updateCatProfile,
} from '../api/index.js';

type LoadStateLike =
  | { status: 'loading' }
  | { status: 'ready'; payload: AppShellPayload }
  | { status: 'error'; message: string };

export function useAppNavigationActions(options: {
  state: LoadStateLike;
  setState: Dispatch<SetStateAction<LoadStateLike>>;
  navigate: NavigateFunction;
  setBusy: Dispatch<SetStateAction<string>>;
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
  setDraftCatModelOverrides: Dispatch<SetStateAction<Map<string, ModelSelectorValue>>>;
  resetDraftConcurrentTargets: () => void;
  createInitialGroupParticipants: () => DraftTemporaryParticipant[];
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
    setAccountMenuOpen,
    setAddCatOpen,
    setAddCatTab,
    setPlusMenuOpen,
    setChannelPlusMenuOpen,
    setDraftCwd,
    setDraftCatIds,
    setDraftTemporaryParticipants,
    setDraftHighlightedCatId,
    setDraftCatModelOverrides,
    resetDraftConcurrentTargets,
    createInitialGroupParticipants,
    setDraftFiles,
    setChannelFiles,
    confirm: confirmDialog,
  } = options;

  const resetFreshDraftState = useCallback((options?: { openAddCatPanel?: boolean }) => {
    setComposerDraft('');
    setFeedback('');
    setAddCatOpen(Boolean(options?.openAddCatPanel));
    setAddCatTab('existing');
    setPlusMenuOpen(false);
    setDraftCwd(null);
    setDraftCatIds([]);
    setDraftTemporaryParticipants([]);
    setDraftHighlightedCatId(null);
    setDraftCatModelOverrides(new Map());
    resetDraftConcurrentTargets();
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
    setDraftCatModelOverrides,
    resetDraftConcurrentTargets,
    setDraftFiles,
    setChannelPlusMenuOpen,
    setChannelFiles,
  ]);

  const onOpenChatsOverview = useCallback((): void => {
    if (state.status !== 'ready') {
      return;
    }

    navigate(resolveVisibleChatPath(state.payload.chat.channels, state.payload.chat.selectedChannelId));
    setFeedback('');
    setAddCatOpen(false);
  }, [navigate, setAddCatOpen, setFeedback, state]);

  const onSelect = useCallback((channelId: string): void => {
    navigate(buildChannelPath(channelId));
    setFeedback('');
    setAddCatOpen(false);
    setChannelFiles([]);
    setChannelPlusMenuOpen(false);
  }, [
    navigate,
    setAddCatOpen,
    setChannelFiles,
    setChannelPlusMenuOpen,
    setFeedback,
  ]);

  const onRenameChannel = useCallback(async (channelId: string, title: string): Promise<void> => {
    setBusy(`channel:rename:${channelId}`);
    try {
      const payload = await renameChatChannel(channelId, title);
      startTransition(() => {
        setState({ status: 'ready', payload });
        setFeedback('');
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to rename chat.');
    } finally {
      setBusy('');
    }
  }, [setBusy, setFeedback, setState]);

  const onDeleteChannel = useCallback(async (channelId: string): Promise<void> => {
    setBusy(`channel:delete:${channelId}`);
    try {
      const payload = await deleteChatChannel(channelId);
      startTransition(() => {
        setState({ status: 'ready', payload });
        setAddCatOpen(false);
        setFeedback('');
      });
      navigate(resolveVisibleChatPath(payload.chat.channels, payload.chat.selectedChannelId));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to delete chat.');
    } finally {
      setBusy('');
    }
  }, [navigate, setAddCatOpen, setBusy, setFeedback, setState]);

  const onRenameConcurrentGroup = useCallback(async (
    groupId: string,
    title: string,
  ): Promise<void> => {
    setBusy(`concurrent-group:rename:${groupId}`);
    try {
      const payload = await renameConcurrentChatGroup(groupId, { title });
      startTransition(() => {
        setState({ status: 'ready', payload });
        setFeedback('');
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to rename parallel chat.');
    } finally {
      setBusy('');
    }
  }, [setBusy, setFeedback, setState]);

  const onUngroupConcurrentGroup = useCallback(async (groupId: string): Promise<void> => {
    setBusy(`concurrent-group:ungroup:${groupId}`);
    try {
      const payload = await ungroupConcurrentChatGroup(groupId);
      startTransition(() => {
        setState({ status: 'ready', payload });
        setFeedback('');
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to ungroup parallel chat.');
    } finally {
      setBusy('');
    }
  }, [setBusy, setFeedback, setState]);

  const onDeleteConcurrentGroup = useCallback(async (groupId: string): Promise<void> => {
    const groupTitle = state.status === 'ready'
      ? (state.payload.chat.concurrentGroups.find((group) => group.id === groupId)?.title ?? 'this parallel chat')
      : 'this parallel chat';
    const confirmed = confirmDialog
      ? await confirmDialog({
          title: 'Delete all chats',
          message: `Delete all chats in "${groupTitle}"? This cannot be undone.`,
          confirmLabel: 'Delete all',
        })
      : true;
    if (!confirmed) return;

    setBusy(`concurrent-group:delete:${groupId}`);
    try {
      const payload = await deleteConcurrentChatGroup(groupId);
      startTransition(() => {
        setState({ status: 'ready', payload });
        setAddCatOpen(false);
        setFeedback('');
      });
      navigate(resolveVisibleChatPath(payload.chat.channels, payload.chat.selectedChannelId));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to delete all chats.');
    } finally {
      setBusy('');
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
    setBusy(`cat:archive:${catId}`);
    try {
      const payload = await updateCatProfile(catId, { archive: true });
      startTransition(() => setState({ status: 'ready', payload }));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to archive cat.');
    } finally {
      setBusy('');
    }
  }, [confirmDialog, setBusy, setFeedback, setState, state]);

  const onDeleteCat = useCallback(async (catId: string): Promise<void> => {
    const confirmed = confirmDialog
      ? await confirmDialog({ title: 'Delete cat', message: 'Delete this cat? This cannot be undone.' })
      : true;
    if (!confirmed) return;
    setBusy(`cat:delete:${catId}`);
    try {
      const payload = await deleteGlobalCat(catId);
      startTransition(() => setState({ status: 'ready', payload }));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to delete cat.');
    } finally {
      setBusy('');
    }
  }, [confirmDialog, setBusy, setFeedback, setState]);

  const onNavigateSettings = useCallback((): void => {
    navigate('/settings/general');
    setAccountMenuOpen(false);
    setAddCatOpen(false);
    setFeedback('');
  }, [navigate, setAccountMenuOpen, setAddCatOpen, setFeedback]);

  const onDirectChatCat = useCallback(async (catId: string): Promise<void> => {
    if (state.status !== 'ready') {
      return;
    }

    const target = resolveMyCatNavigationTarget(state.payload.chat.channels, catId);
    setFeedback('');
    resetFreshDraftState();
    navigate(target.path);
  }, [navigate, resetFreshDraftState, setFeedback, state]);

  const onResetSetup = useCallback(async (): Promise<void> => {
    const confirmed = confirmDialog
      ? await confirmDialog({ title: 'Reset all data', message: 'This will erase all chats, cats, and settings. Continue?', confirmLabel: 'Reset' })
      : true;
    if (!confirmed) return;

    setBusy('setup:reset');
    try {
      await resetSetup();
      window.location.href = '/';
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to reset setup.');
      setBusy('');
    }
  }, [setBusy, setFeedback]);

  const onStartNewChat = useCallback(async (): Promise<void> => {
    navigate(buildNewChatPath(null));
    resetFreshDraftState();
  }, [
    navigate,
    resetFreshDraftState,
  ]);

  const onStartNewGroupChat = useCallback(async (): Promise<void> => {
    navigate(buildNewGroupChatPath());
    resetFreshDraftState();
    setDraftTemporaryParticipants(createInitialGroupParticipants());
  }, [navigate, resetFreshDraftState, setDraftTemporaryParticipants, createInitialGroupParticipants]);

  const onStartNewParallelChat = useCallback(async (): Promise<void> => {
    navigate(buildNewParallelChatPath());
    resetFreshDraftState();
  }, [
    navigate,
    resetFreshDraftState,
  ]);

  return {
    onOpenChatsOverview,
    onSelect,
    onRenameChannel,
    onDeleteChannel,
    onRenameConcurrentGroup,
    onUngroupConcurrentGroup,
    onDeleteConcurrentGroup,
    onArchiveCat,
    onDeleteCat,
    onNavigateSettings,
    onDirectChatCat,
    onResetSetup,
    onStartNewChat,
    onStartNewGroupChat,
    onStartNewParallelChat,
  };
}

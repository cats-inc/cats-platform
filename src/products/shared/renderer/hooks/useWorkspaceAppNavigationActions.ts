import {
  startTransition,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { NavigateFunction } from 'react-router-dom';

import type { AppShellPayload } from '../../api/workspaceContracts.js';
import {
  buildWorkspaceChannelPath,
  buildWorkspaceNewChatPath,
  resolveWorkspaceVisibleChatPath,
} from '../../channelPaths.js';
import { resolveMyCatNavigationTargetForPrefix } from '../../../../app/renderer/productShell/myCatNavigation.js';
import {
  deleteChatChannel,
  deleteGlobalCat,
  renameChatChannel,
  resetSetup,
} from '../api/index.js';

export type WorkspaceNavigationLoadState =
  | { status: 'loading' }
  | { status: 'ready'; payload: AppShellPayload }
  | { status: 'error'; message: string };

export interface UseWorkspaceAppNavigationActionsOptions<TModelSelectorValue> {
  state: WorkspaceNavigationLoadState;
  setState: Dispatch<SetStateAction<WorkspaceNavigationLoadState>>;
  navigate: NavigateFunction;
  platformShellSurface: 'work' | 'code';
  setBusy: Dispatch<SetStateAction<string>>;
  setFeedback: Dispatch<SetStateAction<string>>;
  setComposerDraft: Dispatch<SetStateAction<string>>;
  setAccountMenuOpen: Dispatch<SetStateAction<boolean>>;
  setAddCatOpen: Dispatch<SetStateAction<boolean>>;
  setPlusMenuOpen: Dispatch<SetStateAction<boolean>>;
  setChannelPlusMenuOpen: Dispatch<SetStateAction<boolean>>;
  setDraftCwd: Dispatch<SetStateAction<string | null>>;
  setDraftCatIds: Dispatch<SetStateAction<string[]>>;
  setDraftHighlightedCatId: Dispatch<SetStateAction<string | null>>;
  setDraftCatModelOverrides: Dispatch<SetStateAction<Map<string, TModelSelectorValue>>>;
  setDraftFiles: Dispatch<SetStateAction<File[]>>;
  setChannelFiles: Dispatch<SetStateAction<File[]>>;
  confirm?: (options: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
}

export function useWorkspaceAppNavigationActions<TModelSelectorValue>(
  options: UseWorkspaceAppNavigationActionsOptions<TModelSelectorValue>,
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
    setDraftHighlightedCatId,
    setDraftCatModelOverrides,
    setDraftFiles,
    setChannelFiles,
    confirm: confirmDialog,
  } = options;
  const chatPrefix = platformShellSurface === 'work' ? '/work' : '/code';

  const clearDraftRouteState = useCallback(() => {
    setAddCatOpen(false);
    setPlusMenuOpen(false);
    setDraftCwd(null);
    setDraftCatIds([]);
    setDraftHighlightedCatId(null);
    setDraftCatModelOverrides(new Map());
    setDraftFiles([]);
    setChannelPlusMenuOpen(false);
    setChannelFiles([]);
  }, [
    setAddCatOpen,
    setPlusMenuOpen,
    setDraftCwd,
    setDraftCatIds,
    setDraftHighlightedCatId,
    setDraftCatModelOverrides,
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
      navigate(resolveWorkspaceVisibleChatPath(chatPrefix, payload.chat.channels, payload.chat.selectedChannelId));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to delete chat.');
    } finally {
      setBusy('');
    }
  }, [chatPrefix, navigate, setAddCatOpen, setBusy, setFeedback, setState]);

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
    navigate('/settings/general', {
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

    const target = resolveMyCatNavigationTargetForPrefix(chatPrefix, state.payload.chat.channels, catId);
    setFeedback('');
    clearDraftRouteState();
    navigate(target.path);
  }, [chatPrefix, clearDraftRouteState, navigate, setFeedback, state]);

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
  }, [confirmDialog, setBusy, setFeedback]);

  const onStartNewChat = useCallback(async (): Promise<void> => {
    navigate(buildWorkspaceNewChatPath(chatPrefix, null));
    setComposerDraft('');
    setFeedback('');
    setAddCatOpen(false);
    setPlusMenuOpen(false);
    setDraftCwd(null);
    setDraftCatIds([]);
    setDraftHighlightedCatId(null);
    setDraftCatModelOverrides(new Map());
    setDraftFiles([]);
  }, [
    chatPrefix,
    navigate,
    setComposerDraft,
    setFeedback,
    setAddCatOpen,
    setPlusMenuOpen,
    setDraftCwd,
    setDraftCatIds,
    setDraftHighlightedCatId,
    setDraftCatModelOverrides,
    setDraftFiles,
  ]);

  return {
    onOpenChatsOverview,
    onSelect,
    onRenameChannel,
    onDeleteChannel,
    onDeleteCat,
    onNavigateSettings,
    onDirectChatCat,
    onResetSetup,
    onStartNewChat,
  };
}

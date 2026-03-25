import {
  startTransition,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { NavigateFunction } from 'react-router-dom';

import type { AppShellPayload } from '../../api/contracts.js';
import {
  buildChannelPath,
  buildNewChatPath,
  CHAT_PREFIX,
  resolveVisibleChatPath,
} from '../../shared/channelPaths.js';
import { resolveMyCatNavigationTarget } from '../myCatNavigation.js';
import {
  deleteChatChannel,
  deleteGlobalCat,
  resetSetup,
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
  setPlusMenuOpen: Dispatch<SetStateAction<boolean>>;
  setChannelPlusMenuOpen: Dispatch<SetStateAction<boolean>>;
  setDraftCwd: Dispatch<SetStateAction<string | null>>;
  setDraftCatIds: Dispatch<SetStateAction<string[]>>;
  setDraftFiles: Dispatch<SetStateAction<File[]>>;
  setChannelFiles: Dispatch<SetStateAction<File[]>>;
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
    setPlusMenuOpen,
    setChannelPlusMenuOpen,
    setDraftCwd,
    setDraftCatIds,
    setDraftFiles,
    setChannelFiles,
  } = options;

  const clearDraftRouteState = useCallback(() => {
    setAddCatOpen(false);
    setPlusMenuOpen(false);
    setDraftCwd(null);
    setDraftCatIds([]);
    setDraftFiles([]);
    setChannelPlusMenuOpen(false);
    setChannelFiles([]);
  }, [
    setAddCatOpen,
    setPlusMenuOpen,
    setDraftCwd,
    setDraftCatIds,
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

  const onDeleteCat = useCallback(async (catId: string): Promise<void> => {
    setBusy(`cat:delete:${catId}`);
    try {
      const payload = await deleteGlobalCat(catId);
      startTransition(() => setState({ status: 'ready', payload }));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to delete cat.');
    } finally {
      setBusy('');
    }
  }, [setBusy, setFeedback, setState]);

  const onNavigateSettings = useCallback((): void => {
    navigate(`${CHAT_PREFIX}/settings/general`);
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
    clearDraftRouteState();
    navigate(target.path);
  }, [clearDraftRouteState, navigate, setFeedback, state]);

  const onResetSetup = useCallback(async (): Promise<void> => {
    if (!window.confirm('This will erase all chats, cats, and settings. Continue?')) {
      return;
    }

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
    setComposerDraft('');
    setFeedback('');
    setAddCatOpen(false);
    setPlusMenuOpen(false);
    setDraftCwd(null);
    setDraftCatIds([]);
    setDraftFiles([]);
  }, [
    navigate,
    setComposerDraft,
    setFeedback,
    setAddCatOpen,
    setPlusMenuOpen,
    setDraftCwd,
    setDraftCatIds,
    setDraftFiles,
  ]);

  return {
    onOpenChatsOverview,
    onSelect,
    onDeleteChannel,
    onDeleteCat,
    onNavigateSettings,
    onDirectChatCat,
    onResetSetup,
    onStartNewChat,
  };
}

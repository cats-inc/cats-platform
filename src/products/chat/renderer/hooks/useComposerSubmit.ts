import {
  useCallback,
  type Dispatch,
  type FormEvent,
  type KeyboardEvent,
  type SetStateAction,
} from 'react';
import type { NavigateFunction } from 'react-router-dom';

import { shouldSubmitComposerOnKeyDown } from '../../../../shared/composer';
import type { AppShellPayload } from '../../api/contracts';
import {
  buildChannelPath,
  buildMyCatPath,
  buildNewChatPath,
} from '../../shared/channelPaths';
import { normalizeSelectedChannelView } from '../../shared/channelEntry';
import { isDirectLaneChannel } from '../../shared/channelTopology';
import {
  createConcurrentChatGroup,
  createChatChannel,
  sendConcurrentChatMessage,
  sendChatMessage,
  updateSelectedChannel,
  uploadChannelAttachments,
} from '../api';
import {
  applyOptimisticPendingExecutionTarget,
  appendOptimisticUserMessage,
  buildAttachedFilesMessageBody,
  buildNewChatChannelInput,
  createDraftChannelTitle,
  createDraftChannelTopic,
  insertCreatedChannelIntoPayload,
  type SelectedChannelView,
} from '../chatUtils';
import type { ModelSelectorValue } from '../components/ModelSelector';

type LoadStateLike =
  | { status: 'loading' }
  | { status: 'ready'; payload: AppShellPayload }
  | { status: 'error'; message: string };

function isDirectLaneSelectedForCat(
  channel: SelectedChannelView | null,
  catId: string | null,
): channel is SelectedChannelView {
  if (!channel || !catId) {
    return false;
  }

  return isDirectLaneChannel(channel)
    && channel.roomRouting.leadParticipantId === catId;
}

export function useComposerSubmit(options: {
  state: LoadStateLike;
  setState: Dispatch<SetStateAction<LoadStateLike>>;
  navigate: NavigateFunction;
  currentPathname: string;
  composerDraft: string;
  setComposerDraft: Dispatch<SetStateAction<string>>;
  showingNewChatDraft: boolean;
  showingMyCatDirectLane: boolean;
  draftLeadCatId: string | null;
  draftCatIds: string[];
  draftCwd: string | null;
  draftFiles: File[];
  channelFiles: File[];
  setDraftCwd: Dispatch<SetStateAction<string | null>>;
  setDraftCatIds: Dispatch<SetStateAction<string[]>>;
  setDraftHighlightedCatId: Dispatch<SetStateAction<string | null>>;
  setDraftCatModelOverrides: Dispatch<SetStateAction<Map<string, ModelSelectorValue>>>;
  setDraftFiles: Dispatch<SetStateAction<File[]>>;
  setChannelFiles: Dispatch<SetStateAction<File[]>>;
  draftModel: ModelSelectorValue;
  soloChannelModel: ModelSelectorValue;
  showingCompareChatDraft: boolean;
  draftConcurrentTargets: ModelSelectorValue[];
  resetDraftConcurrentTargets: () => void;
  compareGroupId: string | null;
  compareSendScope: 'all_members' | 'active_only';
  selectedChannel: SelectedChannelView | null;
  setBusy: Dispatch<SetStateAction<string>>;
  setFeedback: Dispatch<SetStateAction<string>>;
}) {
  const {
    state,
    setState,
    navigate,
    currentPathname,
    composerDraft,
    setComposerDraft,
    showingNewChatDraft,
    showingMyCatDirectLane,
    draftLeadCatId,
    draftCatIds,
    draftCwd,
    draftFiles,
    channelFiles,
    setDraftCwd,
    setDraftCatIds,
    setDraftHighlightedCatId,
    setDraftCatModelOverrides,
    setDraftFiles,
    setChannelFiles,
    draftModel,
    soloChannelModel,
    showingCompareChatDraft,
    draftConcurrentTargets,
    resetDraftConcurrentTargets,
    compareGroupId,
    compareSendScope,
    selectedChannel,
    setBusy,
    setFeedback,
  } = options;

  const submitComposerMessage = useCallback(async (): Promise<void> => {
    if (state.status !== 'ready') {
      return;
    }

    const body = composerDraft.trim();
    if (!body) {
      return;
    }

    const initialPayload = state.payload;
    const wasDraftingNewChat = showingNewChatDraft;
    const initialSelectedChannel = normalizeSelectedChannelView(initialPayload.chat.selectedChannel ?? null);
    const isCatScopedLaneRoute = Boolean(draftLeadCatId) && showingMyCatDirectLane;
    const hydratedDirectLane = isDirectLaneSelectedForCat(initialSelectedChannel, draftLeadCatId)
      ? initialSelectedChannel
      : null;
    let payload = initialPayload;
    let rollbackPayload = initialPayload;
    let channelId = wasDraftingNewChat || showingMyCatDirectLane
      ? hydratedDirectLane?.id ?? ''
      : initialPayload.chat.selectedChannelId;
    let rollbackPath = showingMyCatDirectLane
      ? buildMyCatPath(draftLeadCatId ?? '')
      : wasDraftingNewChat
        ? buildNewChatPath(draftLeadCatId)
        : currentPathname;
    const originalDraftFiles = [...draftFiles];
    const originalChannelFiles = [...channelFiles];
    let restoreFiles = (): void => {
      if (wasDraftingNewChat || (isCatScopedLaneRoute && !hydratedDirectLane)) {
        setDraftFiles(originalDraftFiles);
      } else {
        setChannelFiles(originalChannelFiles);
      }
    };

    setFeedback('');
    try {
      if (showingCompareChatDraft && wasDraftingNewChat) {
        if (draftConcurrentTargets.length < 2) {
          throw new Error('Choose at least two parallel chats before sending.');
        }

        setBusy('concurrent:dispatch');
        const created = await createConcurrentChatGroup({
          title: createDraftChannelTitle(body, initialPayload.chat.channels.length),
          repoPath: draftCwd ?? undefined,
          targets: draftConcurrentTargets.map((target) => ({
            provider: target.provider,
            instance: target.instance ?? null,
            model: target.model ?? null,
            modelSelection: target.modelSelection ?? null,
          })),
        });
        const activeChannelId =
          created.appShell.chat.selectedChannelId
          && created.group.memberChannelIds.includes(created.appShell.chat.selectedChannelId)
            ? created.appShell.chat.selectedChannelId
            : created.group.members[0]?.channelId ?? null;
        if (!activeChannelId) {
          throw new Error('Parallel chat was created without an active thread.');
        }

        rollbackPayload = created.appShell;
        rollbackPath = buildChannelPath(activeChannelId);
        setState({ status: 'ready', payload: created.appShell });
        setComposerDraft('');
        navigate(rollbackPath, { replace: true });

        const dispatch = await sendConcurrentChatMessage(created.group.id, {
          activeChannelId,
          body,
        });
        setState({ status: 'ready', payload: dispatch.appShell });
        setFeedback('');

        setDraftCwd(null);
        setDraftCatIds([]);
        setDraftHighlightedCatId(null);
        setDraftCatModelOverrides(new Map());
        setDraftFiles([]);
        resetDraftConcurrentTargets();
        return;
      }

      if (compareGroupId && compareSendScope === 'all_members' && !wasDraftingNewChat) {
        if (!channelId) {
          throw new Error('No parallel chat is available for sending messages.');
        }
        if (channelFiles.length > 0) {
          throw new Error(
            'Parallel chat fan-out does not support files yet. Switch this turn to Only this chat.',
          );
        }

        rollbackPath = currentPathname;
        if (
          initialPayload.chat.selectedChannel?.id === channelId
          && selectedChannel?.id === channelId
        ) {
          payload = appendOptimisticUserMessage(initialPayload, channelId, body);
          rollbackPayload = initialPayload;
          setState({ status: 'ready', payload });
        }
        setComposerDraft('');
        setChannelFiles([]);
        setBusy('concurrent:dispatch');

        const dispatch = await sendConcurrentChatMessage(compareGroupId, {
          activeChannelId: channelId,
          body,
        });
        setState({ status: 'ready', payload: dispatch.appShell });
        setFeedback('');
        return;
      }

      setBusy('message:prepare');

      if (isCatScopedLaneRoute) {
        if (!hydratedDirectLane) {
          const createdChannel = await createChatChannel({
            title: createDraftChannelTitle(body, initialPayload.chat.channels.length),
            topic: createDraftChannelTopic(body),
            skipBossCatGreeting: true,
            repoPath: draftCwd ?? undefined,
            roomMode: 'direct_cat_chat' as const,
            leadParticipantId: draftLeadCatId ?? undefined,
            participantCatIds: draftLeadCatId ? [draftLeadCatId] : draftCatIds,
          });
          channelId = createdChannel.id;
          if (!channelId) {
            throw new Error('No chat is available for sending messages.');
          }
          payload = insertCreatedChannelIntoPayload(initialPayload, createdChannel);
          rollbackPayload = payload;
          setState({ status: 'ready', payload });
          navigate(rollbackPath, { replace: true });
          restoreFiles = () => {
            setChannelFiles(originalDraftFiles);
          };
        } else {
          channelId = hydratedDirectLane.id;
          restoreFiles = () => {
            setChannelFiles(originalChannelFiles);
          };
        }
      } else if (wasDraftingNewChat) {
        const createdChannel = await createChatChannel(buildNewChatChannelInput({
          body,
          existingCount: initialPayload.chat.channels.length,
          repoPath: draftCwd,
          leadCatId: draftLeadCatId,
          participantCatIds: draftCatIds,
          draftModel,
        }));
        channelId = createdChannel.id;
        if (!channelId) {
          throw new Error('No chat is available for sending messages.');
        }
        rollbackPath = buildChannelPath(channelId);
        payload = insertCreatedChannelIntoPayload(initialPayload, createdChannel);
        rollbackPayload = payload;
        setState({ status: 'ready', payload });
        navigate(rollbackPath, { replace: true });
        restoreFiles = () => {
          setChannelFiles(originalDraftFiles);
        };
      } else {
        if (!channelId) {
          throw new Error('No chat is available for sending messages.');
        }
        restoreFiles = () => {
          setChannelFiles(originalChannelFiles);
        };
      }

      if (!channelId) {
        throw new Error('No chat is available for sending messages.');
      }

      const soloDispatchTarget =
        !wasDraftingNewChat
        && !isCatScopedLaneRoute
        && selectedChannel?.id === channelId
        && selectedChannel.composerMode === 'solo'
          ? {
              pendingProvider: soloChannelModel.provider,
              pendingModel: soloChannelModel.model,
              pendingInstance: soloChannelModel.instance,
              pendingModelSelection: soloChannelModel.modelSelection,
            }
          : null;

      let messageBody = body;
      const filesToUpload = isCatScopedLaneRoute && !hydratedDirectLane
        ? draftFiles
        : hydratedDirectLane
          ? channelFiles
          : wasDraftingNewChat
            ? draftFiles
            : channelFiles;
      if (filesToUpload.length > 0) {
        const selectedForFiles =
          payload.chat.selectedChannel?.id === channelId
            ? payload.chat.selectedChannel
            : null;
        if (!selectedForFiles?.repoPath && !selectedForFiles?.chatCwd) {
          payload = await updateSelectedChannel(channelId);
          rollbackPayload = payload;
          setState({ status: 'ready', payload });
        }
        const attachments = await uploadChannelAttachments(channelId, filesToUpload);
        messageBody = buildAttachedFilesMessageBody(body, attachments);
      }

      if (soloDispatchTarget) {
        payload = applyOptimisticPendingExecutionTarget(payload, channelId, soloDispatchTarget);
      }
      payload = appendOptimisticUserMessage(payload, channelId, messageBody);
      setState({ status: 'ready', payload });
      setComposerDraft('');
      setDraftFiles([]);
      setChannelFiles([]);
      navigate(rollbackPath, { replace: true });
      setBusy('message:send');

      const dispatch = await sendChatMessage(channelId, {
        body: messageBody,
        ...(soloDispatchTarget ?? {}),
      });
      setState({ status: 'ready', payload: dispatch.appShell });
      setComposerDraft('');
      setFeedback('');
      navigate(rollbackPath, { replace: true });

      if (isCatScopedLaneRoute) {
        setDraftCwd(null);
        setDraftCatIds([]);
        setDraftHighlightedCatId(null);
        setDraftCatModelOverrides(new Map());
        setDraftFiles([]);
        setChannelFiles([]);
      } else if (wasDraftingNewChat) {
        setDraftCwd(null);
        setDraftCatIds([]);
        setDraftHighlightedCatId(null);
        setDraftCatModelOverrides(new Map());
        setDraftFiles([]);
      } else {
        setChannelFiles([]);
      }
    } catch (error) {
      setState({ status: 'ready', payload: rollbackPayload });
      setComposerDraft(body);
      restoreFiles();
      setFeedback(error instanceof Error ? error.message : 'Failed to send message.');
      navigate(rollbackPath, { replace: true });
    } finally {
      setBusy('');
    }
  }, [
    channelFiles,
    composerDraft,
    currentPathname,
    draftCatIds,
    draftCwd,
    draftFiles,
    draftLeadCatId,
    draftModel.instance,
    draftModel.modelSelection,
    draftModel.model,
    draftModel.provider,
    showingCompareChatDraft,
    draftConcurrentTargets,
    resetDraftConcurrentTargets,
    compareGroupId,
    compareSendScope,
    navigate,
    selectedChannel,
    setBusy,
    setChannelFiles,
    setComposerDraft,
    setDraftCatIds,
    setDraftHighlightedCatId,
    setDraftCatModelOverrides,
    setDraftCwd,
    setDraftFiles,
    setFeedback,
    setState,
    showingMyCatDirectLane,
    showingNewChatDraft,
    soloChannelModel.instance,
    soloChannelModel.modelSelection,
    soloChannelModel.model,
    soloChannelModel.provider,
    state,
  ]);

  const onSendMessage = useCallback(async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    await submitComposerMessage();
  }, [submitComposerMessage]);

  const onComposerKeyDown = useCallback(async (event: KeyboardEvent<HTMLTextAreaElement>): Promise<void> => {
    if (
      !shouldSubmitComposerOnKeyDown({
        key: event.key,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        isComposing: event.nativeEvent.isComposing,
      })
    ) {
      return;
    }

    event.preventDefault();
    await submitComposerMessage();
  }, [submitComposerMessage]);

  return {
    onComposerKeyDown,
    onSendMessage,
    submitComposerMessage,
  };
}

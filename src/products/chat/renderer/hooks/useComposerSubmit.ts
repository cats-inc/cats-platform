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
import {
  createChatChannel,
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

  return channel.roomRouting.mode === 'direct_cat_chat'
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
    const isCatScopedLaneRoute = Boolean(draftLeadCatId) && showingMyCatDirectLane;
    const initialSelectedChannel = normalizeSelectedChannelView(initialPayload.chat.selectedChannel ?? null);
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

    setBusy('message:prepare');
    setFeedback('');
    try {
      if (isCatScopedLaneRoute) {
        if (!hydratedDirectLane) {
          const createdChannel = await createChatChannel({
            title: createDraftChannelTitle(body, initialPayload.chat.channels.length),
            topic: createDraftChannelTopic(body),
            skipBossCatGreeting: true,
            repoPath: draftCwd ?? undefined,
            roomMode: 'direct_cat_chat' as const,
            leadParticipantId: draftLeadCatId ?? undefined,
            participantCatIds: draftLeadCatId
              ? [draftLeadCatId, ...draftCatIds.filter((id) => id !== draftLeadCatId)]
              : draftCatIds,
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

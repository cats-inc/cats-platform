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
  appendOptimisticUserMessage,
  buildNewChatChannelInput,
  createDraftChannelTitle,
  createDraftChannelTopic,
  createOptimisticDraftPayload,
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

    setBusy('message:send');
    setFeedback('');
    try {
      if (isCatScopedLaneRoute) {
        if (!hydratedDirectLane) {
          const createdPayload = await createChatChannel({
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
          channelId = createdPayload.chat.selectedChannelId;
          if (!channelId) {
            throw new Error('No chat is available for sending messages.');
          }
          rollbackPayload = createdPayload;
          payload = appendOptimisticUserMessage(createdPayload, channelId, body);
          setState({ status: 'ready', payload });
          setComposerDraft('');
          navigate(rollbackPath, { replace: true });
        } else {
          channelId = hydratedDirectLane.id;
          payload = appendOptimisticUserMessage(payload, channelId, body);
          setState({ status: 'ready', payload });
          setComposerDraft('');
        }
      } else if (wasDraftingNewChat) {
        const optimisticDraft = createOptimisticDraftPayload(
          initialPayload,
          body,
          draftLeadCatId ?? draftCatIds[0] ?? null,
          draftLeadCatId || draftCatIds.length > 0 ? {
            composerMode: 'cat_led',
          } : {
            composerMode: 'solo',
            pendingProvider: draftModel.provider,
            pendingModel: draftModel.model,
            pendingInstance: draftModel.instance,
            pendingModelSelection: draftModel.modelSelection,
          },
        );
        payload = optimisticDraft.payload;
        setState({ status: 'ready', payload });
        setComposerDraft('');
        navigate(buildChannelPath(optimisticDraft.channelId), { replace: true });

        const createdPayload = await createChatChannel(buildNewChatChannelInput({
          body,
          existingCount: initialPayload.chat.channels.length,
          repoPath: draftCwd,
          leadCatId: draftLeadCatId,
          participantCatIds: draftCatIds,
          draftModel,
        }));
        channelId = createdPayload.chat.selectedChannelId;
        if (!channelId) {
          throw new Error('No chat is available for sending messages.');
        }
        rollbackPayload = createdPayload;
        rollbackPath = buildChannelPath(channelId);
        payload = appendOptimisticUserMessage(createdPayload, channelId, body);
        setState({ status: 'ready', payload });
        navigate(rollbackPath, { replace: true });
      } else {
        if (!channelId) {
          throw new Error('No chat is available for sending messages.');
        }
        payload = appendOptimisticUserMessage(payload, channelId, body);
        setState({ status: 'ready', payload });
        setComposerDraft('');
      }

      if (!channelId) {
        throw new Error('No chat is available for sending messages.');
      }

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
          const warmed = await updateSelectedChannel(channelId);
          payload = warmed;
          rollbackPayload = warmed;
          setState({ status: 'ready', payload: warmed });
        }
        const attachments = await uploadChannelAttachments(channelId, filesToUpload);
        const refs = attachments.map((attachment) => `- ${attachment.relativePath}`).join('\n');
        messageBody = `[Attached files in working directory:]\n${refs}\n\n${body}`;
      }

      const dispatch = await sendChatMessage(channelId, {
        body: messageBody,
        ...(
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
            : {}
        ),
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

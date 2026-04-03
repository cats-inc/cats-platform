import {
  useEffect,
  useCallback,
  useRef,
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
import {
  normalizeSelectedChannelView,
} from '../../shared/channelEntry';
import { isDirectLaneChannel } from '../../shared/channelTopology';
import {
  cancelChatChannel,
  cancelConcurrentChatGroup,
  encodeAttachmentFiles,
  createConcurrentChatGroup,
  createChatChannel,
  sendConcurrentChatMessage,
  sendChatMessage,
  updateSelectedChannel,
  uploadChannelAttachments,
} from '../api';
import {
  applyPendingExecutionTargetPreview,
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

function isChannelDispatchRunning(
  payload: AppShellPayload,
  channelId: string,
): boolean {
  return payload.chat.channels.some((channel) =>
    channel.id === channelId && channel.routingStatus === 'running');
}

function isAnyConcurrentDispatchRunning(
  payload: AppShellPayload,
  channelIds: string[],
): boolean {
  return channelIds.some((channelId) => isChannelDispatchRunning(payload, channelId));
}

interface ActiveSubmitRequest {
  id: number;
  kind: 'channel' | 'concurrent';
  channelId: string;
  groupId?: string;
  channelIds?: string[];
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
  showingParallelChatDraft: boolean;
  draftConcurrentTargets: ModelSelectorValue[];
  resetDraftConcurrentTargets: () => void;
  compareGroupId: string | null;
  compareSendScope: 'all_members' | 'active_only';
  selectedChannel: SelectedChannelView | null;
  busy: string;
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
    showingParallelChatDraft,
    draftConcurrentTargets,
    resetDraftConcurrentTargets,
    compareGroupId,
    compareSendScope,
    selectedChannel,
    busy,
    setBusy,
    setFeedback,
  } = options;
  const activeSubmitRequestRef = useRef<ActiveSubmitRequest | null>(null);
  const nextSubmitIdRef = useRef(1);

  useEffect(() => {
    if (state.status !== 'ready') {
      return;
    }

    const activeRequest = activeSubmitRequestRef.current;
    if (!activeRequest) {
      return;
    }

    if (busy.startsWith('message:stop:') || busy === 'concurrent:stop') {
      return;
    }

    const stillRunning = activeRequest.kind === 'concurrent'
      ? isAnyConcurrentDispatchRunning(
          state.payload,
          activeRequest.channelIds ?? [activeRequest.channelId],
        )
      : isChannelDispatchRunning(state.payload, activeRequest.channelId);
    if (stillRunning) {
      return;
    }

    const expectedBusy = activeRequest.kind === 'concurrent'
      ? 'concurrent:dispatch'
      : `message:send:${activeRequest.channelId}`;
    if (busy === expectedBusy) {
      activeSubmitRequestRef.current = null;
      setBusy('');
    }
  }, [busy, setBusy, state]);

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
    const submitId = nextSubmitIdRef.current;
    nextSubmitIdRef.current += 1;
    let keepBusyAfterReturn = false;
    try {
      if (showingParallelChatDraft && wasDraftingNewChat) {
        if (draftConcurrentTargets.length < 2) {
          throw new Error('Choose at least two parallel chats before sending.');
        }

        setBusy('concurrent:ack');
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
        setComposerDraft('');
        navigate(rollbackPath, { replace: true });
        setState({ status: 'ready', payload: created.appShell });
        const encodedAttachments = draftFiles.length > 0
          ? await encodeAttachmentFiles(draftFiles)
          : undefined;
        const dispatch = await sendConcurrentChatMessage(created.group.id, {
          activeChannelId,
          body,
          attachments: encodedAttachments,
        });
        rollbackPayload = dispatch.appShell;
        setState({ status: 'ready', payload: dispatch.appShell });
        if (isAnyConcurrentDispatchRunning(dispatch.appShell, created.group.memberChannelIds)) {
          activeSubmitRequestRef.current = {
            id: submitId,
            kind: 'concurrent',
            channelId: activeChannelId,
            groupId: created.group.id,
            channelIds: created.group.memberChannelIds,
          };
          setBusy('concurrent:dispatch');
          keepBusyAfterReturn = true;
        } else {
          activeSubmitRequestRef.current = null;
        }
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

        rollbackPath = currentPathname;
        setComposerDraft('');
        setChannelFiles([]);
        setBusy('concurrent:ack');
        const activeGroupChannelIds = initialPayload.chat.concurrentGroups.find((group) =>
          group.id === compareGroupId,
        )?.memberChannelIds ?? [channelId];

        const encodedAttachments = channelFiles.length > 0
          ? await encodeAttachmentFiles(channelFiles)
          : undefined;
        const dispatch = await sendConcurrentChatMessage(compareGroupId, {
          activeChannelId: channelId,
          body,
          attachments: encodedAttachments,
        });
        rollbackPayload = dispatch.appShell;
        setState({ status: 'ready', payload: dispatch.appShell });
        if (isAnyConcurrentDispatchRunning(dispatch.appShell, activeGroupChannelIds)) {
          activeSubmitRequestRef.current = {
            id: submitId,
            kind: 'concurrent',
            channelId,
            groupId: compareGroupId,
            channelIds: activeGroupChannelIds,
          };
          setBusy('concurrent:dispatch');
          keepBusyAfterReturn = true;
        } else {
          activeSubmitRequestRef.current = null;
        }
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
        payload = applyPendingExecutionTargetPreview(payload, channelId, soloDispatchTarget);
      }
      setState({ status: 'ready', payload });
      setComposerDraft('');
      setDraftFiles([]);
      setChannelFiles([]);
      navigate(rollbackPath, { replace: true });
      setBusy(`message:ack:${channelId}`);

      const dispatch = await sendChatMessage(channelId, {
        body: messageBody,
        ...(soloDispatchTarget ?? {}),
      });
      rollbackPayload = dispatch.appShell;
      setState({ status: 'ready', payload: dispatch.appShell });
      if (isChannelDispatchRunning(dispatch.appShell, channelId)) {
        activeSubmitRequestRef.current = {
          id: submitId,
          kind: 'channel',
          channelId,
        };
        setBusy(`message:send:${channelId}`);
        keepBusyAfterReturn = true;
      } else {
        activeSubmitRequestRef.current = null;
      }
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
      activeSubmitRequestRef.current = null;
      setState({ status: 'ready', payload: rollbackPayload });
      setComposerDraft(body);
      restoreFiles();
      setFeedback(error instanceof Error ? error.message : 'Failed to send message.');
      navigate(rollbackPath, { replace: true });
    } finally {
      if (!keepBusyAfterReturn && activeSubmitRequestRef.current?.id === submitId) {
        activeSubmitRequestRef.current = null;
      }
      if (!keepBusyAfterReturn) {
        setBusy('');
      }
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
    showingParallelChatDraft,
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

  const onStopMessage = useCallback(async (): Promise<void> => {
    const activeRequest = activeSubmitRequestRef.current;
    if (!activeRequest) {
      return;
    }

    activeSubmitRequestRef.current = null;
    setFeedback('');
    setBusy(
      activeRequest.kind === 'concurrent'
        ? 'concurrent:stop'
        : `message:stop:${activeRequest.channelId}`,
    );

    try {
      const cancellation = activeRequest.kind === 'concurrent'
        ? await cancelConcurrentChatGroup(activeRequest.groupId ?? '', {
            activeChannelId: activeRequest.channelId,
          })
        : await cancelChatChannel(activeRequest.channelId);
      setState({ status: 'ready', payload: cancellation.appShell });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to stop response.');
    } finally {
      setBusy('');
    }
  }, [
    setBusy,
    setFeedback,
    setState,
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
    onStopMessage,
    submitComposerMessage,
  };
}

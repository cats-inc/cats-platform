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

import {
  isComposerStopBusy,
  normalizeComposerBusy,
  shouldSubmitComposerOnKeyDown,
} from '../../../../shared/composer';
import type { AppShellPayload } from '../../api/contracts';
import {
  buildChannelPath,
} from '../../shared/channelPaths';
import {
  normalizeSelectedChannelView,
} from '../../shared/channelEntry';
import {
  buildSoloDispatchTarget,
  isDirectLaneSelectedForCat,
  prepareComposerChannelDispatch,
  prepareComposerMessageBody,
  resolveComposerFilesToUpload,
} from '../../../shared/renderer/composerDispatch.js';
import {
  cancelChatChannel,
  cancelParallelChatGroup,
  encodeAttachmentFiles,
  createParallelChatGroup,
  createChatChannel,
  fetchAppShell,
  sendParallelChatMessage,
  sendChatMessage,
  updateSelectedChannel,
  uploadChannelAttachments,
} from '../api';
import {
  applyPendingExecutionTargetPreview,
  createDraftChannelTitle,
  insertCreatedChannelIntoPayload,
  type DraftTemporaryParticipant,
  type SelectedChannelView,
} from '../chatUtils';
import {
  resolveDraftRouteContext,
  resolveDraftRoutePath,
} from '../draftParticipants';
import type { ModelSelectorValue } from '../components/ModelSelector';

type LoadStateLike =
  | { status: 'loading' }
  | { status: 'ready'; payload: AppShellPayload }
  | { status: 'error'; message: string };

function isChannelDispatchRunning(
  payload: AppShellPayload,
  channelId: string,
): boolean {
  return payload.chat.channels.some((channel) =>
    channel.id === channelId && channel.routingStatus === 'running');
}

function isAnyParallelChatDispatchRunning(
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

interface ActiveAckRequest {
  id: number;
  controller: AbortController;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
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
  draftEntryKind: 'solo' | 'group' | 'direct';
  draftDefaultRecipientCatId: string | null;
  draftParticipantCatIds: string[];
  draftTemporaryParticipants: DraftTemporaryParticipant[];
  draftCwd: string | null;
  draftFiles: File[];
  channelFiles: File[];
  setDraftCwd: Dispatch<SetStateAction<string | null>>;
  setDraftCatIds: Dispatch<SetStateAction<string[]>>;
  setDraftTemporaryParticipants: Dispatch<SetStateAction<DraftTemporaryParticipant[]>>;
  setDraftHighlightedCatId: Dispatch<SetStateAction<string | null>>;
  setDraftCatModelOverrides: Dispatch<SetStateAction<Map<string, ModelSelectorValue>>>;
  setDraftFiles: Dispatch<SetStateAction<File[]>>;
  setChannelFiles: Dispatch<SetStateAction<File[]>>;
  draftModel: ModelSelectorValue;
  soloChannelModel: ModelSelectorValue;
  showingParallelChatDraft: boolean;
  draftParallelChatTargets: ModelSelectorValue[];
  resetDraftParallelChatTargets: () => void;
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
    draftEntryKind,
    draftDefaultRecipientCatId,
    draftParticipantCatIds,
    draftTemporaryParticipants,
    draftCwd,
    draftFiles,
    channelFiles,
    setDraftCwd,
    setDraftCatIds,
    setDraftTemporaryParticipants,
    setDraftHighlightedCatId,
    setDraftCatModelOverrides,
    setDraftFiles,
    setChannelFiles,
    draftModel,
    soloChannelModel,
    showingParallelChatDraft,
    draftParallelChatTargets,
    resetDraftParallelChatTargets,
    compareGroupId,
    compareSendScope,
    selectedChannel,
    busy,
    setBusy,
    setFeedback,
  } = options;
  const activeAckRequestRef = useRef<ActiveAckRequest | null>(null);
  const activeDispatchRequestRef = useRef<ActiveSubmitRequest | null>(null);
  const nextSubmitIdRef = useRef(1);

  useEffect(() => () => {
    activeAckRequestRef.current?.controller.abort();
    activeAckRequestRef.current = null;
    activeDispatchRequestRef.current = null;
  }, []);

  useEffect(() => {
    if (state.status !== 'ready') {
      return;
    }

    const normalizedBusy = normalizeComposerBusy(busy);
    const activeRequest = activeDispatchRequestRef.current;
    if (!activeRequest) {
      return;
    }

    if (isComposerStopBusy(normalizedBusy)) {
      return;
    }

    const stillRunning = activeRequest.kind === 'concurrent'
      ? isAnyParallelChatDispatchRunning(
          state.payload,
          activeRequest.channelIds ?? [activeRequest.channelId],
        )
      : isChannelDispatchRunning(state.payload, activeRequest.channelId);
    if (stillRunning) {
      return;
    }

    const expectedBusy = activeRequest.kind === 'concurrent'
      ? 'parallelChat:dispatch'
      : `message:send:${activeRequest.channelId}`;
    if (normalizedBusy === expectedBusy) {
      activeDispatchRequestRef.current = null;
      setBusy('');
    }
  }, [busy, setBusy, state]);

  useEffect(() => {
    const normalizedBusy = normalizeComposerBusy(busy);
    const activeRequest = activeDispatchRequestRef.current;
    if (!activeRequest) {
      return;
    }

    const expectedBusy = activeRequest.kind === 'concurrent'
      ? 'parallelChat:dispatch'
      : `message:send:${activeRequest.channelId}`;
    if (normalizedBusy !== expectedBusy) {
      return;
    }

    let cancelled = false;
    let refetchInFlight = false;
    const interval = window.setInterval(async () => {
      if (cancelled || refetchInFlight) {
        return;
      }

      refetchInFlight = true;
      try {
        const payload = await fetchAppShell();
        if (cancelled) {
          return;
        }
        setState({ status: 'ready', payload });

        const currentRequest = activeDispatchRequestRef.current;
        if (!currentRequest || currentRequest.id !== activeRequest.id) {
          return;
        }

        const stillRunning = currentRequest.kind === 'concurrent'
          ? isAnyParallelChatDispatchRunning(
              payload,
              currentRequest.channelIds ?? [currentRequest.channelId],
            )
          : isChannelDispatchRunning(payload, currentRequest.channelId);
        if (!stillRunning) {
          activeDispatchRequestRef.current = null;
          setBusy('');
        }
      } catch {
        // Keep the existing SSE-driven path as primary; this only prevents indefinite busy lockups.
      } finally {
        refetchInFlight = false;
      }
    }, 4_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [busy, setBusy, setState]);

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
    const draftRoute = resolveDraftRouteContext({
      draftDefaultRecipientCatId,
      showingMyCatDirectLane,
    });
    const isCatScopedLaneRoute = draftRoute.isDirectLaneRoute;
    const hydratedDirectLane = isDirectLaneSelectedForCat(initialSelectedChannel, draftDefaultRecipientCatId)
      ? initialSelectedChannel
      : null;
    let payload = initialPayload;
    let rollbackPayload = initialPayload;
    let channelId = wasDraftingNewChat || showingMyCatDirectLane
      ? hydratedDirectLane?.id ?? ''
      : initialPayload.chat.selectedChannelId;
    let rollbackPath = draftRoute.isDirectLaneRoute || wasDraftingNewChat
      ? resolveDraftRoutePath({ route: draftRoute })
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
    const ackController = new AbortController();
    activeAckRequestRef.current = {
      id: submitId,
      controller: ackController,
    };
    let keepBusyAfterReturn = false;
    try {
      if (showingParallelChatDraft && wasDraftingNewChat) {
        if (draftParallelChatTargets.length < 2) {
          throw new Error('Choose at least two parallel chats before sending.');
        }

        setBusy('parallelChat:ack');
        const created = await createParallelChatGroup({
          title: createDraftChannelTitle(body, initialPayload.chat.channels.length),
          repoPath: draftCwd ?? undefined,
          targets: draftParallelChatTargets.map((target) => ({
            provider: target.provider,
            instance: target.instance ?? null,
            model: target.model ?? null,
            modelSelection: target.modelSelection ?? null,
          })),
        }, ackController.signal);
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
        restoreFiles = () => {
          setChannelFiles(originalDraftFiles);
        };
        const encodedAttachments = draftFiles.length > 0
          ? await encodeAttachmentFiles(draftFiles)
          : undefined;
        const dispatch = await sendParallelChatMessage(created.group.id, {
          activeChannelId,
          body,
          attachments: encodedAttachments,
        }, ackController.signal);
        if (activeAckRequestRef.current?.id === submitId) {
          activeAckRequestRef.current = null;
        }
        rollbackPayload = dispatch.appShell;
        setState({ status: 'ready', payload: dispatch.appShell });
        if (isAnyParallelChatDispatchRunning(dispatch.appShell, created.group.memberChannelIds)) {
          activeDispatchRequestRef.current = {
            id: submitId,
            kind: 'concurrent',
            channelId: activeChannelId,
            groupId: created.group.id,
            channelIds: created.group.memberChannelIds,
          };
          setBusy('parallelChat:dispatch');
          keepBusyAfterReturn = true;
        } else {
          activeDispatchRequestRef.current = null;
        }
        setFeedback('');

        setDraftCwd(null);
        setDraftCatIds([]);
        setDraftTemporaryParticipants([]);
        setDraftHighlightedCatId(null);
        setDraftCatModelOverrides(new Map());
        setDraftFiles([]);
        resetDraftParallelChatTargets();
        return;
      }

      if (compareGroupId && compareSendScope === 'all_members' && !wasDraftingNewChat) {
        if (!channelId) {
          throw new Error('No parallel chat is available for sending messages.');
        }

        rollbackPath = currentPathname;
        setComposerDraft('');
        setChannelFiles([]);
        setBusy('parallelChat:ack');
        const activeGroupChannelIds = initialPayload.chat.parallelChatGroups.find((group) =>
          group.id === compareGroupId,
        )?.memberChannelIds ?? [channelId];

        const encodedAttachments = channelFiles.length > 0
          ? await encodeAttachmentFiles(channelFiles)
          : undefined;
        const dispatch = await sendParallelChatMessage(compareGroupId, {
          activeChannelId: channelId,
          body,
          attachments: encodedAttachments,
        }, ackController.signal);
        if (activeAckRequestRef.current?.id === submitId) {
          activeAckRequestRef.current = null;
        }
        rollbackPayload = dispatch.appShell;
        setState({ status: 'ready', payload: dispatch.appShell });
        if (isAnyParallelChatDispatchRunning(dispatch.appShell, activeGroupChannelIds)) {
          activeDispatchRequestRef.current = {
            id: submitId,
            kind: 'concurrent',
            channelId,
            groupId: compareGroupId,
            channelIds: activeGroupChannelIds,
          };
          setBusy('parallelChat:dispatch');
          keepBusyAfterReturn = true;
        } else {
          activeDispatchRequestRef.current = null;
        }
        setFeedback('');
        return;
      }

        setBusy('message:prepare');

      const preparedChannel = await prepareComposerChannelDispatch({
        initialPayload,
        wasDraftingNewChat,
        isCatScopedLaneRoute,
        hydratedDirectLane,
        currentChannelId: channelId,
        currentRollbackPath: rollbackPath,
        body,
        existingCount: initialPayload.chat.channels.length,
        draftCwd,
        draftDefaultRecipientCatId,
        participantCatIds: draftParticipantCatIds,
        temporaryParticipants: draftTemporaryParticipants,
        draftEntryKind,
        draftModel,
        createChatChannel,
        insertCreatedChannelIntoPayload,
        setState,
        navigate,
        setChannelFiles,
        originalDraftFiles,
        originalChannelFiles,
        buildChannelPath,
        signal: ackController.signal,
      });
      payload = preparedChannel.payload;
      rollbackPayload = preparedChannel.rollbackPayload;
      channelId = preparedChannel.channelId;
      rollbackPath = preparedChannel.rollbackPath;
      restoreFiles = preparedChannel.restoreFiles;

      const soloDispatchTarget = buildSoloDispatchTarget({
        wasDraftingNewChat,
        isCatScopedLaneRoute,
        channelId,
        selectedChannel,
        soloChannelModel,
      });

      const filesToUpload = resolveComposerFilesToUpload({
        isCatScopedLaneRoute,
        hydratedDirectLane,
        wasDraftingNewChat,
        draftFiles,
        channelFiles,
      });
      const preparedMessage = await prepareComposerMessageBody({
        payload,
        channelId,
        body,
        filesToUpload,
        updateSelectedChannel,
        uploadChannelAttachments,
        signal: ackController.signal,
      });
      if (preparedMessage.payload !== payload) {
        payload = preparedMessage.payload;
        rollbackPayload = payload;
        setState({ status: 'ready', payload });
      }
      const messageBody = preparedMessage.messageBody;

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
      }, ackController.signal);
      if (activeAckRequestRef.current?.id === submitId) {
        activeAckRequestRef.current = null;
      }
      rollbackPayload = dispatch.appShell;
      setState({ status: 'ready', payload: dispatch.appShell });
      if (isChannelDispatchRunning(dispatch.appShell, channelId)) {
        activeDispatchRequestRef.current = {
          id: submitId,
          kind: 'channel',
          channelId,
        };
        setBusy(`message:send:${channelId}`);
        keepBusyAfterReturn = true;
      } else {
        activeDispatchRequestRef.current = null;
      }
      setComposerDraft('');
      setFeedback('');
      navigate(rollbackPath, { replace: true });

      if (isCatScopedLaneRoute) {
        setDraftCwd(null);
        setDraftCatIds([]);
        setDraftTemporaryParticipants([]);
        setDraftHighlightedCatId(null);
        setDraftCatModelOverrides(new Map());
        setDraftFiles([]);
        setChannelFiles([]);
      } else if (wasDraftingNewChat) {
        setDraftCwd(null);
        setDraftCatIds([]);
        setDraftTemporaryParticipants([]);
        setDraftHighlightedCatId(null);
        setDraftCatModelOverrides(new Map());
        setDraftFiles([]);
      } else {
        setChannelFiles([]);
      }
    } catch (error) {
      if (activeAckRequestRef.current?.id === submitId) {
        activeAckRequestRef.current = null;
      }
      if (activeDispatchRequestRef.current?.id === submitId) {
        activeDispatchRequestRef.current = null;
      }
      setState({ status: 'ready', payload: rollbackPayload });
      setComposerDraft(body);
      restoreFiles();
      if (isAbortError(error)) {
        setFeedback('');
      } else {
        setFeedback(error instanceof Error ? error.message : 'Failed to send message.');
      }
      navigate(rollbackPath, { replace: true });
    } finally {
      if (!keepBusyAfterReturn && activeAckRequestRef.current?.id === submitId) {
        activeAckRequestRef.current = null;
      }
      if (!keepBusyAfterReturn && activeDispatchRequestRef.current?.id === submitId) {
        activeDispatchRequestRef.current = null;
      }
      if (!keepBusyAfterReturn) {
        setBusy('');
      }
    }
  }, [
    channelFiles,
    composerDraft,
    currentPathname,
    draftParticipantCatIds,
    draftTemporaryParticipants,
    draftCwd,
    draftFiles,
    draftEntryKind,
    draftDefaultRecipientCatId,
    draftModel.instance,
    draftModel.modelSelection,
    draftModel.model,
    draftModel.provider,
    showingParallelChatDraft,
    draftParallelChatTargets,
    resetDraftParallelChatTargets,
    compareGroupId,
    compareSendScope,
    navigate,
    selectedChannel,
    setBusy,
    setChannelFiles,
    setComposerDraft,
    setDraftCatIds,
    setDraftTemporaryParticipants,
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
    const activeRequest = activeDispatchRequestRef.current;
    if (!activeRequest) {
      return;
    }

    activeDispatchRequestRef.current = null;
    setFeedback('');
    setBusy(
      activeRequest.kind === 'concurrent'
        ? 'parallelChat:stop'
        : `message:stop:${activeRequest.channelId}`,
    );

    try {
      const cancellation = activeRequest.kind === 'concurrent'
        ? await cancelParallelChatGroup(activeRequest.groupId ?? '', {
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

  const onCancelPendingSend = useCallback((): void => {
    const activeRequest = activeAckRequestRef.current;
    if (!activeRequest) {
      return;
    }

    activeAckRequestRef.current = null;
    setFeedback('');
    activeRequest.controller.abort();
  }, [setFeedback]);

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
    onCancelPendingSend,
    onSendMessage,
    onStopMessage,
    submitComposerMessage,
  };
}

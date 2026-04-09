import {
  useCallback,
  useRef,
  type Dispatch,
  type FormEvent,
  type KeyboardEvent,
  type SetStateAction,
} from 'react';
import type { NavigateFunction } from 'react-router-dom';

import {
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
  isDirectLaneSelectedForCat,
  prepareWorkspaceSendContext,
} from '../../../shared/renderer/composerDispatch.js';
import { useComposerRequestControls } from '../../../shared/renderer/hooks/useComposerRequestControls.js';
import { useComposerRequestLifecycle } from '../../../shared/renderer/hooks/useComposerRequestLifecycle.js';
import {
  cancelChatChannel,
  cancelParallelChatGroup,
  createChatChannel,
  fetchAppShell,
  sendChatMessage,
  updateSelectedChannel,
  uploadChannelAttachments,
} from '../api';
import {
  captureManagedComposerLocation,
  clearManagedComposerLocation,
  navigateWithinManagedComposerFlow,
} from '../../../shared/renderer/composerNavigation.js';
import { resetComposerDraftState } from '../../../shared/renderer/composerDraftState.js';
import {
  submitNewParallelChatDraft,
  submitParallelCompareMessage,
} from '../composerParallelDispatch.js';
import {
  applyPendingExecutionTargetPreview,
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
  const {
    activeDispatchRequestRef,
    beginAckRequest,
    cancelPendingAckRequest,
    clearAckRequestIfCurrent,
    clearDispatchRequestIfCurrent,
    setActiveDispatchRequest,
  } = useComposerRequestLifecycle({
    state,
    busy,
    setBusy,
    setState,
    fetchPayload: fetchAppShell,
    isChannelDispatchRunning,
  });
  const {
    onCancelPendingSend,
    onStopMessage,
  } = useComposerRequestControls({
    activeDispatchRequestRef,
    cancelPendingAckRequest,
    cancelChannel: cancelChatChannel,
    cancelConcurrentGroup: cancelParallelChatGroup,
    setBusy,
    setFeedback,
    setState,
  });
  const managedNavigationLocationRef = useRef<string | null>(null);

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
    const navigateWithinManagedFlow = (nextPath: string): boolean =>
      navigateWithinManagedComposerFlow(
        managedNavigationLocationRef,
        navigate,
        nextPath,
      );

    setFeedback('');
    const { id: submitId, controller: ackController } = beginAckRequest();
    let keepBusyAfterReturn = false;
    captureManagedComposerLocation(managedNavigationLocationRef);
    try {
      if (showingParallelChatDraft && wasDraftingNewChat) {
        setBusy('parallelChat:ack');
        const dispatch = await submitNewParallelChatDraft({
          body,
          payload: initialPayload,
          draftCwd,
          draftFiles,
          draftParallelChatTargets,
          signal: ackController.signal,
        });

        rollbackPayload = dispatch.createdAppShell;
        rollbackPath = dispatch.rollbackPath;
        setComposerDraft('');
        navigateWithinManagedFlow(rollbackPath);
        setState({ status: 'ready', payload: dispatch.createdAppShell });
        restoreFiles = () => {
          setChannelFiles(originalDraftFiles);
        };
        clearAckRequestIfCurrent(submitId);
        rollbackPayload = dispatch.dispatchAppShell;
        setState({ status: 'ready', payload: dispatch.dispatchAppShell });
        if (dispatch.dispatchRequest) {
          setActiveDispatchRequest({
            id: submitId,
            ...dispatch.dispatchRequest,
          });
          setBusy('parallelChat:dispatch');
          keepBusyAfterReturn = true;
        } else {
          setActiveDispatchRequest(null);
        }
        setFeedback('');

        resetComposerDraftState({
          setDraftCwd,
          setDraftCatIds,
          setDraftTemporaryParticipants,
          setDraftHighlightedCatId,
          setDraftCatModelOverrides,
          setDraftFiles,
          resetDraftParallelChatTargets,
        });
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
        const dispatch = await submitParallelCompareMessage({
          body,
          payload: initialPayload,
          compareGroupId,
          channelId,
          channelFiles,
          signal: ackController.signal,
        });
        clearAckRequestIfCurrent(submitId);
        rollbackPayload = dispatch.dispatchAppShell;
        setState({ status: 'ready', payload: dispatch.dispatchAppShell });
        if (dispatch.dispatchRequest) {
          setActiveDispatchRequest({
            id: submitId,
            ...dispatch.dispatchRequest,
          });
          setBusy('parallelChat:dispatch');
          keepBusyAfterReturn = true;
        } else {
          setActiveDispatchRequest(null);
        }
        setFeedback('');
        return;
      }

        setBusy('message:prepare');

      const preparedSendContext = await prepareWorkspaceSendContext({
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
        selectedChannel,
        soloChannelModel,
        draftFiles,
        channelFiles,
        createChatChannel,
        insertCreatedChannelIntoPayload,
        setState,
        navigate,
        setChannelFiles,
        originalDraftFiles,
        originalChannelFiles,
        buildChannelPath,
        updateSelectedChannel,
        uploadChannelAttachments,
        signal: ackController.signal,
      });
      payload = preparedSendContext.payload;
      rollbackPayload = preparedSendContext.rollbackPayload;
      channelId = preparedSendContext.channelId;
      rollbackPath = preparedSendContext.rollbackPath;
      restoreFiles = preparedSendContext.restoreFiles;
      const { messageBody, soloDispatchTarget } = preparedSendContext;

      if (soloDispatchTarget) {
        payload = applyPendingExecutionTargetPreview(payload, channelId, soloDispatchTarget);
      }
      setState({ status: 'ready', payload });
      setComposerDraft('');
      setDraftFiles([]);
      setChannelFiles([]);
      navigateWithinManagedFlow(rollbackPath);
      setBusy(`message:ack:${channelId}`);

      const dispatch = await sendChatMessage(channelId, {
        body: messageBody,
        ...(soloDispatchTarget ?? {}),
      }, ackController.signal);
      clearAckRequestIfCurrent(submitId);
      rollbackPayload = dispatch.appShell;
      setState({ status: 'ready', payload: dispatch.appShell });
      if (isChannelDispatchRunning(dispatch.appShell, channelId)) {
        setActiveDispatchRequest({
          id: submitId,
          kind: 'channel',
          channelId,
        });
        setBusy(`message:send:${channelId}`);
        keepBusyAfterReturn = true;
      } else {
        setActiveDispatchRequest(null);
      }
      setComposerDraft('');
      setFeedback('');
      navigateWithinManagedFlow(rollbackPath);

      if (isCatScopedLaneRoute) {
        resetComposerDraftState({
          setDraftCwd,
          setDraftCatIds,
          setDraftTemporaryParticipants,
          setDraftHighlightedCatId,
          setDraftCatModelOverrides,
          setDraftFiles,
          setChannelFiles,
        });
      } else if (wasDraftingNewChat) {
        resetComposerDraftState({
          setDraftCwd,
          setDraftCatIds,
          setDraftTemporaryParticipants,
          setDraftHighlightedCatId,
          setDraftCatModelOverrides,
          setDraftFiles,
        });
      } else {
        setChannelFiles([]);
      }
    } catch (error) {
      clearAckRequestIfCurrent(submitId);
      if (activeDispatchRequestRef.current?.id === submitId) {
        setActiveDispatchRequest(null);
      }
      setState({ status: 'ready', payload: rollbackPayload });
      setComposerDraft(body);
      restoreFiles();
      if (isAbortError(error)) {
        setFeedback('');
      } else {
        setFeedback(error instanceof Error ? error.message : 'Failed to send message.');
      }
      navigateWithinManagedFlow(rollbackPath);
    } finally {
      if (!keepBusyAfterReturn) {
        clearAckRequestIfCurrent(submitId);
        clearDispatchRequestIfCurrent(submitId);
      }
      if (!keepBusyAfterReturn) {
        setBusy('');
      }
      clearManagedComposerLocation(managedNavigationLocationRef);
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

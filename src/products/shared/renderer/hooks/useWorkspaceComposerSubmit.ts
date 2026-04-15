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
} from '../../../../shared/composer.js';
import {
  clearBusyState,
  createChannelComposerBusyScope,
  createComposerBusyState,
  createDraftComposerBusyScope,
  type WorkspaceBusyState,
} from '../../../../shared/workspaceBusy.js';
import type { ProviderModelSelection } from '../../../../shared/providerSelection.js';
import type { AppShellPayload } from '../../api/workspaceContracts.js';
import {
  buildWorkspaceChannelPath,
  buildWorkspaceMyCatPath,
  buildWorkspaceNewChatPath,
} from '../../channelPaths.js';
import { normalizeSelectedChannelView, type SelectedChannelView } from '../../channelEntry.js';
import {
  isDirectLaneSelectedForCat,
  prepareWorkspaceSendContext,
} from '../composerDispatch.js';
import {
  createChatChannel,
  fetchAppShell,
  sendChatMessage,
  updateSelectedChannel,
  uploadChannelAttachments,
} from '../api/index.js';
import {
  applyOptimisticPendingExecutionTarget,
  appendOptimisticUserMessage,
  insertCreatedChannelIntoPayload,
} from '../workspaceChatUtils.js';
import {
  captureManagedComposerLocation,
  clearManagedComposerLocation,
  navigateWithinManagedComposerFlow,
} from '../composerNavigation.js';
import { resetComposerDraftState } from '../composerDraftState.js';
import { useComposerRequestLifecycle } from './useComposerRequestLifecycle.js';
import { useComposerSubmitBindings } from './useComposerSubmitBindings.js';

type LoadStateLike =
  | { status: 'loading' }
  | { status: 'ready'; payload: AppShellPayload }
  | { status: 'error'; message: string };

export interface WorkspaceModelSelectorValue {
  provider: string;
  model: string | null;
  instance: string | null;
  modelSelection: ProviderModelSelection | null;
}

export interface WorkspaceComposerSubmitOptions<ModelValue extends WorkspaceModelSelectorValue> {
  state: LoadStateLike;
  setState: Dispatch<SetStateAction<LoadStateLike>>;
  navigate: NavigateFunction;
  chatPrefix: string;
  currentPathname: string;
  composerDraft: string;
  setComposerDraft: Dispatch<SetStateAction<string>>;
  showingNewChatDraft: boolean;
  showingMyCatDirectLane: boolean;
  draftDefaultRecipientCatId: string | null;
  draftCatIds: string[];
  draftCwd: string | null;
  draftFiles: File[];
  channelFiles: File[];
  setDraftCwd: Dispatch<SetStateAction<string | null>>;
  setDraftCatIds: Dispatch<SetStateAction<string[]>>;
  setDraftHighlightedCatId: Dispatch<SetStateAction<string | null>>;
  setDraftCatModelOverrides: Dispatch<SetStateAction<Map<string, ModelValue>>>;
  setDraftFiles: Dispatch<SetStateAction<File[]>>;
  setChannelFiles: Dispatch<SetStateAction<File[]>>;
  draftModel: ModelValue;
  soloChannelModel: ModelValue;
  selectedChannel: SelectedChannelView | null;
  busy: WorkspaceBusyState;
  setBusy: Dispatch<SetStateAction<WorkspaceBusyState>>;
  setFeedback: Dispatch<SetStateAction<string>>;
}

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

export function useWorkspaceComposerSubmit<ModelValue extends WorkspaceModelSelectorValue>(
  options: WorkspaceComposerSubmitOptions<ModelValue>,
) {
  const {
    state,
    setState,
    navigate,
    chatPrefix,
    currentPathname,
    composerDraft,
    setComposerDraft,
    showingNewChatDraft,
    showingMyCatDirectLane,
    draftDefaultRecipientCatId,
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
    busy,
    setBusy,
    setFeedback,
  } = options;
  const managedNavigationLocationRef = useRef<string | null>(null);
  const {
    activeDispatchRequestRef,
    beginAckRequest,
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
    const isCatScopedLaneRoute = Boolean(draftDefaultRecipientCatId) && showingMyCatDirectLane;
    const initialSelectedChannel = normalizeSelectedChannelView(initialPayload.chat.selectedChannel ?? null);
    const hydratedDirectLane = isDirectLaneSelectedForCat(initialSelectedChannel, draftDefaultRecipientCatId)
      ? initialSelectedChannel
      : null;
    let payload = initialPayload;
    let rollbackPayload = initialPayload;
    let channelId = wasDraftingNewChat || showingMyCatDirectLane
      ? hydratedDirectLane?.id ?? ''
      : initialPayload.chat.selectedChannelId;
    let rollbackPath = showingMyCatDirectLane
      ? buildWorkspaceMyCatPath(chatPrefix, draftDefaultRecipientCatId ?? '')
      : wasDraftingNewChat
        ? buildWorkspaceNewChatPath(chatPrefix, draftDefaultRecipientCatId)
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
    const prepareBusyScope = channelId
      ? createChannelComposerBusyScope(channelId)
      : createDraftComposerBusyScope();
    const { id: submitId, controller: ackController } = beginAckRequest();
    let keepBusyAfterReturn = false;
    setBusy(createComposerBusyState('prepare', prepareBusyScope));
    captureManagedComposerLocation(managedNavigationLocationRef);
    try {
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
        participantCatIds: draftCatIds,
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
        buildChannelPath: (createdChannelId) =>
          buildWorkspaceChannelPath(chatPrefix, createdChannelId),
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
        payload = applyOptimisticPendingExecutionTarget(payload, channelId, soloDispatchTarget);
      }
      payload = appendOptimisticUserMessage(payload, channelId, messageBody);
      setState({ status: 'ready', payload });
      setComposerDraft('');
      setDraftFiles([]);
      setChannelFiles([]);
      navigateWithinManagedFlow(rollbackPath);
      setBusy(createComposerBusyState('ack', createChannelComposerBusyScope(channelId)));

      const dispatch = await sendChatMessage(channelId, {
        body: messageBody,
        ...(soloDispatchTarget ?? {}),
      }, ackController.signal);
      clearAckRequestIfCurrent(submitId);
      setState({ status: 'ready', payload: dispatch.appShell });
      if (isChannelDispatchRunning(dispatch.appShell, channelId)) {
        setActiveDispatchRequest({
          id: submitId,
          kind: 'channel',
          channelId,
        });
        setBusy(createComposerBusyState('send', createChannelComposerBusyScope(channelId)));
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
          setDraftHighlightedCatId,
          setDraftCatModelOverrides,
          setDraftFiles,
          setChannelFiles,
        });
      } else if (wasDraftingNewChat) {
        resetComposerDraftState({
          setDraftCwd,
          setDraftCatIds,
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
        setBusy(clearBusyState());
      }
      clearManagedComposerLocation(managedNavigationLocationRef);
    }
  }, [
    activeDispatchRequestRef,
    beginAckRequest,
    channelFiles,
    chatPrefix,
    clearAckRequestIfCurrent,
    clearDispatchRequestIfCurrent,
    composerDraft,
    currentPathname,
    draftCatIds,
    draftCwd,
    draftFiles,
    draftDefaultRecipientCatId,
    draftModel.instance,
    draftModel.modelSelection,
    draftModel.model,
    draftModel.provider,
    navigate,
    selectedChannel,
    setActiveDispatchRequest,
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

  const { onSendMessage, onComposerKeyDown } =
    useComposerSubmitBindings(submitComposerMessage);

  return {
    onComposerKeyDown,
    onSendMessage,
    submitComposerMessage,
  };
}

export function createUseComposerSubmit<ModelValue extends WorkspaceModelSelectorValue>(
  chatPrefix: string,
) {
  return function useComposerSubmit(
    options: Omit<WorkspaceComposerSubmitOptions<ModelValue>, 'chatPrefix'>,
  ) {
    return useWorkspaceComposerSubmit<ModelValue>({
      ...options,
      chatPrefix,
    });
  };
}

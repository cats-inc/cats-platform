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
import type { PlatformSurfaceId } from '../../../../shared/platform-contract.js';
import {
  clearBusyState,
  createChannelComposerBusyScope,
  createComposerBusyState,
  createDraftComposerBusyScope,
  createParallelChatBusyState,
  type WorkspaceBusyState,
} from '../../../../shared/workspaceBusy.js';
import type { ProviderModelSelection } from '../../../../shared/providerSelection.js';
import {
  createDefaultRuntimeSessionPolicy,
  type RuntimeSessionPolicy,
} from '../../../../shared/runtimeSessionPolicy.js';
import type { AppShellPayload } from '../../api/workspaceContracts.js';
import {
  buildWorkspaceChannelPath,
  buildWorkspaceMyCatPath,
  buildWorkspaceNewChatPath,
} from '../../channelPaths.js';
import { normalizeSelectedChannelView, type SelectedChannelView } from '../../channelEntry.js';
import {
  resolveDraftAudienceParticipantIds,
  type DraftTemporaryParticipant,
} from '../draftChatUtils.js';
import {
  submitNewParallelChatDraft,
  submitParallelCompareMessage,
} from '../composerParallelDispatch.js';
import {
  isDirectLaneSelectedForCat,
  prepareWorkspaceSendContext,
} from '../composerDispatch.js';
import {
  cancelChatChannel,
  cancelParallelChatGroup,
  createChatChannel,
  fetchAppShell,
  retryChatMessage,
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
import { resolveActiveChannelMessageMetadata } from '../composerMessageMetadata.js';
import { useComposerRequestControls } from './useComposerRequestControls.js';
import { useComposerRequestLifecycle } from './useComposerRequestLifecycle.js';
import { useComposerSubmitBindings } from './useComposerSubmitBindings.js';

type LoadStateLike =
  | { status: 'loading' }
  | { status: 'ready'; payload: AppShellPayload }
  | { status: 'error'; message: string };

export interface WorkspaceExecutionTargetValue {
  provider: string;
  model: string | null;
  instance: string | null;
  modelSelection: ProviderModelSelection | null;
}

export interface WorkspaceComposerSubmitOptions<ModelValue extends WorkspaceExecutionTargetValue> {
  state: LoadStateLike;
  setState: Dispatch<SetStateAction<LoadStateLike>>;
  navigate: NavigateFunction;
  chatPrefix: string;
  originSurface: PlatformSurfaceId;
  currentPathname: string;
  composerDraft: string;
  setComposerDraft: Dispatch<SetStateAction<string>>;
  showingNewChatDraft: boolean;
  showingMyCatDirectLane: boolean;
  draftEntryKind?: 'solo' | 'group' | 'direct';
  draftDefaultRecipientCatId: string | null;
  draftCatIds: string[];
  draftTemporaryParticipants?: DraftTemporaryParticipant[];
  draftCwd: string | null;
  draftSessionPolicy?: RuntimeSessionPolicy | null;
  draftFiles: File[];
  channelFiles: File[];
  setDraftCwd: Dispatch<SetStateAction<string | null>>;
  setDraftCatIds: Dispatch<SetStateAction<string[]>>;
  setDraftTemporaryParticipants?: Dispatch<SetStateAction<DraftTemporaryParticipant[]>>;
  setDraftHighlightedCatId: Dispatch<SetStateAction<string | null>>;
  setDraftCatExecutionTargetOverrides: Dispatch<SetStateAction<Map<string, ModelValue>>>;
  setDraftRuntimeSessionPolicy?: Dispatch<SetStateAction<RuntimeSessionPolicy>>;
  setDraftFiles: Dispatch<SetStateAction<File[]>>;
  setChannelFiles: Dispatch<SetStateAction<File[]>>;
  setDraftWorkflowShape?: Dispatch<SetStateAction<'sequential' | 'concurrent'>>;
  setDraftAudienceKeys?: Dispatch<SetStateAction<string[] | null>>;
  draftExecutionTarget: ModelValue;
  soloChannelExecutionTarget: ModelValue;
  showingParallelChatDraft?: boolean;
  draftParallelChatTargets?: ModelValue[];
  draftWorkflowShape?: 'sequential' | 'concurrent';
  draftAudienceKeys?: string[] | null;
  activeWorkflowShape?: 'sequential' | 'concurrent';
  activeAudienceKeys?: string[] | null;
  resetDraftParallelChatTargets?: () => void;
  compareGroupId?: string | null;
  compareSendScope?: 'all_members' | 'active_only';
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

export function useWorkspaceComposerSubmit<ModelValue extends WorkspaceExecutionTargetValue>(
  options: WorkspaceComposerSubmitOptions<ModelValue>,
) {
  const {
    state,
    setState,
    navigate,
    chatPrefix,
    originSurface,
    currentPathname,
    composerDraft,
    setComposerDraft,
    showingNewChatDraft,
    showingMyCatDirectLane,
    draftEntryKind = 'solo',
    draftDefaultRecipientCatId,
    draftCatIds,
    draftTemporaryParticipants = [],
    draftCwd,
    draftSessionPolicy = null,
    draftFiles,
    channelFiles,
    setDraftCwd,
    setDraftCatIds,
    setDraftTemporaryParticipants,
    setDraftHighlightedCatId,
    setDraftCatExecutionTargetOverrides,
    setDraftRuntimeSessionPolicy,
    setDraftFiles,
    setChannelFiles,
    setDraftWorkflowShape,
    setDraftAudienceKeys,
    draftExecutionTarget,
    soloChannelExecutionTarget,
    showingParallelChatDraft = false,
    draftParallelChatTargets = [],
    draftWorkflowShape = 'sequential',
    draftAudienceKeys = null,
    activeWorkflowShape = 'sequential',
    activeAudienceKeys = null,
    resetDraftParallelChatTargets,
    compareGroupId = null,
    compareSendScope = 'active_only',
    selectedChannel,
    busy,
    setBusy,
    setFeedback,
  } = options;
  const managedNavigationLocationRef = useRef<string | null>(null);
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
    const { id: submitId, controller: ackController } = beginAckRequest();
    let keepBusyAfterReturn = false;
    captureManagedComposerLocation(managedNavigationLocationRef);
    try {
      if (showingParallelChatDraft && wasDraftingNewChat) {
        setBusy(createParallelChatBusyState('ack'));
        const dispatch = await submitNewParallelChatDraft({
          body,
          payload: initialPayload,
          originSurface,
          draftCwd,
          draftFiles,
          draftParallelChatTargets,
          buildChannelPath: (createdChannelId) =>
            buildWorkspaceChannelPath(chatPrefix, createdChannelId),
          signal: ackController.signal,
        });

        rollbackPayload = dispatch.createdAppShell;
        rollbackPath = dispatch.rollbackPath;
        setComposerDraft('');
        setDraftFiles([]);
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
          setBusy(createParallelChatBusyState('dispatch'));
          keepBusyAfterReturn = true;
        } else {
          setActiveDispatchRequest(null);
        }
        setFeedback('');
        setDraftCwd(null);
        setDraftCatIds([]);
        setDraftTemporaryParticipants?.([]);
        setDraftHighlightedCatId(null);
        setDraftCatExecutionTargetOverrides(new Map());
        setDraftRuntimeSessionPolicy?.(createDefaultRuntimeSessionPolicy());
        setDraftFiles([]);
        setDraftWorkflowShape?.('sequential');
        setDraftAudienceKeys?.(null);
        resetDraftParallelChatTargets?.();
        return;
      }

      if (compareGroupId && compareSendScope === 'all_members' && !wasDraftingNewChat) {
        if (!channelId) {
          throw new Error('No parallel chat is available for sending messages.');
        }

        // Compare-container sends rely on the group dispatch ack to materialize
        // member-local optimistic messages consistently across the container.
        rollbackPath = currentPathname;
        setComposerDraft('');
        setChannelFiles([]);
        setBusy(createParallelChatBusyState('ack'));
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
          setBusy(createParallelChatBusyState('dispatch'));
          keepBusyAfterReturn = true;
        } else {
          setActiveDispatchRequest(null);
        }
        setFeedback('');
        return;
      }

      const prepareBusyScope = channelId
        ? createChannelComposerBusyScope(channelId)
        : createDraftComposerBusyScope();
      setBusy(createComposerBusyState('prepare', prepareBusyScope));
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
        draftSessionPolicy,
        originSurface,
        draftDefaultRecipientCatId,
        participantCatIds: draftCatIds,
        temporaryParticipants: draftTemporaryParticipants,
        draftEntryKind,
        draftExecutionTarget,
        selectedChannel,
        soloChannelExecutionTarget,
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
      const maxAudienceParticipants =
        state.status === 'ready'
          ? state.payload.chat.capabilities.maxAudienceParticipants
          : undefined;
      const draftMessageMetadata = wasDraftingNewChat
        && draftEntryKind === 'group'
        && !showingParallelChatDraft
        ? (() => {
            const recipientParticipantIds = resolveDraftAudienceParticipantIds({
              draftParticipantCatIds: draftCatIds,
              draftTemporaryParticipants,
              draftAudienceKeys,
              maxAudienceParticipants,
            });
            return recipientParticipantIds.length > 0
              ? {
                  recipientParticipantIds,
                  workflowShape: draftWorkflowShape,
                }
              : null;
          })()
        : null;
      const activeChannelMessageMetadata = !wasDraftingNewChat
        ? resolveActiveChannelMessageMetadata({
            selectedChannel,
            maxAudienceParticipants,
            audienceKeys: activeAudienceKeys,
            workflowShape: activeWorkflowShape,
          })
        : null;
      const messageMetadata = draftMessageMetadata ?? activeChannelMessageMetadata;

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
        ...(messageMetadata ? { messageMetadata } : {}),
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
          setDraftTemporaryParticipants,
          setDraftHighlightedCatId,
          setDraftCatExecutionTargetOverrides,
          setDraftRuntimeSessionPolicy,
          setDraftFiles,
          setChannelFiles,
          setDraftWorkflowShape,
          setDraftAudienceKeys,
        });
      } else if (wasDraftingNewChat) {
        resetComposerDraftState({
          setDraftCwd,
          setDraftCatIds,
          setDraftTemporaryParticipants,
          setDraftHighlightedCatId,
          setDraftCatExecutionTargetOverrides,
          setDraftRuntimeSessionPolicy,
          setDraftFiles,
          setDraftWorkflowShape,
          setDraftAudienceKeys,
        });
        resetDraftParallelChatTargets?.();
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
    draftTemporaryParticipants,
    draftCwd,
    draftSessionPolicy?.permissionMode,
    draftSessionPolicy?.workspaceAccess,
    draftSessionPolicy?.workspaceKind,
    draftFiles,
    draftEntryKind,
    draftDefaultRecipientCatId,
    originSurface,
    draftExecutionTarget.instance,
    draftExecutionTarget.modelSelection,
    draftExecutionTarget.model,
    draftExecutionTarget.provider,
    navigate,
    selectedChannel,
    setActiveDispatchRequest,
    setBusy,
    setChannelFiles,
    setComposerDraft,
    setDraftCatIds,
    setDraftTemporaryParticipants,
    setDraftHighlightedCatId,
    setDraftCatExecutionTargetOverrides,
    setDraftRuntimeSessionPolicy,
    setDraftCwd,
    setDraftFiles,
    setDraftAudienceKeys,
    setDraftWorkflowShape,
    setFeedback,
    setState,
    draftAudienceKeys,
    draftParallelChatTargets,
    draftWorkflowShape,
    activeAudienceKeys,
    activeWorkflowShape,
    compareGroupId,
    compareSendScope,
    showingParallelChatDraft,
    showingMyCatDirectLane,
    showingNewChatDraft,
    soloChannelExecutionTarget.instance,
    soloChannelExecutionTarget.modelSelection,
    soloChannelExecutionTarget.model,
    soloChannelExecutionTarget.provider,
    resetDraftParallelChatTargets,
    state,
  ]);

  const { onSendMessage, onComposerKeyDown } =
    useComposerSubmitBindings(submitComposerMessage);

  const onRetryMessage = useCallback(async (messageId: string): Promise<void> => {
    if (state.status !== 'ready' || !selectedChannel || !messageId.trim()) {
      return;
    }

    const channelId = selectedChannel.id;
    setFeedback('');
    const { id: submitId, controller: ackController } = beginAckRequest();
    let keepBusyAfterReturn = false;

    try {
      setBusy(createComposerBusyState('ack', createChannelComposerBusyScope(channelId)));
      const dispatch = await retryChatMessage(
        channelId,
        messageId,
        ackController.signal,
      );
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
      setFeedback('');
    } catch (error) {
      clearAckRequestIfCurrent(submitId);
      if (activeDispatchRequestRef.current?.id === submitId) {
        setActiveDispatchRequest(null);
      }
      if (isAbortError(error)) {
        setFeedback('');
      } else {
        setFeedback(error instanceof Error ? error.message : 'Failed to retry response.');
      }
    } finally {
      if (!keepBusyAfterReturn) {
        clearAckRequestIfCurrent(submitId);
        clearDispatchRequestIfCurrent(submitId);
        setBusy(clearBusyState());
      }
    }
  }, [
    activeDispatchRequestRef,
    beginAckRequest,
    clearAckRequestIfCurrent,
    clearDispatchRequestIfCurrent,
    selectedChannel,
    setActiveDispatchRequest,
    setBusy,
    setFeedback,
    setState,
    state,
  ]);

  return {
    onComposerKeyDown,
    onCancelPendingSend,
    onSendMessage,
    onStopMessage,
    onRetryMessage,
    submitComposerMessage,
  };
}

export function createUseComposerSubmit<ModelValue extends WorkspaceExecutionTargetValue>(
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

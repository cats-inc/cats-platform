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
import {
  clearBusyState,
  createChannelComposerBusyScope,
  createComposerBusyState,
  createDraftComposerBusyScope,
  createParallelChatBusyState,
  type WorkspaceBusyState,
} from '../../../../shared/workspaceBusy.js';
import type { PlatformSurfaceId } from '../../../../shared/platform-contract.js';
import type { AppShellPayload } from '../../api/contracts';
import {
  normalizeSelectedChannelView,
} from '../../shared/channelEntry';
import { isSoloThreadChannel } from '../../shared/channelTopology.js';
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
  retryChatMessage,
  sendChatMessage,
  updateSelectedChannel,
  uploadChannelAttachments,
} from '../api';
import { captureCompanionReferenceSnapshots } from '../api/companion.js';
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
  resolveDraftAudienceParticipantIds,
  type DraftTemporaryParticipant,
  type SelectedChannelView,
} from '../chatUtils';
import {
  resolveActiveChannelMessageMetadata,
} from '../composerMessageMetadata.js';
import {
  resolveDraftRouteContext,
  resolveDraftRoutePath,
} from '../draftParticipants';
import { resolveCrossSurfaceParallelGroupHandoffId } from '../crossSurfaceDispatchUtils.js';
import type { ExecutionTargetValue } from '../../../shared/renderer/components/ExecutionTarget.js';
import {
  reconcileRuntimeBackedExecutionTargetValue,
  sameExecutionTargetValue,
} from '../../../shared/renderer/hooks/useWorkspaceExecutionTargetState.js';
import { useComposerSubmitBindings } from '../../../shared/renderer/hooks/useComposerSubmitBindings.js';
import type { DraftParallelTargetBranchFields } from '../../../shared/renderer/draftParallelTargets.js';
import {
  buildCrossSurfaceChannelPath,
  prefetchCrossSurfaceNavigationTarget,
  resolveCrossSurfaceNavigationRouteTarget,
} from '../../../shared/renderer/crossSurfaceNavigationRegistry.js';
import {
  clearCrossSurfaceNavigationHandoff,
  stageCrossSurfaceNavigationHandoff,
} from '../../../shared/renderer/crossSurfaceNavigationHandoff.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { messageKeys } from '../../../../shared/i18n/index.js';

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

function logDispatchExecutionTargetResolveWarning(
  target: ExecutionTargetValue,
  error: unknown,
): void {
  if (typeof console === 'undefined' || typeof console.warn !== 'function') {
    return;
  }

  console.warn(
    `[cats-platform] failed to reconcile dispatch execution target for ${target.provider}:${target.model ?? 'default'}`,
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
}

export async function resolveDispatchExecutionTargetValue(
  target: ExecutionTargetValue,
  reconcileExecutionTargetFn: typeof reconcileRuntimeBackedExecutionTargetValue =
    reconcileRuntimeBackedExecutionTargetValue,
): Promise<ExecutionTargetValue> {
  try {
    return await reconcileExecutionTargetFn({ target });
  } catch (error) {
    if (reconcileExecutionTargetFn === reconcileRuntimeBackedExecutionTargetValue) {
      logDispatchExecutionTargetResolveWarning(target, error);
    }
    return target;
  }
}

export function resolveCrossSurfaceDraftDispatchState(input: {
  showingNewChatDraft: boolean;
  draftSurface: PlatformSurfaceId;
}): {
  targetSurface: PlatformSurfaceId;
  isCrossSurfaceDraftDispatch: boolean;
} {
  const targetSurface = input.showingNewChatDraft ? input.draftSurface : 'chat';
  return {
    targetSurface,
    isCrossSurfaceDraftDispatch: input.showingNewChatDraft && targetSurface !== 'chat',
  };
}

export function stageCrossSurfaceDraftNavigationHandoff(input: {
  kind: 'draft-create-channel' | 'draft-create-parallel-group';
  sourceSurface: PlatformSurfaceId;
  targetSurface: PlatformSurfaceId;
  entityId: string;
  entityKind: 'channel' | 'parallel-group';
  activeChannelId?: string | null;
  snapshotPayload: AppShellPayload;
  pendingExecution: boolean;
}): void {
  if (input.targetSurface === 'chat' || !input.entityId.trim()) {
    return;
  }

  stageCrossSurfaceNavigationHandoff({
    kind: input.kind,
    sourceSurface: input.sourceSurface,
    targetSurface: input.targetSurface,
    destination: {
      entityKind: input.entityKind,
      entityId: input.entityId,
      route: resolveCrossSurfaceNavigationRouteTarget({
        surface: input.targetSurface,
        entityKind: input.entityKind,
        entityId: input.entityId,
        activeChannelId: input.activeChannelId,
      }),
    },
    createdAt: new Date().toISOString(),
    snapshot: {
      appShellPayload: input.snapshotPayload,
    },
    optimisticState: {
      pendingExecution: input.pendingExecution,
      selectedChannelId: input.snapshotPayload.chat.selectedChannelId,
    },
  });
}

export function useComposerSubmit(options: {
  state: LoadStateLike;
  setState: Dispatch<SetStateAction<LoadStateLike>>;
  navigate: NavigateFunction;
  currentPath: string;
  draftSurface: PlatformSurfaceId;
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
  setDraftCatExecutionTargetOverrides: Dispatch<SetStateAction<Map<string, ExecutionTargetValue>>>;
  setDraftFiles: Dispatch<SetStateAction<File[]>>;
  setChannelFiles: Dispatch<SetStateAction<File[]>>;
  setDraftWorkflowShape: Dispatch<SetStateAction<'sequential' | 'concurrent'>>;
  setDraftAudienceKeys: Dispatch<SetStateAction<string[] | null>>;
  draftExecutionTarget: ExecutionTargetValue;
  setDraftExecutionTarget: Dispatch<SetStateAction<ExecutionTargetValue>>;
  soloChannelExecutionTarget: ExecutionTargetValue;
  setSoloChannelExecutionTarget: Dispatch<SetStateAction<ExecutionTargetValue>>;
  showingParallelChatDraft: boolean;
  draftParallelChatTargets: Array<ExecutionTargetValue & DraftParallelTargetBranchFields>;
  draftWorkflowShape: 'sequential' | 'concurrent';
  draftAudienceKeys: string[] | null;
  activeWorkflowShape: 'sequential' | 'concurrent';
  activeAudienceKeys: string[] | null;
  resetDraftParallelChatTargets: () => void;
  compareGroupId: string | null;
  compareSendScope: 'all_members' | 'active_only';
  selectedChannel: SelectedChannelView | null;
  busy: WorkspaceBusyState;
  setBusy: Dispatch<SetStateAction<WorkspaceBusyState>>;
  setFeedback: Dispatch<SetStateAction<string>>;
}) {
  const {
    state,
    setState,
    navigate,
    currentPath,
    draftSurface,
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
    setDraftCatExecutionTargetOverrides,
    setDraftFiles,
    setChannelFiles,
    setDraftWorkflowShape,
    setDraftAudienceKeys,
    draftExecutionTarget,
    setDraftExecutionTarget,
    soloChannelExecutionTarget,
    setSoloChannelExecutionTarget,
    showingParallelChatDraft,
    draftParallelChatTargets,
    draftWorkflowShape,
    draftAudienceKeys,
    activeWorkflowShape,
    activeAudienceKeys,
    resetDraftParallelChatTargets,
    compareGroupId,
    compareSendScope,
    selectedChannel,
    busy,
    setBusy,
    setFeedback,
  } = options;
  const { t } = useI18n();
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
    const hasDraftAttachments = draftFiles.length > 0;
    const hasChannelAttachments = channelFiles.length > 0;
    if (!body && !hasDraftAttachments && !hasChannelAttachments) {
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
    const {
      targetSurface,
      isCrossSurfaceDraftDispatch,
    } = resolveCrossSurfaceDraftDispatchState({
      showingNewChatDraft: wasDraftingNewChat,
      draftSurface,
    });
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
      : currentPath;
    let successNavigationPath = rollbackPath;
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
    const updateDraftExecutionTargetIfChanged = (nextExecutionTarget: ExecutionTargetValue): void => {
      setDraftExecutionTarget((currentDraftExecutionTarget) =>
        sameExecutionTargetValue(currentDraftExecutionTarget, nextExecutionTarget)
          && (currentDraftExecutionTarget.executionLabel ?? null)
            === (nextExecutionTarget.executionLabel ?? null)
          ? currentDraftExecutionTarget
          : nextExecutionTarget);
    };
    const updateSoloChannelExecutionTargetIfChanged = (
      nextExecutionTarget: ExecutionTargetValue,
    ): void => {
      setSoloChannelExecutionTarget((currentSoloChannelExecutionTarget) =>
        sameExecutionTargetValue(currentSoloChannelExecutionTarget, nextExecutionTarget)
          && (currentSoloChannelExecutionTarget.executionLabel ?? null)
            === (nextExecutionTarget.executionLabel ?? null)
          ? currentSoloChannelExecutionTarget
          : nextExecutionTarget);
    };
    const buildTargetChannelPath = (nextChannelId: string): string =>
      buildCrossSurfaceChannelPath(targetSurface, nextChannelId);
    const clearStagedTargetHandoff = (nextPath: string): void => {
      clearCrossSurfaceNavigationHandoff({
        surface: targetSurface,
        path: nextPath,
      });
    };

    setFeedback('');
    const { id: submitId, controller: ackController } = beginAckRequest();
    let keepBusyAfterReturn = false;
    captureManagedComposerLocation(managedNavigationLocationRef);
    try {
      if (isCrossSurfaceDraftDispatch) {
        void prefetchCrossSurfaceNavigationTarget(targetSurface);
      }

      if (showingParallelChatDraft && wasDraftingNewChat) {
        setBusy(createParallelChatBusyState('ack'));
        const dispatch = await submitNewParallelChatDraft({
          body,
          payload: initialPayload,
          originSurface: targetSurface,
          draftCwd,
          draftSessionPolicy: null,
          draftFiles,
          draftWorkflowShape,
          draftAudienceKeys,
          draftParallelChatTargets,
          draftParticipantCatIds,
          draftTemporaryParticipants,
          buildChannelPath: buildTargetChannelPath,
          t,
          signal: ackController.signal,
        });

        rollbackPayload = dispatch.createdAppShell;
        successNavigationPath = dispatch.rollbackPath;
        setComposerDraft('');
        if (!isCrossSurfaceDraftDispatch) {
          navigateWithinManagedFlow(successNavigationPath);
        }
        setState({ status: 'ready', payload: dispatch.createdAppShell });
        restoreFiles = () => {
          setChannelFiles(originalDraftFiles);
        };
        clearAckRequestIfCurrent(submitId);
        rollbackPayload = dispatch.dispatchAppShell;
        setState({ status: 'ready', payload: dispatch.dispatchAppShell });
        const parallelGroupId = resolveCrossSurfaceParallelGroupHandoffId({
          dispatchRequest: dispatch.dispatchRequest,
          createdGroups: dispatch.createdAppShell.chat.parallelChatGroups,
          dispatchGroups: dispatch.dispatchAppShell.chat.parallelChatGroups,
          fallbackChannelId:
            dispatch.dispatchRequest?.channelId
            ?? dispatch.dispatchAppShell.chat.selectedChannelId,
        });
        stageCrossSurfaceDraftNavigationHandoff({
          kind: 'draft-create-parallel-group',
          sourceSurface: 'chat',
          targetSurface,
          entityId: parallelGroupId,
          entityKind: 'parallel-group',
          activeChannelId: dispatch.dispatchRequest?.channelId ?? dispatch.dispatchAppShell.chat.selectedChannelId,
          snapshotPayload: dispatch.dispatchAppShell,
          pendingExecution: dispatch.dispatchRequest != null,
        });
        if (isCrossSurfaceDraftDispatch && !navigateWithinManagedFlow(successNavigationPath)) {
          clearStagedTargetHandoff(successNavigationPath);
        }
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

        resetComposerDraftState({
          setDraftCwd,
          setDraftCatIds,
          setDraftTemporaryParticipants,
          setDraftHighlightedCatId,
          setDraftCatExecutionTargetOverrides,
          setDraftFiles,
          resetDraftParallelChatTargets,
          setDraftWorkflowShape,
          setDraftAudienceKeys,
        });
        return;
      }

      if (compareGroupId && compareSendScope === 'all_members' && !wasDraftingNewChat) {
        if (!channelId) {
          throw new Error(t(messageKeys.chatComposerErrorNoParallelChatForSending));
        }

        rollbackPath = currentPath;
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

      setBusy(createComposerBusyState(
        'prepare',
        channelId
          ? createChannelComposerBusyScope(channelId)
          : createDraftComposerBusyScope(),
      ));

      let effectiveDraftExecutionTarget = draftExecutionTarget;
      let effectiveSoloChannelExecutionTarget = soloChannelExecutionTarget;
      if (wasDraftingNewChat || (isCatScopedLaneRoute && !hydratedDirectLane)) {
        effectiveDraftExecutionTarget = await resolveDispatchExecutionTargetValue(
          draftExecutionTarget,
        );
        updateDraftExecutionTargetIfChanged(effectiveDraftExecutionTarget);
      } else if (
        initialSelectedChannel?.id === channelId
        && isSoloThreadChannel(initialSelectedChannel)
      ) {
        effectiveSoloChannelExecutionTarget = await resolveDispatchExecutionTargetValue(
          soloChannelExecutionTarget,
        );
        updateSoloChannelExecutionTargetIfChanged(effectiveSoloChannelExecutionTarget);
      }

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
        originSurface: targetSurface,
        draftDefaultRecipientCatId,
        participantCatIds: draftParticipantCatIds,
        temporaryParticipants: draftTemporaryParticipants,
        draftEntryKind,
        draftExecutionTarget: effectiveDraftExecutionTarget,
        selectedChannel,
        soloChannelExecutionTarget: effectiveSoloChannelExecutionTarget,
        draftFiles,
        channelFiles,
        createChatChannel,
        insertCreatedChannelIntoPayload,
        setState,
        navigate: isCrossSurfaceDraftDispatch ? () => {} : navigate,
        setChannelFiles,
        originalDraftFiles,
        originalChannelFiles,
        buildChannelPath: buildTargetChannelPath,
        updateSelectedChannel,
        uploadChannelAttachments,
        t,
        signal: ackController.signal,
      });
      payload = preparedSendContext.payload;
      rollbackPayload = preparedSendContext.rollbackPayload;
      channelId = preparedSendContext.channelId;
      successNavigationPath = preparedSendContext.rollbackPath;
      restoreFiles = preparedSendContext.restoreFiles;
      const { messageBody, soloDispatchTarget } = preparedSendContext;
      const draftAudienceParticipantIds = wasDraftingNewChat
        && draftEntryKind === 'group'
        && !showingParallelChatDraft
        ? resolveDraftAudienceParticipantIds({
            draftParticipantCatIds,
            draftTemporaryParticipants,
            draftAudienceKeys,
            maxAudienceParticipants:
              state.status === 'ready'
                ? state.payload.chat.capabilities.maxAudienceParticipants
                : undefined,
          })
        : [];
      const draftMessageMetadata = draftAudienceParticipantIds.length > 0
        ? {
            recipientParticipantIds: draftAudienceParticipantIds,
            workflowShape: draftWorkflowShape,
          }
        : null;
      const activeChannelMessageMetadata = !wasDraftingNewChat
        ? resolveActiveChannelMessageMetadata({
            selectedChannel,
            maxAudienceParticipants:
              state.status === 'ready'
                ? state.payload.chat.capabilities.maxAudienceParticipants
                : undefined,
            audienceKeys: activeAudienceKeys,
            workflowShape: activeWorkflowShape,
          })
        : null;
      const baseMessageMetadata = draftMessageMetadata ?? activeChannelMessageMetadata;
      // PLAN-077 Phase 5 send-time snapshot capture: resolve every
      // `cats://companion/v1/...` reference in the body and persist the
      // available previews on the outgoing message. The transcript
      // hydrator (next slice) feeds these snapshots into the resolver's
      // fallback slot when the live preview is missing / deleted /
      // inaccessible, so old messages keep showing meaningful titles.
      const companionReferenceSnapshots = await captureCompanionReferenceSnapshots(
        messageBody,
        { signal: ackController.signal },
      );
      const messageMetadata =
        companionReferenceSnapshots.length > 0
          ? {
              ...(baseMessageMetadata ?? {}),
              companionReferenceSnapshots,
            }
          : baseMessageMetadata;

      if (soloDispatchTarget) {
        payload = applyPendingExecutionTargetPreview(payload, channelId, soloDispatchTarget);
      }
      setState({ status: 'ready', payload });
      setComposerDraft('');
      setDraftFiles([]);
      setChannelFiles([]);
      if (!isCrossSurfaceDraftDispatch) {
        navigateWithinManagedFlow(successNavigationPath);
      }
      setBusy(createComposerBusyState('ack', createChannelComposerBusyScope(channelId)));

      const dispatch = await sendChatMessage(channelId, {
        body: messageBody,
        senderName: payload.ownerDisplayName,
        ...(soloDispatchTarget ?? {}),
        ...(messageMetadata
          ? {
              messageMetadata,
            }
          : {}),
      }, ackController.signal);
      clearAckRequestIfCurrent(submitId);
      rollbackPayload = dispatch.appShell;
      setState({ status: 'ready', payload: dispatch.appShell });
      stageCrossSurfaceDraftNavigationHandoff({
        kind: 'draft-create-channel',
        sourceSurface: 'chat',
        targetSurface,
        entityId: channelId,
        entityKind: 'channel',
        snapshotPayload: dispatch.appShell,
        pendingExecution: isChannelDispatchRunning(dispatch.appShell, channelId),
      });
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
      if (!navigateWithinManagedFlow(successNavigationPath) && isCrossSurfaceDraftDispatch) {
        clearStagedTargetHandoff(successNavigationPath);
      }

      if (isCatScopedLaneRoute) {
        resetComposerDraftState({
          setDraftCwd,
          setDraftCatIds,
          setDraftTemporaryParticipants,
          setDraftHighlightedCatId,
          setDraftCatExecutionTargetOverrides,
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
          setDraftFiles,
          setDraftWorkflowShape,
          setDraftAudienceKeys,
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
        setFeedback(error instanceof Error ? error.message : t(messageKeys.chatComposerErrorSendFailed));
      }
      navigateWithinManagedFlow(rollbackPath);
    } finally {
      if (!keepBusyAfterReturn) {
        clearAckRequestIfCurrent(submitId);
        clearDispatchRequestIfCurrent(submitId);
      }
      if (!keepBusyAfterReturn) {
        setBusy(clearBusyState());
      }
      clearManagedComposerLocation(managedNavigationLocationRef);
    }
  }, [
    channelFiles,
    composerDraft,
    currentPath,
    draftParticipantCatIds,
    draftTemporaryParticipants,
    draftCwd,
    draftFiles,
    draftEntryKind,
    draftDefaultRecipientCatId,
    draftSurface,
    draftExecutionTarget.instance,
    draftExecutionTarget.modelSelection,
    draftExecutionTarget.model,
    draftExecutionTarget.provider,
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
    setDraftCatExecutionTargetOverrides,
    setDraftCwd,
    setDraftFiles,
    setDraftAudienceKeys,
    setDraftWorkflowShape,
    setFeedback,
    setState,
    draftAudienceKeys,
    draftWorkflowShape,
    activeAudienceKeys,
    activeWorkflowShape,
    showingMyCatDirectLane,
    showingNewChatDraft,
    soloChannelExecutionTarget.instance,
    soloChannelExecutionTarget.modelSelection,
    soloChannelExecutionTarget.model,
    soloChannelExecutionTarget.provider,
    state,
    t,
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

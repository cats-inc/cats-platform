import {
  useCallback,
  type Dispatch,
  type FormEvent,
  type KeyboardEvent,
  type SetStateAction,
} from 'react';
import type { NavigateFunction } from 'react-router-dom';

import { shouldSubmitComposerOnKeyDown } from '../../../../shared/composer.js';
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
  sendChatMessage,
  updateSelectedChannel,
  uploadChannelAttachments,
} from '../api/index.js';
import {
  applyOptimisticPendingExecutionTarget,
  appendOptimisticUserMessage,
  insertCreatedChannelIntoPayload,
} from '../workspaceChatUtils.js';

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
  setBusy: Dispatch<SetStateAction<string>>;
  setFeedback: Dispatch<SetStateAction<string>>;
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

    setBusy('message:prepare');
    setFeedback('');
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
        setDraftCatModelOverrides(new Map<string, ModelValue>());
        setDraftFiles([]);
        setChannelFiles([]);
      } else if (wasDraftingNewChat) {
        setDraftCwd(null);
        setDraftCatIds([]);
        setDraftHighlightedCatId(null);
        setDraftCatModelOverrides(new Map<string, ModelValue>());
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
    chatPrefix,
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

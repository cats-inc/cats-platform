import type { ProviderModelSelection } from '../../../shared/providerSelection.js';
import {
  buildAttachedFilesMessageBody,
  buildNewChatChannelInput,
} from './workspaceChatUtils.js';

export interface ComposerModelValue {
  provider: string;
  model: string | null;
  instance: string | null;
  modelSelection: ProviderModelSelection | null;
}

export interface ComposerSelectedChannelLike {
  id: string;
  channelKind?: string | null;
  composerMode?: string | null;
  roomRouting?: {
    defaultRecipientId?: string | null;
  };
  repoPath?: string | null;
  chatCwd?: string | null;
}

export interface ComposerPayloadLike<
  TSelectedChannel extends ComposerSelectedChannelLike = ComposerSelectedChannelLike,
> {
  chat: {
    selectedChannel: TSelectedChannel | null;
  };
}

export interface PendingExecutionTargetInput {
  pendingProvider: string;
  pendingModel: string | null;
  pendingInstance: string | null;
  pendingModelSelection: ProviderModelSelection | null;
}

export interface ComposerTemporaryParticipantLike {
  participantId: string;
  name: string;
  provider: string;
  instance?: string | null;
  model?: string | null;
  modelSelection?: ProviderModelSelection | null;
  roleHint?: string | null;
}

export interface ComposerCreatedChannelLike {
  id: string;
}

export interface PrepareComposerChannelDispatchResult<TPayload> {
  payload: TPayload;
  rollbackPayload: TPayload;
  channelId: string;
  rollbackPath: string;
  restoreFiles: () => void;
}

export interface PrepareWorkspaceSendContextResult<TPayload>
  extends PrepareComposerChannelDispatchResult<TPayload> {
  messageBody: string;
  soloDispatchTarget: PendingExecutionTargetInput | null;
}

export function isDirectLaneSelectedForCat<
  TSelectedChannel extends ComposerSelectedChannelLike,
>(
  channel: TSelectedChannel | null,
  catId: string | null,
): channel is TSelectedChannel {
  if (!channel || !catId) {
    return false;
  }

  return channel.channelKind === 'direct_lane'
    && channel.roomRouting?.defaultRecipientId === catId;
}

export function buildSoloDispatchTarget<
  ModelValue extends ComposerModelValue,
  TSelectedChannel extends Pick<ComposerSelectedChannelLike, 'id' | 'composerMode'>,
>(options: {
  wasDraftingNewChat: boolean;
  isCatScopedLaneRoute: boolean;
  channelId: string;
  selectedChannel: TSelectedChannel | null;
  soloChannelExecutionTarget: ModelValue;
}): PendingExecutionTargetInput | null {
  const {
    wasDraftingNewChat,
    isCatScopedLaneRoute,
    channelId,
    selectedChannel,
    soloChannelExecutionTarget,
  } = options;

  if (
    wasDraftingNewChat
    || isCatScopedLaneRoute
    || selectedChannel?.id !== channelId
    || selectedChannel.composerMode !== 'solo'
  ) {
    return null;
  }

  return {
    pendingProvider: soloChannelExecutionTarget.provider,
    pendingModel: soloChannelExecutionTarget.model,
    pendingInstance: soloChannelExecutionTarget.instance,
    pendingModelSelection: soloChannelExecutionTarget.modelSelection,
  };
}

export function resolveComposerFilesToUpload(options: {
  isCatScopedLaneRoute: boolean;
  hydratedDirectLane: ComposerSelectedChannelLike | null;
  wasDraftingNewChat: boolean;
  draftFiles: File[];
  channelFiles: File[];
}): File[] {
  const {
    isCatScopedLaneRoute,
    hydratedDirectLane,
    wasDraftingNewChat,
    draftFiles,
    channelFiles,
  } = options;

  return isCatScopedLaneRoute && !hydratedDirectLane
    ? draftFiles
    : hydratedDirectLane
      ? channelFiles
      : wasDraftingNewChat
        ? draftFiles
        : channelFiles;
}

export async function prepareComposerMessageBody<
  TPayload extends ComposerPayloadLike<TSelectedChannel>,
  TSelectedChannel extends ComposerSelectedChannelLike,
>(options: {
  payload: TPayload;
  channelId: string;
  body: string;
  filesToUpload: File[];
  updateSelectedChannel: (
    channelId: string,
    signal?: AbortSignal,
  ) => Promise<TPayload>;
  uploadChannelAttachments: (
    channelId: string,
    files: File[],
    signal?: AbortSignal,
  ) => Promise<Array<{ relativePath: string }>>;
  signal?: AbortSignal;
}): Promise<{ payload: TPayload; messageBody: string }> {
  const {
    channelId,
    body,
    filesToUpload,
    updateSelectedChannel,
    uploadChannelAttachments,
    signal,
  } = options;
  let { payload } = options;
  let messageBody = body;

  if (filesToUpload.length === 0) {
    return { payload, messageBody };
  }

  const selectedForFiles =
    payload.chat.selectedChannel?.id === channelId
      ? payload.chat.selectedChannel
      : null;
  if (!selectedForFiles?.repoPath && !selectedForFiles?.chatCwd) {
    payload = await updateSelectedChannel(channelId, signal);
  }

  const attachments = await uploadChannelAttachments(channelId, filesToUpload, signal);
  messageBody = buildAttachedFilesMessageBody(body, attachments);
  return { payload, messageBody };
}

export async function prepareComposerChannelDispatch<
  TPayload,
  TCreatedChannel extends ComposerCreatedChannelLike,
>(options: {
  initialPayload: TPayload;
  wasDraftingNewChat: boolean;
  isCatScopedLaneRoute: boolean;
  hydratedDirectLane: ComposerSelectedChannelLike | null;
  currentChannelId: string;
  currentRollbackPath: string;
  body: string;
  existingCount: number;
  draftCwd: string | null;
  draftDefaultRecipientCatId: string | null;
  participantCatIds: string[];
  temporaryParticipants?: ComposerTemporaryParticipantLike[];
  draftEntryKind?: 'solo' | 'group' | 'direct';
  draftExecutionTarget?: ComposerModelValue;
  createChatChannel: (
    input: ReturnType<typeof buildNewChatChannelInput>,
    signal?: AbortSignal,
  ) => Promise<TCreatedChannel>;
  insertCreatedChannelIntoPayload: (
    payload: TPayload,
    createdChannel: TCreatedChannel,
  ) => TPayload;
  setState: (state: { status: 'ready'; payload: TPayload }) => void;
  navigate: (path: string, options: { replace: boolean }) => void;
  setChannelFiles: (files: File[]) => void;
  originalDraftFiles: File[];
  originalChannelFiles: File[];
  buildChannelPath: (channelId: string) => string;
  signal?: AbortSignal;
}): Promise<PrepareComposerChannelDispatchResult<TPayload>> {
  const {
    initialPayload,
    wasDraftingNewChat,
    isCatScopedLaneRoute,
    hydratedDirectLane,
    currentChannelId,
    currentRollbackPath,
    body,
    existingCount,
    draftCwd,
    draftDefaultRecipientCatId,
    participantCatIds,
    temporaryParticipants = [],
    draftEntryKind,
    draftExecutionTarget,
    createChatChannel,
    insertCreatedChannelIntoPayload,
    setState,
    navigate,
    setChannelFiles,
    originalDraftFiles,
    originalChannelFiles,
    buildChannelPath,
    signal,
  } = options;

  let payload = initialPayload;
  let rollbackPayload = initialPayload;
  let channelId = currentChannelId;
  let rollbackPath = currentRollbackPath;
  let restoreFiles = (): void => {
    if (wasDraftingNewChat || (isCatScopedLaneRoute && !hydratedDirectLane)) {
      setChannelFiles(originalDraftFiles);
    } else {
      setChannelFiles(originalChannelFiles);
    }
  };

  if (isCatScopedLaneRoute) {
    if (!hydratedDirectLane) {
      const createdChannel = await createChatChannel(buildNewChatChannelInput({
        body,
        existingCount,
        entryKind: 'direct',
        repoPath: draftCwd,
        defaultRecipientCatId: draftDefaultRecipientCatId,
        participantCatIds,
        temporaryParticipants: temporaryParticipants.map((participant) => ({
          participantId: participant.participantId,
          name: participant.name,
          provider: participant.provider,
          instance: participant.instance ?? undefined,
          model: participant.model ?? undefined,
          modelSelection: participant.modelSelection ?? null,
          roleHint: participant.roleHint ?? undefined,
        })),
      }), signal);
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
      existingCount,
      entryKind: draftEntryKind,
      repoPath: draftCwd,
      defaultRecipientCatId: draftDefaultRecipientCatId,
      participantCatIds,
      temporaryParticipants: temporaryParticipants.map((participant) => ({
        participantId: participant.participantId,
        name: participant.name,
        provider: participant.provider,
        instance: participant.instance ?? undefined,
        model: participant.model ?? undefined,
        modelSelection: participant.modelSelection ?? null,
        roleHint: participant.roleHint ?? undefined,
      })),
      draftExecutionTarget,
    }), signal);
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

  return {
    payload,
    rollbackPayload,
    channelId,
    rollbackPath,
    restoreFiles,
  };
}

export async function prepareWorkspaceSendContext<
  TPayload extends ComposerPayloadLike,
  THydratedChannel extends ComposerSelectedChannelLike,
  ModelValue extends ComposerModelValue,
  TCreatedChannel extends ComposerCreatedChannelLike,
>(options: {
  initialPayload: TPayload;
  wasDraftingNewChat: boolean;
  isCatScopedLaneRoute: boolean;
  hydratedDirectLane: THydratedChannel | null;
  currentChannelId: string;
  currentRollbackPath: string;
  body: string;
  existingCount: number;
  draftCwd: string | null;
  draftDefaultRecipientCatId: string | null;
  participantCatIds: string[];
  temporaryParticipants?: ComposerTemporaryParticipantLike[];
  draftEntryKind?: 'solo' | 'group' | 'direct';
  draftExecutionTarget?: ModelValue;
  selectedChannel: Pick<ComposerSelectedChannelLike, 'id' | 'composerMode'> | null;
  soloChannelExecutionTarget: ModelValue;
  draftFiles: File[];
  channelFiles: File[];
  createChatChannel: (
    input: ReturnType<typeof buildNewChatChannelInput>,
    signal?: AbortSignal,
  ) => Promise<TCreatedChannel>;
  insertCreatedChannelIntoPayload: (
    payload: TPayload,
    createdChannel: TCreatedChannel,
  ) => TPayload;
  setState: (state: { status: 'ready'; payload: TPayload }) => void;
  navigate: (path: string, options: { replace: boolean }) => void;
  setChannelFiles: (files: File[]) => void;
  originalDraftFiles: File[];
  originalChannelFiles: File[];
  buildChannelPath: (channelId: string) => string;
  updateSelectedChannel: (
    channelId: string,
    signal?: AbortSignal,
  ) => Promise<TPayload>;
  uploadChannelAttachments: (
    channelId: string,
    files: File[],
    signal?: AbortSignal,
  ) => Promise<Array<{ relativePath: string }>>;
  signal?: AbortSignal;
}): Promise<PrepareWorkspaceSendContextResult<TPayload>> {
  const {
    initialPayload,
    wasDraftingNewChat,
    isCatScopedLaneRoute,
    hydratedDirectLane,
    currentChannelId,
    currentRollbackPath,
    body,
    existingCount,
    draftCwd,
    draftDefaultRecipientCatId,
    participantCatIds,
    temporaryParticipants,
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
    buildChannelPath,
    updateSelectedChannel,
    uploadChannelAttachments,
    signal,
  } = options;

  let payload = initialPayload;
  const preparedChannel = await prepareComposerChannelDispatch({
    initialPayload,
    wasDraftingNewChat,
    isCatScopedLaneRoute,
    hydratedDirectLane,
    currentChannelId,
    currentRollbackPath,
    body,
    existingCount,
    draftCwd,
    draftDefaultRecipientCatId,
    participantCatIds,
    temporaryParticipants,
    draftEntryKind,
    draftExecutionTarget,
    createChatChannel,
    insertCreatedChannelIntoPayload,
    setState,
    navigate,
    setChannelFiles,
    originalDraftFiles,
    originalChannelFiles,
    buildChannelPath,
    signal,
  });
  payload = preparedChannel.payload;

  const soloDispatchTarget = buildSoloDispatchTarget({
    wasDraftingNewChat,
    isCatScopedLaneRoute,
    channelId: preparedChannel.channelId,
    selectedChannel,
    soloChannelExecutionTarget,
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
    channelId: preparedChannel.channelId,
    body,
    filesToUpload,
    updateSelectedChannel,
    uploadChannelAttachments,
    signal,
  });
  payload = preparedMessage.payload;
  if (preparedMessage.payload !== preparedChannel.payload) {
    setState({ status: 'ready', payload });
  }

  return {
    ...preparedChannel,
    payload,
    rollbackPayload:
      preparedMessage.payload !== preparedChannel.payload
        ? payload
        : preparedChannel.rollbackPayload,
    messageBody: preparedMessage.messageBody,
    soloDispatchTarget,
  };
}

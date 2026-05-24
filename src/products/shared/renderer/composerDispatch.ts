import type { ProviderModelSelection } from '../../../shared/providerSelection.js';
import type {
  AssistantResponseLanguage,
  PlatformSurfaceId,
} from '../../../shared/platform-contract.js';
import type { RoomRoutingMode } from '../../../shared/roomRouting.js';
import type { RuntimeSessionPolicy } from '../../../shared/runtimeSessionPolicy.js';
import { isDefaultChatChannel } from '../../chat/shared/channelTopology.js';
import {
  buildAttachedFilesMessageBody,
  buildNewChatChannelInput,
  type WorkspaceChatTranslator,
} from './workspaceChatUtils.js';
import {
  createTranslator,
  messageKeys,
} from '../../../shared/i18n/index.js';
import { resolveProductProviderId } from '../../../shared/providerCatalog.js';

const defaultComposerDispatchTranslator = createTranslator('en');

function normalizeComposerProvider(provider: string): string {
  return resolveProductProviderId(provider) ?? provider.trim();
}

export interface ComposerModelValue {
  provider: string;
  model: string | null;
  instance: string | null;
  modelSelection: ProviderModelSelection | null;
}

export interface ComposerSelectedChannelLike {
  id: string;
  channelKind?: 'chat_channel' | 'direct_message' | null;
  pendingProvider?: string | null;
  roomRouting?: {
    mode?: RoomRoutingMode | null;
    defaultRecipientId?: string | null;
  };
  assignedParticipants?: ReadonlyArray<{ participantId: string; status: string }> | null;
  assignedCats?: ReadonlyArray<{ catId: string; status: string }> | null;
  participantAssignments?: ReadonlyArray<{ participantId: string; status: string }> | null;
  catAssignments?: ReadonlyArray<{ catId: string; status: string }> | null;
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
  defaultDispatchTarget: PendingExecutionTargetInput | null;
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

  return channel.channelKind === 'direct_message'
    && channel.roomRouting?.defaultRecipientId === catId;
}

export function buildDefaultChatDispatchTarget<
  ModelValue extends ComposerModelValue,
  TSelectedChannel extends ComposerSelectedChannelLike,
>(options: {
  wasDraftingNewChat: boolean;
  isCatScopedLaneRoute: boolean;
  channelId: string;
  selectedChannel: TSelectedChannel | null;
  defaultChannelExecutionTarget: ModelValue;
}): PendingExecutionTargetInput | null {
  const {
    wasDraftingNewChat,
    isCatScopedLaneRoute,
    channelId,
    selectedChannel,
    defaultChannelExecutionTarget,
  } = options;

  if (
    wasDraftingNewChat
    || isCatScopedLaneRoute
    || selectedChannel?.id !== channelId
    || !isDefaultChatChannel(selectedChannel)
  ) {
    return null;
  }

  return {
    pendingProvider: normalizeComposerProvider(defaultChannelExecutionTarget.provider),
    pendingModel: defaultChannelExecutionTarget.model,
    pendingInstance: defaultChannelExecutionTarget.instance,
    pendingModelSelection: defaultChannelExecutionTarget.modelSelection,
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
  draftSessionPolicy?: RuntimeSessionPolicy | null;
  originSurface: PlatformSurfaceId;
  draftDefaultRecipientCatId: string | null;
  participantCatIds: string[];
  temporaryParticipants?: ComposerTemporaryParticipantLike[];
  draftEntryKind?: 'default' | 'group' | 'direct';
  draftExecutionTarget?: ComposerModelValue;
  assistantResponseLanguage?: AssistantResponseLanguage;
  t?: WorkspaceChatTranslator;
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
    draftSessionPolicy,
    originSurface,
    draftDefaultRecipientCatId,
    participantCatIds,
    temporaryParticipants = [],
    draftEntryKind,
    draftExecutionTarget,
    assistantResponseLanguage,
    t = defaultComposerDispatchTranslator,
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
        originSurface,
        entryKind: 'direct',
        repoPath: draftCwd,
        draftSessionPolicy,
        t,
        defaultRecipientCatId: draftDefaultRecipientCatId,
        participantCatIds,
        assistantResponseLanguage,
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
        throw new Error(t(messageKeys.chatComposerErrorNoChatForSending));
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
      originSurface,
      entryKind: draftEntryKind,
      repoPath: draftCwd,
      draftSessionPolicy,
      t,
      defaultRecipientCatId: draftDefaultRecipientCatId,
      participantCatIds,
      assistantResponseLanguage,
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
      throw new Error(t(messageKeys.chatComposerErrorNoChatForSending));
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
      throw new Error(t(messageKeys.chatComposerErrorNoChatForSending));
    }
    restoreFiles = () => {
      setChannelFiles(originalChannelFiles);
    };
  }

  if (!channelId) {
    throw new Error(t(messageKeys.chatComposerErrorNoChatForSending));
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
  draftSessionPolicy?: RuntimeSessionPolicy | null;
  originSurface: PlatformSurfaceId;
  draftDefaultRecipientCatId: string | null;
  participantCatIds: string[];
  temporaryParticipants?: ComposerTemporaryParticipantLike[];
  draftEntryKind?: 'default' | 'group' | 'direct';
  draftExecutionTarget?: ModelValue;
  assistantResponseLanguage?: AssistantResponseLanguage;
  t?: WorkspaceChatTranslator;
  selectedChannel: ComposerSelectedChannelLike | null;
  defaultChannelExecutionTarget: ModelValue;
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
    draftSessionPolicy,
    originSurface,
    draftDefaultRecipientCatId,
    participantCatIds,
    temporaryParticipants,
    draftEntryKind,
    draftExecutionTarget,
    assistantResponseLanguage,
    t,
    selectedChannel,
    defaultChannelExecutionTarget,
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
    draftSessionPolicy,
    originSurface,
    draftDefaultRecipientCatId,
    participantCatIds,
    temporaryParticipants,
    draftEntryKind,
    draftExecutionTarget,
    assistantResponseLanguage,
    t,
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

  const defaultDispatchTarget = buildDefaultChatDispatchTarget({
    wasDraftingNewChat,
    isCatScopedLaneRoute,
    channelId: preparedChannel.channelId,
    selectedChannel,
    defaultChannelExecutionTarget,
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
    defaultDispatchTarget,
  };
}

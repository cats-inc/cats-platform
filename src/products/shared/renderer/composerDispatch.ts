import type { ProviderModelSelection } from '../../../shared/providerSelection.js';
import { buildAttachedFilesMessageBody } from './workspaceChatUtils.js';

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
  soloChannelModel: ModelValue;
}): PendingExecutionTargetInput | null {
  const {
    wasDraftingNewChat,
    isCatScopedLaneRoute,
    channelId,
    selectedChannel,
    soloChannelModel,
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
    pendingProvider: soloChannelModel.provider,
    pendingModel: soloChannelModel.model,
    pendingInstance: soloChannelModel.instance,
    pendingModelSelection: soloChannelModel.modelSelection,
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

import type {
  ActivateChannelResponse,
  AppShellPayload,
  AssignChannelCatInput,
  CancelChannelResponse,
  CancelParallelChatGroupInput,
  CancelParallelChatGroupResponse,
  ChatChannelView,
  ParallelChatDispatchResponse,
  CreateParallelChatGroupInput,
  CreateParallelChatGroupResponse,
  CreateChatChannelInput,
  RelayParallelChatMessageInput,
  CreateCatInput,
  SendParallelChatMessageInput,
  SendChannelMessageInput,
  SendChannelMessageResponse,
  UpdateChannelParticipantInput,
  UpdateParallelChatGroupInput,
} from '../../api/contracts';

import {
  activateChatChannel as activateWorkspaceChatChannel,
  assignCatToChannelApi as assignWorkspaceCatToChannelApi,
  cancelChatChannel as cancelWorkspaceChatChannel,
  cancelParallelChatGroup as cancelWorkspaceParallelChatGroup,
  createChatChannel as createWorkspaceChatChannel,
  createGlobalCat as createWorkspaceGlobalCat,
  deleteChatChannel as deleteWorkspaceChatChannel,
  deleteGlobalCat as deleteWorkspaceGlobalCat,
  encodeAttachmentFiles as encodeWorkspaceAttachmentFiles,
  relayParallelChatMessage as relayWorkspaceParallelChatMessage,
  removeCatFromChannelApi as removeWorkspaceCatFromChannelApi,
  renameChatChannel as renameWorkspaceChatChannel,
  retryChatMessage as retryWorkspaceChatMessage,
  sendChatMessage as sendWorkspaceChatMessage,
  updateCatProfile as updateWorkspaceCatProfile,
  updateChannelParticipantApi as updateWorkspaceChannelParticipantApi,
  uploadChannelAttachments as uploadWorkspaceChannelAttachments,
  type DeleteChatChannelResult,
} from '../../../shared/renderer/api/chat.js';
import { refetchAfterMutation } from './appShell.js';
import { expectJson } from './http.js';

const PARALLEL_CHAT_GROUPS_API_BASE = '/api/parallel-chat-groups';

export async function deleteGlobalCat(
  catId: string,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  return deleteWorkspaceGlobalCat(catId, signal) as Promise<AppShellPayload>;
}

export async function createChatChannel(
  input: CreateChatChannelInput,
  signal?: AbortSignal,
): Promise<ChatChannelView> {
  return createWorkspaceChatChannel(input, signal) as Promise<ChatChannelView>;
}

export async function renameChatChannel(
  channelId: string,
  title: string,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  return renameWorkspaceChatChannel(channelId, title, signal) as Promise<AppShellPayload>;
}

export async function deleteChatChannel(
  channelId: string,
  signal?: AbortSignal,
): Promise<DeleteChatChannelResult<AppShellPayload>> {
  return deleteWorkspaceChatChannel(channelId, signal) as Promise<DeleteChatChannelResult<AppShellPayload>>;
}

export async function createGlobalCat(
  input: CreateCatInput,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  return createWorkspaceGlobalCat(input, signal) as Promise<AppShellPayload>;
}

export async function assignCatToChannelApi(
  channelId: string,
  input: AssignChannelCatInput,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  return assignWorkspaceCatToChannelApi(channelId, input, signal) as Promise<AppShellPayload>;
}

export async function removeCatFromChannelApi(
  channelId: string,
  catId: string,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  return removeWorkspaceCatFromChannelApi(channelId, catId, signal) as Promise<AppShellPayload>;
}

export async function updateChannelParticipantApi(
  channelId: string,
  participantId: string,
  input: UpdateChannelParticipantInput,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  return updateWorkspaceChannelParticipantApi(channelId, participantId, input, signal) as Promise<AppShellPayload>;
}

export async function activateChatChannel(
  channelId: string,
  signal?: AbortSignal,
): Promise<ActivateChannelResponse> {
  return activateWorkspaceChatChannel(channelId, signal) as Promise<ActivateChannelResponse>;
}

export async function uploadChannelAttachments(
  channelId: string,
  files: File[],
  signal?: AbortSignal,
): Promise<Array<{ name: string; relativePath: string }>> {
  return uploadWorkspaceChannelAttachments(channelId, files, signal);
}

export async function encodeAttachmentFiles(
  files: File[],
): Promise<NonNullable<SendParallelChatMessageInput['attachments']>> {
  return encodeWorkspaceAttachmentFiles(files);
}

export async function sendChatMessage(
  channelId: string,
  input: SendChannelMessageInput,
  signal?: AbortSignal,
): Promise<SendChannelMessageResponse> {
  return sendWorkspaceChatMessage(channelId, input, signal) as Promise<SendChannelMessageResponse>;
}

export async function retryChatMessage(
  channelId: string,
  messageId: string,
  signal?: AbortSignal,
): Promise<SendChannelMessageResponse> {
  return retryWorkspaceChatMessage(channelId, messageId, signal) as Promise<SendChannelMessageResponse>;
}

export async function cancelChatChannel(
  channelId: string,
  signal?: AbortSignal,
): Promise<CancelChannelResponse> {
  return cancelWorkspaceChatChannel(channelId, signal) as Promise<CancelChannelResponse>;
}

export async function createParallelChatGroup(
  input: CreateParallelChatGroupInput,
  signal?: AbortSignal,
): Promise<CreateParallelChatGroupResponse> {
  const response = await fetch(PARALLEL_CHAT_GROUPS_API_BASE, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
    signal,
  });

  return expectJson<CreateParallelChatGroupResponse>(
    response,
    `parallel chat creation returned ${response.status}`,
  );
}

export async function sendParallelChatMessage(
  groupId: string,
  input: SendParallelChatMessageInput,
  signal?: AbortSignal,
): Promise<ParallelChatDispatchResponse> {
  const response = await fetch(
    `${PARALLEL_CHAT_GROUPS_API_BASE}/${encodeURIComponent(groupId)}/messages`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(input),
      signal,
    },
  );

  return expectJson<ParallelChatDispatchResponse>(
    response,
    `parallel chat dispatch returned ${response.status}`,
  );
}

export async function relayParallelChatMessage(
  groupId: string,
  input: RelayParallelChatMessageInput,
  signal?: AbortSignal,
): Promise<ParallelChatDispatchResponse> {
  return relayWorkspaceParallelChatMessage(
    groupId,
    input,
    signal,
  ) as Promise<ParallelChatDispatchResponse>;
}

export async function cancelParallelChatGroup(
  groupId: string,
  input: CancelParallelChatGroupInput,
  signal?: AbortSignal,
): Promise<CancelParallelChatGroupResponse> {
  return cancelWorkspaceParallelChatGroup(
    groupId,
    input,
    signal,
  ) as Promise<CancelParallelChatGroupResponse>;
}

export async function renameParallelChatGroup(
  groupId: string,
  input: UpdateParallelChatGroupInput,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const response = await fetch(
    `${PARALLEL_CHAT_GROUPS_API_BASE}/${encodeURIComponent(groupId)}`,
    {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(input),
      signal,
    },
  );

  return refetchAfterMutation(
    response,
    `parallel chat rename returned ${response.status}`,
    signal,
  );
}

export async function ungroupParallelChatGroup(
  groupId: string,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const response = await fetch(
    `${PARALLEL_CHAT_GROUPS_API_BASE}/${encodeURIComponent(groupId)}/ungroup`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
      signal,
    },
  );

  return refetchAfterMutation(
    response,
    `parallel chat ungroup returned ${response.status}`,
    signal,
  );
}

export async function deleteParallelChatGroup(
  groupId: string,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const response = await fetch(
    `${PARALLEL_CHAT_GROUPS_API_BASE}/${encodeURIComponent(groupId)}`,
    {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
      },
      signal,
    },
  );

  return refetchAfterMutation(
    response,
    `parallel chat deletion returned ${response.status}`,
    signal,
  );
}

export async function updateCatProfile(
  catId: string,
  input: {
    skillProfile?: string | null;
    name?: string;
    makeBoss?: boolean;
    products?: string[];
    archive?: boolean;
    unarchive?: boolean;
    provider?: string;
    instance?: string | null;
    model?: string | null;
    modelSelection?: import('../../../../shared/providerSelection.js').ProviderModelSelection | null;
    avatarUrl?: string | null;
  },
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  return updateWorkspaceCatProfile(catId, input, signal) as Promise<AppShellPayload>;
}

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
  createChatChannel as createWorkspaceChatChannel,
  createGlobalCat as createWorkspaceGlobalCat,
  deleteChatChannel as deleteWorkspaceChatChannel,
  deleteGlobalCat as deleteWorkspaceGlobalCat,
  removeCatFromChannelApi as removeWorkspaceCatFromChannelApi,
  renameChatChannel as renameWorkspaceChatChannel,
  sendChatMessage as sendWorkspaceChatMessage,
  updateCatProfile as updateWorkspaceCatProfile,
  uploadChannelAttachments as uploadWorkspaceChannelAttachments,
} from '../../../shared/renderer/api/chat.js';
import { refetchAfterMutation } from './appShell.js';
import { expectJson } from './http.js';

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
): Promise<AppShellPayload> {
  return deleteWorkspaceChatChannel(channelId, signal) as Promise<AppShellPayload>;
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
  const response = await fetch(
    `/api/channels/${encodeURIComponent(channelId)}/participants/${encodeURIComponent(participantId)}`,
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
    `cats channel participant update returned ${response.status}`,
    signal,
  );
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
  return Promise.all(
    files.map(async (file) => {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let index = 0; index < bytes.length; index++) {
        binary += String.fromCharCode(bytes[index]);
      }
      return { name: file.name, data: btoa(binary) };
    }),
  );
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
  const response = await fetch(
    `/api/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/retry`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
      signal,
    },
  );

  return expectJson<SendChannelMessageResponse>(
    response,
    `channel message retry returned ${response.status}`,
  );
}

export async function cancelChatChannel(
  channelId: string,
  signal?: AbortSignal,
): Promise<CancelChannelResponse> {
  const response = await fetch(`/api/channels/${channelId}/cancel`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  return expectJson<CancelChannelResponse>(
    response,
    `cats channel cancel returned ${response.status}`,
  );
}

export async function createParallelChatGroup(
  input: CreateParallelChatGroupInput,
  signal?: AbortSignal,
): Promise<CreateParallelChatGroupResponse> {
  const response = await fetch('/api/concurrent-groups', {
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
  const response = await fetch(`/api/concurrent-groups/${encodeURIComponent(groupId)}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
    signal,
  });

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
  const response = await fetch(`/api/concurrent-groups/${encodeURIComponent(groupId)}/relay`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
    signal,
  });

  return expectJson<ParallelChatDispatchResponse>(
    response,
    `parallel chat relay returned ${response.status}`,
  );
}

export async function cancelParallelChatGroup(
  groupId: string,
  input: CancelParallelChatGroupInput,
  signal?: AbortSignal,
): Promise<CancelParallelChatGroupResponse> {
  const response = await fetch(`/api/concurrent-groups/${encodeURIComponent(groupId)}/cancel`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
    signal,
  });

  return expectJson<CancelParallelChatGroupResponse>(
    response,
    `parallel chat cancel returned ${response.status}`,
  );
}

export async function renameParallelChatGroup(
  groupId: string,
  input: UpdateParallelChatGroupInput,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const response = await fetch(`/api/concurrent-groups/${encodeURIComponent(groupId)}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
    signal,
  });

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
  const response = await fetch(`/api/concurrent-groups/${encodeURIComponent(groupId)}/ungroup`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

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
  const response = await fetch(`/api/concurrent-groups/${encodeURIComponent(groupId)}`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

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

import type {
  ActivateChannelResponse,
  AppShellPayload,
  AssignChannelCatInput,
  CancelChannelResponse,
  CancelParallelChatGroupInput,
  CancelParallelChatGroupResponse,
  ChannelMessageMetadata,
  ChatChannelView,
  CreateChatChannelInput,
  CreateCatInput,
  CreateTemporaryParticipantInput,
  RelayParallelChatMessageInput,
  SendChannelMessageInput,
  SendChannelMessageResponse,
  UpdateChannelParticipantInput,
} from '../../api/workspaceContracts.js';
import type { PlatformSurfaceId } from '../../../../shared/platform-contract.js';

import { fetchAppShell, refetchAfterMutation } from './appShell.js';
import { expectJson } from './http.js';
import { normalizeSelectedChannelView } from '../../channelEntry.js';

const PARALLEL_CHAT_GROUPS_API_BASE = '/api/parallel-chat-groups';

function encodeBytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const binaryChunks: string[] = [];
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binaryChunks.push(String.fromCharCode(...chunk));
  }
  return btoa(binaryChunks.join(''));
}

export async function deleteGlobalCat(
  catId: string,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const response = await fetch(`/api/cats/${encodeURIComponent(catId)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
    signal,
  });

  return refetchAfterMutation(
    response,
    `cats cat deletion returned ${response.status}`,
    signal,
  );
}

export async function createChatChannel(
  input: CreateChatChannelInput,
  signal?: AbortSignal,
): Promise<ChatChannelView> {
  const response = await fetch('/api/channels', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
    signal,
  });

  const { channel } = await expectJson<{ channel: ChatChannelView }>(
    response,
    `cats chat creation returned ${response.status}`,
  );
  const normalized = normalizeSelectedChannelView(channel);
  if (!normalized) {
    throw new Error('Created channel payload was invalid.');
  }
  return normalized;
}

export async function renameChatChannel(
  channelId: string,
  title: string,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const response = await fetch(`/api/channels/${channelId}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ title }),
    signal,
  });

  return refetchAfterMutation(
    response,
    `cats chat rename returned ${response.status}`,
    signal,
  );
}

export async function deleteChatChannel(
  channelId: string,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const response = await fetch(`/api/channels/${channelId}`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  return refetchAfterMutation(
    response,
    `cats chat deletion returned ${response.status}`,
    signal,
  );
}

export async function createGlobalCat(
  input: CreateCatInput,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const response = await fetch('/api/cats', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
    signal,
  });

  return refetchAfterMutation(
    response,
    `cats chat cat creation returned ${response.status}`,
    signal,
  );
}

export async function assignCatToChannelApi(
  channelId: string,
  input: AssignChannelCatInput,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const { catId, ...assignmentBody } = input;
  const response = await fetch(`/api/channels/${channelId}/cats/${catId}`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(assignmentBody),
    signal,
  });

  return refetchAfterMutation(
    response,
    `cats channel cat assignment returned ${response.status}`,
    signal,
  );
}

export async function removeCatFromChannelApi(
  channelId: string,
  catId: string,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const response = await fetch(`/api/channels/${channelId}/cats/${catId}`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  return refetchAfterMutation(
    response,
    `cats channel cat removal returned ${response.status}`,
    signal,
  );
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
  const response = await fetch(`/api/channels/${channelId}/activations`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  const { activation } = await expectJson<{
    activation: { channelId: string; startedAt: string; results: ActivateChannelResponse['results'] };
  }>(response, `cats channel activation returned ${response.status}`);

  let appShell: AppShellPayload;
  try {
    appShell = await fetchAppShell(signal);
  } catch {
    appShell = await fetchAppShell();
  }
  return { appShell, results: activation.results };
}

export async function uploadChannelAttachments(
  channelId: string,
  files: File[],
  signal?: AbortSignal,
): Promise<Array<{ name: string; relativePath: string }>> {
  const encoded = await Promise.all(
    files.map(async (file) => {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      return { name: file.name, data: encodeBytesToBase64(bytes) };
    }),
  );

  const response = await fetch(`/api/channels/${channelId}/attachments`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ files: encoded }),
    signal,
  });

  const result = await expectJson<{
    attachments: Array<{ name: string; relativePath: string }>;
  }>(response, `attachment upload returned ${response.status}`);

  return result.attachments;
}

export interface ParallelChatTargetInput {
  provider: string;
  instance: string | null;
  model: string | null;
  modelSelection?: import('../../../../shared/providerSelection.js').ProviderModelSelection | null;
}

export interface CreateParallelChatGroupInput {
  title: string;
  originSurface: PlatformSurfaceId;
  repoPath?: string;
  responseLanguage?: string;
  targets: Array<ParallelChatTargetInput & {
    audienceKeys?: string[];
  }>;
  participantCatIds?: string[];
  temporaryParticipants?: CreateTemporaryParticipantInput[];
}

export interface ParallelChatGroupMemberSummary extends ParallelChatTargetInput {
  channelId: string;
  title: string;
  index: number;
  lastMessageAt: string | null;
}

export interface ParallelChatGroupSummary {
  id: string;
  title: string;
  mode: 'parallel';
  status: 'active' | 'archived';
  memberCount: number;
  memberChannelIds: string[];
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  members: ParallelChatGroupMemberSummary[];
}

export interface CreateParallelChatGroupResponse {
  appShell: AppShellPayload;
  group: ParallelChatGroupSummary;
}

export interface SendParallelChatMessageInput {
  activeChannelId: string;
  body: string;
  attachments?: Array<{ name: string; data: string }>;
  channelInputs?: Array<{
    channelId: string;
    body?: string;
    messageMetadata?: ChannelMessageMetadata;
  }>;
}

export interface ParallelChatDispatchResponse {
  appShell: AppShellPayload;
  groupId: string;
  phase: 'acknowledged' | 'completed';
  results: Array<{
    channelId: string;
    status: 'sent' | 'error' | 'skipped';
    sourceMessageId?: string;
    error?: string;
  }>;
}

export async function encodeAttachmentFiles(
  files: File[],
): Promise<NonNullable<SendParallelChatMessageInput['attachments']>> {
  return Promise.all(
    files.map(async (file) => {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      return { name: file.name, data: encodeBytesToBase64(bytes) };
    }),
  );
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
  const response = await fetch(
    `${PARALLEL_CHAT_GROUPS_API_BASE}/${encodeURIComponent(groupId)}/relay`,
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
    `parallel chat relay returned ${response.status}`,
  );
}

export async function cancelParallelChatGroup(
  groupId: string,
  input: CancelParallelChatGroupInput,
  signal?: AbortSignal,
): Promise<CancelParallelChatGroupResponse> {
  const response = await fetch(
    `${PARALLEL_CHAT_GROUPS_API_BASE}/${encodeURIComponent(groupId)}/cancel`,
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

  return expectJson<CancelParallelChatGroupResponse>(
    response,
    `parallel chat cancel returned ${response.status}`,
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

export async function sendChatMessage(
  channelId: string,
  input: SendChannelMessageInput,
  signal?: AbortSignal,
): Promise<SendChannelMessageResponse> {
  const response = await fetch(`/api/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
    signal,
  });

  const { appShell, message, phase, results, dispatch } = await expectJson<{
    appShell: AppShellPayload;
    message: SendChannelMessageResponse['message'];
    phase: SendChannelMessageResponse['phase'];
    results?: SendChannelMessageResponse['results'];
    dispatch?: { channelId: string; results: SendChannelMessageResponse['results'] };
  }>(response, `cats channel messaging returned ${response.status}`);
  return {
    appShell,
    message,
    phase,
    results: results ?? dispatch?.results ?? [],
  };
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
  const response = await fetch(`/api/cats/${encodeURIComponent(catId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
    signal,
  });

  return refetchAfterMutation(response, `cat profile update returned ${response.status}`, signal);
}

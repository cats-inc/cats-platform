import type {
  ActivateChannelResponse,
  AppShellPayload,
  AssignChannelCatInput,
  CancelChannelResponse,
  CancelConcurrentChatGroupInput,
  CancelConcurrentChatGroupResponse,
  ChatChannelView,
  ConcurrentChatDispatchResponse,
  CreateConcurrentChatGroupInput,
  CreateConcurrentChatGroupResponse,
  CreateChatChannelInput,
  RelayConcurrentChatMessageInput,
  CreateCatInput,
  SendConcurrentChatMessageInput,
  SendChannelMessageInput,
  SendChannelMessageResponse,
  UpdateConcurrentChatGroupInput,
} from '../../api/contracts';

import { fetchAppShell, refetchAfterMutation } from './appShell.js';
import { expectJson } from './http.js';
import { normalizeSelectedChannelView } from '../../shared/channelEntry.js';

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
  const encoded = await encodeAttachmentFiles(
    files,
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

export async function encodeAttachmentFiles(
  files: File[],
): Promise<NonNullable<SendConcurrentChatMessageInput['attachments']>> {
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
  const response = await fetch(`/api/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
    signal,
  });

  const { appShell, message, phase, dispatch } = await expectJson<{
    appShell: AppShellPayload;
    message: SendChannelMessageResponse['message'];
    phase: SendChannelMessageResponse['phase'];
    dispatch: { channelId: string; results: SendChannelMessageResponse['results'] };
  }>(response, `cats channel messaging returned ${response.status}`);
  return {
    appShell,
    message,
    phase,
    results: dispatch.results,
  };
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

export async function createConcurrentChatGroup(
  input: CreateConcurrentChatGroupInput,
  signal?: AbortSignal,
): Promise<CreateConcurrentChatGroupResponse> {
  const response = await fetch('/api/concurrent-groups', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
    signal,
  });

  return expectJson<CreateConcurrentChatGroupResponse>(
    response,
    `parallel chat creation returned ${response.status}`,
  );
}

export async function sendConcurrentChatMessage(
  groupId: string,
  input: SendConcurrentChatMessageInput,
  signal?: AbortSignal,
): Promise<ConcurrentChatDispatchResponse> {
  const response = await fetch(`/api/concurrent-groups/${encodeURIComponent(groupId)}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
    signal,
  });

  return expectJson<ConcurrentChatDispatchResponse>(
    response,
    `parallel chat dispatch returned ${response.status}`,
  );
}

export async function relayConcurrentChatMessage(
  groupId: string,
  input: RelayConcurrentChatMessageInput,
  signal?: AbortSignal,
): Promise<ConcurrentChatDispatchResponse> {
  const response = await fetch(`/api/concurrent-groups/${encodeURIComponent(groupId)}/relay`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
    signal,
  });

  return expectJson<ConcurrentChatDispatchResponse>(
    response,
    `parallel chat relay returned ${response.status}`,
  );
}

export async function cancelConcurrentChatGroup(
  groupId: string,
  input: CancelConcurrentChatGroupInput,
  signal?: AbortSignal,
): Promise<CancelConcurrentChatGroupResponse> {
  const response = await fetch(`/api/concurrent-groups/${encodeURIComponent(groupId)}/cancel`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
    signal,
  });

  return expectJson<CancelConcurrentChatGroupResponse>(
    response,
    `parallel chat cancel returned ${response.status}`,
  );
}

export async function renameConcurrentChatGroup(
  groupId: string,
  input: UpdateConcurrentChatGroupInput,
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

export async function ungroupConcurrentChatGroup(
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

export async function deleteConcurrentChatGroup(
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
  const response = await fetch(`/api/cats/${encodeURIComponent(catId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
    signal,
  });

  return refetchAfterMutation(response, `cat profile update returned ${response.status}`, signal);
}

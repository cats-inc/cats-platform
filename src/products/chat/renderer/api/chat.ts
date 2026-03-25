import type {
  ActivateChannelResponse,
  AppShellPayload,
  AssignChannelCatInput,
  CreateChatChannelInput,
  CreateCatInput,
  SendChannelMessageInput,
  SendChannelMessageResponse,
} from '../../api/contracts';

import { fetchAppShell, refetchAfterMutation } from './appShell.js';
import { expectJson } from './http.js';

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
): Promise<AppShellPayload> {
  const response = await fetch('/api/channels', {
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
    `cats chat creation returned ${response.status}`,
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
  const encoded = await Promise.all(
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

  const { dispatch } = await expectJson<{
    message: unknown;
    dispatch: { channelId: string; results: SendChannelMessageResponse['results'] };
  }>(response, `cats channel messaging returned ${response.status}`);

  let appShell: AppShellPayload;
  try {
    appShell = await fetchAppShell(signal);
  } catch {
    appShell = await fetchAppShell();
  }
  return { appShell, results: dispatch.results };
}

export async function updateCatProfile(
  catId: string,
  input: { skillProfile?: string | null; name?: string; makeBoss?: boolean; products?: string[]; archive?: boolean },
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

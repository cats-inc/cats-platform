import type {
  ActivateChannelResponse,
  AddChannelMemberInput,
  AppShellPayload,
  CreateWorkspaceChannelInput,
  SendChannelMessageResponse,
  SendChannelMessageInput,
  UpdateGlobalOrchestratorInput,
} from '../shared/app-shell';

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? fallback;
  } catch {
    return fallback;
  }
}

async function expectJson<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, fallback));
  }

  return (await response.json()) as T;
}

export async function fetchAppShell(signal?: AbortSignal): Promise<AppShellPayload> {
  const response = await fetch('/api/app-shell', {
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  return expectJson<AppShellPayload>(response, `cats-inc app shell returned ${response.status}`);
}

export async function updateSelectedChannel(
  selectedChannelId: string,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const response = await fetch('/api/workspace/selection', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ selectedChannelId }),
    signal,
  });

  return expectJson<AppShellPayload>(
    response,
    `cats-inc workspace selection returned ${response.status}`,
  );
}

export async function createWorkspaceChannel(
  input: CreateWorkspaceChannelInput,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const response = await fetch('/api/workspace/channels', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
    signal,
  });

  return expectJson<AppShellPayload>(
    response,
    `cats-inc workspace channel creation returned ${response.status}`,
  );
}

export async function activateWorkspaceChannel(
  channelId: string,
  signal?: AbortSignal,
): Promise<ActivateChannelResponse> {
  const response = await fetch(`/api/workspace/channels/${channelId}/activate`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  return expectJson<ActivateChannelResponse>(
    response,
    `cats-inc channel activation returned ${response.status}`,
  );
}

export async function sendWorkspaceMessage(
  channelId: string,
  input: SendChannelMessageInput,
  signal?: AbortSignal,
): Promise<SendChannelMessageResponse> {
  const response = await fetch(`/api/workspace/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
    signal,
  });

  return expectJson<SendChannelMessageResponse>(
    response,
    `cats-inc channel messaging returned ${response.status}`,
  );
}

export async function addWorkspaceMember(
  channelId: string,
  input: AddChannelMemberInput,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const response = await fetch(`/api/workspace/channels/${channelId}/members`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
    signal,
  });

  return expectJson<AppShellPayload>(
    response,
    `cats-inc add member returned ${response.status}`,
  );
}

export async function removeWorkspaceMember(
  channelId: string,
  memberId: string,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const response = await fetch(`/api/workspace/channels/${channelId}/members/${memberId}`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  return expectJson<AppShellPayload>(
    response,
    `cats-inc remove member returned ${response.status}`,
  );
}

export async function updateWorkspaceOrchestrator(
  input: UpdateGlobalOrchestratorInput,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const response = await fetch('/api/orchestrator', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
    signal,
  });

  return expectJson<AppShellPayload>(
    response,
    `cats-inc orchestrator update returned ${response.status}`,
  );
}

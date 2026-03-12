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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeAppShellPayload(payload: AppShellPayload): AppShellPayload {
  const nextPayload = structuredClone(payload) as AppShellPayload & Record<string, unknown>;
  const workspace = asRecord(nextPayload.workspace);
  const globalOrchestrator = asRecord(workspace?.globalOrchestrator);

  if (globalOrchestrator && !asRecord(globalOrchestrator.executionTarget)) {
    globalOrchestrator.executionTarget = {
      provider: readString(globalOrchestrator.provider, 'claude'),
      model: readNullableString(globalOrchestrator.model),
    };
  }

  if (globalOrchestrator && !asRecord(globalOrchestrator.memory)) {
    globalOrchestrator.memory = {
      summary: null,
      facts: [],
      openLoops: [],
      updatedAt: null,
    };
  }

  const selectedChannel = asRecord(workspace?.selectedChannel);
  if (selectedChannel && !asRecord(selectedChannel.orchestratorLease)) {
    const orchestratorSession = asRecord(selectedChannel.orchestratorSession);
    const executionTarget = asRecord(globalOrchestrator?.executionTarget);
    selectedChannel.orchestratorLease = {
      sessionId: readNullableString(orchestratorSession?.sessionId),
      status: readString(orchestratorSession?.status, 'not_started'),
      cwd: readNullableString(orchestratorSession?.cwd),
      lastError: readNullableString(orchestratorSession?.lastError),
      provider: readNullableString(executionTarget?.provider) ?? 'claude',
      model: readNullableString(executionTarget?.model),
      startedAt: null,
      lastUsedAt: null,
    };
  }

  if (selectedChannel && Array.isArray(selectedChannel.members)) {
    selectedChannel.members = selectedChannel.members.map((memberValue) => {
      const member = asRecord(memberValue) ?? {};
      if (!asRecord(member.execution)) {
        member.execution = {
          target: {
            provider: readString(member.provider, 'claude'),
            model: readNullableString(member.model),
          },
          lease: {
            sessionId: readNullableString(asRecord(member.session)?.sessionId),
            status: readString(asRecord(member.session)?.status, 'not_started'),
            cwd: readNullableString(asRecord(member.session)?.cwd),
            lastError: readNullableString(asRecord(member.session)?.lastError),
            provider: readString(member.provider, 'claude'),
            model: readNullableString(member.model),
            startedAt: null,
            lastUsedAt: null,
          },
        };
      }

      if (!asRecord(member.memory)) {
        member.memory = {
          summary: null,
          facts: [],
          openLoops: [],
          updatedAt: null,
        };
      }

      if (!Array.isArray(member.roles)) {
        member.roles = readStringArray(member.roles);
      }

      return member;
    });
  }

  return nextPayload;
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

  return normalizeAppShellPayload(
    await expectJson<AppShellPayload>(response, `cats-inc app shell returned ${response.status}`),
  );
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

  return normalizeAppShellPayload(
    await expectJson<AppShellPayload>(
      response,
      `cats-inc workspace selection returned ${response.status}`,
    ),
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

  return normalizeAppShellPayload(
    await expectJson<AppShellPayload>(
      response,
      `cats-inc workspace channel creation returned ${response.status}`,
    ),
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

  const result = await expectJson<ActivateChannelResponse>(
    response,
    `cats-inc channel activation returned ${response.status}`,
  );
  return {
    ...result,
    appShell: normalizeAppShellPayload(result.appShell),
  };
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

  const result = await expectJson<SendChannelMessageResponse>(
    response,
    `cats-inc channel messaging returned ${response.status}`,
  );
  return {
    ...result,
    appShell: normalizeAppShellPayload(result.appShell),
  };
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

  return normalizeAppShellPayload(
    await expectJson<AppShellPayload>(
      response,
      `cats-inc add member returned ${response.status}`,
    ),
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

  return normalizeAppShellPayload(
    await expectJson<AppShellPayload>(
      response,
      `cats-inc remove member returned ${response.status}`,
    ),
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

  return normalizeAppShellPayload(
    await expectJson<AppShellPayload>(
      response,
      `cats-inc orchestrator update returned ${response.status}`,
    ),
  );
}

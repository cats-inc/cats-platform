import type {
  ActivateChannelResponse,
  AppShellPayload,
  AssignChannelPalInput,
  CreateWorkspaceChannelInput,
  CreateWorkspacePalInput,
  SendChannelMessageInput,
  SendChannelMessageResponse,
  UpdateGlobalOrchestratorInput,
} from '../shared/app-shell';

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as {
      error?: string | { code?: string; message?: string };
    };
    if (typeof payload.error === 'string') {
      return payload.error || fallback;
    }
    if (payload.error && typeof payload.error === 'object' && typeof payload.error.message === 'string') {
      return payload.error.message || fallback;
    }
    return fallback;
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

  if (!Array.isArray(workspace?.pals)) {
    workspace!.pals = [];
  }

  const pals = (workspace?.pals as Array<Record<string, unknown>>).map((palValue) => {
    const pal = asRecord(palValue) ?? {};
    if (!asRecord(pal.defaultExecutionTarget)) {
      pal.defaultExecutionTarget = {
        provider: readString(pal.provider, 'claude'),
        model: readNullableString(pal.model),
      };
    }
    if (!asRecord(pal.memory)) {
      pal.memory = {
        summary: null,
        facts: [],
        openLoops: [],
        updatedAt: null,
      };
    }
    if (!Array.isArray(pal.roles)) {
      pal.roles = readStringArray(pal.roles);
    }
    return pal;
  });
  const palsById = new Map(pals.map((pal) => [readString(pal.id), pal]));

  if (selectedChannel) {
    if (!Array.isArray(selectedChannel.palAssignments) && Array.isArray(selectedChannel.members)) {
      selectedChannel.palAssignments = selectedChannel.members.map((memberValue) => {
        const member = asRecord(memberValue) ?? {};
        const execution = asRecord(member.execution);
        const target = asRecord(execution?.target);
        const lease = asRecord(execution?.lease);
        return {
          palId: readString(member.id),
          status: readString(member.status, 'active'),
          roles: Array.isArray(member.roles) ? member.roles : [],
          joinedAt: readString(member.joinedAt),
          leftAt: readNullableString(member.leftAt),
          execution: {
            target: {
              provider: readString(target?.provider, readString(member.provider, 'claude')),
              model: readNullableString(target?.model ?? member.model),
            },
            lease: {
              sessionId: readNullableString(lease?.sessionId ?? asRecord(member.session)?.sessionId),
              status: readString(lease?.status ?? asRecord(member.session)?.status, 'not_started'),
              cwd: readNullableString(lease?.cwd ?? asRecord(member.session)?.cwd),
              lastError: readNullableString(lease?.lastError ?? asRecord(member.session)?.lastError),
              provider: readNullableString(lease?.provider) ?? readString(target?.provider, readString(member.provider, 'claude')),
              model: readNullableString(lease?.model ?? target?.model ?? member.model),
              startedAt: readNullableString(lease?.startedAt),
              lastUsedAt: readNullableString(lease?.lastUsedAt),
            },
          },
        };
      });
    }

    if (!Array.isArray(selectedChannel.assignedPals)) {
      if (Array.isArray(selectedChannel.members)) {
        selectedChannel.assignedPals = selectedChannel.members.map((memberValue) => {
          const member = asRecord(memberValue) ?? {};
          if (!palsById.has(readString(member.id))) {
            palsById.set(readString(member.id), {
              id: readString(member.id),
              name: readString(member.name, 'Pal'),
              roles: Array.isArray(member.roles) ? member.roles : [],
              skillProfile: readNullableString(member.skillProfile),
              mcpProfile: readNullableString(member.mcpProfile),
              status: readString(member.status, 'active') === 'removed' ? 'archived' : 'active',
              createdAt: readString(member.joinedAt),
              updatedAt: readString(member.joinedAt),
              archivedAt: readNullableString(member.leftAt),
              defaultExecutionTarget: {
                provider: readString(member.provider, 'claude'),
                model: readNullableString(member.model),
              },
              memory: asRecord(member.memory) ?? {
                summary: null,
                facts: [],
                openLoops: [],
                updatedAt: null,
              },
            });
          }
          return {
            palId: readString(member.id),
            name: readString(member.name, 'Pal'),
            roles: Array.isArray(member.roles) ? member.roles : [],
            skillProfile: readNullableString(member.skillProfile),
            mcpProfile: readNullableString(member.mcpProfile),
            status: readString(member.status, 'active'),
            joinedAt: readString(member.joinedAt),
            leftAt: readNullableString(member.leftAt),
            execution: member.execution,
            memory: asRecord(member.memory) ?? {
              summary: null,
              facts: [],
              openLoops: [],
              updatedAt: null,
            },
          };
        });
      } else if (Array.isArray(selectedChannel.palAssignments)) {
        selectedChannel.assignedPals = selectedChannel.palAssignments.map((assignmentValue) => {
          const assignment = asRecord(assignmentValue) ?? {};
          const pal = palsById.get(readString(assignment.palId)) ?? {};
          return {
            palId: readString(assignment.palId),
            name: readString(pal.name, 'Pal'),
            roles: Array.isArray(assignment.roles) ? assignment.roles : readStringArray(pal.roles),
            skillProfile: readNullableString(pal.skillProfile),
            mcpProfile: readNullableString(pal.mcpProfile),
            status: readString(assignment.status, 'active'),
            joinedAt: readString(assignment.joinedAt),
            leftAt: readNullableString(assignment.leftAt),
            execution: assignment.execution,
            memory: asRecord(pal.memory) ?? {
              summary: null,
              facts: [],
              openLoops: [],
              updatedAt: null,
            },
          };
        });
      }
    }
  }

  workspace!.pals = Array.from(palsById.values());

  if (Array.isArray(workspace?.channels)) {
    workspace.channels = workspace.channels.map((channelValue) => {
      const channel = asRecord(channelValue) ?? {};
      if (channel.palCount === undefined) {
        channel.palCount = channel.memberCount ?? 0;
      }
      if (channel.activePalCount === undefined) {
        channel.activePalCount = channel.activeMemberCount ?? 0;
      }
      return channel;
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

async function mutateAndRefetch(
  mutationResponse: Response,
  errorFallback: string,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  if (!mutationResponse.ok) {
    throw new Error(await readErrorMessage(mutationResponse, errorFallback));
  }
  return fetchAppShell(signal);
}

export async function updateSelectedChannel(
  selectedChannelId: string,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const response = await fetch('/api/workspaces/default/preferences', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ selectedChannelId }),
    signal,
  });

  return mutateAndRefetch(
    response,
    `cats-inc workspace selection returned ${response.status}`,
    signal,
  );
}

export async function createWorkspaceChannel(
  input: CreateWorkspaceChannelInput,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const response = await fetch('/api/workspaces/default/channels', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
    signal,
  });

  return mutateAndRefetch(
    response,
    `cats-inc workspace channel creation returned ${response.status}`,
    signal,
  );
}

export async function deleteWorkspaceChannel(
  channelId: string,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const response = await fetch(`/api/workspaces/default/channels/${channelId}`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  return mutateAndRefetch(
    response,
    `cats-inc workspace channel deletion returned ${response.status}`,
    signal,
  );
}

export async function createGlobalPal(
  input: CreateWorkspacePalInput,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const response = await fetch('/api/pals', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
    signal,
  });

  return mutateAndRefetch(
    response,
    `cats-inc workspace pal creation returned ${response.status}`,
    signal,
  );
}

export async function assignPalToWorkspaceChannel(
  channelId: string,
  input: AssignChannelPalInput,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const { palId, ...assignmentBody } = input;
  const response = await fetch(`/api/workspaces/default/channels/${channelId}/pal-assignments/${palId}`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(assignmentBody),
    signal,
  });

  return mutateAndRefetch(
    response,
    `cats-inc channel pal assignment returned ${response.status}`,
    signal,
  );
}

export async function removePalFromWorkspaceChannel(
  channelId: string,
  palId: string,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const response = await fetch(`/api/workspaces/default/channels/${channelId}/pal-assignments/${palId}`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  return mutateAndRefetch(
    response,
    `cats-inc channel pal removal returned ${response.status}`,
    signal,
  );
}

export async function activateWorkspaceChannel(
  channelId: string,
  signal?: AbortSignal,
): Promise<ActivateChannelResponse> {
  const response = await fetch(`/api/workspaces/default/channels/${channelId}/activations`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  const { activation } = await expectJson<{
    activation: { channelId: string; startedAt: string; results: ActivateChannelResponse['results'] };
  }>(response, `cats-inc channel activation returned ${response.status}`);

  const appShell = await fetchAppShell(signal);
  return { appShell, results: activation.results };
}

export async function sendWorkspaceMessage(
  channelId: string,
  input: SendChannelMessageInput,
  signal?: AbortSignal,
): Promise<SendChannelMessageResponse> {
  const response = await fetch(`/api/workspaces/default/channels/${channelId}/messages`, {
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
  }>(response, `cats-inc channel messaging returned ${response.status}`);

  const appShell = await fetchAppShell(signal);
  return { appShell, results: dispatch.results };
}

export async function updateWorkspaceOrchestrator(
  input: UpdateGlobalOrchestratorInput,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const response = await fetch('/api/workspaces/default/orchestrator', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
    signal,
  });

  return mutateAndRefetch(
    response,
    `cats-inc orchestrator update returned ${response.status}`,
    signal,
  );
}

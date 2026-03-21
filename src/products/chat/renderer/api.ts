import type {
  ActivateChannelResponse,
  AppShellPayload,
  AssignChannelPalInput,
  CreateWorkspaceChannelInput,
  CreateWorkspacePalInput,
  SendChannelMessageInput,
  SendChannelMessageResponse,
  UpdateGlobalOrchestratorInput,
} from '../../../shared/app-shell';
import type {
  ProductProviderDescriptor,
  ProviderModelCatalog,
} from '../../../shared/providerCatalog';

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
      instance: readNullableString(globalOrchestrator.instance),
      model: readNullableString(globalOrchestrator.model),
    };
  }
  const orchestratorExecutionTarget = asRecord(globalOrchestrator?.executionTarget);
  if (orchestratorExecutionTarget && orchestratorExecutionTarget.instance === undefined) {
    orchestratorExecutionTarget.instance = readNullableString(globalOrchestrator?.instance);
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
      instance: readNullableString(executionTarget?.instance),
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
        instance: readNullableString(pal.instance),
        model: readNullableString(pal.model),
      };
    }
    const defaultExecutionTarget = asRecord(pal.defaultExecutionTarget);
    if (defaultExecutionTarget && defaultExecutionTarget.instance === undefined) {
      defaultExecutionTarget.instance = readNullableString(pal.instance);
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
              instance: readNullableString(target?.instance ?? member.instance),
              model: readNullableString(target?.model ?? member.model),
            },
            lease: {
              sessionId: readNullableString(lease?.sessionId ?? asRecord(member.session)?.sessionId),
              status: readString(lease?.status ?? asRecord(member.session)?.status, 'not_started'),
              cwd: readNullableString(lease?.cwd ?? asRecord(member.session)?.cwd),
              lastError: readNullableString(lease?.lastError ?? asRecord(member.session)?.lastError),
              provider: readNullableString(lease?.provider) ?? readString(target?.provider, readString(member.provider, 'claude')),
              instance: readNullableString(lease?.instance ?? target?.instance ?? member.instance),
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
                instance: readNullableString(member.instance),
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

  if (nextPayload.setupCompleteAt === undefined) {
    (nextPayload as Record<string, unknown>).setupCompleteAt = null;
  }
  if (!nextPayload.ownerDisplayName) {
    (nextPayload as Record<string, unknown>).ownerDisplayName = 'Owner';
  }
  if (nextPayload.ownerAvatarColor === undefined) {
    (nextPayload as Record<string, unknown>).ownerAvatarColor = null;
  }
  if (workspace && workspace.bossCatId === undefined) {
    (workspace as Record<string, unknown>).bossCatId = null;
  }
  if (workspace && workspace.showVerboseMessages === undefined) {
    (workspace as Record<string, unknown>).showVerboseMessages = false;
  }

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

export async function fetchProviders(): Promise<ProductProviderDescriptor[]> {
  const response = await fetch('/api/providers');
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Failed to load providers.'));
  }

  const payload = (await response.json()) as { providers?: ProductProviderDescriptor[] };
  if (!Array.isArray(payload.providers)) {
    return [];
  }

  return payload.providers.map((provider) => ({
    id: provider.id,
    label: provider.label,
    defaultModel: provider.defaultModel ?? null,
    defaultInstance: provider.defaultInstance ?? null,
    defaultBackend: provider.defaultBackend ?? null,
    instances: Array.isArray(provider.instances)
      ? provider.instances.map((instance) => ({
          id: instance.id,
          label: instance.label,
          target: instance.target ?? null,
          backend: instance.backend ?? null,
          default: Boolean(instance.default),
        }))
      : [],
    modelsPath: provider.modelsPath,
  }));
}

export async function fetchProviderModels(
  provider: string,
  instance?: string | null,
): Promise<ProviderModelCatalog> {
  const url = new URL(`/api/providers/${encodeURIComponent(provider)}/models`, window.location.origin);
  if (instance?.trim()) {
    url.searchParams.set('instance', instance.trim());
  }

  const response = await fetch(`${url.pathname}${url.search}`);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Failed to load provider models.'));
  }

  const payload = (await response.json()) as { catalog?: ProviderModelCatalog };
  if (!payload.catalog) {
    throw new Error('Provider catalog response was incomplete.');
  }

  return payload.catalog;
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
    await expectJson<AppShellPayload>(response, `cats app shell returned ${response.status}`),
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
  // Mutation committed — retry re-fetch once without the caller's abort signal
  // so an in-flight cancellation doesn't surface as a mutation failure, which
  // could prompt the user to retry and create duplicates.
  try {
    return await fetchAppShell(signal);
  } catch {
    return fetchAppShell();
  }
}

export async function updateSelectedChannel(
  selectedChannelId: string,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const response = await fetch('/api/preferences', {
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
    `cats workspace selection returned ${response.status}`,
    signal,
  );
}

export async function updateVerbosePreference(
  show: boolean,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const response = await fetch('/api/preferences', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ showVerboseMessages: show }),
    signal,
  });

  return mutateAndRefetch(
    response,
    `cats verbose preference update returned ${response.status}`,
    signal,
  );
}

export async function deleteGlobalPal(
  catId: string,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const response = await fetch(`/api/cats/${encodeURIComponent(catId)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
    signal,
  });

  return mutateAndRefetch(
    response,
    `cats cat deletion returned ${response.status}`,
    signal,
  );
}

export async function createWorkspaceChannel(
  input: CreateWorkspaceChannelInput,
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

  return mutateAndRefetch(
    response,
    `cats workspace channel creation returned ${response.status}`,
    signal,
  );
}

export async function deleteWorkspaceChannel(
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

  return mutateAndRefetch(
    response,
    `cats workspace channel deletion returned ${response.status}`,
    signal,
  );
}

export async function createGlobalPal(
  input: CreateWorkspacePalInput,
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

  return mutateAndRefetch(
    response,
    `cats workspace pal creation returned ${response.status}`,
    signal,
  );
}

export async function assignPalToWorkspaceChannel(
  channelId: string,
  input: AssignChannelPalInput,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const { palId, ...assignmentBody } = input;
  const response = await fetch(`/api/channels/${channelId}/cats/${palId}`, {
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
    `cats channel pal assignment returned ${response.status}`,
    signal,
  );
}

export async function removePalFromWorkspaceChannel(
  channelId: string,
  palId: string,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const response = await fetch(`/api/channels/${channelId}/cats/${palId}`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  return mutateAndRefetch(
    response,
    `cats channel pal removal returned ${response.status}`,
    signal,
  );
}

export async function activateWorkspaceChannel(
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
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
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

export async function sendWorkspaceMessage(
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

export async function updateWorkspaceOrchestrator(
  input: UpdateGlobalOrchestratorInput,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const response = await fetch('/api/orchestrator', {
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
    `cats orchestrator update returned ${response.status}`,
    signal,
  );
}

export async function completeSetup(
  input: {
    ownerDisplayName: string;
    bossCatName: string;
    bossCatProvider: string;
    bossCatInstance?: string;
    bossCatModel?: string;
  },
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const response = await fetch('/api/setup/complete', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
    signal,
  });

  return normalizeAppShellPayload(
    await expectJson<AppShellPayload>(response, `setup completion returned ${response.status}`),
  );
}

export async function resetSetup(signal?: AbortSignal): Promise<AppShellPayload> {
  const response = await fetch('/api/setup/reset', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  return normalizeAppShellPayload(
    await expectJson<AppShellPayload>(response, `setup reset returned ${response.status}`),
  );
}

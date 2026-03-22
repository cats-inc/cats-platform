import type {
  ActivateChannelResponse,
  AppShellPayload,
  AssignChannelCatInput,
  CreateChatChannelInput,
  CreateCatInput,
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
  const chatState = asRecord(nextPayload.chat) ?? {};
  nextPayload.chat = chatState as AppShellPayload['chat'];
  const globalOrchestrator = asRecord(chatState.globalOrchestrator);

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

  const selectedChannel = asRecord(chatState.selectedChannel);
  if (selectedChannel && !asRecord(selectedChannel.orchestratorLease)) {
    const executionTarget = asRecord(globalOrchestrator?.executionTarget);
    selectedChannel.orchestratorLease = {
      sessionId: null,
      status: 'not_started',
      cwd: null,
      lastError: null,
      provider: readNullableString(executionTarget?.provider) ?? 'claude',
      instance: readNullableString(executionTarget?.instance),
      model: readNullableString(executionTarget?.model),
      startedAt: null,
      lastUsedAt: null,
    };
  }

  if (!Array.isArray(chatState.cats)) {
    chatState.cats = [];
  }

  const cats = (chatState.cats as Array<Record<string, unknown>>).map((catValue) => {
    const cat = asRecord(catValue) ?? {};
    if (!asRecord(cat.defaultExecutionTarget)) {
      cat.defaultExecutionTarget = {
        provider: readString(cat.provider, 'claude'),
        instance: readNullableString(cat.instance),
        model: readNullableString(cat.model),
      };
    }
    const defaultExecutionTarget = asRecord(cat.defaultExecutionTarget);
    if (defaultExecutionTarget && defaultExecutionTarget.instance === undefined) {
      defaultExecutionTarget.instance = readNullableString(cat.instance);
    }
    if (!asRecord(cat.memory)) {
      cat.memory = {
        summary: null,
        facts: [],
        openLoops: [],
        updatedAt: null,
      };
    }
    if (!Array.isArray(cat.roles)) {
      cat.roles = readStringArray(cat.roles);
    }
    return cat;
  });
  const catsById = new Map(cats.map((cat) => [readString(cat.id), cat]));

  if (selectedChannel) {
    if (!Array.isArray(selectedChannel.catAssignments)) {
      selectedChannel.catAssignments = [];
    }

    if (!Array.isArray(selectedChannel.assignedCats)) {
      if (Array.isArray(selectedChannel.catAssignments)) {
        selectedChannel.assignedCats = selectedChannel.catAssignments.map((assignmentValue) => {
          const assignment = asRecord(assignmentValue) ?? {};
          const cat = catsById.get(readString(assignment.catId)) ?? {};
          return {
            catId: readString(assignment.catId),
            name: readString(cat.name, 'Cat'),
            roles: Array.isArray(assignment.roles) ? assignment.roles : readStringArray(cat.roles),
            skillProfile: readNullableString(cat.skillProfile),
            mcpProfile: readNullableString(cat.mcpProfile),
            status: readString(assignment.status, 'active'),
            joinedAt: readString(assignment.joinedAt),
            leftAt: readNullableString(assignment.leftAt),
            execution: assignment.execution,
            memory: asRecord(cat.memory) ?? {
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

  chatState.cats = Array.from(catsById.values());

  if (nextPayload.setupCompleteAt === undefined) {
    (nextPayload as Record<string, unknown>).setupCompleteAt = null;
  }
  if (!nextPayload.ownerDisplayName) {
    (nextPayload as Record<string, unknown>).ownerDisplayName = 'Owner';
  }
  if (nextPayload.ownerAvatarColor === undefined) {
    (nextPayload as Record<string, unknown>).ownerAvatarColor = null;
  }
  if (chatState.bossCatId === undefined) {
    chatState.bossCatId = null;
  }
  if (chatState.showVerboseMessages === undefined) {
    chatState.showVerboseMessages = false;
  }

  if (Array.isArray(chatState.channels)) {
    chatState.channels = chatState.channels.map((channelValue) => {
      const channel = asRecord(channelValue) ?? {};
      if (channel.catCount === undefined) {
        channel.catCount = 0;
      }
      if (channel.activeCatCount === undefined) {
        channel.activeCatCount = 0;
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
    `cats chat selection returned ${response.status}`,
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

export async function deleteGlobalCat(
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

  return mutateAndRefetch(
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

  return mutateAndRefetch(
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

  return mutateAndRefetch(
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

  return mutateAndRefetch(
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

  return mutateAndRefetch(
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

export interface BrowseDirectoryEntry {
  name: string;
  path: string;
}

export interface BrowseDirectoriesResult {
  current: string;
  parent: string;
  entries: BrowseDirectoryEntry[];
  error?: string;
}

export async function browseDirectories(
  targetPath?: string,
  signal?: AbortSignal,
): Promise<BrowseDirectoriesResult> {
  const query = targetPath ? `?path=${encodeURIComponent(targetPath)}` : '';
  const response = await fetch(`/api/shell/browse${query}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });
  return expectJson<BrowseDirectoriesResult>(
    response,
    `directory browse returned ${response.status}`,
    signal,
  );
}

export async function openFolderInExplorer(folderPath: string): Promise<void> {
  await fetch('/api/shell/open-folder', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: folderPath }),
  });
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

export async function updateChatOrchestrator(
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
    bossCatName?: string;
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

export async function updateCatProfile(
  catId: string,
  input: { skillProfile?: string | null; name?: string; makeBoss?: boolean },
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const response = await fetch(`/api/cats/${encodeURIComponent(catId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
    signal,
  });

  return mutateAndRefetch(response, `cat profile update returned ${response.status}`, signal);
}

export async function createBotBindingApi(
  input: {
    botName: string;
    boundCatId: string;
    botToken?: string;
    webhookSecret?: string;
  },
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const response = await fetch('/api/bot-bindings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ platform: 'telegram', ...input }),
    signal,
  });

  return mutateAndRefetch(response, `bot binding create returned ${response.status}`, signal);
}

export async function deleteBotBindingApi(
  bindingId: string,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const response = await fetch(`/api/bot-bindings/${encodeURIComponent(bindingId)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
    signal,
  });

  return mutateAndRefetch(response, `bot binding delete returned ${response.status}`, signal);
}

export interface DurableMemoryItem {
  id: string;
  category: string;
  content: string;
  confidence: number | null;
  updatedAt: string;
}

export async function listCatMemory(
  catId: string,
  signal?: AbortSignal,
): Promise<DurableMemoryItem[]> {
  const response = await fetch(`/api/cats/${encodeURIComponent(catId)}/memory`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  const data = await expectJson<{ records: DurableMemoryItem[] }>(response, `cat memory list returned ${response.status}`);
  return data.records ?? [];
}

export async function createCatMemory(
  catId: string,
  input: { category: string; content: string },
  signal?: AbortSignal,
): Promise<DurableMemoryItem[]> {
  const response = await fetch(`/api/cats/${encodeURIComponent(catId)}/memory`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  const data = await expectJson<{ records: DurableMemoryItem[] }>(response, `cat memory create returned ${response.status}`);
  return data.records ?? [];
}

export async function deleteCatMemory(
  catId: string,
  memoryId: string,
  signal?: AbortSignal,
): Promise<void> {
  await fetch(`/api/cats/${encodeURIComponent(catId)}/memory/${encodeURIComponent(memoryId)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
    signal,
  });
}





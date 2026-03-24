import type { AppShellPayload, UpdateGlobalOrchestratorInput } from '../../api/contracts';

import { normalizeAppShellPayload } from './normalization.js';
import { expectJson, readErrorMessage } from './shared.js';

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

export async function refetchAfterMutation(
  mutationResponse: Response,
  errorFallback: string,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  return mutateAndRefetch(mutationResponse, errorFallback, signal);
}

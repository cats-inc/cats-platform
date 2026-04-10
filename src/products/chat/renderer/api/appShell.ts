import type {
  AppShellPayload,
  NewChatDefaults,
  UpdateGlobalOrchestratorInput,
} from '../../api/contracts';
import type { ProviderModelSelection } from '../../../../shared/providerSelection.js';
import { createKeyedRequestCoalescer } from '../../shared/asyncControl.js';

import { normalizeAppShellPayload } from './normalization.js';
import { expectJson, readErrorMessage } from './http.js';

const pendingSelectedChannelUpdates = createKeyedRequestCoalescer<AppShellPayload>();

function createAbortError(): Error {
  if (typeof DOMException === 'function') {
    return new DOMException('The operation was aborted.', 'AbortError');
  }

  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise;
  }

  if (signal.aborted) {
    return Promise.reject(createAbortError());
  }

  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      signal.addEventListener('abort', () => {
        reject(createAbortError());
      }, { once: true });
    }),
  ]);
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
  return raceWithAbort(
    pendingSelectedChannelUpdates.run(selectedChannelId, async () => {
      const response = await fetch('/api/preferences', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ selectedChannelId }),
      });

      return mutateAndRefetch(
        response,
        `cats chat selection returned ${response.status}`,
      );
    }),
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

export async function updateLiveProgressDetailsPreference(
  show: boolean,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const response = await fetch('/api/preferences', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ showLiveProgressDetails: show }),
    signal,
  });

  return mutateAndRefetch(
    response,
    `cats live progress preference update returned ${response.status}`,
    signal,
  );
}

export async function updateNewChatDefaultsPreference(
  input: NewChatDefaults,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const response = await fetch('/api/preferences', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ newChatDefaults: input }),
    signal,
  });

  return mutateAndRefetch(
    response,
    `cats new chat defaults update returned ${response.status}`,
    signal,
  );
}

export async function updateChannelPendingExecutionTarget(
  channelId: string,
  input: {
    pendingProvider?: string | null;
    pendingModel?: string | null;
    pendingInstance?: string | null;
    pendingModelSelection?: ProviderModelSelection | null;
  },
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  const response = await fetch(`/api/channels/${encodeURIComponent(channelId)}`, {
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
    `cats channel update returned ${response.status}`,
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

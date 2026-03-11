import type { AppShellPayload, CreateWorkspaceChannelInput } from '../shared/app-shell';

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? fallback;
  } catch {
    return fallback;
  }
}

export async function fetchAppShell(signal?: AbortSignal): Promise<AppShellPayload> {
  const response = await fetch('/api/app-shell', {
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`cats-inc app shell returned ${response.status}`);
  }

  return (await response.json()) as AppShellPayload;
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

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        `cats-inc workspace selection returned ${response.status}`,
      ),
    );
  }

  return (await response.json()) as AppShellPayload;
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

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        `cats-inc workspace channel creation returned ${response.status}`,
      ),
    );
  }

  return (await response.json()) as AppShellPayload;
}

import type { AppShellPayload } from '../shared/app-shell';

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
    throw new Error(`cats-inc workspace selection returned ${response.status}`);
  }

  return (await response.json()) as AppShellPayload;
}

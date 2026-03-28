import type { AppShellPayload } from '../../api/contracts';

import { normalizeAppShellPayload } from './normalization.js';
import { expectJson } from './http.js';

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

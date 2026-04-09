import type { AppShellPayload } from '../../api/workspaceContracts.js';

import { normalizeAppShellPayload as normalizeWorkspaceAppShellPayload } from './normalization.js';
import { expectJson } from './http.js';

export function createSetupApi<TPayload>(
  normalizePayload: (payload: TPayload) => TPayload,
) {
  async function completeSetup(
    input: {
      ownerDisplayName: string;
      bossCatName?: string;
      bossCatProvider: string;
      bossCatInstance?: string;
      bossCatModel?: string;
    },
    signal?: AbortSignal,
  ): Promise<TPayload> {
    const response = await fetch('/api/setup/complete', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(input),
      signal,
    });

    return normalizePayload(
      await expectJson<TPayload>(response, `setup completion returned ${response.status}`),
    );
  }

  async function resetSetup(signal?: AbortSignal): Promise<TPayload> {
    const response = await fetch('/api/setup/reset', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
      signal,
    });

    return normalizePayload(
      await expectJson<TPayload>(response, `setup reset returned ${response.status}`),
    );
  }

  return {
    completeSetup,
    resetSetup,
  };
}

const workspaceSetupApi = createSetupApi<AppShellPayload>(normalizeWorkspaceAppShellPayload);

export const completeSetup = workspaceSetupApi.completeSetup;
export const resetSetup = workspaceSetupApi.resetSetup;

import type { AppShellPayload } from '../../api/workspaceContracts.js';

import { normalizeAppShellPayload as normalizeWorkspaceAppShellPayload } from './normalization.js';
import { expectJson } from './http.js';

export function createSetupApi<TPayload>(
  normalizePayload: (payload: TPayload) => TPayload,
) {
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
    resetSetup,
  };
}

const workspaceSetupApi = createSetupApi<AppShellPayload>(normalizeWorkspaceAppShellPayload);

export const resetSetup = workspaceSetupApi.resetSetup;

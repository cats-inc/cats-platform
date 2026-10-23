import type { AppShellPayload } from '../../api/workspaceContracts.js';
import { browserLocalStorage } from '../../../../shared/browserStorage.js';
import type { PlatformDataResetRequest } from '../../../../shared/platformDataResetRequest.js';

import { normalizeAppShellPayload as normalizeWorkspaceAppShellPayload } from './normalization.js';
import { expectJson } from './http.js';

export function createSetupApi<TPayload>(
  normalizePayload: (payload: TPayload) => TPayload,
) {
  async function resetSetup(options: PlatformDataResetRequest, signal?: AbortSignal): Promise<TPayload> {
    const response = await fetch('/api/setup/reset', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options),
      signal,
    });

    const payload = normalizePayload(
      await expectJson<TPayload>(response, `setup reset returned ${response.status}`),
    );
    // The browser half of the erased profile: cat covers, layout and Guide Cat
    // state are keyed to records the server just removed.
    try { browserLocalStorage()?.clear(); } catch { /* storage blocked by the host */ }
    return payload;
  }

  return {
    resetSetup,
  };
}

const workspaceSetupApi = createSetupApi<AppShellPayload>(normalizeWorkspaceAppShellPayload);

export const resetSetup = workspaceSetupApi.resetSetup;

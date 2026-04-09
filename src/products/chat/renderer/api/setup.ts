import type { AppShellPayload } from '../../api/contracts.js';

import { createSetupApi } from '../../../shared/renderer/api/setup.js';

import { normalizeAppShellPayload } from './normalization.js';

const chatSetupApi = createSetupApi<AppShellPayload>(normalizeAppShellPayload);

export const completeSetup = chatSetupApi.completeSetup;
export const resetSetup = chatSetupApi.resetSetup;

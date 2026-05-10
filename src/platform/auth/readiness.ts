import type { PlatformAuthStateReadStatus } from './state.js';

export type PlatformAuthReadinessPhase = 'pre_setup' | 'post_setup' | 'repair';

export type PlatformAuthRepairReason =
  | 'missing_auth_state_after_setup'
  | 'corrupt_auth_state_after_setup';

export interface PlatformAuthReadiness {
  phase: PlatformAuthReadinessPhase;
  setupCompleteAt: string | null;
  authStateStatus: PlatformAuthStateReadStatus['status'];
  repairRequired: boolean;
  repairReason: PlatformAuthRepairReason | null;
  corruptErrorMessage: string | null;
}

export function resolvePlatformAuthReadiness(input: {
  setupCompleteAt: string | null;
  authStateStatus: PlatformAuthStateReadStatus;
}): PlatformAuthReadiness {
  if (input.setupCompleteAt === null) {
    return {
      phase: 'pre_setup',
      setupCompleteAt: null,
      authStateStatus: input.authStateStatus.status,
      repairRequired: false,
      repairReason: null,
      corruptErrorMessage: null,
    };
  }

  if (input.authStateStatus.status === 'ready') {
    return {
      phase: 'post_setup',
      setupCompleteAt: input.setupCompleteAt,
      authStateStatus: 'ready',
      repairRequired: false,
      repairReason: null,
      corruptErrorMessage: null,
    };
  }

  return {
    phase: 'repair',
    setupCompleteAt: input.setupCompleteAt,
    authStateStatus: input.authStateStatus.status,
    repairRequired: true,
    repairReason: input.authStateStatus.status === 'missing'
      ? 'missing_auth_state_after_setup'
      : 'corrupt_auth_state_after_setup',
    corruptErrorMessage: input.authStateStatus.status === 'corrupt'
      ? input.authStateStatus.error.message
      : null,
  };
}

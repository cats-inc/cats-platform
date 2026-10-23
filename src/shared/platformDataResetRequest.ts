/** Explicit confirmation shared by the reset dialog and authenticated API. */
export const PLATFORM_DATA_RESET_CONFIRMATION = 'RESET';

export interface PlatformDataResetRequest {
  confirmation: string;
  resetRuntime: boolean;
}

export function isPlatformDataResetRequest(value: unknown): value is PlatformDataResetRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.confirmation === PLATFORM_DATA_RESET_CONFIRMATION
    && typeof record.resetRuntime === 'boolean';
}

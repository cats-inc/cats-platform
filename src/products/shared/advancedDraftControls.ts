import type { PlatformSurfaceId } from '../../shared/platform-contract.js';

export interface AdvancedDraftControlsPreferences {
  chat: boolean;
  code: boolean;
  work: boolean;
}

export type AdvancedDraftControlsPatch = Partial<AdvancedDraftControlsPreferences>;

const ADVANCED_DRAFT_CONTROL_SURFACES: readonly PlatformSurfaceId[] = [
  'chat',
  'code',
  'work',
];

export function createDefaultAdvancedDraftControlsPreferences(): AdvancedDraftControlsPreferences {
  return {
    chat: false,
    code: false,
    work: false,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function normalizeAdvancedDraftControlsPreferences(
  value: unknown,
): AdvancedDraftControlsPreferences {
  const fallback = createDefaultAdvancedDraftControlsPreferences();
  const record = asRecord(value);
  if (!record) {
    return fallback;
  }

  return ADVANCED_DRAFT_CONTROL_SURFACES.reduce<AdvancedDraftControlsPreferences>(
    (next, surface) => ({
      ...next,
      [surface]: record[surface] === true,
    }),
    fallback,
  );
}

export function cloneAdvancedDraftControlsPreferences(
  value: AdvancedDraftControlsPreferences | null | undefined,
): AdvancedDraftControlsPreferences {
  return normalizeAdvancedDraftControlsPreferences(value);
}

export function applyAdvancedDraftControlsPatch(
  current: AdvancedDraftControlsPreferences | null | undefined,
  patch: AdvancedDraftControlsPatch | null | undefined,
): AdvancedDraftControlsPreferences {
  const next = normalizeAdvancedDraftControlsPreferences(current);
  const record = asRecord(patch);
  if (!record) {
    return next;
  }

  for (const surface of ADVANCED_DRAFT_CONTROL_SURFACES) {
    if (typeof record[surface] === 'boolean') {
      next[surface] = record[surface] as boolean;
    }
  }

  return next;
}

export function isAdvancedDraftControlsEnabled(
  value: AdvancedDraftControlsPreferences | null | undefined,
  surface: PlatformSurfaceId,
): boolean {
  return normalizeAdvancedDraftControlsPreferences(value)[surface] === true;
}

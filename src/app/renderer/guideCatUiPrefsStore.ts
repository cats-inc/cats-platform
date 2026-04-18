import type {
  GuideCatFloatingAnchor,
  GuideCatPlacement,
  GuideCatSidecarMode,
} from '../../shared/platform-contract.js';

export const GUIDE_CAT_UI_PREFS_STORAGE_KEY = 'cats.guide-cat-ui-prefs';
export const GUIDE_CAT_UI_PREFS_SCHEMA_VERSION = 1;

export interface GuideCatUiPrefs {
  sidecarSeen: boolean;
  sidecarMode: GuideCatSidecarMode;
  placement: GuideCatPlacement;
  floatingAnchor: GuideCatFloatingAnchor | null;
}

export interface LegacyGuideCatUiPrefsInput {
  sidecarSeen?: boolean | null;
  sidecarMode?: GuideCatSidecarMode | null;
  placement?: GuideCatPlacement | null;
  floatingAnchor?: GuideCatFloatingAnchor | null;
}

export interface GuideCatUiPrefsPatch {
  sidecarSeen?: boolean;
  sidecarMode?: GuideCatSidecarMode;
  placement?: GuideCatPlacement;
  floatingAnchor?: GuideCatFloatingAnchor | null;
}

interface GuideCatUiPrefsRecord extends GuideCatUiPrefs {
  version: typeof GUIDE_CAT_UI_PREFS_SCHEMA_VERSION;
}

interface GuideCatUiPrefsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface GuideCatUiPrefsHydrationResult {
  prefs: GuideCatUiPrefs;
  source: 'local' | 'legacy' | 'defaults';
  persisted: boolean;
}

export const GUIDE_CAT_UI_PREFS_DEFAULTS: GuideCatUiPrefs = {
  sidecarSeen: false,
  sidecarMode: 'auto',
  placement: 'floating',
  floatingAnchor: null,
};

function normalizeFloatingAnchor(value: unknown): GuideCatFloatingAnchor | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const x = record.x;
  const y = record.y;
  if (typeof x !== 'number' || typeof y !== 'number') {
    return null;
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
  };
}

function normalizeSidecarMode(value: unknown): GuideCatSidecarMode {
  return value === 'auto' || value === 'drawer' || value === 'bubble'
    ? value
    : GUIDE_CAT_UI_PREFS_DEFAULTS.sidecarMode;
}

function normalizePlacement(value: unknown): GuideCatPlacement {
  return value === 'floating' || value === 'docked'
    ? value
    : GUIDE_CAT_UI_PREFS_DEFAULTS.placement;
}

function hasLegacyGuideCatUiPrefsInput(
  value: LegacyGuideCatUiPrefsInput | null | undefined,
): value is LegacyGuideCatUiPrefsInput {
  if (!value) {
    return false;
  }
  return (
    value.sidecarSeen !== undefined
    || value.sidecarMode !== undefined
    || value.placement !== undefined
    || value.floatingAnchor !== undefined
  );
}

export function mergeGuideCatUiPrefs(
  current: GuideCatUiPrefs,
  patch: GuideCatUiPrefsPatch,
): GuideCatUiPrefs {
  return {
    sidecarSeen: patch.sidecarSeen ?? current.sidecarSeen,
    sidecarMode: patch.sidecarMode ?? current.sidecarMode,
    placement: patch.placement ?? current.placement,
    floatingAnchor:
      patch.floatingAnchor !== undefined ? patch.floatingAnchor : current.floatingAnchor,
  };
}

export function parseStoredGuideCatUiPrefs(
  raw: string | null | undefined,
): GuideCatUiPrefs | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (record.version !== GUIDE_CAT_UI_PREFS_SCHEMA_VERSION) {
      return null;
    }
    return {
      sidecarSeen: record.sidecarSeen === true,
      sidecarMode: normalizeSidecarMode(record.sidecarMode),
      placement: normalizePlacement(record.placement),
      floatingAnchor: normalizeFloatingAnchor(record.floatingAnchor),
    };
  } catch {
    return null;
  }
}

export function serializeGuideCatUiPrefs(prefs: GuideCatUiPrefs): string {
  const record: GuideCatUiPrefsRecord = {
    version: GUIDE_CAT_UI_PREFS_SCHEMA_VERSION,
    sidecarSeen: prefs.sidecarSeen,
    sidecarMode: prefs.sidecarMode,
    placement: prefs.placement,
    floatingAnchor: prefs.floatingAnchor ? { ...prefs.floatingAnchor } : null,
  };
  return JSON.stringify(record);
}

export function readStoredGuideCatUiPrefs(
  storage: GuideCatUiPrefsStorage | null | undefined,
): GuideCatUiPrefs | null {
  if (!storage) {
    return null;
  }
  try {
    return parseStoredGuideCatUiPrefs(storage.getItem(GUIDE_CAT_UI_PREFS_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeStoredGuideCatUiPrefs(
  storage: GuideCatUiPrefsStorage | null | undefined,
  prefs: GuideCatUiPrefs,
): { persisted: boolean; prefs: GuideCatUiPrefs } {
  if (!storage) {
    return { persisted: false, prefs };
  }

  try {
    storage.setItem(GUIDE_CAT_UI_PREFS_STORAGE_KEY, serializeGuideCatUiPrefs(prefs));
    const readBack = readStoredGuideCatUiPrefs(storage);
    if (readBack) {
      return { persisted: true, prefs: readBack };
    }
  } catch {
    // Ignore storage failures and keep the in-memory value alive.
  }

  return { persisted: false, prefs };
}

export function deriveGuideCatUiPrefsFromLegacy(
  legacy: LegacyGuideCatUiPrefsInput | null | undefined,
): GuideCatUiPrefs {
  const sidecarMode = normalizeSidecarMode(legacy?.sidecarMode);
  const placement = normalizePlacement(legacy?.placement);
  const floatingAnchor = normalizeFloatingAnchor(legacy?.floatingAnchor);
  const interactedBeyondDefaults =
    sidecarMode !== GUIDE_CAT_UI_PREFS_DEFAULTS.sidecarMode
    || placement !== GUIDE_CAT_UI_PREFS_DEFAULTS.placement
    || floatingAnchor !== null;
  const sidecarSeen = legacy?.sidecarSeen === true || interactedBeyondDefaults;

  return {
    sidecarSeen,
    sidecarMode,
    placement,
    floatingAnchor,
  };
}

export function hydrateGuideCatUiPrefs(options: {
  storage: GuideCatUiPrefsStorage | null | undefined;
  legacy?: LegacyGuideCatUiPrefsInput | null;
}): GuideCatUiPrefsHydrationResult {
  const { storage, legacy = null } = options;
  const stored = readStoredGuideCatUiPrefs(storage);
  if (stored) {
    return { prefs: stored, source: 'local', persisted: true };
  }

  const source = hasLegacyGuideCatUiPrefsInput(legacy) ? 'legacy' : 'defaults';
  const prefs = source === 'legacy'
    ? deriveGuideCatUiPrefsFromLegacy(legacy)
    : { ...GUIDE_CAT_UI_PREFS_DEFAULTS };
  const persisted = writeStoredGuideCatUiPrefs(storage, prefs).persisted;
  return { prefs, source, persisted };
}

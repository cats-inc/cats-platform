import {
  useCallback,
  useMemo,
  useSyncExternalStore,
} from 'react';

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

type GuideCatUiPrefsListener = () => void;

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

export interface UseGuideCatUiPrefsOptions {
  legacy?: LegacyGuideCatUiPrefsInput | null;
  hydrate?: boolean;
}

export interface UseGuideCatUiPrefsResult {
  prefs: GuideCatUiPrefs;
  hydrated: boolean;
  update: (patch: GuideCatUiPrefsPatch) => void;
}

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

function areGuideCatUiPrefsEqual(a: GuideCatUiPrefs, b: GuideCatUiPrefs): boolean {
  return (
    a.sidecarSeen === b.sidecarSeen
    && a.sidecarMode === b.sidecarMode
    && a.placement === b.placement
    && a.floatingAnchor?.x === b.floatingAnchor?.x
    && a.floatingAnchor?.y === b.floatingAnchor?.y
  );
}

export class GuideCatUiPrefsStore {
  private prefs: GuideCatUiPrefs = { ...GUIDE_CAT_UI_PREFS_DEFAULTS };
  private hydrated = false;
  private listeners = new Set<GuideCatUiPrefsListener>();
  private storageListening = false;

  constructor(
    private readonly storage: GuideCatUiPrefsStorage | null | undefined,
  ) {}

  getSnapshot = (): GuideCatUiPrefs => this.prefs;

  isHydrated(): boolean {
    return this.hydrated;
  }

  subscribe = (listener: GuideCatUiPrefsListener): (() => void) => {
    this.listeners.add(listener);
    this.ensureStorageListener();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.teardownStorageListener();
      }
    };
  };

  ensureHydrated(legacy?: LegacyGuideCatUiPrefsInput | null): void {
    if (this.hydrated) {
      return;
    }
    const result = hydrateGuideCatUiPrefs({ storage: this.storage, legacy });
    this.prefs = result.prefs;
    this.hydrated = true;
  }

  update(patch: GuideCatUiPrefsPatch): void {
    if (!this.hydrated) {
      this.ensureHydrated();
    }

    const next = mergeGuideCatUiPrefs(this.prefs, patch);
    if (areGuideCatUiPrefsEqual(this.prefs, next)) {
      return;
    }

    const nextSnapshot = writeStoredGuideCatUiPrefs(this.storage, next).prefs;
    this.prefs = nextSnapshot;
    this.hydrated = true;
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }

  private ensureStorageListener(): void {
    if (
      this.storageListening
      || typeof window === 'undefined'
      || typeof window.addEventListener !== 'function'
    ) {
      return;
    }
    window.addEventListener('storage', this.handleStorageEvent);
    this.storageListening = true;
  }

  private teardownStorageListener(): void {
    if (
      !this.storageListening
      || typeof window === 'undefined'
      || typeof window.removeEventListener !== 'function'
    ) {
      return;
    }
    window.removeEventListener('storage', this.handleStorageEvent);
    this.storageListening = false;
  }

  private readonly handleStorageEvent = (event: StorageEvent): void => {
    if (event.key !== GUIDE_CAT_UI_PREFS_STORAGE_KEY) {
      return;
    }
    const next = parseStoredGuideCatUiPrefs(event.newValue) ?? { ...GUIDE_CAT_UI_PREFS_DEFAULTS };
    if (areGuideCatUiPrefsEqual(this.prefs, next)) {
      return;
    }
    this.prefs = next;
    this.hydrated = true;
    this.emit();
  };
}

export function createGuideCatUiPrefsStore(
  storage: GuideCatUiPrefsStorage | null | undefined,
): GuideCatUiPrefsStore {
  return new GuideCatUiPrefsStore(storage);
}

let guideCatUiPrefsStore: GuideCatUiPrefsStore | null = null;

function getBrowserGuideCatUiPrefsStore(): GuideCatUiPrefsStore {
  if (!guideCatUiPrefsStore) {
    guideCatUiPrefsStore = createGuideCatUiPrefsStore(
      typeof window === 'undefined' ? null : window.localStorage,
    );
  }
  return guideCatUiPrefsStore;
}

export function resetGuideCatUiPrefsStoreForTests(): void {
  guideCatUiPrefsStore = null;
}

export function useGuideCatUiPrefs(
  options: UseGuideCatUiPrefsOptions = {},
): UseGuideCatUiPrefsResult {
  const {
    legacy = null,
    hydrate = true,
  } = options;
  const store = useMemo(
    () =>
      typeof window === 'undefined'
        ? createGuideCatUiPrefsStore(null)
        : getBrowserGuideCatUiPrefsStore(),
    [],
  );

  if (hydrate) {
    store.ensureHydrated(legacy);
  }

  const prefs = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const update = useCallback(
    (patch: GuideCatUiPrefsPatch) => {
      store.update(patch);
    },
    [store],
  );

  return {
    prefs,
    hydrated: hydrate && store.isHydrated(),
    update,
  };
}

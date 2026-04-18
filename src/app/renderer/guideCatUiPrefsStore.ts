import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
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

interface GuideCatBrowserGlobalLike {
  addEventListener?: (
    type: 'storage',
    listener: (event: GuideCatStorageEventLike) => void,
  ) => void;
  removeEventListener?: (
    type: 'storage',
    listener: (event: GuideCatStorageEventLike) => void,
  ) => void;
  localStorage?: GuideCatUiPrefsStorage;
}

interface GuideCatStorageEventLike {
  key: string | null;
  newValue: string | null;
}

type GuideCatUiPrefsListener = () => void;

export interface GuideCatUiPrefsHydrationResult {
  prefs: GuideCatUiPrefs;
  source: 'local' | 'defaults';
  persisted: boolean;
}

export const GUIDE_CAT_UI_PREFS_DEFAULTS: GuideCatUiPrefs = {
  sidecarSeen: false,
  sidecarMode: 'auto',
  placement: 'floating',
  floatingAnchor: null,
};

export interface UseGuideCatUiPrefsOptions {
  hydrate?: boolean;
}

export interface UseGuideCatUiPrefsResult {
  prefs: GuideCatUiPrefs;
  hydrated: boolean;
  update: (patch: GuideCatUiPrefsPatch) => void;
}

const warnedInvalidGuideCatUiPrefsContexts = new Set<string>();

function readBrowserGlobal(): GuideCatBrowserGlobalLike | null {
  const candidate = globalThis as unknown as GuideCatBrowserGlobalLike;
  if (
    typeof candidate.addEventListener !== 'function'
    || typeof candidate.removeEventListener !== 'function'
  ) {
    return null;
  }
  return candidate;
}

const useIsoLayoutEffect = readBrowserGlobal() === null ? useEffect : useLayoutEffect;

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
    // Future: when bumping the schema version, add a case that parses older
    // records and migrates them in memory before returning the current shape.
    switch (record.version) {
      case GUIDE_CAT_UI_PREFS_SCHEMA_VERSION:
        return {
          sidecarSeen: record.sidecarSeen === true,
          sidecarMode: normalizeSidecarMode(record.sidecarMode),
          placement: normalizePlacement(record.placement),
          floatingAnchor: normalizeFloatingAnchor(record.floatingAnchor),
        };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function warnInvalidGuideCatUiPrefsRecord(context: 'bootstrap' | 'storage-event'): void {
  if (warnedInvalidGuideCatUiPrefsContexts.has(context)) {
    return;
  }
  warnedInvalidGuideCatUiPrefsContexts.add(context);
  globalThis.console?.warn?.(
    `[guide-cat-ui-prefs] Ignoring unsupported or malformed stored prefs during ${context}.`,
  );
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

function readStoredGuideCatUiPrefsRaw(
  storage: GuideCatUiPrefsStorage | null | undefined,
): string | null {
  if (!storage) {
    return null;
  }
  try {
    return storage.getItem(GUIDE_CAT_UI_PREFS_STORAGE_KEY);
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

export function hydrateGuideCatUiPrefs(options: {
  storage: GuideCatUiPrefsStorage | null | undefined;
}): GuideCatUiPrefsHydrationResult {
  const { storage } = options;
  const storedRaw = readStoredGuideCatUiPrefsRaw(storage);
  const stored = parseStoredGuideCatUiPrefs(storedRaw);
  if (stored) {
    return { prefs: stored, source: 'local', persisted: true };
  }

  if (storedRaw !== null) {
    warnInvalidGuideCatUiPrefsRecord('bootstrap');
    return {
      prefs: { ...GUIDE_CAT_UI_PREFS_DEFAULTS },
      source: 'defaults',
      persisted: false,
    };
  }

  const prefs = { ...GUIDE_CAT_UI_PREFS_DEFAULTS };
  const persisted = writeStoredGuideCatUiPrefs(storage, prefs).persisted;
  return { prefs, source: 'defaults', persisted };
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

  ensureHydrated(): void {
    if (this.hydrated) {
      return;
    }
    const result = hydrateGuideCatUiPrefs({ storage: this.storage });
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
    const browser = readBrowserGlobal();
    if (!browser || this.storageListening) {
      return;
    }
    browser.addEventListener?.('storage', this.handleStorageEvent);
    this.storageListening = true;
  }

  private teardownStorageListener(): void {
    const browser = readBrowserGlobal();
    if (!browser || !this.storageListening) {
      return;
    }
    browser.removeEventListener?.('storage', this.handleStorageEvent);
    this.storageListening = false;
  }

  private readonly handleStorageEvent = (event: GuideCatStorageEventLike): void => {
    if (event.key !== GUIDE_CAT_UI_PREFS_STORAGE_KEY) {
      return;
    }
    if (event.newValue === null) {
      const next = { ...GUIDE_CAT_UI_PREFS_DEFAULTS };
      if (areGuideCatUiPrefsEqual(this.prefs, next)) {
        return;
      }
      this.prefs = next;
      this.hydrated = true;
      this.emit();
      return;
    }
    const next = parseStoredGuideCatUiPrefs(event.newValue);
    if (!next) {
      warnInvalidGuideCatUiPrefsRecord('storage-event');
      return;
    }
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
    guideCatUiPrefsStore = createGuideCatUiPrefsStore(readBrowserGlobal()?.localStorage ?? null);
  }
  return guideCatUiPrefsStore;
}

export function useGuideCatUiPrefs(
  options: UseGuideCatUiPrefsOptions = {},
): UseGuideCatUiPrefsResult {
  const {
    hydrate = true,
  } = options;
  const store = useMemo(
    () =>
      readBrowserGlobal() === null
        ? createGuideCatUiPrefsStore(null)
        : getBrowserGuideCatUiPrefsStore(),
    [],
  );
  const [, setHydrationTick] = useState(0);

  useIsoLayoutEffect(() => {
    if (!hydrate || store.isHydrated()) {
      return;
    }
    store.ensureHydrated();
    setHydrationTick((current) => current + 1);
  }, [hydrate, store]);

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

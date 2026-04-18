import type { ConcurrentChatPresentationMode } from '../../../api/workspaceContracts.js';

import { resolveConcurrentPresentationMode } from './concurrentModeResolver.js';

export const CONCURRENT_CLUSTER_UI_STATE_STORAGE_KEY = 'cats.concurrent-cluster-ui-state';
export const MAX_CONCURRENT_CLUSTER_UI_STATE_ENTRIES = 200;

export interface ConcurrentClusterContext {
  turnId: string;
  sourceMessageId: string;
  segmentCount: number;
  clusterKind: 'live' | 'durable';
}

export interface ConcurrentClusterAction {
  key: string;
  label: string;
  title?: string;
  disabled?: boolean;
  onSelect: () => void;
}

export interface ConcurrentClusterActionContext extends ConcurrentClusterContext {
  resolvedMode: ConcurrentChatPresentationMode;
}

export interface ConcurrentClusterUiState {
  presentationOverride: 'inline_stack' | null;
}

export type ConcurrentClusterUiStateMap = Record<string, ConcurrentClusterUiState>;

interface ConcurrentClusterUiStateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

const warnedConcurrentClusterUiStateStorageKeys = new Set<string>();

function resolveConcurrentClusterUiStateWarningDedupeKey(
  context: 'read' | 'write',
  error: unknown,
): string {
  if (error instanceof Error) {
    return `${context}:${error.name || 'Error'}`;
  }
  return `${context}:${typeof error}`;
}

function warnConcurrentClusterUiStateStorageFailure(
  context: 'read' | 'write',
  error: unknown,
): void {
  const dedupeKey = resolveConcurrentClusterUiStateWarningDedupeKey(context, error);
  if (warnedConcurrentClusterUiStateStorageKeys.has(dedupeKey)) {
    return;
  }
  warnedConcurrentClusterUiStateStorageKeys.add(dedupeKey);
  if (typeof console === 'undefined' || typeof console.warn !== 'function') {
    return;
  }
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.warn(
    `[Cats] Failed to ${context} concurrent cluster dismiss state: ${errorMessage}`,
  );
}

// Tests share this module-level dedupe set, so a previous test that triggered the
// same context+error name would silently swallow the next warn assertion. Reset
// between tests that assert on warn output.
export function resetConcurrentClusterUiStateStorageWarnings(): void {
  warnedConcurrentClusterUiStateStorageKeys.clear();
}

function readConcurrentClusterUiStateRecord(
  value: unknown,
): ConcurrentClusterUiState | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const presentationOverride = (value as { presentationOverride?: unknown }).presentationOverride;
  if (presentationOverride !== 'inline_stack') {
    return null;
  }
  return { presentationOverride };
}

function pruneConcurrentClusterUiStateMap(
  value: ConcurrentClusterUiStateMap,
  maxEntries: number = MAX_CONCURRENT_CLUSTER_UI_STATE_ENTRIES,
): ConcurrentClusterUiStateMap {
  const entries = Object.entries(value);
  if (entries.length <= maxEntries) {
    return value;
  }
  return Object.fromEntries(entries.slice(-maxEntries));
}

export function buildConcurrentClusterUiStateKey(
  channelId: string,
  turnId: string,
): string {
  return `${channelId}:${turnId}`;
}

export function parseStoredConcurrentClusterUiStateMap(
  value: string | null | undefined,
): ConcurrentClusterUiStateMap {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    const next: ConcurrentClusterUiStateMap = {};
    for (const [key, record] of Object.entries(parsed)) {
      if (!key || typeof key !== 'string') {
        continue;
      }
      const normalized = readConcurrentClusterUiStateRecord(record);
      if (normalized) {
        next[key] = normalized;
      }
    }
    return pruneConcurrentClusterUiStateMap(next);
  } catch {
    return {};
  }
}

export interface LoadedConcurrentClusterUiStateMap {
  value: ConcurrentClusterUiStateMap;
  // True when parse normalized the raw payload (dropped invalid records or pruned
  // overflow). Callers should persist the cleaned value on first mount instead of
  // letting the next user dismiss overwrite the storage-side bloat.
  requiresPersistedCleanup: boolean;
}

export function loadConcurrentClusterUiStateMap(
  storage: ConcurrentClusterUiStateStorage | null | undefined,
): LoadedConcurrentClusterUiStateMap {
  if (!storage) {
    return { value: {}, requiresPersistedCleanup: false };
  }

  let raw: string | null = null;
  try {
    raw = storage.getItem(CONCURRENT_CLUSTER_UI_STATE_STORAGE_KEY);
  } catch (error) {
    warnConcurrentClusterUiStateStorageFailure('read', error);
    return { value: {}, requiresPersistedCleanup: false };
  }
  if (!raw) {
    return { value: {}, requiresPersistedCleanup: false };
  }

  const value = parseStoredConcurrentClusterUiStateMap(raw);
  const requiresPersistedCleanup = JSON.stringify(value) !== raw;
  return { value, requiresPersistedCleanup };
}

export function readConcurrentClusterUiStateMap(
  storage: ConcurrentClusterUiStateStorage | null | undefined,
): ConcurrentClusterUiStateMap {
  return loadConcurrentClusterUiStateMap(storage).value;
}

function tryShrinkAndWriteConcurrentClusterUiStateMap(
  storage: ConcurrentClusterUiStateStorage,
  normalized: ConcurrentClusterUiStateMap,
): ConcurrentClusterUiStateMap | null {
  // Halve the map each retry so we converge in a few attempts rather than
  // dumping everything to a hard-coded 32. Stop before we go below a single
  // entry — at that point the caller should fall back to removeItem instead.
  // Returns the map that actually landed so the caller can sync in-memory
  // state to the persisted truth; null means nothing landed.
  let currentSize = Object.keys(normalized).length;
  while (currentSize > 1) {
    currentSize = Math.floor(currentSize / 2);
    const pruned = pruneConcurrentClusterUiStateMap(normalized, currentSize);
    try {
      storage.setItem(
        CONCURRENT_CLUSTER_UI_STATE_STORAGE_KEY,
        JSON.stringify(pruned),
      );
      return pruned;
    } catch {
      // try the next (smaller) tier
    }
  }
  return null;
}

// Returns the map that was actually persisted. On a clean write this is the
// input (identity preserved so callers can skip sync). Under quota pressure
// the return value may be a shrunk subset, or {} when removeItem succeeded in
// clearing the stored key. When the writer could neither persist nor confirm
// the key was cleared, the input is returned unchanged — the caller must not
// sync in-memory state to a clean slate that storage can't back up, or a
// refresh will resurrect the stale payload.
export function writeConcurrentClusterUiStateMap(
  storage: ConcurrentClusterUiStateStorage | null | undefined,
  value: ConcurrentClusterUiStateMap,
): ConcurrentClusterUiStateMap {
  if (!storage) {
    return value;
  }

  const normalized = pruneConcurrentClusterUiStateMap(value);
  try {
    storage.setItem(
      CONCURRENT_CLUSTER_UI_STATE_STORAGE_KEY,
      JSON.stringify(normalized),
    );
    return normalized;
  } catch (initialError) {
    const shrunk = tryShrinkAndWriteConcurrentClusterUiStateMap(storage, normalized);
    if (shrunk !== null) {
      return shrunk;
    }
    // Last resort: nuke the stored key so we don't keep carrying a stale payload
    // that blocks future writes. Small maps (size ≤ 1) also land here because the
    // shrink loop has nothing to prune. Only claim storage is empty when
    // removeItem actually succeeded — otherwise whatever was there before this
    // attempt still lingers, and falsely syncing the caller to {} would
    // resurrect those entries on the next refresh.
    if (typeof storage.removeItem === 'function') {
      try {
        storage.removeItem(CONCURRENT_CLUSTER_UI_STATE_STORAGE_KEY);
        warnConcurrentClusterUiStateStorageFailure('write', initialError);
        return {};
      } catch {
        // removeItem also failed — fall through to "storage is opaque" path.
      }
    }
    warnConcurrentClusterUiStateStorageFailure('write', initialError);
    // Storage retains whatever it had before; we haven't actually persisted or
    // cleared anything. Return the input so the caller's identity check keeps
    // in-memory state unchanged rather than promising a clean slate storage
    // can't back up.
    return value;
  }
}

export function dismissConcurrentClusterUiState(
  previous: ConcurrentClusterUiStateMap,
  input: {
    channelId: string;
    turnId: string;
  },
): ConcurrentClusterUiStateMap {
  const key = buildConcurrentClusterUiStateKey(input.channelId, input.turnId);
  const nextState: ConcurrentClusterUiState = {
    presentationOverride: 'inline_stack',
  };
  const currentState = previous[key];
  if (currentState?.presentationOverride === nextState.presentationOverride) {
    return previous;
  }
  return pruneConcurrentClusterUiStateMap({
    ...previous,
    [key]: nextState,
  });
}

export function resolveConcurrentClusterPresentationMode(input: {
  channelId: string;
  turnId: string;
  userDefault: ConcurrentChatPresentationMode;
  segmentCount: number;
  viewportWidth: number;
  workflowRecommendation?: ConcurrentChatPresentationMode | null;
  uiStateByKey: ConcurrentClusterUiStateMap;
}): ConcurrentChatPresentationMode {
  const clusterUiState = input.uiStateByKey[
    buildConcurrentClusterUiStateKey(input.channelId, input.turnId)
  ] ?? null;
  return resolveConcurrentPresentationMode({
    explicitOverride: clusterUiState?.presentationOverride ?? null,
    workflowRecommendation: input.workflowRecommendation ?? null,
    userDefault: input.userDefault,
    segmentCount: input.segmentCount,
    viewportWidth: input.viewportWidth,
  });
}

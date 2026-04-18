import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONCURRENT_CLUSTER_UI_STATE_STORAGE_KEY,
  MAX_CONCURRENT_CLUSTER_UI_STATE_ENTRIES,
  buildConcurrentClusterUiStateKey,
  dismissConcurrentClusterUiState,
  loadConcurrentClusterUiStateMap,
  parseStoredConcurrentClusterUiStateMap,
  readConcurrentClusterUiStateMap,
  resetConcurrentClusterUiStateStorageWarnings,
  resolveConcurrentClusterPresentationMode,
  type ConcurrentClusterUiStateMap,
  writeConcurrentClusterUiStateMap,
} from '../src/products/shared/renderer/components/chat-view/concurrentClusterUiState.js';

test('dismissConcurrentClusterUiState scopes dismissal by channel and turn', () => {
  const dismissed = dismissConcurrentClusterUiState({}, {
    channelId: 'channel-1',
    turnId: 'turn-1',
  });

  assert.deepEqual(Object.keys(dismissed), [
    buildConcurrentClusterUiStateKey('channel-1', 'turn-1'),
  ]);
  assert.equal(
    dismissed[buildConcurrentClusterUiStateKey('channel-1', 'turn-1')]?.presentationOverride,
    'inline_stack',
  );
});

test('resolveConcurrentClusterPresentationMode only applies override to the dismissed cluster', () => {
  const uiStateByKey: ConcurrentClusterUiStateMap = dismissConcurrentClusterUiState({}, {
    channelId: 'channel-1',
    turnId: 'turn-1',
  });

  assert.equal(
    resolveConcurrentClusterPresentationMode({
      channelId: 'channel-1',
      turnId: 'turn-1',
      userDefault: 'compare_cards',
      segmentCount: 2,
      viewportWidth: 1280,
      workflowRecommendation: null,
      uiStateByKey,
    }),
    'inline_stack',
  );
  assert.equal(
    resolveConcurrentClusterPresentationMode({
      channelId: 'channel-1',
      turnId: 'turn-2',
      userDefault: 'compare_cards',
      segmentCount: 2,
      viewportWidth: 1280,
      workflowRecommendation: null,
      uiStateByKey,
    }),
    'compare_cards',
  );
  assert.equal(
    resolveConcurrentClusterPresentationMode({
      channelId: 'channel-2',
      turnId: 'turn-1',
      userDefault: 'compare_cards',
      segmentCount: 2,
      viewportWidth: 1280,
      workflowRecommendation: null,
      uiStateByKey,
    }),
    'compare_cards',
  );
});

test('writeConcurrentClusterUiStateMap persists dismiss overrides for refresh-time restore', () => {
  const writes = new Map<string, string>();
  const storage = {
    getItem(key: string) {
      return writes.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      writes.set(key, value);
    },
  };
  const uiStateByKey: ConcurrentClusterUiStateMap = dismissConcurrentClusterUiState({}, {
    channelId: 'channel-1',
    turnId: 'turn-1',
  });

  writeConcurrentClusterUiStateMap(storage, uiStateByKey);

  assert.equal(writes.has(CONCURRENT_CLUSTER_UI_STATE_STORAGE_KEY), true);
  assert.deepEqual(readConcurrentClusterUiStateMap(storage), uiStateByKey);
});

test('parseStoredConcurrentClusterUiStateMap ignores invalid records and keeps valid dismiss overrides', () => {
  const parsed = parseStoredConcurrentClusterUiStateMap(JSON.stringify({
    'channel-1:turn-1': { presentationOverride: 'inline_stack' },
    'channel-1:turn-2': { presentationOverride: 'focus_rail' },
    'channel-1:turn-3': { presentationOverride: null },
    'channel-1:turn-4': 'bad-record',
  }));

  assert.deepEqual(parsed, {
    'channel-1:turn-1': { presentationOverride: 'inline_stack' },
  });
});

test('dismissConcurrentClusterUiState keeps only the most recent bounded entry set', () => {
  let state: ConcurrentClusterUiStateMap = {};
  for (let index = 0; index < MAX_CONCURRENT_CLUSTER_UI_STATE_ENTRIES + 5; index += 1) {
    state = dismissConcurrentClusterUiState(state, {
      channelId: 'channel-1',
      turnId: `turn-${index}`,
    });
  }

  assert.equal(Object.keys(state).length, MAX_CONCURRENT_CLUSTER_UI_STATE_ENTRIES);
  assert.equal(state[buildConcurrentClusterUiStateKey('channel-1', 'turn-0')], undefined);
  assert.deepEqual(
    state[buildConcurrentClusterUiStateKey(
      'channel-1',
      `turn-${MAX_CONCURRENT_CLUSTER_UI_STATE_ENTRIES + 4}`,
    )],
    { presentationOverride: 'inline_stack' },
  );
});

test('writeConcurrentClusterUiStateMap warns when storage writes fail', () => {
  resetConcurrentClusterUiStateStorageWarnings();
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (message?: unknown) => {
    warnings.push(String(message ?? ''));
  };
  try {
    const storage = {
      getItem(): string | null {
        return null;
      },
      setItem(): void {
        throw new Error('quota exceeded');
      },
    };

    writeConcurrentClusterUiStateMap(storage, dismissConcurrentClusterUiState({}, {
      channelId: 'channel-1',
      turnId: 'turn-1',
    }));
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? '', /Failed to write concurrent cluster dismiss state/i);
});

test('writeConcurrentClusterUiStateMap surfaces distinct failure modes across successive calls', () => {
  resetConcurrentClusterUiStateStorageWarnings();
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (message?: unknown) => {
    warnings.push(String(message ?? ''));
  };
  try {
    const makeThrowingStorage = (errorName: string, errorMessage: string) => ({
      getItem(): string | null {
        return null;
      },
      setItem(): void {
        const err = new Error(errorMessage);
        err.name = errorName;
        throw err;
      },
    });
    const dismissed = dismissConcurrentClusterUiState({}, {
      channelId: 'channel-1',
      turnId: 'turn-1',
    });

    writeConcurrentClusterUiStateMap(
      makeThrowingStorage('QuotaExceededError', 'quota full'),
      dismissed,
    );
    writeConcurrentClusterUiStateMap(
      makeThrowingStorage('QuotaExceededError', 'still full'),
      dismissed,
    );
    writeConcurrentClusterUiStateMap(
      makeThrowingStorage('SecurityError', 'disabled'),
      dismissed,
    );
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 2);
  assert.match(warnings[0] ?? '', /quota full/);
  assert.match(warnings[1] ?? '', /disabled/);
});

test('writeConcurrentClusterUiStateMap removes the stored key when every retry fails on a small map', () => {
  resetConcurrentClusterUiStateStorageWarnings();
  let removedKey: string | null = null;
  const storage = {
    getItem(): string | null {
      return null;
    },
    setItem(): void {
      throw new Error('quota exceeded');
    },
    removeItem(key: string): void {
      removedKey = key;
    },
  };
  const dismissed = dismissConcurrentClusterUiState({}, {
    channelId: 'channel-1',
    turnId: 'turn-1',
  });

  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    writeConcurrentClusterUiStateMap(storage, dismissed);
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(removedKey, CONCURRENT_CLUSTER_UI_STATE_STORAGE_KEY);
});

test('writeConcurrentClusterUiStateMap halves the map on retry before giving up on large writes', () => {
  resetConcurrentClusterUiStateStorageWarnings();
  let state: ConcurrentClusterUiStateMap = {};
  for (let index = 0; index < MAX_CONCURRENT_CLUSTER_UI_STATE_ENTRIES; index += 1) {
    state = dismissConcurrentClusterUiState(state, {
      channelId: 'channel-1',
      turnId: `turn-${index}`,
    });
  }
  const setAttempts: number[] = [];
  let committedPayload: string | null = null;
  const storage = {
    getItem(): string | null {
      return null;
    },
    setItem(_key: string, value: string): void {
      const entryCount = Object.keys(JSON.parse(value)).length;
      setAttempts.push(entryCount);
      if (entryCount > 25) {
        throw new Error('quota exceeded');
      }
      committedPayload = value;
    },
  };

  writeConcurrentClusterUiStateMap(storage, state);

  assert.equal(setAttempts[0], MAX_CONCURRENT_CLUSTER_UI_STATE_ENTRIES);
  assert.ok(setAttempts.length >= 2, 'should have attempted at least one halving retry');
  assert.ok(setAttempts.every((count, idx) => idx === 0 || count < setAttempts[idx - 1]!),
    'each retry should shrink the payload');
  assert.ok(committedPayload !== null, 'eventually one of the smaller writes should land');
});

test('loadConcurrentClusterUiStateMap flags dirty storage when parse drops records', () => {
  const storage = {
    getItem(): string | null {
      return JSON.stringify({
        'channel-1:turn-1': { presentationOverride: 'inline_stack' },
        'channel-1:turn-2': { presentationOverride: 'focus_rail' },
      });
    },
    setItem(): void {},
  };

  const loaded = loadConcurrentClusterUiStateMap(storage);

  assert.equal(loaded.requiresPersistedCleanup, true);
  assert.deepEqual(loaded.value, {
    'channel-1:turn-1': { presentationOverride: 'inline_stack' },
  });
});

test('writeConcurrentClusterUiStateMap returns the input identity on a clean write for caller sync', () => {
  resetConcurrentClusterUiStateStorageWarnings();
  const storage = {
    getItem(): string | null {
      return null;
    },
    setItem(): void {},
  };
  const dismissed = dismissConcurrentClusterUiState({}, {
    channelId: 'channel-1',
    turnId: 'turn-1',
  });

  const persisted = writeConcurrentClusterUiStateMap(storage, dismissed);

  assert.strictEqual(persisted, dismissed);
});

test('writeConcurrentClusterUiStateMap returns the shrunk map that actually landed under quota pressure', () => {
  resetConcurrentClusterUiStateStorageWarnings();
  let state: ConcurrentClusterUiStateMap = {};
  for (let index = 0; index < MAX_CONCURRENT_CLUSTER_UI_STATE_ENTRIES; index += 1) {
    state = dismissConcurrentClusterUiState(state, {
      channelId: 'channel-1',
      turnId: `turn-${index}`,
    });
  }
  let persistedCount: number | null = null;
  const storage = {
    getItem(): string | null {
      return null;
    },
    setItem(_key: string, value: string): void {
      const count = Object.keys(JSON.parse(value)).length;
      if (count > 25) {
        throw new Error('quota exceeded');
      }
      persistedCount = count;
    },
  };

  const persisted = writeConcurrentClusterUiStateMap(storage, state);

  assert.notStrictEqual(persisted, state);
  assert.equal(Object.keys(persisted).length, persistedCount);
  assert.ok(Object.keys(persisted).length <= 25);
});

test('writeConcurrentClusterUiStateMap returns the input identity when removeItem itself throws so UI state is not falsely cleared', () => {
  resetConcurrentClusterUiStateStorageWarnings();
  let removeItemAttempts = 0;
  const storage = {
    getItem(): string | null {
      return null;
    },
    setItem(): void {
      throw new Error('quota exceeded');
    },
    removeItem(): void {
      removeItemAttempts += 1;
      throw new Error('security error');
    },
  };
  const dismissed = dismissConcurrentClusterUiState({}, {
    channelId: 'channel-1',
    turnId: 'turn-1',
  });

  const originalWarn = console.warn;
  console.warn = () => {};
  let persisted: ConcurrentClusterUiStateMap;
  try {
    persisted = writeConcurrentClusterUiStateMap(storage, dismissed);
  } finally {
    console.warn = originalWarn;
  }

  // Storage was never actually cleared, so returning {} would make the caller
  // sync in-memory to empty — a lie that a refresh would immediately expose.
  assert.strictEqual(persisted, dismissed);
  assert.equal(removeItemAttempts, 1);
});

test('writeConcurrentClusterUiStateMap returns the input identity when storage has no removeItem and all retries fail', () => {
  resetConcurrentClusterUiStateStorageWarnings();
  const storage = {
    getItem(): string | null {
      return null;
    },
    setItem(): void {
      throw new Error('quota exceeded');
    },
  };
  const dismissed = dismissConcurrentClusterUiState({}, {
    channelId: 'channel-1',
    turnId: 'turn-1',
  });

  const originalWarn = console.warn;
  console.warn = () => {};
  let persisted: ConcurrentClusterUiStateMap;
  try {
    persisted = writeConcurrentClusterUiStateMap(storage, dismissed);
  } finally {
    console.warn = originalWarn;
  }

  // Without removeItem we had no way to clear storage either; must not claim
  // the stored key is empty.
  assert.strictEqual(persisted, dismissed);
});

test('writeConcurrentClusterUiStateMap returns an empty map when it fell back to removeItem', () => {
  resetConcurrentClusterUiStateStorageWarnings();
  let removedKey: string | null = null;
  const storage = {
    getItem(): string | null {
      return null;
    },
    setItem(): void {
      throw new Error('quota exceeded');
    },
    removeItem(key: string): void {
      removedKey = key;
    },
  };
  const dismissed = dismissConcurrentClusterUiState({}, {
    channelId: 'channel-1',
    turnId: 'turn-1',
  });

  const originalWarn = console.warn;
  console.warn = () => {};
  let persisted: ConcurrentClusterUiStateMap;
  try {
    persisted = writeConcurrentClusterUiStateMap(storage, dismissed);
  } finally {
    console.warn = originalWarn;
  }

  assert.deepEqual(persisted, {});
  assert.equal(removedKey, CONCURRENT_CLUSTER_UI_STATE_STORAGE_KEY);
});

test('loadConcurrentClusterUiStateMap reports clean storage when no normalization is required', () => {
  const storage = {
    getItem(): string | null {
      return JSON.stringify({
        'channel-1:turn-1': { presentationOverride: 'inline_stack' },
      });
    },
    setItem(): void {},
  };

  const loaded = loadConcurrentClusterUiStateMap(storage);

  assert.equal(loaded.requiresPersistedCleanup, false);
  assert.deepEqual(loaded.value, {
    'channel-1:turn-1': { presentationOverride: 'inline_stack' },
  });
});

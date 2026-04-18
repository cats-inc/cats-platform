import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GUIDE_CAT_UI_PREFS_DEFAULTS,
  GUIDE_CAT_UI_PREFS_STORAGE_KEY,
  createGuideCatUiPrefsStore,
  deriveGuideCatUiPrefsFromLegacy,
  hydrateGuideCatUiPrefs,
  mergeGuideCatUiPrefs,
  parseStoredGuideCatUiPrefs,
  readLegacyGuideCatUiPrefsInput,
  serializeGuideCatUiPrefs,
  writeStoredGuideCatUiPrefs,
} from '../src/app/renderer/guideCatUiPrefsStore.ts';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class ThrowingStorage extends MemoryStorage {
  override setItem(): void {
    throw new Error('storage unavailable');
  }
}

async function withBrowserStorageHarness(
  run: (harness: {
    storage: MemoryStorage;
    dispatchStorage: (newValue: string | null) => void;
  }) => Promise<void> | void,
): Promise<void> {
  const browserGlobal = globalThis as typeof globalThis & {
    addEventListener?: (type: 'storage', listener: (event: {
      key: string | null;
      newValue: string | null;
    }) => void) => void;
    removeEventListener?: (type: 'storage', listener: (event: {
      key: string | null;
      newValue: string | null;
    }) => void) => void;
    localStorage?: MemoryStorage;
  };
  const originalAddEventListener = browserGlobal.addEventListener;
  const originalRemoveEventListener = browserGlobal.removeEventListener;
  const originalLocalStorage = browserGlobal.localStorage;
  const listeners = new Set<(event: { key: string | null; newValue: string | null }) => void>();
  const storage = new MemoryStorage();

  browserGlobal.addEventListener = (type, listener) => {
    if (type === 'storage') {
      listeners.add(listener);
    }
  };
  browserGlobal.removeEventListener = (type, listener) => {
    if (type === 'storage') {
      listeners.delete(listener);
    }
  };
  browserGlobal.localStorage = storage;

  try {
    await run({
      storage,
      dispatchStorage(newValue) {
        listeners.forEach((listener) => {
          listener({
            key: GUIDE_CAT_UI_PREFS_STORAGE_KEY,
            newValue,
          });
        });
      },
    });
  } finally {
    if (originalAddEventListener) {
      browserGlobal.addEventListener = originalAddEventListener;
    } else {
      delete browserGlobal.addEventListener;
    }
    if (originalRemoveEventListener) {
      browserGlobal.removeEventListener = originalRemoveEventListener;
    } else {
      delete browserGlobal.removeEventListener;
    }
    if (originalLocalStorage) {
      browserGlobal.localStorage = originalLocalStorage;
    } else {
      delete browserGlobal.localStorage;
    }
  }
}

test('parseStoredGuideCatUiPrefs rejects missing or malformed records', () => {
  assert.equal(parseStoredGuideCatUiPrefs(null), null);
  assert.equal(parseStoredGuideCatUiPrefs(''), null);
  assert.equal(parseStoredGuideCatUiPrefs('{'), null);
  assert.equal(parseStoredGuideCatUiPrefs(JSON.stringify({ version: 999 })), null);
});

test('serializeGuideCatUiPrefs round-trips a valid record', () => {
  const prefs = {
    sidecarSeen: true,
    sidecarMode: 'bubble' as const,
    placement: 'docked' as const,
    floatingAnchor: { x: 0.25, y: 0.75 },
  };

  assert.deepEqual(parseStoredGuideCatUiPrefs(serializeGuideCatUiPrefs(prefs)), prefs);
});

test('deriveGuideCatUiPrefsFromLegacy repairs likely race-polluted sidecarSeen=false', () => {
  assert.deepEqual(
    deriveGuideCatUiPrefsFromLegacy({
      sidecarSeen: false,
      sidecarMode: 'bubble',
      placement: 'floating',
      floatingAnchor: null,
    }),
    {
      sidecarSeen: true,
      sidecarMode: 'bubble',
      placement: 'floating',
      floatingAnchor: null,
    },
  );

  assert.deepEqual(
    deriveGuideCatUiPrefsFromLegacy({
      sidecarSeen: false,
      sidecarMode: 'auto',
      placement: 'docked',
      floatingAnchor: null,
    }),
    {
      sidecarSeen: true,
      sidecarMode: 'auto',
      placement: 'docked',
      floatingAnchor: null,
    },
  );
});

test('deriveGuideCatUiPrefsFromLegacy keeps pristine defaults unseen', () => {
  assert.deepEqual(
    deriveGuideCatUiPrefsFromLegacy({
      sidecarSeen: false,
      sidecarMode: 'auto',
      placement: 'floating',
      floatingAnchor: null,
    }),
    GUIDE_CAT_UI_PREFS_DEFAULTS,
  );
});

test('readLegacyGuideCatUiPrefsInput only returns a legacy snapshot when old fields exist', () => {
  assert.equal(readLegacyGuideCatUiPrefsInput({ ownerDisplayName: 'Kenny' }), null);
  assert.deepEqual(
    readLegacyGuideCatUiPrefsInput({
      guideCatSidecarSeen: true,
      guideCatSidecarMode: 'bubble',
      guideCatPlacement: 'docked',
      guideCatFloatingAnchor: { x: 0.4, y: 0.6 },
    }),
    {
      sidecarSeen: true,
      sidecarMode: 'bubble',
      placement: 'docked',
      floatingAnchor: { x: 0.4, y: 0.6 },
    },
  );
});

test('hydrateGuideCatUiPrefs prefers an existing local record over legacy values', () => {
  const storage = new MemoryStorage();
  storage.setItem(
    GUIDE_CAT_UI_PREFS_STORAGE_KEY,
    serializeGuideCatUiPrefs({
      sidecarSeen: true,
      sidecarMode: 'drawer',
      placement: 'docked',
      floatingAnchor: { x: 0.5, y: 0.5 },
    }),
  );

  const result = hydrateGuideCatUiPrefs({
    storage,
    legacy: {
      sidecarSeen: false,
      sidecarMode: 'bubble',
      placement: 'floating',
      floatingAnchor: null,
    },
  });

  assert.equal(result.source, 'local');
  assert.equal(result.persisted, true);
  assert.deepEqual(result.prefs, {
    sidecarSeen: true,
    sidecarMode: 'drawer',
    placement: 'docked',
    floatingAnchor: { x: 0.5, y: 0.5 },
  });
});

test('hydrateGuideCatUiPrefs imports legacy values and persists them locally', () => {
  const storage = new MemoryStorage();
  const result = hydrateGuideCatUiPrefs({
    storage,
    legacy: {
      sidecarSeen: false,
      sidecarMode: 'bubble',
      placement: 'floating',
      floatingAnchor: { x: 0.2, y: 0.8 },
    },
  });

  assert.equal(result.source, 'legacy');
  assert.equal(result.persisted, true);
  assert.deepEqual(result.prefs, {
    sidecarSeen: true,
    sidecarMode: 'bubble',
    placement: 'floating',
    floatingAnchor: { x: 0.2, y: 0.8 },
  });
  assert.deepEqual(
    parseStoredGuideCatUiPrefs(storage.getItem(GUIDE_CAT_UI_PREFS_STORAGE_KEY)),
    result.prefs,
  );
});

test('hydrateGuideCatUiPrefs retries later when local persistence fails', () => {
  const storage = new ThrowingStorage();
  const result = hydrateGuideCatUiPrefs({
    storage,
    legacy: {
      sidecarSeen: true,
      sidecarMode: 'drawer',
      placement: 'docked',
      floatingAnchor: { x: 0.6, y: 0.4 },
    },
  });

  assert.equal(result.source, 'legacy');
  assert.equal(result.persisted, false);
  assert.deepEqual(result.prefs, {
    sidecarSeen: true,
    sidecarMode: 'drawer',
    placement: 'docked',
    floatingAnchor: { x: 0.6, y: 0.4 },
  });
});

test('writeStoredGuideCatUiPrefs persists one atomic record', () => {
  const storage = new MemoryStorage();
  const current = {
    sidecarSeen: false,
    sidecarMode: 'auto' as const,
    placement: 'docked' as const,
    floatingAnchor: { x: 0.1, y: 0.9 },
  };
  const next = mergeGuideCatUiPrefs(current, {
    placement: 'floating',
    floatingAnchor: { x: 0.3, y: 0.4 },
  });

  const result = writeStoredGuideCatUiPrefs(storage, next);

  assert.equal(result.persisted, true);
  assert.deepEqual(
    parseStoredGuideCatUiPrefs(storage.getItem(GUIDE_CAT_UI_PREFS_STORAGE_KEY)),
    {
      sidecarSeen: false,
      sidecarMode: 'auto',
      placement: 'floating',
      floatingAnchor: { x: 0.3, y: 0.4 },
    },
  );
});

test('GuideCatUiPrefsStore hydrates once and notifies subscribers on durable updates', () => {
  const storage = new MemoryStorage();
  const store = createGuideCatUiPrefsStore(storage);
  let notifications = 0;
  const unsubscribe = store.subscribe(() => {
    notifications += 1;
  });

  store.ensureHydrated({
    sidecarSeen: false,
    sidecarMode: 'bubble',
    placement: 'floating',
    floatingAnchor: { x: 0.2, y: 0.8 },
  });
  store.ensureHydrated({
    sidecarSeen: true,
    sidecarMode: 'drawer',
    placement: 'docked',
    floatingAnchor: { x: 0.9, y: 0.1 },
  });

  assert.deepEqual(store.getSnapshot(), {
    sidecarSeen: true,
    sidecarMode: 'bubble',
    placement: 'floating',
    floatingAnchor: { x: 0.2, y: 0.8 },
  });

  store.update({
    placement: 'docked',
    floatingAnchor: { x: 0.3, y: 0.4 },
  });

  assert.equal(notifications, 1);
  assert.deepEqual(store.getSnapshot(), {
    sidecarSeen: true,
    sidecarMode: 'bubble',
    placement: 'docked',
    floatingAnchor: { x: 0.3, y: 0.4 },
  });
  assert.deepEqual(
    parseStoredGuideCatUiPrefs(storage.getItem(GUIDE_CAT_UI_PREFS_STORAGE_KEY)),
    store.getSnapshot(),
  );

  unsubscribe();
});

test('GuideCatUiPrefsStore reconciles external storage updates from another window', async () => {
  await withBrowserStorageHarness(async ({ storage, dispatchStorage }) => {
    const store = createGuideCatUiPrefsStore(storage);
    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });

    store.ensureHydrated({
      sidecarSeen: false,
      sidecarMode: 'auto',
      placement: 'floating',
      floatingAnchor: null,
    });

    storage.setItem(
      GUIDE_CAT_UI_PREFS_STORAGE_KEY,
      serializeGuideCatUiPrefs({
        sidecarSeen: true,
        sidecarMode: 'bubble',
        placement: 'docked',
        floatingAnchor: { x: 0.7, y: 0.3 },
      }),
    );
    dispatchStorage(storage.getItem(GUIDE_CAT_UI_PREFS_STORAGE_KEY));

    assert.equal(notifications, 1);
    assert.deepEqual(store.getSnapshot(), {
      sidecarSeen: true,
      sidecarMode: 'bubble',
      placement: 'docked',
      floatingAnchor: { x: 0.7, y: 0.3 },
    });

    unsubscribe();
  });
});

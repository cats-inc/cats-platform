import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GUIDE_CAT_UI_PREFS_DEFAULTS,
  GUIDE_CAT_UI_PREFS_STORAGE_KEY,
  createGuideCatUiPrefsStore,
  hydrateGuideCatUiPrefs,
  mergeGuideCatUiPrefs,
  parseStoredGuideCatUiPrefs,
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
    dispatchStorage: (options: {
      key?: string | null;
      newValue: string | null;
    }) => void;
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
      dispatchStorage({ key = GUIDE_CAT_UI_PREFS_STORAGE_KEY, newValue }) {
        listeners.forEach((listener) => {
          listener({
            key,
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

test('hydrateGuideCatUiPrefs prefers an existing local record over defaults', () => {
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

test('hydrateGuideCatUiPrefs falls back to defaults and persists them locally', () => {
  const storage = new MemoryStorage();
  const result = hydrateGuideCatUiPrefs({
    storage,
  });

  assert.equal(result.source, 'defaults');
  assert.equal(result.persisted, true);
  assert.deepEqual(result.prefs, GUIDE_CAT_UI_PREFS_DEFAULTS);
  assert.deepEqual(
    parseStoredGuideCatUiPrefs(storage.getItem(GUIDE_CAT_UI_PREFS_STORAGE_KEY)),
    result.prefs,
  );
});

test('hydrateGuideCatUiPrefs keeps defaults in memory when local persistence fails', () => {
  const storage = new ThrowingStorage();
  const result = hydrateGuideCatUiPrefs({
    storage,
  });

  assert.equal(result.source, 'defaults');
  assert.equal(result.persisted, false);
  assert.deepEqual(result.prefs, GUIDE_CAT_UI_PREFS_DEFAULTS);
});

test('hydrateGuideCatUiPrefs does not overwrite malformed stored records during bootstrap', () => {
  const storage = new MemoryStorage();
  storage.setItem(GUIDE_CAT_UI_PREFS_STORAGE_KEY, '{');
  const originalWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (message?: unknown) => {
    warnings.push(String(message ?? ''));
  };

  try {
    const result = hydrateGuideCatUiPrefs({
      storage,
    });

    assert.equal(result.source, 'defaults');
    assert.equal(result.persisted, false);
    assert.deepEqual(result.prefs, GUIDE_CAT_UI_PREFS_DEFAULTS);
    assert.equal(storage.getItem(GUIDE_CAT_UI_PREFS_STORAGE_KEY), '{');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0] ?? '', /Ignoring unsupported or malformed stored prefs/u);
  } finally {
    console.warn = originalWarn;
  }
});

test('hydrateGuideCatUiPrefs does not overwrite unsupported stored schema versions', () => {
  const storage = new MemoryStorage();
  const unsupportedRecord = JSON.stringify({
    version: 2,
    sidecarSeen: true,
    sidecarMode: 'bubble',
    placement: 'docked',
    floatingAnchor: { x: 0.2, y: 0.8 },
  });
  storage.setItem(GUIDE_CAT_UI_PREFS_STORAGE_KEY, unsupportedRecord);

  const result = hydrateGuideCatUiPrefs({
    storage,
  });

  assert.equal(result.source, 'defaults');
  assert.equal(result.persisted, false);
  assert.deepEqual(result.prefs, GUIDE_CAT_UI_PREFS_DEFAULTS);
  assert.equal(storage.getItem(GUIDE_CAT_UI_PREFS_STORAGE_KEY), unsupportedRecord);
});

test('hydrateGuideCatUiPrefs retries local persistence on a later startup', () => {
  const firstStartup = hydrateGuideCatUiPrefs({
    storage: new ThrowingStorage(),
  });
  assert.equal(firstStartup.persisted, false);

  const secondStorage = new MemoryStorage();
  const secondStartup = hydrateGuideCatUiPrefs({
    storage: secondStorage,
  });

  assert.equal(secondStartup.source, 'defaults');
  assert.equal(secondStartup.persisted, true);
  assert.deepEqual(
    parseStoredGuideCatUiPrefs(secondStorage.getItem(GUIDE_CAT_UI_PREFS_STORAGE_KEY)),
    GUIDE_CAT_UI_PREFS_DEFAULTS,
  );
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

  store.ensureHydrated();
  store.ensureHydrated();

  assert.deepEqual(store.getSnapshot(), GUIDE_CAT_UI_PREFS_DEFAULTS);

  store.update({
    placement: 'docked',
    floatingAnchor: { x: 0.3, y: 0.4 },
  });

  assert.equal(notifications, 1);
  assert.deepEqual(store.getSnapshot(), {
    ...GUIDE_CAT_UI_PREFS_DEFAULTS,
    placement: 'docked',
    floatingAnchor: { x: 0.3, y: 0.4 },
  });
  assert.deepEqual(
    parseStoredGuideCatUiPrefs(storage.getItem(GUIDE_CAT_UI_PREFS_STORAGE_KEY)),
    store.getSnapshot(),
  );

  unsubscribe();
});

test('GuideCatUiPrefsStore replaces an invalid stored record on the next durable write', () => {
  const storage = new MemoryStorage();
  storage.setItem(GUIDE_CAT_UI_PREFS_STORAGE_KEY, '{');
  const store = createGuideCatUiPrefsStore(storage);

  store.ensureHydrated();

  assert.deepEqual(store.getSnapshot(), GUIDE_CAT_UI_PREFS_DEFAULTS);
  assert.equal(storage.getItem(GUIDE_CAT_UI_PREFS_STORAGE_KEY), '{');

  store.update({
    sidecarMode: 'bubble',
  });

  assert.deepEqual(store.getSnapshot(), {
    ...GUIDE_CAT_UI_PREFS_DEFAULTS,
    sidecarMode: 'bubble',
  });
  assert.deepEqual(
    parseStoredGuideCatUiPrefs(storage.getItem(GUIDE_CAT_UI_PREFS_STORAGE_KEY)),
    {
      ...GUIDE_CAT_UI_PREFS_DEFAULTS,
      sidecarMode: 'bubble',
    },
  );
});

test('GuideCatUiPrefsStore reconciles external storage updates from another window', async () => {
  await withBrowserStorageHarness(async ({ storage, dispatchStorage }) => {
    const store = createGuideCatUiPrefsStore(storage);
    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });

    store.ensureHydrated();

    storage.setItem(
      GUIDE_CAT_UI_PREFS_STORAGE_KEY,
      serializeGuideCatUiPrefs({
        sidecarSeen: true,
        sidecarMode: 'bubble',
        placement: 'docked',
        floatingAnchor: { x: 0.7, y: 0.3 },
      }),
    );
    dispatchStorage({
      newValue: storage.getItem(GUIDE_CAT_UI_PREFS_STORAGE_KEY),
    });

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

test('GuideCatUiPrefsStore ignores invalid storage events and keeps the current snapshot', async () => {
  await withBrowserStorageHarness(async ({ storage, dispatchStorage }) => {
    const store = createGuideCatUiPrefsStore(storage);
    let notifications = 0;
    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (message?: unknown) => {
      warnings.push(String(message ?? ''));
    };
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });

    try {
      store.ensureHydrated();
      store.update({
        sidecarMode: 'bubble',
        placement: 'docked',
        floatingAnchor: { x: 0.7, y: 0.3 },
      });
      notifications = 0;

      dispatchStorage({
        newValue: JSON.stringify({
          version: 2,
          sidecarSeen: true,
          sidecarMode: 'drawer',
          placement: 'floating',
          floatingAnchor: { x: 0.1, y: 0.1 },
        }),
      });

      assert.equal(notifications, 0);
      assert.deepEqual(store.getSnapshot(), {
        ...GUIDE_CAT_UI_PREFS_DEFAULTS,
        sidecarMode: 'bubble',
        placement: 'docked',
        floatingAnchor: { x: 0.7, y: 0.3 },
      });
      assert.equal(warnings.length, 1);
      assert.match(warnings[0] ?? '', /Ignoring unsupported or malformed stored prefs/u);
    } finally {
      console.warn = originalWarn;
      unsubscribe();
    }
  });
});

test('GuideCatUiPrefsStore falls back to defaults when another window clears the stored key', async () => {
  await withBrowserStorageHarness(async ({ storage, dispatchStorage }) => {
    const store = createGuideCatUiPrefsStore(storage);
    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });

    try {
      store.ensureHydrated();
      store.update({
        sidecarSeen: true,
        sidecarMode: 'bubble',
      });
      notifications = 0;

      dispatchStorage({
        newValue: null,
      });

      assert.equal(notifications, 1);
      assert.deepEqual(store.getSnapshot(), GUIDE_CAT_UI_PREFS_DEFAULTS);
    } finally {
      unsubscribe();
    }
  });
});

test('GuideCatUiPrefsStore ignores storage events for other keys', async () => {
  await withBrowserStorageHarness(async ({ storage, dispatchStorage }) => {
    const store = createGuideCatUiPrefsStore(storage);
    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });

    store.ensureHydrated();

    dispatchStorage({
      key: 'cats.some-other-setting',
      newValue: serializeGuideCatUiPrefs({
        sidecarSeen: true,
        sidecarMode: 'bubble',
        placement: 'docked',
        floatingAnchor: { x: 0.4, y: 0.6 },
      }),
    });

    assert.equal(notifications, 0);
    assert.deepEqual(store.getSnapshot(), GUIDE_CAT_UI_PREFS_DEFAULTS);

    unsubscribe();
  });
});

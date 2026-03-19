import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseStoredSidebarOpen,
  readSidebarOpenPreference,
  SIDEBAR_OPEN_STORAGE_KEY,
  writeSidebarOpenPreference,
} from '../dist-server/shared/sidebarPreference.js';

test('parseStoredSidebarOpen defaults to open unless explicitly collapsed', () => {
  assert.equal(parseStoredSidebarOpen(null), true);
  assert.equal(parseStoredSidebarOpen(undefined), true);
  assert.equal(parseStoredSidebarOpen('open'), true);
  assert.equal(parseStoredSidebarOpen('collapsed'), false);
});

test('sidebar preference helpers read and write the collapsed state', () => {
  const storage = new Map();
  const fakeStorage = {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(key, value);
    },
  };

  assert.equal(readSidebarOpenPreference(fakeStorage), true);

  writeSidebarOpenPreference(fakeStorage, false);
  assert.equal(storage.get(SIDEBAR_OPEN_STORAGE_KEY), 'collapsed');
  assert.equal(readSidebarOpenPreference(fakeStorage), false);

  writeSidebarOpenPreference(fakeStorage, true);
  assert.equal(storage.get(SIDEBAR_OPEN_STORAGE_KEY), 'open');
  assert.equal(readSidebarOpenPreference(fakeStorage), true);
});

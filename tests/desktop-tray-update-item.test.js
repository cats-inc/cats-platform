import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDesktopTrayMenuState,
  buildDesktopTrayUpdateItem,
} from '../build/desktop/trayMenu.js';
import { createUnavailableDesktopUpdateSnapshot } from '../build/desktop/updateManager.js';

function snapshot(overrides = {}) {
  const base = createUnavailableDesktopUpdateSnapshot('0.2.0');
  return {
    ...base,
    capability: {
      ...base.capability,
      distribution: 'official_packaged',
      canCheck: true,
      canDownload: true,
      canInstall: true,
    },
    status: 'idle',
    nextAction: 'check',
    ...overrides,
  };
}

test('the tray hides the update item for builds without update capability', () => {
  assert.equal(buildDesktopTrayUpdateItem(null), null);
  assert.equal(buildDesktopTrayUpdateItem(undefined), null);
  assert.equal(
    buildDesktopTrayUpdateItem(createUnavailableDesktopUpdateSnapshot('0.2.0')),
    null,
  );
});

test('the tray offers a check while the host is idle', () => {
  assert.deepEqual(buildDesktopTrayUpdateItem(snapshot()), {
    label: 'Check for Updates…',
    enabled: true,
    intent: 'check',
  });
  assert.deepEqual(buildDesktopTrayUpdateItem(snapshot({ status: 'up_to_date' })), {
    label: 'Check for Updates…',
    enabled: true,
    intent: 'check',
  });
  assert.deepEqual(buildDesktopTrayUpdateItem(snapshot({ status: 'failed' })), {
    label: 'Check for Updates…',
    enabled: true,
    intent: 'check',
  });
});

test('the tray disables the item while an operation is in flight', () => {
  for (const status of ['checking', 'installing']) {
    const item = buildDesktopTrayUpdateItem(snapshot({ status }));
    assert.equal(item.enabled, false, status);
  }
});

test('the tray reports truthful download progress and stays disabled', () => {
  const item = buildDesktopTrayUpdateItem(snapshot({
    status: 'downloading',
    progress: { percent: 42.7, transferredBytes: 1, totalBytes: 2, bytesPerSecond: 3 },
  }));

  assert.equal(item.label, 'Downloading Update… 43%');
  assert.equal(item.enabled, false);
});

test('the tray shows zero percent before the first progress event', () => {
  const item = buildDesktopTrayUpdateItem(snapshot({ status: 'downloading', progress: null }));

  assert.equal(item.label, 'Downloading Update… 0%');
});

test('actionable update states route the user to Settings rather than acting from the tray', () => {
  for (const status of ['update_available', 'downloaded']) {
    const item = buildDesktopTrayUpdateItem(snapshot({ status }));
    assert.equal(item.enabled, true, status);
    assert.equal(item.intent, 'open_settings', status);
  }
});

test('tray update labels are localized for Traditional Chinese', () => {
  assert.equal(buildDesktopTrayUpdateItem(snapshot(), 'zh-TW').label, '檢查更新…');
  assert.equal(
    buildDesktopTrayUpdateItem(snapshot({ status: 'checking' }), 'zh-TW').label,
    '正在檢查更新…',
  );
  assert.equal(
    buildDesktopTrayUpdateItem(snapshot({ status: 'update_available' }), 'zh_tw').label,
    '有可用更新…',
  );
  assert.equal(
    buildDesktopTrayUpdateItem(snapshot({ status: 'downloaded' }), 'zh-Hant').label,
    '重新啟動以更新…',
  );
  assert.equal(
    buildDesktopTrayUpdateItem(snapshot({ status: 'installing' }), 'zh-TW').label,
    '正在安裝更新…',
  );
});

test('a preview build labels its tray entry as a preview', () => {
  const preview = snapshot({
    capability: {
      ...snapshot().capability,
      distribution: 'preview_packaged',
    },
  });

  assert.equal(buildDesktopTrayUpdateItem(preview).label, 'Check for Updates… (preview)');
  assert.equal(buildDesktopTrayUpdateItem(preview, 'zh-TW').label, '檢查更新…（預覽）');
  assert.equal(
    buildDesktopTrayUpdateItem(preview, 'zh-TW').label.includes('預覽'),
    true,
  );
});

test('an official build carries no preview marker', () => {
  assert.equal(buildDesktopTrayUpdateItem(snapshot()).label, 'Check for Updates…');
  assert.equal(buildDesktopTrayUpdateItem(snapshot()).label.includes('preview'), false);
});

test('the tray menu state carries the update item alongside existing entries', () => {
  const state = buildDesktopTrayMenuState({
    phase: 'ready_for_chat',
    summary: 'Desktop services and at least one provider path are ready.',
    setupCompleteAt: '2026-07-29T10:00:00.000Z',
    actions: [{ id: 'open_chat', label: 'Open Cats', primary: true }],
    products: [],
    updates: snapshot(),
  });

  assert.deepEqual(state.updateItem, {
    label: 'Check for Updates…',
    enabled: true,
    intent: 'check',
  });
  assert.equal(state.actions.length, 1);
});

test('the tray menu state omits the update item when capability is closed', () => {
  const state = buildDesktopTrayMenuState({
    phase: 'ready_for_chat',
    summary: 'Desktop services and at least one provider path are ready.',
    setupCompleteAt: null,
    actions: [],
    products: [],
    updates: createUnavailableDesktopUpdateSnapshot('0.2.0'),
  });

  assert.equal(state.updateItem, null);
});

test('a menu state built without update input has no update item', () => {
  const state = buildDesktopTrayMenuState({
    phase: 'starting_services',
    summary: 'Starting Cats services.',
    setupCompleteAt: null,
    actions: [],
    products: [],
  });

  assert.equal(state.updateItem, null);
});

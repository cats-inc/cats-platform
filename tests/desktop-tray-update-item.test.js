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

test('actionable update states route a set-up host to Settings', () => {
  for (const status of ['update_available', 'downloaded']) {
    const item = buildDesktopTrayUpdateItem(snapshot({ status }), null, { setupComplete: true });
    assert.equal(item.enabled, true, status);
    assert.equal(item.intent, 'open_settings', status);
  }
});

/**
 * The tray withholds its Settings entry until setup completes, so an update
 * item that hands out a Settings sub-page before then walks the user into the
 * setup gate instead of an update -- and someone parked on the bootstrap
 * screen is exactly who most needs the build that fixes it. Downloading and
 * installing do not depend on setup, so the tray drives them itself.
 */
test('before setup the tray drives the update itself instead of pointing at Settings', () => {
  const available = buildDesktopTrayUpdateItem(snapshot({ status: 'update_available' }));
  assert.equal(available.enabled, true);
  assert.equal(available.intent, 'download');
  // The click downloads, so the label has to promise that and not a page.
  assert.equal(available.label, 'Download Update…');

  const downloaded = buildDesktopTrayUpdateItem(snapshot({ status: 'downloaded' }));
  assert.equal(downloaded.enabled, true);
  assert.equal(downloaded.intent, 'install');
  assert.equal(downloaded.label, 'Restart to Update…');
});

test('an unspecified setup state falls back to the flow that works in both', () => {
  for (const status of ['update_available', 'downloaded']) {
    const item = buildDesktopTrayUpdateItem(snapshot({ status }));
    assert.notEqual(
      item.intent,
      'open_settings',
      `${status} must not assume a Settings surface the caller never vouched for`,
    );
  }
});

test('the menu state derives the update intent from its own setup state', () => {
  const base = {
    phase: 'ready_for_setup',
    summary: 'Desktop services are ready. Continue into setup.',
    actions: [],
    products: [],
    updates: snapshot({ status: 'update_available' }),
  };

  assert.equal(
    buildDesktopTrayMenuState({ ...base, setupCompleteAt: null }).updateItem.intent,
    'download',
  );
  assert.equal(
    buildDesktopTrayMenuState({
      ...base,
      setupCompleteAt: '2026-07-29T10:00:00.000Z',
    }).updateItem.intent,
    'open_settings',
  );
  // fallbackSetupCompleteAt counts as setup being done, same as it does for
  // the product entries.
  assert.equal(
    buildDesktopTrayMenuState({
      ...base,
      setupCompleteAt: null,
      fallbackSetupCompleteAt: '2026-07-29T10:00:00.000Z',
    }).updateItem.intent,
    'open_settings',
  );
});

test('tray update labels are localized for Traditional Chinese', () => {
  assert.equal(buildDesktopTrayUpdateItem(snapshot(), 'zh-TW').label, '檢查更新…');
  assert.equal(
    buildDesktopTrayUpdateItem(snapshot({ status: 'checking' }), 'zh-TW').label,
    '正在檢查更新…',
  );
  assert.equal(
    buildDesktopTrayUpdateItem(
      snapshot({ status: 'update_available' }),
      'zh_tw',
      { setupComplete: true },
    ).label,
    '有可用更新…',
  );
  assert.equal(
    buildDesktopTrayUpdateItem(snapshot({ status: 'update_available' }), 'zh_tw').label,
    '下載更新…',
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

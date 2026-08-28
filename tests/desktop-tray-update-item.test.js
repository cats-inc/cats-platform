import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDesktopTrayMenuState,
  buildDesktopTrayTooltip,
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

/**
 * The tray is a complete update path, not a shortcut into Settings. Routing an
 * actionable state to /settings/desktop used to strand anyone whose setup was
 * unfinished -- the tray withholds its own Settings entry until setup completes
 * -- and offered nothing to a set-up user that the tray could not do itself.
 * Settings stays as the detail surface and drives the same manager.
 */
/**
 * One decision, not three. The item used to say "Download Update…" and then,
 * on the next visit, "Restart to Update…" -- so completing an update meant
 * opening the tray three times, and the same menu position meant something
 * different each time. Every mainstream desktop updater asks once and then
 * finishes. `install` survives only as the recovery path for a download that
 * landed without the install following it.
 */
test('an available update is one click that names where it goes', () => {
  const item = buildDesktopTrayUpdateItem(snapshot({
    status: 'update_available',
    availableVersion: '0.1.15',
  }));

  assert.equal(item.enabled, true);
  assert.equal(item.intent, 'update');
  assert.equal(item.label, 'Update to 0.1.15…');
  assert.equal(item.intent === 'download', false, 'the click is the whole update, not a step');
});

test('an available update without a version still offers the update', () => {
  const item = buildDesktopTrayUpdateItem(snapshot({
    status: 'update_available',
    availableVersion: null,
  }));

  assert.equal(item.label, 'Update Cats…');
  assert.equal(item.intent, 'update');
});

test('a downloaded update stays applyable as a recovery path', () => {
  const item = buildDesktopTrayUpdateItem(snapshot({ status: 'downloaded' }));

  assert.equal(item.enabled, true);
  assert.equal(item.intent, 'install');
  assert.equal(item.label, 'Restart to Update…');
});

test('no update state hands the user to Settings', () => {
  for (const status of ['idle', 'checking', 'update_available', 'downloading', 'downloaded', 'installing']) {
    const item = buildDesktopTrayUpdateItem(snapshot({ status, availableVersion: '0.1.15' }));
    assert.notEqual(item.intent, 'open_settings', status);
  }
});

test('no update state depends on how far setup got', () => {
  const base = {
    phase: 'ready_for_setup',
    summary: 'Desktop services are ready. Continue into setup.',
    actions: [],
    products: [],
  };

  for (const status of ['update_available', 'downloaded', 'idle']) {
    const unfinished = buildDesktopTrayMenuState({
      ...base,
      setupCompleteAt: null,
      updates: snapshot({ status }),
    });
    const complete = buildDesktopTrayMenuState({
      ...base,
      setupCompleteAt: '2026-07-29T10:00:00.000Z',
      updates: snapshot({ status }),
    });

    assert.deepEqual(unfinished.updateItem, complete.updateItem, status);
    assert.notEqual(unfinished.updateItem.intent, 'open_settings', status);
  }
});

test('tray update labels are localized for Traditional Chinese', () => {
  assert.equal(buildDesktopTrayUpdateItem(snapshot(), 'zh-TW').label, '檢查更新…');
  assert.equal(
    buildDesktopTrayUpdateItem(snapshot({ status: 'checking' }), 'zh-TW').label,
    '正在檢查更新…',
  );
  assert.equal(
    buildDesktopTrayUpdateItem(
      snapshot({ status: 'update_available', availableVersion: '0.1.15' }),
      'zh_tw',
    ).label,
    '更新到 0.1.15…',
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

/**
 * A native context menu does not repaint when the menu behind it is rebuilt,
 * so the percentage on the menu item is only visible to someone who closes and
 * reopens it. The tooltip is the surface that can actually be watched.
 */
test('the tray tooltip carries download progress and nothing else', () => {
  assert.equal(
    buildDesktopTrayTooltip(snapshot({
      status: 'downloading',
      progress: { percent: 42.7, transferredBytes: 1, totalBytes: 2, bytesPerSecond: 3 },
    })),
    'Cats — Downloading Update… 43%',
  );
  assert.equal(
    buildDesktopTrayTooltip(snapshot({ status: 'downloading', progress: null })),
    'Cats — Downloading Update… 0%',
  );
  assert.equal(
    buildDesktopTrayTooltip(
      snapshot({
        status: 'downloading',
        progress: { percent: 7, transferredBytes: 1, totalBytes: 2, bytesPerSecond: 3 },
      }),
      'zh-TW',
    ),
    'Cats — 正在下載更新… 7%',
  );

  // Every other state has somewhere better to be read, so the tooltip stays
  // the plain product name rather than narrating the state machine.
  for (const status of ['idle', 'checking', 'update_available', 'downloaded', 'installing', 'failed']) {
    assert.equal(buildDesktopTrayTooltip(snapshot({ status })), 'Cats', status);
  }
  assert.equal(buildDesktopTrayTooltip(null), 'Cats');
});

test('the menu state carries the tooltip alongside the item', () => {
  const state = buildDesktopTrayMenuState({
    phase: 'ready_for_chat',
    summary: 'Desktop services and at least one provider path are ready.',
    setupCompleteAt: '2026-07-29T10:00:00.000Z',
    actions: [],
    products: [],
    updates: snapshot({
      status: 'downloading',
      progress: { percent: 55, transferredBytes: 1, totalBytes: 2, bytesPerSecond: 3 },
    }),
  });

  assert.equal(state.tooltip, 'Cats — Downloading Update… 55%');
});

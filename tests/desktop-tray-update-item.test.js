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

/**
 * The item is a question with one fixed label; the dialog is the answer.
 *
 * A tray menu closes the moment it is clicked, so a label that tracked the
 * update state asked the user to reopen the menu just to find out where they
 * were -- and to re-read the item before every press to learn what pressing it
 * would do now. Progress in particular was decoration: nobody reopens a tray
 * menu to watch a percentage.
 */
test('the update item reads the same in every state', () => {
  const seen = new Set();
  for (const status of [
    'idle', 'checking', 'up_to_date', 'update_available',
    'downloading', 'downloaded', 'installing', 'failed',
  ]) {
    const item = buildDesktopTrayUpdateItem(snapshot({
      status,
      availableVersion: '0.1.17',
      progress: { percent: 42, transferredBytes: 1, totalBytes: 2, bytesPerSecond: 3 },
    }));
    seen.add(item.label);
    assert.equal(item.intent, 'open', status);
    // Always pressable: asking where the update got to is exactly what a user
    // does while waiting, and the dialog answers that.
    assert.equal(item.enabled, true, status);
  }

  assert.deepEqual([...seen], ['Check for Updates…']);
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
    intent: 'open',
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

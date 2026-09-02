import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveDesktopUpdateDialog,
  shouldRefreshDesktopUpdateFromTray,
} from '../build/desktop/updateDialog.js';
import { createUnavailableDesktopUpdateSnapshot } from '../build/desktop/updateManager.js';

/**
 * The tray item is a question with one fixed label; this dialog is the answer.
 * A tray menu closes the moment it is clicked, so every result -- including
 * progress, which nobody reopens a menu to watch -- has to be reachable here.
 */

function snapshot(overrides = {}) {
  const base = createUnavailableDesktopUpdateSnapshot('0.1.16');
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
    currentVersion: '0.1.16',
    nextAction: 'check',
    ...overrides,
  };
}

function dialogFor(overrides, platform = 'win32', locale = undefined) {
  return resolveDesktopUpdateDialog({ snapshot: snapshot(overrides), platform, locale });
}

const EVERY_STATUS = [
  'idle', 'checking', 'up_to_date', 'update_available',
  'downloading', 'downloaded', 'installing', 'failed',
];

test('every state has an answer, and every answer has a way out', () => {
  for (const status of EVERY_STATUS) {
    const spec = dialogFor({ status, availableVersion: '0.1.17' });

    assert.ok(spec.title, status);
    assert.ok(spec.message, status);
    assert.ok(spec.buttons.length >= 1, status);
    // The last button is always the dismissal, so cancelId can point at it.
    assert.ok(['OK', 'Later'].includes(spec.buttons[spec.buttons.length - 1]), status);
  }
});

test('only the states with something to decide offer a decision', () => {
  assert.equal(dialogFor({ status: 'update_available', availableVersion: '0.1.17' }).action, 'update');
  assert.equal(dialogFor({ status: 'downloaded' }).action, 'install');
  assert.equal(dialogFor({ status: 'idle' }).action, 'check');

  // Nothing to decide: an operation is running, or the answer is just news.
  for (const status of ['checking', 'downloading', 'installing', 'up_to_date', 'failed']) {
    const spec = dialogFor({ status });
    assert.equal(spec.action, 'none', status);
    assert.deepEqual(spec.buttons, ['OK'], status);
  }
});

test('the download percentage is reachable from the dialog', () => {
  const spec = dialogFor({
    status: 'downloading',
    progress: { percent: 42.7, transferredBytes: 1, totalBytes: 2, bytesPerSecond: 3 },
  });

  assert.match(spec.message, /43%/u);
  assert.equal(spec.action, 'none');

  // Before the first progress event there is still an honest answer.
  assert.match(dialogFor({ status: 'downloading', progress: null }).message, /0%/u);
});

test('an offer names both versions and what the platform will do', () => {
  const spec = dialogFor({ status: 'update_available', availableVersion: '0.1.17' });

  assert.match(spec.message, /0\.1\.17/u);
  assert.match(spec.detail, /0\.1\.16/u, 'the user should see what they are leaving');
  assert.match(spec.detail, /Windows installer/u);
  assert.equal(spec.buttons[0], 'Update and Restart');

  assert.match(
    dialogFor({ status: 'update_available', availableVersion: '0.1.17' }, 'linux').detail,
    /dpkg.*password/su,
  );
  assert.match(
    dialogFor({ status: 'update_available', availableVersion: '0.1.17' }, 'darwin').detail,
    /replaced\s+in place/su,
  );
  // No packaged installer exists elsewhere, so name no mechanism at all.
  const generic = dialogFor({ status: 'update_available', availableVersion: '0.1.17' }, 'aix').detail;
  for (const mechanism of [/Windows/u, /dpkg/u, /in place/u]) {
    assert.equal(mechanism.test(generic), false, String(mechanism));
  }
});

test('up to date says which version that is', () => {
  const spec = dialogFor({ status: 'up_to_date' });

  assert.match(spec.message, /0\.1\.16/u);
  assert.equal(spec.action, 'none');
});

test('an explicit tray check refreshes repeatable results exactly once', () => {
  for (const status of ['idle', 'up_to_date', 'failed']) {
    const repeatable = snapshot({ status, nextAction: 'check' });

    assert.equal(shouldRefreshDesktopUpdateFromTray(repeatable, true), true, status);
    assert.equal(shouldRefreshDesktopUpdateFromTray(repeatable, false), false, status);
  }

  assert.equal(
    shouldRefreshDesktopUpdateFromTray(snapshot({
      status: 'update_available',
      nextAction: 'download',
    }), true),
    false,
  );
  assert.equal(
    shouldRefreshDesktopUpdateFromTray(createUnavailableDesktopUpdateSnapshot('0.1.16'), true),
    false,
  );
});

test('a build that cannot update says so instead of offering a check', () => {
  const spec = resolveDesktopUpdateDialog({
    snapshot: createUnavailableDesktopUpdateSnapshot('0.1.16'),
    platform: 'win32',
  });

  assert.match(spec.message, /cannot update itself/u);
  assert.equal(spec.action, 'none');
});

test('a preview build says so in every dialog title', () => {
  for (const status of EVERY_STATUS) {
    const spec = resolveDesktopUpdateDialog({
      snapshot: snapshot({
        status,
        availableVersion: '0.1.17',
        capability: { ...snapshot().capability, distribution: 'preview_packaged' },
      }),
      platform: 'win32',
    });
    assert.match(spec.title, /\(preview\)$/u, status);
  }
});

test('the dialog is localized for Traditional Chinese', () => {
  const offer = dialogFor({ status: 'update_available', availableVersion: '0.1.17' }, 'win32', 'zh-TW');
  assert.equal(offer.title, '有可用更新');
  assert.equal(offer.buttons[0], '更新並重新啟動');
  assert.equal(offer.buttons[1], '稍後');
  assert.match(offer.detail, /Windows 安裝程式/u);

  assert.equal(dialogFor({ status: 'up_to_date' }, 'win32', 'zh-TW').title, 'Cats 已是最新版本');
  assert.match(
    dialogFor({ status: 'downloading', progress: null }, 'win32', 'zh-Hant').message,
    /正在下載更新/u,
  );
  assert.match(
    dialogFor({ status: 'update_available', availableVersion: '0.1.17' }, 'linux', 'zh-TW').detail,
    /dpkg/u,
  );
});

test('an unknown locale falls back to English rather than an empty dialog', () => {
  const spec = dialogFor({ status: 'up_to_date' }, 'win32', 'de-DE');

  assert.equal(spec.title, 'Cats is up to date');
  assert.ok(spec.message.length > 0);
});

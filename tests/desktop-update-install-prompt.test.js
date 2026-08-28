import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveDesktopInstallConfirmation,
} from '../build/desktop/updateInstallPrompt.js';

/**
 * The tray finishes an update without ever opening a window, so this dialog is
 * the last point at which a user learns the app is about to exit and what the
 * platform installer will do. Settings says it inline; the tray has nowhere to
 * put it but here.
 */

test('every platform confirmation says the app will close and comes back', () => {
  for (const platform of ['win32', 'linux', 'darwin', 'freebsd']) {
    const confirmation = resolveDesktopInstallConfirmation({ platform });

    assert.equal(confirmation.title, 'Install the update?');
    assert.match(confirmation.message, /close/i, platform);
    assert.match(confirmation.detail, /reopens/i, platform);
    assert.equal(confirmation.confirmLabel, 'Install and Restart');
    assert.equal(confirmation.cancelLabel, 'Cancel');
  }
});

test('the detail names what each platform actually does', () => {
  // An assisted NSIS installer, so a wizard appears and may ask where to go.
  assert.match(
    resolveDesktopInstallConfirmation({ platform: 'win32' }).detail,
    /Windows installer.*installation folder/su,
  );
  // SPEC-111 section 8: the "no elevation prompt" guarantee is specific to the
  // per-user Windows installer and does not extend to a .deb install.
  assert.match(
    resolveDesktopInstallConfirmation({ platform: 'linux' }).detail,
    /dpkg.*password/su,
  );
  assert.match(
    resolveDesktopInstallConfirmation({ platform: 'darwin' }).detail,
    /replaced in place/su,
  );
});

test('an unpackaged platform claims no installer mechanism it does not have', () => {
  const detail = resolveDesktopInstallConfirmation({ platform: 'aix' }).detail;

  assert.equal(detail, 'Cats reopens once the install finishes.');
  for (const mechanism of [/Windows/u, /dpkg/u, /in place/u]) {
    assert.equal(mechanism.test(detail), false, String(mechanism));
  }
});

test('the confirmation is localized for Traditional Chinese', () => {
  const confirmation = resolveDesktopInstallConfirmation({
    platform: 'win32',
    locale: 'zh-TW',
  });

  assert.equal(confirmation.title, '要安裝更新嗎？');
  assert.equal(confirmation.confirmLabel, '安裝並重新啟動');
  assert.equal(confirmation.cancelLabel, '取消');
  assert.match(confirmation.detail, /Windows 安裝程式/u);

  assert.match(
    resolveDesktopInstallConfirmation({ platform: 'linux', locale: 'zh-Hant' }).detail,
    /dpkg/u,
  );
});

test('an unknown locale falls back to English rather than an empty dialog', () => {
  const confirmation = resolveDesktopInstallConfirmation({
    platform: 'linux',
    locale: 'de-DE',
  });

  assert.equal(confirmation.title, 'Install the update?');
  assert.match(confirmation.detail, /dpkg/u);
});

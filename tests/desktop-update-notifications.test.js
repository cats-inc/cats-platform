import assert from 'node:assert/strict';
import test from 'node:test';

import { createUnavailableDesktopUpdateSnapshot } from '../build/desktop/updateManager.js';
import {
  DESKTOP_UPDATE_NOTIFICATION_ERROR_COPY,
  DESKTOP_UPDATE_SETTINGS_PATH,
  resolveDesktopUpdateAnnouncement,
} from '../build/desktop/updateNotifications.js';

function snapshot(overrides = {}) {
  const base = createUnavailableDesktopUpdateSnapshot('0.1.3');
  return {
    ...base,
    capability: {
      ...base.capability,
      distribution: 'official_packaged',
      provider: 'github_release',
      canCheck: true,
      canDownload: true,
      canInstall: true,
      unavailableReason: null,
    },
    status: 'idle',
    nextAction: 'check',
    ...overrides,
  };
}

function announce(overrides = {}, input = {}) {
  return resolveDesktopUpdateAnnouncement({
    origin: 'tray',
    snapshot: snapshot(overrides),
    notificationsSupported: true,
    ...input,
  });
}

test('a settings-originated result is never announced natively', () => {
  // The section renders the state and routes manual results through the shared
  // toast system. A notification would report the same check twice.
  for (const status of ['up_to_date', 'update_available', 'failed']) {
    const announcement = announce(
      { status, availableVersion: '0.1.4', error: { code: 'offline', summary: 'x' } },
      { origin: 'settings' },
    );
    assert.deepEqual(announcement, {
      notification: null,
      fallbackNavigatePath: null,
    }, status);
  }
});

test('a build without update capability announces nothing', () => {
  const announcement = resolveDesktopUpdateAnnouncement({
    origin: 'tray',
    snapshot: createUnavailableDesktopUpdateSnapshot('0.1.3'),
    notificationsSupported: true,
  });
  assert.equal(announcement.notification, null);
  assert.equal(announcement.fallbackNavigatePath, null);
});

test('a tray check reports an up-to-date result with the installed version', () => {
  const { notification } = announce({ status: 'up_to_date' });
  assert.equal(notification.title, 'Cats is up to date');
  assert.match(notification.body, /0\.1\.3/u);
  assert.equal(notification.navigatePath, DESKTOP_UPDATE_SETTINGS_PATH);
});

test('an available update names the version and is announced from every origin', () => {
  for (const origin of ['tray', 'startup']) {
    const { notification } = announce(
      { status: 'update_available', availableVersion: '0.1.4' },
      { origin },
    );
    assert.equal(notification.title, 'Update available', origin);
    assert.match(notification.body, /0\.1\.4/u, origin);
  }
});

test('a silent startup check stays quiet unless it found an update', () => {
  // The user did not ask for this check, so an up-to-date result has nothing to
  // say and an offline laptop would otherwise be nagged on every launch.
  for (const overrides of [
    { status: 'up_to_date' },
    { status: 'failed', error: { code: 'offline', summary: 'x' } },
  ]) {
    const announcement = announce(overrides, { origin: 'startup' });
    assert.equal(announcement.notification, null, overrides.status);
    assert.equal(announcement.fallbackNavigatePath, null, overrides.status);
  }
});

test('a failure is announced from its stable code, not the provider message', () => {
  const { notification } = announce({
    status: 'failed',
    error: { code: 'provider_rejected', summary: 'raw provider text that must not leak' },
  });
  assert.equal(notification.title, 'Update check failed');
  assert.equal(
    notification.body,
    DESKTOP_UPDATE_NOTIFICATION_ERROR_COPY.en.provider_rejected,
  );
  assert.equal(notification.body.includes('raw provider text'), false);
});

test('every error code has announceable copy in both locales', () => {
  for (const locale of ['en', 'zh-TW']) {
    for (const code of Object.keys(DESKTOP_UPDATE_NOTIFICATION_ERROR_COPY.en)) {
      const { notification } = announce(
        { status: 'failed', error: { code, summary: 'x' } },
        { locale },
      );
      assert.equal(
        notification.body,
        DESKTOP_UPDATE_NOTIFICATION_ERROR_COPY[locale][code],
        `${locale}/${code}`,
      );
      assert.notEqual(notification.body, undefined, `${locale}/${code}`);
    }
  }
});

test('in-flight and settings-driven states are not announced', () => {
  for (const status of [
    'idle',
    'checking',
    'downloading',
    'downloaded',
    'installing',
    'unavailable',
  ]) {
    const announcement = announce({ status });
    assert.equal(announcement.notification, null, status);
    assert.equal(announcement.fallbackNavigatePath, null, status);
  }
});

test('a preview build says so in the notification title', () => {
  const { notification } = announce({
    status: 'up_to_date',
    capability: { ...snapshot().capability, distribution: 'preview_packaged' },
  });
  assert.equal(notification.title, 'Cats is up to date (preview)');

  const zh = announce({
    status: 'up_to_date',
    capability: { ...snapshot().capability, distribution: 'preview_packaged' },
  }, { locale: 'zh-TW' });
  assert.equal(zh.notification.title, 'Cats 已是最新版本（預覽）');
});

test('a tray result stays visible when the platform has no notifications', () => {
  // SPEC-111 section 5.5: the command must never look like it did nothing.
  const announcement = announce(
    { status: 'up_to_date' },
    { notificationsSupported: false },
  );
  assert.equal(announcement.notification, null);
  assert.equal(announcement.fallbackNavigatePath, DESKTOP_UPDATE_SETTINGS_PATH);
});

test('a tray result carries the fallback even when a notification is available', () => {
  // The caller needs somewhere to go when show() throws, without re-deriving
  // which origins are allowed to pull a window forward.
  const announcement = announce({ status: 'update_available', availableVersion: '0.1.4' });
  assert.ok(announcement.notification);
  assert.equal(announcement.fallbackNavigatePath, DESKTOP_UPDATE_SETTINGS_PATH);
});

test('a startup result never pulls a window forward', () => {
  const announcement = announce(
    { status: 'update_available', availableVersion: '0.1.4' },
    { origin: 'startup', notificationsSupported: false },
  );
  assert.equal(announcement.notification, null);
  assert.equal(announcement.fallbackNavigatePath, null);
});

test('an available update without a version is not announced', () => {
  // The manager cannot produce this state; the guard keeps a version-less body
  // from ever being written.
  const announcement = announce({ status: 'update_available', availableVersion: null });
  assert.equal(announcement.notification, null);
});

test('an unrecognized locale falls back to English', () => {
  const { notification } = announce({ status: 'up_to_date' }, { locale: 'fr-FR' });
  assert.equal(notification.title, 'Cats is up to date');
});

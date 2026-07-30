import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatDesktopUpdateProgressPercent,
  resolveDesktopUpdateErrorMessageKey,
  resolveDesktopUpdatePrimaryAction,
  resolveDesktopUpdateStatusMessageKey,
  resolveDesktopUpdateStatusTone,
  shouldWarnAboutVisibleInstaller,
} from '../src/app/renderer/settings/settingsDesktopUpdateLabels.js';
import { enCatalog } from '../src/shared/i18n/catalogs/en.js';
import { zhTWCatalog } from '../src/shared/i18n/catalogs/zh-TW.js';
import { messageKeys } from '../src/shared/i18n/messageKeys.js';
import {
  DESKTOP_UPDATE_NOTIFICATION_ERROR_COPY,
} from '../desktop/host/updateNotifications.ts';

const STATUSES = [
  'unavailable',
  'idle',
  'checking',
  'up_to_date',
  'update_available',
  'downloading',
  'downloaded',
  'installing',
  'failed',
] as const;

const ERROR_CODES = [
  'offline',
  'timeout',
  'provider_rejected',
  'metadata_invalid',
  'checksum_mismatch',
  'signature_rejected',
  'unsupported_package',
  'download_cancelled',
  'install_handoff_failed',
  'unknown',
] as const;

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    capability: {
      distribution: 'official_packaged',
      provider: 'github_release',
      channel: 'stable',
      currentVersion: '0.2.0',
      canCheck: true,
      canDownload: true,
      canInstall: true,
      unavailableReason: null,
    },
    status: 'idle',
    currentVersion: '0.2.0',
    availableVersion: null,
    releaseSummary: null,
    lastCheckedAt: null,
    progress: null,
    error: null,
    nextAction: 'check',
    ...overrides,
  } as never;
}

test('every update status resolves to a catalogued message in both locales', () => {
  for (const status of STATUSES) {
    const alias = resolveDesktopUpdateStatusMessageKey(status);
    const dotted = messageKeys[alias];
    assert.ok(dotted, `${status} has no message key`);
    assert.equal(typeof enCatalog[dotted], 'string', `${dotted} missing from en`);
    assert.equal(typeof zhTWCatalog[dotted], 'string', `${dotted} missing from zh-TW`);
  }
});

test('every update error code resolves to a catalogued message in both locales', () => {
  for (const code of ERROR_CODES) {
    const alias = resolveDesktopUpdateErrorMessageKey(code);
    const dotted = messageKeys[alias];
    assert.ok(dotted, `${code} has no message key`);
    assert.equal(typeof enCatalog[dotted], 'string', `${dotted} missing from en`);
    assert.equal(typeof zhTWCatalog[dotted], 'string', `${dotted} missing from zh-TW`);
  }
});

test('native notification error copy matches the renderer catalogs word for word', () => {
  // The main process has no translator, so the host keeps its own copy of this
  // copy. The same failure must not read differently depending on whether the
  // user saw it in Settings or in a notification.
  for (const code of ERROR_CODES) {
    const dotted = messageKeys[resolveDesktopUpdateErrorMessageKey(code)];
    assert.equal(
      DESKTOP_UPDATE_NOTIFICATION_ERROR_COPY.en[code],
      enCatalog[dotted],
      `en/${code} drifted from ${dotted}`,
    );
    assert.equal(
      DESKTOP_UPDATE_NOTIFICATION_ERROR_COPY['zh-TW'][code],
      zhTWCatalog[dotted],
      `zh-TW/${code} drifted from ${dotted}`,
    );
  }
});

test('status tones use the settings chip vocabulary and flag attention states', () => {
  // The shared chip only offers ready/warm/muted, so warm carries both
  // "needs your attention" meanings: an available update and a failure.
  assert.equal(resolveDesktopUpdateStatusTone('failed'), 'warm');
  assert.equal(resolveDesktopUpdateStatusTone('update_available'), 'warm');
  assert.equal(resolveDesktopUpdateStatusTone('up_to_date'), 'ready');
  assert.equal(resolveDesktopUpdateStatusTone('downloaded'), 'ready');
  assert.equal(resolveDesktopUpdateStatusTone('checking'), 'muted');
  assert.equal(resolveDesktopUpdateStatusTone('idle'), 'muted');
  assert.equal(resolveDesktopUpdateStatusTone('unavailable'), 'muted');

  for (const status of STATUSES) {
    assert.equal(
      ['ready', 'warm', 'muted'].includes(resolveDesktopUpdateStatusTone(status)),
      true,
      status,
    );
  }
});

test('exactly one primary action is offered per state', () => {
  assert.deepEqual(resolveDesktopUpdatePrimaryAction(snapshot()), {
    messageKey: 'settingsDesktopUpdatesActionCheck',
    action: 'check',
    disabled: false,
  });

  assert.deepEqual(
    resolveDesktopUpdatePrimaryAction(
      snapshot({ status: 'update_available', nextAction: 'download' }),
    ),
    { messageKey: 'settingsDesktopUpdatesActionDownload', action: 'download', disabled: false },
  );

  assert.deepEqual(
    resolveDesktopUpdatePrimaryAction(
      snapshot({ status: 'downloaded', nextAction: 'restart_install' }),
    ),
    {
      messageKey: 'settingsDesktopUpdatesActionRestartInstall',
      action: 'restart_install',
      disabled: false,
    },
  );
});

test('in-flight states show a truthful disabled label instead of an actionable button', () => {
  for (const [status, messageKey] of [
    ['checking', 'settingsDesktopUpdatesActionChecking'],
    ['downloading', 'settingsDesktopUpdatesActionDownloading'],
    ['installing', 'settingsDesktopUpdatesActionInstalling'],
  ] as const) {
    const action = resolveDesktopUpdatePrimaryAction(snapshot({ status, nextAction: 'none' }));
    assert.deepEqual(action, { messageKey, action: 'none', disabled: true }, status);
  }
});

test('a build without update capability offers no primary action', () => {
  const action = resolveDesktopUpdatePrimaryAction(
    snapshot({ status: 'unavailable', nextAction: 'none' }),
  );

  assert.equal(action, null);
});

test('download progress is rounded and clamped for display', () => {
  assert.equal(
    formatDesktopUpdateProgressPercent(snapshot({
      status: 'downloading',
      progress: { percent: 42.6, transferredBytes: 1, totalBytes: 2, bytesPerSecond: 3 },
    })),
    43,
  );
  assert.equal(
    formatDesktopUpdateProgressPercent(snapshot({ status: 'downloading', progress: null })),
    null,
  );
  assert.equal(formatDesktopUpdateProgressPercent(snapshot()), null);
  assert.equal(
    formatDesktopUpdateProgressPercent(snapshot({
      status: 'downloading',
      progress: { percent: 140, transferredBytes: 1, totalBytes: 1, bytesPerSecond: 0 },
    })),
    100,
  );
});

test('the visible-installer warning appears only before a Windows install', () => {
  assert.equal(shouldWarnAboutVisibleInstaller(snapshot({ status: 'downloaded' }), 'win32'), true);
  assert.equal(shouldWarnAboutVisibleInstaller(snapshot({ status: 'downloaded' }), 'darwin'), false);
  assert.equal(shouldWarnAboutVisibleInstaller(snapshot({ status: 'downloaded' }), 'linux'), false);
  assert.equal(shouldWarnAboutVisibleInstaller(snapshot({ status: 'idle' }), 'win32'), false);
});

test('every new update message key exists in both catalogs', () => {
  const updateAliases = Object.keys(messageKeys)
    .filter((alias) => alias.startsWith('settingsDesktopUpdates'));

  assert.ok(updateAliases.length >= 30, `expected the full update copy set, saw ${updateAliases.length}`);
  for (const alias of updateAliases) {
    const dotted = messageKeys[alias as keyof typeof messageKeys];
    assert.equal(typeof enCatalog[dotted], 'string', `${dotted} missing from en`);
    assert.equal(typeof zhTWCatalog[dotted], 'string', `${dotted} missing from zh-TW`);
    assert.notEqual(enCatalog[dotted], zhTWCatalog[dotted], `${dotted} is not translated`);
  }
});

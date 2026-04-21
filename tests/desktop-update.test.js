import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkForDesktopUpdates,
  createDefaultDesktopUpdateState,
  resolveDesktopUpdateConfig,
} from '../build/desktop/update.js';

test('resolveDesktopUpdateConfig reads channel and manifest settings', () => {
  const config = resolveDesktopUpdateConfig({
    CATS_DESKTOP_UPDATE_CHANNEL: 'beta',
    CATS_DESKTOP_UPDATE_MANIFEST_URL: 'https://updates.example.com/cats/beta.json',
    CATS_DESKTOP_UPDATE_ALLOWED_HOSTS: 'downloads.example.com',
    CATS_DESKTOP_UPDATE_CHECK_ON_STARTUP: 'true',
    CATS_DESKTOP_UPDATE_AUTO_DOWNLOAD: 'false',
  });

  assert.equal(config.channel, 'beta');
  assert.equal(config.manifestUrl, 'https://updates.example.com/cats/beta.json');
  assert.deepEqual(config.allowedHosts, ['downloads.example.com']);
  assert.equal(config.checkOnStartup, true);
  assert.equal(config.autoDownload, false);
});

test('resolveDesktopUpdateConfig rejects insecure manifest URLs', () => {
  assert.throws(() => resolveDesktopUpdateConfig({
    CATS_DESKTOP_UPDATE_MANIFEST_URL: 'http://updates.example.com/cats/stable.json',
  }), /Unsupported desktop URL protocol/);
});

test('createDefaultDesktopUpdateState disables checks when no manifest is configured', () => {
  const state = createDefaultDesktopUpdateState({
    channel: 'stable',
    manifestUrl: null,
    allowedHosts: [],
    checkOnStartup: false,
    autoDownload: false,
  });

  assert.equal(state.status, 'disabled');
  assert.equal(state.summary.includes('disabled'), true);
});

test('checkForDesktopUpdates reports update_available when manifest version is newer', async () => {
  const state = await checkForDesktopUpdates({
    channel: 'stable',
    manifestUrl: 'https://updates.example.com/cats/stable.json',
    allowedHosts: ['downloads.example.com'],
    checkOnStartup: false,
    autoDownload: false,
  }, {
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          version: '0.2.0',
          summary: 'A newer desktop bundle is available.',
          downloadUrl: 'https://downloads.example.com/cats-0.2.0.exe',
        };
      },
    }),
    now: () => new Date('2026-03-24T10:00:00.000Z'),
  });

  assert.equal(state.status, 'update_available');
  assert.equal(state.latestVersion, '0.2.0');
  assert.equal(state.downloadUrl, 'https://downloads.example.com/cats-0.2.0.exe');
  assert.equal(state.lastCheckedAt, '2026-03-24T10:00:00.000Z');
});

test('checkForDesktopUpdates reports failed when manifest omits version', async () => {
  const state = await checkForDesktopUpdates({
    channel: 'stable',
    manifestUrl: 'https://updates.example.com/cats/stable.json',
    allowedHosts: [],
    checkOnStartup: false,
    autoDownload: false,
  }, {
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          summary: 'Malformed manifest without a version.',
        };
      },
    }),
    now: () => new Date('2026-03-24T10:03:00.000Z'),
  });

  assert.equal(state.status, 'failed');
  assert.match(state.error ?? '', /missing required field "version"/);
  assert.equal(state.latestVersion, null);
});

test('checkForDesktopUpdates reports failed when manifest channel mismatches config', async () => {
  const state = await checkForDesktopUpdates({
    channel: 'stable',
    manifestUrl: 'https://updates.example.com/cats/stable.json',
    allowedHosts: [],
    checkOnStartup: false,
    autoDownload: false,
  }, {
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          channel: 'beta',
          version: '0.2.0',
          summary: 'Wrong channel manifest.',
        };
      },
    }),
    now: () => new Date('2026-03-24T10:04:00.000Z'),
  });

  assert.equal(state.status, 'failed');
  assert.match(state.error ?? '', /does not match configured channel "stable"/);
  assert.equal(state.downloadUrl, null);
});

test('checkForDesktopUpdates reports failed when manifest fetch breaks', async () => {
  const state = await checkForDesktopUpdates({
    channel: 'stable',
    manifestUrl: 'https://updates.example.com/cats/stable.json',
    allowedHosts: [],
    checkOnStartup: false,
    autoDownload: false,
  }, {
    fetchImpl: async () => {
      throw new Error('network unavailable');
    },
    now: () => new Date('2026-03-24T10:05:00.000Z'),
  });

  assert.equal(state.status, 'failed');
  assert.equal(state.error, 'network unavailable');
});

test('checkForDesktopUpdates rejects insecure or non-allow-listed download URLs', async () => {
  const state = await checkForDesktopUpdates({
    channel: 'stable',
    manifestUrl: 'https://updates.example.com/cats/stable.json',
    allowedHosts: [],
    checkOnStartup: false,
    autoDownload: false,
  }, {
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          version: '0.2.0',
          downloadUrl: 'https://downloads.example.com/cats-0.2.0.exe',
        };
      },
    }),
    now: () => new Date('2026-03-24T10:08:00.000Z'),
  });

  assert.equal(state.status, 'failed');
  assert.match(state.error ?? '', /allow-listed/);
});

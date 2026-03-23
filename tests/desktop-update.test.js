import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkForDesktopUpdates,
  createDefaultDesktopUpdateState,
  resolveDesktopUpdateConfig,
} from '../dist-electron/update.js';

test('resolveDesktopUpdateConfig reads channel and manifest settings', () => {
  const config = resolveDesktopUpdateConfig({
    CATS_DESKTOP_UPDATE_CHANNEL: 'beta',
    CATS_DESKTOP_UPDATE_MANIFEST_URL: 'https://updates.example.com/cats/beta.json',
    CATS_DESKTOP_UPDATE_CHECK_ON_STARTUP: 'true',
    CATS_DESKTOP_UPDATE_AUTO_DOWNLOAD: 'false',
  });

  assert.equal(config.channel, 'beta');
  assert.equal(config.manifestUrl, 'https://updates.example.com/cats/beta.json');
  assert.equal(config.checkOnStartup, true);
  assert.equal(config.autoDownload, false);
});

test('createDefaultDesktopUpdateState disables checks when no manifest is configured', () => {
  const state = createDefaultDesktopUpdateState({
    channel: 'stable',
    manifestUrl: null,
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

test('checkForDesktopUpdates reports failed when manifest fetch breaks', async () => {
  const state = await checkForDesktopUpdates({
    channel: 'stable',
    manifestUrl: 'https://updates.example.com/cats/stable.json',
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

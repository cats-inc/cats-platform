import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DESKTOP_DISTRIBUTION_MODES,
  DESKTOP_UPDATE_CHANNELS,
  DESKTOP_UPDATE_ERROR_CODES,
  DESKTOP_UPDATE_NEXT_ACTIONS,
  DESKTOP_UPDATE_PROVIDERS,
  DESKTOP_UPDATE_STATUSES,
  DESKTOP_UPDATE_UNAVAILABLE_REASONS,
} from '../build/desktop/contracts.js';
import { resolveDesktopDistributionIdentity } from '../build/desktop/releaseDescriptor.js';

test('update statuses cover the full SPEC-111 lifecycle', () => {
  assert.deepEqual([...DESKTOP_UPDATE_STATUSES], [
    'unavailable',
    'idle',
    'checking',
    'up_to_date',
    'update_available',
    'downloading',
    'downloaded',
    'installing',
    'failed',
  ]);
});

test('update statuses no longer expose the retired disabled value', () => {
  assert.equal(DESKTOP_UPDATE_STATUSES.includes('disabled'), false);
});

test('next actions describe only the bounded commands the renderer may request', () => {
  assert.deepEqual([...DESKTOP_UPDATE_NEXT_ACTIONS], [
    'none',
    'check',
    'download',
    'restart_install',
  ]);
});

test('update error codes cover every failure class the spec requires copy for', () => {
  for (const code of [
    'offline',
    'timeout',
    'provider_rejected',
    'metadata_invalid',
    'checksum_mismatch',
    'signature_rejected',
    'unsupported_package',
    'download_cancelled',
    'install_handoff_failed',
  ]) {
    assert.equal(DESKTOP_UPDATE_ERROR_CODES.includes(code), true, code);
  }
  assert.equal(DESKTOP_UPDATE_ERROR_CODES.includes('unknown'), true);
});

test('distribution modes match the three execution modes the capability distinguishes', () => {
  assert.deepEqual([...DESKTOP_DISTRIBUTION_MODES], [
    'official_packaged',
    'development',
    'unofficial_packaged',
  ]);
});

test('no fourth runtime distribution mode exists for test-only self-update', () => {
  assert.equal(DESKTOP_DISTRIBUTION_MODES.length, 3);
  for (const forbidden of ['test', 'testing', 'staging', 'internal', 'official_development']) {
    assert.equal(DESKTOP_DISTRIBUTION_MODES.includes(forbidden), false, forbidden);
  }
});

test('update providers are limited to the GitHub feed or nothing', () => {
  assert.deepEqual([...DESKTOP_UPDATE_PROVIDERS], ['github_release', 'none']);
});

test('update channels still describe the declared stable, beta, and alpha set', () => {
  assert.deepEqual([...DESKTOP_UPDATE_CHANNELS], ['stable', 'beta', 'alpha']);
});

test('every distribution identity reason is part of the shared unavailable vocabulary', () => {
  const observed = new Set();

  observed.add(resolveDesktopDistributionIdentity({
    isPackaged: false,
    currentVersion: '0.2.0',
    nodePlatform: 'win32',
    descriptor: null,
  }).unavailableReason);

  observed.add(resolveDesktopDistributionIdentity({
    isPackaged: true,
    currentVersion: '0.2.0',
    nodePlatform: 'win32',
    descriptor: null,
  }).unavailableReason);

  for (const reason of ['descriptor_unreadable', 'descriptor_malformed',
    'descriptor_schema_unsupported']) {
    observed.add(resolveDesktopDistributionIdentity({
      isPackaged: true,
      currentVersion: '0.2.0',
      nodePlatform: 'win32',
      descriptor: { ok: false, reason, detail: 'x' },
    }).unavailableReason);
  }

  for (const reason of observed) {
    assert.equal(DESKTOP_UPDATE_UNAVAILABLE_REASONS.includes(reason), true, reason);
  }
  assert.equal(observed.has('development_build'), true);
  assert.equal(observed.has('descriptor_missing'), true);
});

test('an official identity reports no unavailable reason', () => {
  const identity = resolveDesktopDistributionIdentity({
    isPackaged: true,
    currentVersion: '0.2.0',
    nodePlatform: 'win32',
    descriptor: {
      ok: true,
      descriptor: {
        schemaVersion: 1,
        tag: 'v0.2.0',
        version: '0.2.0',
        commit: 'b'.repeat(40),
        platform: 'windows',
        channel: 'stable',
        provider: 'github_release',
        repository: 'cats-inc/cats-platform',
        generatedAt: null,
      },
    },
  });

  assert.equal(identity.unavailableReason, null);
  assert.equal(DESKTOP_DISTRIBUTION_MODES.includes(identity.distribution), true);
  assert.equal(DESKTOP_UPDATE_PROVIDERS.includes(identity.provider), true);
  assert.equal(DESKTOP_UPDATE_CHANNELS.includes(identity.channel), true);
});

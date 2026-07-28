import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  DESKTOP_RELEASE_DESCRIPTOR_FILENAME,
  DESKTOP_RELEASE_DESCRIPTOR_SCHEMA_VERSION,
  loadDesktopReleaseDescriptor,
  parseDesktopReleaseDescriptor,
  resolveDesktopDistributionIdentity,
  resolveDesktopReleaseDescriptorPath,
  resolveDesktopReleasePlatform,
} from '../build/desktop/releaseDescriptor.js';
import {
  DESCRIPTOR_RELATIVE_PATH,
  buildReleaseDescriptor,
} from '../scripts/generate-desktop-release-descriptor.mjs';

const COMMIT = 'a'.repeat(40);

function validDescriptor(overrides = {}) {
  return {
    schemaVersion: DESKTOP_RELEASE_DESCRIPTOR_SCHEMA_VERSION,
    tag: 'v0.2.0',
    version: '0.2.0',
    commit: COMMIT,
    platform: 'windows',
    channel: 'stable',
    provider: 'github_release',
    repository: 'cats-inc/cats-platform',
    generatedAt: '2026-07-28T00:00:00.000Z',
    ...overrides,
  };
}

function officialInput(overrides = {}) {
  return {
    isPackaged: true,
    currentVersion: '0.2.0',
    nodePlatform: 'win32',
    descriptor: parseDesktopReleaseDescriptor(validDescriptor()),
    ...overrides,
  };
}

test('release descriptor parsing accepts a workflow-generated descriptor', () => {
  const result = parseDesktopReleaseDescriptor(validDescriptor());

  assert.equal(result.ok, true);
  assert.equal(result.descriptor.version, '0.2.0');
  assert.equal(result.descriptor.repository, 'cats-inc/cats-platform');
  assert.equal(result.descriptor.commit, COMMIT);
});

test('release descriptor parsing rejects a tag that disagrees with its version', () => {
  const result = parseDesktopReleaseDescriptor(validDescriptor({ tag: 'v0.3.0' }));

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'descriptor_malformed');
});

test('release descriptor parsing rejects an unsupported schema version', () => {
  const result = parseDesktopReleaseDescriptor(validDescriptor({ schemaVersion: 2 }));

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'descriptor_schema_unsupported');
});

test('release descriptor parsing rejects a non-stable channel or foreign provider', () => {
  for (const overrides of [{ channel: 'beta' }, { provider: 'generic' }]) {
    const result = parseDesktopReleaseDescriptor(validDescriptor(overrides));
    assert.equal(result.ok, false, JSON.stringify(overrides));
    assert.equal(result.reason, 'descriptor_malformed');
  }
});

test('release descriptor parsing rejects malformed commit, platform, and repository', () => {
  for (const overrides of [
    { commit: 'abc' },
    { platform: 'freebsd' },
    { repository: 'cats-platform' },
    { version: 'not-a-version' },
  ]) {
    const result = parseDesktopReleaseDescriptor(validDescriptor(overrides));
    assert.equal(result.ok, false, JSON.stringify(overrides));
    assert.equal(result.reason, 'descriptor_malformed');
  }
});

test('release descriptor parsing rejects non-object payloads', () => {
  for (const raw of [null, 'string', 42, [], undefined]) {
    const result = parseDesktopReleaseDescriptor(raw);
    assert.equal(result.ok, false, JSON.stringify(raw ?? null));
    assert.equal(result.reason, 'descriptor_malformed');
  }
});

test('distribution identity treats an unpackaged run as development', () => {
  const identity = resolveDesktopDistributionIdentity(officialInput({ isPackaged: false }));

  assert.equal(identity.distribution, 'development');
  assert.equal(identity.provider, 'none');
  assert.equal(identity.unavailableReason, 'development_build');
});

test('distribution identity treats a packaged build without a descriptor as unofficial', () => {
  const identity = resolveDesktopDistributionIdentity(officialInput({ descriptor: null }));

  assert.equal(identity.distribution, 'unofficial_packaged');
  assert.equal(identity.provider, 'none');
  assert.equal(identity.unavailableReason, 'descriptor_missing');
});

test('distribution identity refuses a descriptor whose version is not the running version', () => {
  const identity = resolveDesktopDistributionIdentity(officialInput({ currentVersion: '0.3.0' }));

  assert.equal(identity.distribution, 'unofficial_packaged');
  assert.equal(identity.unavailableReason, 'descriptor_version_mismatch');
});

test('distribution identity refuses a descriptor built for another platform', () => {
  const identity = resolveDesktopDistributionIdentity(officialInput({ nodePlatform: 'linux' }));

  assert.equal(identity.distribution, 'unofficial_packaged');
  assert.equal(identity.unavailableReason, 'descriptor_platform_mismatch');
});

test('distribution identity refuses an unsupported host platform', () => {
  const identity = resolveDesktopDistributionIdentity(officialInput({ nodePlatform: 'freebsd' }));

  assert.equal(identity.distribution, 'unofficial_packaged');
  assert.equal(identity.unavailableReason, 'descriptor_platform_mismatch');
});

test('distribution identity propagates a parse failure reason', () => {
  const identity = resolveDesktopDistributionIdentity(officialInput({
    descriptor: parseDesktopReleaseDescriptor(validDescriptor({ schemaVersion: 99 })),
  }));

  assert.equal(identity.distribution, 'unofficial_packaged');
  assert.equal(identity.unavailableReason, 'descriptor_schema_unsupported');
});

test('distribution identity resolves an official packaged build', () => {
  const identity = resolveDesktopDistributionIdentity(officialInput());

  assert.deepEqual(identity, {
    distribution: 'official_packaged',
    provider: 'github_release',
    channel: 'stable',
    currentVersion: '0.2.0',
    repository: 'cats-inc/cats-platform',
    commit: COMMIT,
    unavailableReason: null,
  });
});

test('release platform mapping covers the supported desktop targets only', () => {
  assert.equal(resolveDesktopReleasePlatform('win32'), 'windows');
  assert.equal(resolveDesktopReleasePlatform('darwin'), 'macos');
  assert.equal(resolveDesktopReleasePlatform('linux'), 'linux');
  assert.equal(resolveDesktopReleasePlatform('freebsd'), null);
});

test('release descriptor loading reports absence separately from corruption', async () => {
  const missing = await loadDesktopReleaseDescriptor('/nowhere/release-descriptor.json', {
    readFileImpl: async () => {
      const error = new Error('not found');
      error.code = 'ENOENT';
      throw error;
    },
  });
  assert.equal(missing, null);

  const unreadable = await loadDesktopReleaseDescriptor('/nowhere/release-descriptor.json', {
    readFileImpl: async () => {
      const error = new Error('permission denied');
      error.code = 'EACCES';
      throw error;
    },
  });
  assert.equal(unreadable.ok, false);
  assert.equal(unreadable.reason, 'descriptor_unreadable');

  const invalidJson = await loadDesktopReleaseDescriptor('/nowhere/release-descriptor.json', {
    readFileImpl: async () => 'not json',
  });
  assert.equal(invalidJson.ok, false);
  assert.equal(invalidJson.reason, 'descriptor_malformed');

  const parsed = await loadDesktopReleaseDescriptor('/nowhere/release-descriptor.json', {
    readFileImpl: async () => JSON.stringify(validDescriptor()),
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.descriptor.version, '0.2.0');
});

test('release descriptor path sits next to the compiled desktop host', () => {
  assert.equal(
    resolveDesktopReleaseDescriptorPath('/app/build/desktop'),
    join('/app/build/desktop', DESKTOP_RELEASE_DESCRIPTOR_FILENAME),
  );
});

test('the release workflow generator emits exactly what the host validator accepts', () => {
  const generated = buildReleaseDescriptor({
    tag: 'v0.2.0',
    commit: COMMIT,
    repository: 'cats-inc/cats-platform',
    platform: 'windows',
    generatedAt: '2026-07-28T00:00:00.000Z',
  });
  assert.equal(generated.ok, true);

  const parsed = parseDesktopReleaseDescriptor(generated.descriptor);
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  assert.deepEqual(parsed.descriptor, generated.descriptor);

  const identity = resolveDesktopDistributionIdentity({
    isPackaged: true,
    currentVersion: '0.2.0',
    nodePlatform: 'win32',
    descriptor: parsed,
  });
  assert.equal(identity.distribution, 'official_packaged');
});

test('the generator writes where the host looks for the descriptor', () => {
  assert.equal(DESCRIPTOR_RELATIVE_PATH.endsWith(DESKTOP_RELEASE_DESCRIPTOR_FILENAME), true);
  assert.equal(DESCRIPTOR_RELATIVE_PATH, `build/desktop/${DESKTOP_RELEASE_DESCRIPTOR_FILENAME}`);
});

test('release descriptor resolution never consults the environment', async () => {
  const source = await readFile(
    join(process.cwd(), 'desktop', 'host', 'releaseDescriptor.ts'),
    'utf8',
  );

  // Requirement 1.9: no environment variable may promote a development or
  // unofficial package into an official update client.
  assert.equal(/process\.env/u.test(source), false);
});

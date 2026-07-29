import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  DESCRIPTOR_RELATIVE_PATH,
  DESCRIPTOR_SCHEMA_VERSION,
  buildReleaseDescriptor,
  parseArgs,
  resolveDescriptorPlatform,
  serializeReleaseDescriptor,
  writeReleaseDescriptor,
} from '../scripts/generate-desktop-release-descriptor.mjs';

const COMMIT = 'a'.repeat(40);
const RUNTIME_COMMIT = 'b'.repeat(40);

function validInputs(overrides = {}) {
  return {
    kind: 'official',
    tag: 'v0.2.0',
    commit: COMMIT,
    repository: 'cats-inc/cats-platform',
    platform: 'windows',
    runtimeCommit: RUNTIME_COMMIT,
    ...overrides,
  };
}

function problemCodes(result) {
  return result.problems.map((problem) => problem.code);
}

test('release descriptor records tag, commit, platform, channel, and provider identity', () => {
  const result = buildReleaseDescriptor(validInputs({ generatedAt: '2026-07-28T00:00:00.000Z' }));

  assert.equal(result.ok, true);
  assert.deepEqual(result.descriptor, {
    schemaVersion: DESCRIPTOR_SCHEMA_VERSION,
    kind: 'official',
    tag: 'v0.2.0',
    version: '0.2.0',
    commit: COMMIT,
    platform: 'windows',
    channel: 'stable',
    provider: 'github_release',
    repository: 'cats-inc/cats-platform',
    runtimeCommit: RUNTIME_COMMIT,
    generatedAt: '2026-07-28T00:00:00.000Z',
  });
});

test('release descriptor pins the stable channel rather than accepting it as input', () => {
  const result = buildReleaseDescriptor({ ...validInputs(), channel: 'beta' });

  assert.equal(result.descriptor.channel, 'stable');
});

test('release descriptor rejects a tag that is not a stable release tag', () => {
  assert.deepEqual(
    problemCodes(buildReleaseDescriptor(validInputs({ tag: 'main' }))),
    ['descriptor_tag_malformed'],
  );
  assert.deepEqual(
    problemCodes(buildReleaseDescriptor(validInputs({ tag: '' }))),
    ['descriptor_tag_missing'],
  );
});

test('release descriptor requires a full commit sha', () => {
  for (const commit of ['', 'abc1234', COMMIT.slice(0, 39), `${COMMIT}0`, 'z'.repeat(40)]) {
    assert.deepEqual(
      problemCodes(buildReleaseDescriptor(validInputs({ commit }))),
      ['descriptor_commit_invalid'],
      `expected ${commit} to be rejected`,
    );
  }
});

test('release descriptor normalizes an uppercase commit sha', () => {
  const result = buildReleaseDescriptor(validInputs({ commit: 'A'.repeat(40) }));

  assert.equal(result.ok, true);
  assert.equal(result.descriptor.commit, COMMIT);
});

test('release descriptor requires an owner/name repository', () => {
  for (const repository of ['', 'cats-platform', 'cats-inc/', '/cats-platform', 'a/b/c']) {
    assert.deepEqual(
      problemCodes(buildReleaseDescriptor(validInputs({ repository }))),
      ['descriptor_repository_invalid'],
      `expected ${repository} to be rejected`,
    );
  }
});

test('release descriptor maps node platform identifiers to release platforms', () => {
  assert.equal(resolveDescriptorPlatform('win32'), 'windows');
  assert.equal(resolveDescriptorPlatform('darwin'), 'macos');
  assert.equal(resolveDescriptorPlatform('linux'), 'linux');
  assert.equal(resolveDescriptorPlatform('WINDOWS'), 'windows');
  assert.equal(resolveDescriptorPlatform('freebsd'), null);
  assert.equal(resolveDescriptorPlatform(undefined), null);
});

test('release descriptor rejects an unsupported platform', () => {
  assert.deepEqual(
    problemCodes(buildReleaseDescriptor(validInputs({ platform: 'freebsd' }))),
    ['descriptor_platform_invalid'],
  );
});

test('release descriptor requires the packaged runtime commit', () => {
  for (const runtimeCommit of ['', 'abc1234', RUNTIME_COMMIT.slice(0, 39), 'z'.repeat(40)]) {
    assert.deepEqual(
      problemCodes(buildReleaseDescriptor(validInputs({ runtimeCommit }))),
      ['descriptor_runtime_commit_invalid'],
      `expected ${runtimeCommit} to be rejected`,
    );
  }
});

test('release descriptor records which runtime checkout was packaged', () => {
  const result = buildReleaseDescriptor(validInputs({ runtimeCommit: 'B'.repeat(40) }));

  assert.equal(result.ok, true);
  assert.equal(result.descriptor.runtimeCommit, RUNTIME_COMMIT);
  assert.notEqual(result.descriptor.runtimeCommit, result.descriptor.commit);
});

test('release descriptor marks an unsigned preview as its own kind', () => {
  const result = buildReleaseDescriptor(validInputs({ kind: 'preview' }));

  assert.equal(result.ok, true);
  assert.equal(result.descriptor.kind, 'preview');
});

test('release descriptor defaults to official so a missing flag cannot downgrade a release', () => {
  const inputs = validInputs();
  delete inputs.kind;

  assert.equal(buildReleaseDescriptor(inputs).descriptor.kind, 'official');
  assert.equal(parseArgs([], {}).kind, 'official');
});

test('release descriptor rejects an unknown build kind', () => {
  for (const kind of ['', 'nightly', 'internal', 'Official ']) {
    const result = buildReleaseDescriptor(validInputs({ kind }));
    if (kind === 'Official ') {
      // Trimmed and lowercased rather than rejected.
      assert.equal(result.ok, true, kind);
      continue;
    }
    assert.equal(problemCodes(result).includes('descriptor_kind_invalid'), true, kind);
  }
});

test('release descriptor reports every invalid input at once', () => {
  const result = buildReleaseDescriptor({
    kind: 'nope',
    tag: 'main',
    commit: 'nope',
    repository: 'nope',
    platform: 'nope',
    runtimeCommit: 'nope',
  });

  assert.equal(result.ok, false);
  assert.equal(result.descriptor, null);
  assert.deepEqual(problemCodes(result), [
    'descriptor_kind_invalid',
    'descriptor_tag_malformed',
    'descriptor_commit_invalid',
    'descriptor_repository_invalid',
    'descriptor_platform_invalid',
    'descriptor_runtime_commit_invalid',
  ]);
});

test('release descriptor args read the workflow environment by default', () => {
  const parsed = parseArgs([], {
    GITHUB_REF_NAME: 'v0.2.0',
    GITHUB_SHA: COMMIT,
    GITHUB_REPOSITORY: 'cats-inc/cats-platform',
    CATS_DESKTOP_RELEASE_PLATFORM: 'linux',
    CATS_DESKTOP_RUNTIME_COMMIT: RUNTIME_COMMIT,
  });

  assert.equal(parsed.tag, 'v0.2.0');
  assert.equal(parsed.commit, COMMIT);
  assert.equal(parsed.repository, 'cats-inc/cats-platform');
  assert.equal(parsed.platform, 'linux');
  assert.equal(parsed.runtimeCommit, RUNTIME_COMMIT);
  assert.equal(parsed.kind, 'official');
  assert.equal(parsed.output, DESCRIPTOR_RELATIVE_PATH);
});

test('release descriptor args let the release job override every field', () => {
  const parsed = parseArgs(
    ['--tag', 'v1.2.3', '--commit', COMMIT, '--repository', 'o/r', '--platform', 'macos',
      '--runtime-commit', RUNTIME_COMMIT, '--kind', 'preview',
      '--output', 'build/desktop/other.json'],
    {},
  );

  assert.deepEqual(parsed, {
    help: false,
    tag: 'v1.2.3',
    commit: COMMIT,
    repository: 'o/r',
    platform: 'macos',
    runtimeCommit: RUNTIME_COMMIT,
    kind: 'preview',
    output: 'build/desktop/other.json',
  });
  assert.throws(() => parseArgs(['--publish'], {}), /Unknown option: --publish/);
});

test('release descriptor ships inside the packaged desktop build output', () => {
  assert.equal(DESCRIPTOR_RELATIVE_PATH, 'build/desktop/release-descriptor.json');
});

test('release descriptor is written as pretty JSON with a trailing newline', async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-release-descriptor-'));
  try {
    const { descriptor } = buildReleaseDescriptor(
      validInputs({ generatedAt: '2026-07-28T00:00:00.000Z' }),
    );
    const writtenPath = await writeReleaseDescriptor(
      descriptor,
      DESCRIPTOR_RELATIVE_PATH,
      workingDir,
    );

    const contents = await readFile(writtenPath, 'utf8');
    assert.equal(contents, serializeReleaseDescriptor(descriptor));
    assert.equal(contents.endsWith('\n'), true);
    assert.deepEqual(JSON.parse(contents), descriptor);
  } finally {
    await rm(workingDir, { recursive: true, force: true });
  }
});

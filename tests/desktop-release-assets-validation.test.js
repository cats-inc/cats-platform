import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  PRIMARY_ARTIFACT_PATTERNS,
  UPDATE_METADATA_FILES,
  collectReferencedFiles,
  parseArgs,
  resolveMissingMetadataFiles,
  resolveMissingPrimaryArtifacts,
  validateReleaseAssets,
} from '../scripts/validate-release-assets.mjs';

const COMPLETE_FILES = [
  'collected/release-windows/Cats-0.2.0-setup-x64.exe',
  'collected/release-windows/Cats-0.2.0-setup-x64.exe.blockmap',
  'collected/release-windows/latest.yml',
  'collected/release-macos/Cats-0.2.0-universal.dmg',
  'collected/release-macos/Cats-0.2.0-universal-mac.zip',
  'collected/release-macos/latest-mac.yml',
  'collected/release-linux/Cats-0.2.0-x86_64.AppImage',
  'collected/release-linux/latest-linux.yml',
];

function metadata(name, overrides = {}) {
  const byName = {
    'latest.yml': {
      version: '0.2.0',
      path: 'Cats-0.2.0-setup-x64.exe',
      files: [{ url: 'Cats-0.2.0-setup-x64.exe' }],
    },
    'latest-mac.yml': {
      version: '0.2.0',
      path: 'Cats-0.2.0-universal-mac.zip',
      files: [{ url: 'Cats-0.2.0-universal-mac.zip' }],
    },
    'latest-linux.yml': {
      version: '0.2.0',
      path: 'Cats-0.2.0-x86_64.AppImage',
      files: [{ url: 'Cats-0.2.0-x86_64.AppImage' }],
    },
  };
  return { name, document: { ...byName[name], ...overrides }, error: null };
}

function completeDocuments() {
  return UPDATE_METADATA_FILES.map((name) => metadata(name));
}

function problemCodes(result) {
  return result.problems.map((problem) => problem.code);
}

test('a complete release passes validation', () => {
  const result = validateReleaseAssets({
    files: COMPLETE_FILES,
    metadataDocuments: completeDocuments(),
  });

  assert.equal(result.ok, true, JSON.stringify(result.problems));
  assert.deepEqual(result.problems, []);
});

test('a missing primary artifact fails validation per platform', () => {
  const withoutInstaller = COMPLETE_FILES.filter((path) => !path.endsWith('.exe'));

  const result = validateReleaseAssets({
    files: withoutInstaller,
    metadataDocuments: completeDocuments(),
  });

  assert.equal(result.ok, false);
  assert.equal(problemCodes(result).includes('primary_artifact_missing'), true);
});

test('metadata that references an unbuilt file fails validation', () => {
  const result = validateReleaseAssets({
    files: COMPLETE_FILES,
    metadataDocuments: [
      metadata('latest.yml', {
        path: 'Cats-0.2.0-setup-arm64.exe',
        files: [{ url: 'Cats-0.2.0-setup-arm64.exe' }],
      }),
      metadata('latest-mac.yml'),
      metadata('latest-linux.yml'),
    ],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(problemCodes(result), ['referenced_artifact_missing']);
  assert.match(result.problems[0].message, /Cats-0\.2\.0-setup-arm64\.exe/u);
});

test('a missing metadata file fails validation even when the installer exists', () => {
  const withoutMetadata = COMPLETE_FILES.filter((path) => !path.endsWith('latest.yml'));

  const result = validateReleaseAssets({
    files: withoutMetadata,
    metadataDocuments: completeDocuments().filter((entry) => entry.name !== 'latest.yml'),
  });

  assert.equal(result.ok, false);
  assert.equal(problemCodes(result).includes('update_metadata_missing'), true);
});

test('unreadable metadata is reported rather than silently skipped', () => {
  const result = validateReleaseAssets({
    files: COMPLETE_FILES,
    metadataDocuments: [
      { name: 'latest.yml', document: null, error: 'bad indentation' },
      metadata('latest-mac.yml'),
      metadata('latest-linux.yml'),
    ],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(problemCodes(result), ['update_metadata_unreadable']);
});

test('metadata that references nothing fails validation', () => {
  const result = validateReleaseAssets({
    files: COMPLETE_FILES,
    metadataDocuments: [
      { name: 'latest.yml', document: { version: '0.2.0' }, error: null },
      metadata('latest-mac.yml'),
      metadata('latest-linux.yml'),
    ],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(problemCodes(result), ['update_metadata_empty']);
});

test('referenced files are matched by name regardless of url form', () => {
  assert.deepEqual(
    collectReferencedFiles({
      path: 'Cats%200.2.0%20setup.exe',
      files: [{ url: 'nested/dir/Cats-0.2.0-setup-x64.exe' }],
    }).sort(),
    ['Cats 0.2.0 setup.exe', 'Cats-0.2.0-setup-x64.exe'],
  );
  assert.deepEqual(collectReferencedFiles(null), []);
  assert.deepEqual(collectReferencedFiles({ files: 'nope' }), []);
});

test('primary artifact detection covers the three declared release targets', () => {
  assert.deepEqual(
    PRIMARY_ARTIFACT_PATTERNS.map((entry) => entry.platform),
    ['windows', 'macos', 'linux'],
  );
  assert.deepEqual(resolveMissingPrimaryArtifacts(['a.exe', 'b.dmg', 'c.AppImage']), []);
  assert.deepEqual(resolveMissingPrimaryArtifacts([]), ['windows', 'macos', 'linux']);
  assert.deepEqual(resolveMissingPrimaryArtifacts(['a.exe']), ['macos', 'linux']);
});

test('metadata presence detection covers every updater feed', () => {
  assert.deepEqual(resolveMissingMetadataFiles([...UPDATE_METADATA_FILES]), []);
  assert.deepEqual(resolveMissingMetadataFiles([]), [...UPDATE_METADATA_FILES]);
});

test('release asset args default to the local release directory', () => {
  assert.deepEqual(parseArgs([]), { help: false, root: 'release', json: false });
  assert.equal(parseArgs(['--root', 'collected']).root, 'collected');
  assert.equal(parseArgs(['--json']).json, true);
  assert.equal(parseArgs(['--help']).help, true);
  assert.throws(() => parseArgs(['--publish']), /Unknown option: --publish/);
});

test('the release workflow runs the guard before any platform build', async () => {
  const workflow = await readFile(
    join(process.cwd(), '.github', 'workflows', 'desktop-release.yml'),
    'utf8',
  );

  const guardIndex = workflow.indexOf('validate-release-version.mjs');
  const buildIndex = workflow.indexOf('build-desktop-installer.mjs');
  assert.ok(guardIndex > 0, 'the workflow must run the version guard');
  assert.ok(buildIndex > guardIndex, 'the guard must precede the installer build');
});

test('the release workflow only triggers on stable version tags', async () => {
  const workflow = await readFile(
    join(process.cwd(), '.github', 'workflows', 'desktop-release.yml'),
    'utf8',
  );

  assert.match(workflow, /tags:\s*\n\s*- 'v\[0-9\]\+\.\[0-9\]\+\.\[0-9\]\+'/u);
  assert.equal(/on:\s*\n\s*push:\s*\n\s*branches:/u.test(workflow), false);
});

test('the release workflow publishes only after builds and asset validation', async () => {
  const workflow = await readFile(
    join(process.cwd(), '.github', 'workflows', 'desktop-release.yml'),
    'utf8',
  );

  const publishBlock = workflow.slice(workflow.indexOf('  publish:'));
  assert.match(publishBlock, /needs: \[guard, build, validate-assets\]/u);
  assert.match(publishBlock, /--draft=false/u);
  assert.match(publishBlock, /dry_run == 'false'/u);
});

test('electron-builder publishes drafts to the public GitHub repository', async () => {
  const packageJson = JSON.parse(
    await readFile(join(process.cwd(), 'package.json'), 'utf8'),
  );

  assert.deepEqual(packageJson.build.publish, [{
    provider: 'github',
    owner: 'cats-inc',
    repo: 'cats-platform',
    // Draft-first: assets are collected and validated before anything is
    // publicly visible as the latest release.
    releaseType: 'draft',
  }]);
});

test('the Windows release job passes the bundled sidecar layout explicitly', async () => {
  const workflow = await readFile(
    join(process.cwd(), '.github', 'workflows', 'desktop-release.yml'),
    'utf8',
  );

  assert.match(workflow, /platform: windows[\s\S]*?--sidecar-layout bundle/u);
});

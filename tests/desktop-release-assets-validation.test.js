import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  DESKTOP_RELEASE_MATRIX,
  PRIMARY_ARTIFACT_PATTERNS,
  UPDATE_METADATA_FILES,
  collectReferencedFiles,
  parseArgs,
  resolveMissingMetadataFiles,
  resolveDisallowedArtifacts,
  resolveUnreleasedArchitectureArtifacts,
  resolveMissingPrimaryArtifacts,
  validateReleaseAssets,
} from '../scripts/validate-release-assets.mjs';

// Taken from a real preview run rather than invented. An earlier fixture
// guessed the macOS archive was named -mac.zip, which let the validator pass
// its tests while rejecting the artifact the workflow actually produces.
const COMPLETE_FILES = [
  'collected/unsigned-preview-windows/Cats-0.2.0-setup-x64.exe',
  'collected/unsigned-preview-windows/Cats-0.2.0-setup-x64.exe.blockmap',
  'collected/unsigned-preview-windows/latest.yml',
  'collected/unsigned-preview-macos/Cats-0.2.0-universal.dmg',
  'collected/unsigned-preview-macos/Cats-0.2.0-universal.dmg.blockmap',
  'collected/unsigned-preview-macos/Cats-0.2.0-universal.zip',
  'collected/unsigned-preview-macos/Cats-0.2.0-universal.zip.blockmap',
  'collected/unsigned-preview-macos/latest-mac.yml',
  'collected/unsigned-preview-linux/Cats-0.2.0-x86_64.AppImage',
  'collected/unsigned-preview-linux/latest-linux.yml',
];

function withExtraFile(name) {
  return [...COMPLETE_FILES, `collected/release-macos/${name}`];
}

function metadata(name, overrides = {}) {
  const byName = {
    'latest.yml': {
      version: '0.2.0',
      path: 'Cats-0.2.0-setup-x64.exe',
      files: [{ url: 'Cats-0.2.0-setup-x64.exe' }],
    },
    'latest-mac.yml': {
      version: '0.2.0',
      // The real feed lists both the updater archive and the DMG.
      path: 'Cats-0.2.0-universal.zip',
      files: [
        { url: 'Cats-0.2.0-universal.zip' },
        { url: 'Cats-0.2.0-universal.dmg' },
      ],
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

test('artifacts outside the release contract fail validation', () => {
  for (const forbidden of [
    'Cats-0.2.0-universal.pkg',
    'Cats-0.2.0-amd64.deb',
    'Cats-0.2.0-x86_64.tar.gz',
  ]) {
    const result = validateReleaseAssets({
      files: withExtraFile(forbidden),
      metadataDocuments: completeDocuments(),
    });

    assert.equal(result.ok, false, forbidden);
    assert.equal(
      problemCodes(result).includes('artifact_outside_release_contract'),
      true,
      forbidden,
    );
  }
});

test('an architecture the declared set omits fails validation', () => {
  const result = validateReleaseAssets({
    files: [...COMPLETE_FILES, 'collected/release-linux/Cats-0.2.0-arm64.AppImage'],
    metadataDocuments: completeDocuments(),
  });

  assert.equal(result.ok, false);
  assert.equal(problemCodes(result).includes('artifact_architecture_not_released'), true);
});

test('widening the declared set is all it takes to ship another architecture', () => {
  // The rule is "what we declared", not "arm64 is forbidden". Declaring it
  // makes the same artifact valid without touching the validator.
  const widened = DESKTOP_RELEASE_MATRIX.map((entry) => (entry.platform === 'linux'
    ? { ...entry, arches: [...entry.arches, 'arm64'] }
    : entry));

  const names = [...COMPLETE_FILES, 'collected/release-linux/Cats-0.2.0-arm64.AppImage']
    .map((path) => path.split('/').pop());

  assert.deepEqual(resolveUnreleasedArchitectureArtifacts(names, widened), []);
  assert.deepEqual(resolveDisallowedArtifacts(names, widened), []);
  // Still rejected under the current declaration.
  assert.deepEqual(
    resolveUnreleasedArchitectureArtifacts(names),
    ['Cats-0.2.0-arm64.AppImage'],
  );
});

test('widening the declared set is all it takes to ship another format', () => {
  const widened = DESKTOP_RELEASE_MATRIX.map((entry) => (entry.platform === 'linux'
    ? { ...entry, formats: [...entry.formats, 'deb'] }
    : entry));
  const names = [...COMPLETE_FILES, 'collected/release-linux/Cats-0.2.0-amd64.deb']
    .map((path) => path.split('/').pop());

  assert.deepEqual(resolveDisallowedArtifacts(names, widened), []);
  assert.deepEqual(resolveDisallowedArtifacts(names), ['Cats-0.2.0-amd64.deb']);
});

test('the declared release set is fully allowed', () => {
  const names = COMPLETE_FILES.map((path) => path.split('/').pop());

  assert.deepEqual(resolveDisallowedArtifacts(names), []);
  assert.deepEqual(resolveUnreleasedArchitectureArtifacts(names), []);
});

test('an artifact with no recognizable architecture token is not guessed at', () => {
  assert.deepEqual(
    resolveUnreleasedArchitectureArtifacts(['Cats-0.2.0-setup.exe', 'Cats.AppImage']),
    [],
  );
});

test('the workflow matrix matches the declared release set', async () => {
  const workflow = await readFile(
    join(process.cwd(), '.github', 'workflows', 'desktop-release.yml'),
    'utf8',
  );

  for (const entry of DESKTOP_RELEASE_MATRIX) {
    const block = workflow.slice(workflow.indexOf(`platform: ${entry.platform}`));
    const extraArgs = block.slice(0, block.indexOf('\n          - platform') + 1 || undefined);

    assert.match(
      extraArgs,
      new RegExp(`--format ${entry.formats.join(',')}\\b`, 'u'),
      `${entry.platform} formats drifted from DESKTOP_RELEASE_MATRIX`,
    );
    for (const arch of entry.arches) {
      assert.match(
        extraArgs,
        new RegExp(`--arch ${arch}\\b`, 'u'),
        `${entry.platform} arch ${arch} drifted from DESKTOP_RELEASE_MATRIX`,
      );
    }
  }
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

test('the release workflow publishes stable or preview releases only after validation', async () => {
  const workflow = await readFile(
    join(process.cwd(), '.github', 'workflows', 'desktop-release.yml'),
    'utf8',
  );

  const publishBlock = workflow.slice(workflow.indexOf('  publish:'));
  assert.match(publishBlock, /needs: \[guard, build, validate-assets\]/u);
  assert.match(publishBlock, /--draft=false/u);
  assert.match(publishBlock, /--prerelease/u);
  assert.match(publishBlock, /--latest/u);
});

test('manual release workflow publishes an unsigned prerelease preview', async () => {
  const workflow = await readFile(
    join(process.cwd(), '.github', 'workflows', 'desktop-release.yml'),
    'utf8',
  );

  assert.match(
    workflow,
    /\$\{\{ needs\.guard\.outputs\.preview == 'true' && '--preview' \|\| '--release' \}\}/u,
  );
  assert.match(workflow, /--publish always/u);
  assert.match(workflow, /gh release create "\$TAG" --target "\$COMMIT" --draft --prerelease/u);
  assert.match(workflow, /ref: \$\{\{ needs\.guard\.outputs\.source_commit \}\}/u);
  assert.match(
    workflow,
    /if: matrix\.platform == 'windows' && needs\.guard\.outputs\.preview == 'false'/u,
  );
  assert.match(
    workflow,
    /if: matrix\.platform == 'macos' && needs\.guard\.outputs\.preview == 'false'/u,
  );
  assert.match(
    workflow,
    /'unsigned-preview' \|\| 'release'/u,
  );
  assert.match(
    workflow,
    /preview == 'false' && secrets\.WIN_CSC_LINK \|\| ''/u,
  );
  assert.match(
    workflow,
    /preview == 'false' && secrets\.CSC_LINK \|\| ''/u,
  );
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

test('the release matrix pins every platform to its contracted formats and arch', async () => {
  const workflow = await readFile(
    join(process.cwd(), '.github', 'workflows', 'desktop-release.yml'),
    'utf8',
  );

  assert.match(workflow, /platform: windows[\s\S]*?--format nsis --arch x64/u);
  assert.match(workflow, /platform: macos[\s\S]*?--format dmg,zip --arch universal/u);
  assert.match(workflow, /platform: linux[\s\S]*?--format AppImage --arch x64/u);
});

test('both repositories are checked out inside the workspace', async () => {
  const workflow = await readFile(
    join(process.cwd(), '.github', 'workflows', 'desktop-release.yml'),
    'utf8',
  );

  // actions/checkout rejects a path outside $GITHUB_WORKSPACE, and the
  // installer wrapper resolves cats-runtime as a sibling of the platform root.
  assert.equal(workflow.includes('path: ../cats-runtime'), false);
  assert.match(workflow, /path: cats-platform/u);
  assert.match(workflow, /path: cats-runtime/u);
  assert.match(workflow, /working-directory: cats-runtime\s+run: npm ci/u);
  assert.match(workflow, /repository: cats-inc\/cats-runtime\s+ref: /u);
});

test('signatures are verified on the signing platforms before publication', async () => {
  const workflow = await readFile(
    join(process.cwd(), '.github', 'workflows', 'desktop-release.yml'),
    'utf8',
  );

  assert.match(workflow, /Get-AuthenticodeSignature/u);
  assert.match(workflow, /codesign --verify/u);
  assert.match(workflow, /spctl --assess/u);
});

test('the workflow never tries to override runner-provided GITHUB_ variables', async () => {
  const workflow = await readFile(
    join(process.cwd(), '.github', 'workflows', 'desktop-release.yml'),
    'utf8',
  );

  // Everything in the GITHUB_ namespace except GITHUB_TOKEN is set by the
  // runner and silently ignored when assigned in an `env:` block. Assigning one
  // reads like configuration but does nothing, which is exactly how the first
  // preview run failed.
  for (const reserved of [
    'GITHUB_REF_TYPE',
    'GITHUB_REF_NAME',
    'GITHUB_SHA',
    'GITHUB_REPOSITORY',
    'GITHUB_ACTIONS',
  ]) {
    assert.equal(
      new RegExp(`^\\s+${reserved}:`, 'mu').test(workflow),
      false,
      `${reserved} is runner-provided and cannot be set from an env block`,
    );
  }
});

test('every cross-platform shell step pins bash', async () => {
  const workflow = await readFile(
    join(process.cwd(), '.github', 'workflows', 'desktop-release.yml'),
    'utf8',
  );

  // windows-latest defaults to PowerShell, where "$GITHUB_OUTPUT" is an
  // undefined variable rather than the env var. A step that writes a job
  // output has to pin its shell or it silently records nothing on Windows.
  const stepStart = workflow.indexOf('Record the packaged runtime commit');
  assert.ok(stepStart > 0, 'the runtime commit step must exist');
  const runtimeStep = workflow.slice(stepStart, stepStart + 400);

  assert.match(runtimeStep, /shell: bash/u);
  assert.match(runtimeStep, /GITHUB_OUTPUT/u);
});

test('artifact collection excludes electron-builder diagnostics', async () => {
  const workflow = await readFile(
    join(process.cwd(), '.github', 'workflows', 'desktop-release.yml'),
    'utf8',
  );

  // release/ also holds builder-debug.yml and builder-effective-config.yaml.
  // A broad *.yml sweep collects them and the contract validator then rejects
  // its own inputs.
  assert.match(workflow, /release\/latest\*\.yml/u);
  assert.equal(/release\/\*\.yml/u.test(workflow), false);
});

test('build diagnostics are rejected if they ever reach the validator', () => {
  const result = validateReleaseAssets({
    files: [...COMPLETE_FILES, 'collected/unsigned-preview-linux/builder-debug.yml'],
    metadataDocuments: completeDocuments(),
  });

  assert.equal(result.ok, false);
  assert.equal(problemCodes(result).includes('artifact_outside_release_contract'), true);
});

test('the release tag reaches the installer as an explicit argument', async () => {
  const workflow = await readFile(
    join(process.cwd(), '.github', 'workflows', 'desktop-release.yml'),
    'utf8',
  );

  assert.match(workflow, /--tag \$\{\{ needs\.guard\.outputs\.tag \}\}/u);
  assert.match(workflow, /CATS_DESKTOP_RELEASE_TAG: \$\{\{ needs\.guard\.outputs\.tag \}\}/u);
});

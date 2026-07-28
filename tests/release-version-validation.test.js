import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectVersionProblems,
  parseArgs,
  parseStableReleaseTag,
  readVersionSources,
  validateReleaseVersion,
} from '../scripts/validate-release-version.mjs';

function createVersionSources(version) {
  return {
    packageJson: { version },
    packageLockJson: {
      version,
      packages: {
        '': { version },
      },
    },
  };
}

function problemCodes(result) {
  return result.problems.map((problem) => problem.code);
}

test('release tag validation accepts a stable tag that matches every version source', () => {
  const result = validateReleaseVersion({
    tag: 'v0.2.0',
    ...createVersionSources('0.2.0'),
  });

  assert.equal(result.ok, true);
  assert.equal(result.tag, 'v0.2.0');
  assert.equal(result.version, '0.2.0');
  assert.deepEqual(result.problems, []);
});

test('release tag validation rejects a missing tag before reading versions', () => {
  const result = validateReleaseVersion({
    tag: '   ',
    ...createVersionSources('0.2.0'),
  });

  assert.equal(result.ok, false);
  assert.deepEqual(problemCodes(result), ['tag_missing']);
});

test('release tag validation rejects tags that are not stable vMAJOR.MINOR.PATCH', () => {
  const rejected = ['0.2.0', 'v0.2', 'v0.2.0-rc.1', 'v0.2.0+build', 'release-0.2.0', 'v01.2.0'];

  for (const tag of rejected) {
    const result = validateReleaseVersion({ tag, ...createVersionSources('0.2.0') });
    assert.equal(result.ok, false, `expected ${tag} to be rejected`);
    assert.deepEqual(problemCodes(result), ['tag_malformed'], `unexpected problems for ${tag}`);
  }
});

test('release tag validation reports package.json disagreement', () => {
  const result = validateReleaseVersion({
    tag: 'v0.2.0',
    packageJson: { version: '0.1.1' },
    packageLockJson: { version: '0.2.0', packages: { '': { version: '0.2.0' } } },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(problemCodes(result), ['package_version_mismatch']);
  assert.match(result.problems[0].message, /0\.1\.1/);
});

test('release tag validation reports a stale package-lock root package entry', () => {
  const result = validateReleaseVersion({
    tag: 'v0.2.0',
    packageJson: { version: '0.2.0' },
    packageLockJson: { version: '0.2.0', packages: { '': { version: '0.1.1' } } },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(problemCodes(result), ['lock_root_version_mismatch']);
});

test('release tag validation reports every disagreeing source instead of only the first', () => {
  const result = validateReleaseVersion({
    tag: 'v0.2.0',
    packageJson: { version: '0.1.1' },
    packageLockJson: { version: '0.1.1', packages: { '': { version: '0.1.1' } } },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(problemCodes(result), [
    'package_version_mismatch',
    'lock_version_mismatch',
    'lock_root_version_mismatch',
  ]);
});

test('release version problems flag absent version fields separately from mismatches', () => {
  const problems = collectVersionProblems({
    version: '0.2.0',
    packageJson: {},
    packageLockJson: { packages: {} },
  });

  assert.deepEqual(problems.map((problem) => problem.code), [
    'package_version_missing',
    'lock_version_missing',
    'lock_root_version_missing',
  ]);
});

test('stable release tag parsing strips the leading v for the package version', () => {
  const parsed = parseStableReleaseTag('  v12.3.45  ');

  assert.equal(parsed.ok, true);
  assert.equal(parsed.tag, 'v12.3.45');
  assert.equal(parsed.version, '12.3.45');
});

test('release version args prefer an explicit tag over the workflow ref name', () => {
  const parsed = parseArgs(['--tag', 'v0.3.0'], { GITHUB_REF_NAME: 'v0.2.0' });

  assert.equal(parsed.help, false);
  assert.equal(parsed.tag, 'v0.3.0');
  assert.equal(parsed.json, false);
});

test('release version args fall back to the workflow ref name', () => {
  const parsed = parseArgs([], { GITHUB_REF_NAME: 'v0.2.0' });

  assert.equal(parsed.tag, 'v0.2.0');
});

test('release version args expose the json flag and reject unknown options', () => {
  assert.equal(parseArgs(['--json'], {}).json, true);
  assert.equal(parseArgs(['--help'], {}).help, true);
  assert.throws(() => parseArgs(['--publish'], {}), /Unknown option: --publish/);
});

test('release version sources read the repository package and lock files', async () => {
  const { packageJson, packageLockJson } = await readVersionSources();

  assert.equal(typeof packageJson.version, 'string');
  assert.equal(packageLockJson.version, packageJson.version);
  assert.equal(packageLockJson.packages[''].version, packageJson.version);

  const result = validateReleaseVersion({
    tag: `v${packageJson.version}`,
    packageJson,
    packageLockJson,
  });
  assert.equal(result.ok, true);
});

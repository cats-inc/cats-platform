import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildInstallerEnvironment,
  electronBuilderArgs,
  hasWindowsSigningCredentials,
  parseArgs,
  resolveReleaseModeProblems,
} from '../scripts/build-desktop-installer.mjs';

function problemCodes(problems) {
  return problems.map((problem) => problem.code);
}

test('local packaging keeps the non-publishing electron-builder invocation', () => {
  const args = electronBuilderArgs('windows', null, null);

  assert.deepEqual(args, ['electron-builder', '--win', '--publish', 'never']);
});

test('release packaging selects the publishing electron-builder invocation', () => {
  const args = electronBuilderArgs('windows', null, null, { releaseMode: true });

  assert.deepEqual(args, ['electron-builder', '--win', '--publish', 'always']);
});

test('release packaging re-enables Windows executable signing only with credentials', () => {
  const signed = electronBuilderArgs('windows', null, null, {
    releaseMode: true,
    signWindowsExecutable: true,
  });
  assert.deepEqual(signed, [
    'electron-builder',
    '--win',
    '-c.win.signAndEditExecutable=true',
    '--publish',
    'always',
  ]);

  const unsigned = electronBuilderArgs('windows', null, null, { releaseMode: true });
  assert.equal(unsigned.includes('-c.win.signAndEditExecutable=true'), false);
});

test('local packaging never re-enables Windows executable signing', () => {
  const args = electronBuilderArgs('windows', null, null, { signWindowsExecutable: true });

  assert.deepEqual(args, ['electron-builder', '--win', '--publish', 'never']);
});

test('the Windows signing override never leaks into macOS or Linux release builds', () => {
  for (const target of ['macos', 'linux']) {
    const args = electronBuilderArgs(target, null, null, {
      releaseMode: true,
      signWindowsExecutable: true,
    });
    assert.equal(args.includes('-c.win.signAndEditExecutable=true'), false, target);
    assert.deepEqual(args.slice(-2), ['--publish', 'always'], target);
  }
});

test('local installer environment still disables signing identity discovery', () => {
  const env = buildInstallerEnvironment({ KEEP_ME: '1' });

  assert.equal(env.CSC_IDENTITY_AUTO_DISCOVERY, 'false');
  assert.equal(env.KEEP_ME, '1');
});

test('release installer environment leaves signing identity discovery to the workflow', () => {
  const env = buildInstallerEnvironment(
    { WIN_CSC_LINK: 'file:///tmp/windows-signing.p12', WIN_CSC_KEY_PASSWORD: 'win-secret' },
    { releaseMode: true },
  );

  assert.equal('CSC_IDENTITY_AUTO_DISCOVERY' in env, false);
  assert.equal(env.WIN_CSC_LINK, 'file:///tmp/windows-signing.p12');
  assert.equal(env.WIN_CSC_KEY_PASSWORD, 'win-secret');
});

test('release installer environment still drops empty signing credentials', () => {
  const env = buildInstallerEnvironment(
    { CSC_LINK: '', WIN_CSC_LINK: '   ', CSC_KEY_PASSWORD: '', WIN_CSC_KEY_PASSWORD: '' },
    { releaseMode: true },
  );

  assert.equal('CSC_LINK' in env, false);
  assert.equal('WIN_CSC_LINK' in env, false);
  assert.equal('CSC_KEY_PASSWORD' in env, false);
  assert.equal('WIN_CSC_KEY_PASSWORD' in env, false);
});

test('Windows signing credential detection accepts either the scoped or shared link', () => {
  assert.equal(hasWindowsSigningCredentials({ WIN_CSC_LINK: 'file:///tmp/win.p12' }), true);
  assert.equal(hasWindowsSigningCredentials({ CSC_LINK: 'file:///tmp/shared.p12' }), true);
  assert.equal(hasWindowsSigningCredentials({ WIN_CSC_LINK: '   ' }), false);
  assert.equal(hasWindowsSigningCredentials({}), false);
});

test('installer args expose release mode through the flag and the environment', () => {
  assert.equal(parseArgs([], {}).releaseMode, false);
  assert.equal(parseArgs(['--release'], {}).releaseMode, true);
  assert.equal(parseArgs([], { CATS_DESKTOP_RELEASE_MODE: '1' }).releaseMode, true);
  assert.equal(
    parseArgs(['--no-release'], { CATS_DESKTOP_RELEASE_MODE: 'true' }).releaseMode,
    false,
  );
});

test('release mode accepts a stable tag paired with a GitHub token', () => {
  const problems = resolveReleaseModeProblems({
    env: { GITHUB_REF_NAME: 'v0.2.0', GITHUB_TOKEN: 'token' },
  });

  assert.deepEqual(problems, []);
});

test('release mode rejects a missing or non-stable tag', () => {
  assert.deepEqual(
    problemCodes(resolveReleaseModeProblems({ env: { GITHUB_TOKEN: 'token' } })),
    ['release_tag_missing'],
  );
  assert.deepEqual(
    problemCodes(resolveReleaseModeProblems({
      env: { GITHUB_REF_NAME: 'main', GITHUB_TOKEN: 'token' },
    })),
    ['release_tag_malformed'],
  );
  assert.deepEqual(
    problemCodes(resolveReleaseModeProblems({
      env: { GITHUB_REF_NAME: 'v0.2.0-rc.1', GITHUB_TOKEN: 'token' },
    })),
    ['release_tag_malformed'],
  );
});

test('release mode rejects a run without a GitHub publish token', () => {
  const problems = resolveReleaseModeProblems({ env: { GITHUB_REF_NAME: 'v0.2.0' } });

  assert.deepEqual(problemCodes(problems), ['release_token_missing']);
});

test('release mode reports tag and token problems together', () => {
  const problems = resolveReleaseModeProblems({ env: {} });

  assert.deepEqual(problemCodes(problems), ['release_tag_missing', 'release_token_missing']);
});

test('release mode prefers an explicit tag over the workflow ref name', () => {
  const problems = resolveReleaseModeProblems({
    env: { GITHUB_REF_NAME: 'main', GH_TOKEN: 'token' },
    tag: 'v1.0.0',
  });

  assert.deepEqual(problems, []);
});

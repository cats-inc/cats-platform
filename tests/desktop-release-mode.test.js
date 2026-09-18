import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildInstallerEnvironment,
  electronBuilderArgs,
  hasMacosNotarizationCredentials,
  hasMacosSigningCredentials,
  hasWindowsSigningCredentials,
  parseArgs,
  resolvePublishPolicy,
  resolveReleaseModeProblems,
  resolveSigningProblems,
} from '../scripts/build-desktop-installer.mjs';

function problemCodes(problems) {
  return problems.map((problem) => problem.code);
}

// A workflow run that satisfies every non-signing precondition.
function workflowEnv(overrides = {}) {
  return {
    GITHUB_ACTIONS: 'true',
    GITHUB_REF_TYPE: 'tag',
    GITHUB_REF_NAME: 'v0.2.0',
    GITHUB_TOKEN: 'token',
    WIN_CSC_LINK: 'file:///tmp/win.p12',
    CSC_LINK: 'file:///tmp/mac.p12',
    APPLE_API_KEY: '/tmp/apple-api-key.p8',
    APPLE_API_KEY_ID: 'ABCD123456',
    APPLE_API_ISSUER: '11111111-2222-3333-4444-555555555555',
    ...overrides,
  };
}

test('local packaging keeps the non-publishing electron-builder invocation', () => {
  const args = electronBuilderArgs('windows', null, null);

  assert.deepEqual(args, ['electron-builder', '--win', '--publish', 'never']);
});

test('publish policy is independent of official release mode', () => {
  // The wrapper can validate official inputs without publishing.
  assert.deepEqual(
    electronBuilderArgs('windows', null, null, { releaseMode: true }),
    ['electron-builder', '--win', '--publish', 'never'],
  );
  // Official build that publishes: the tag run.
  assert.deepEqual(
    electronBuilderArgs('windows', null, null, { releaseMode: true, publish: 'always' }),
    ['electron-builder', '--win', '--publish', 'always'],
  );
});

test('publish policy rejects anything outside never and always', () => {
  assert.equal(resolvePublishPolicy(''), 'never');
  assert.equal(resolvePublishPolicy(undefined), 'never');
  assert.equal(resolvePublishPolicy('always'), 'always');
  assert.throws(() => resolvePublishPolicy('onTag'), /Unsupported publish policy/u);
});

test('release packaging re-enables Windows executable signing only with credentials', () => {
  const signed = electronBuilderArgs('windows', null, null, {
    releaseMode: true,
    publish: 'always',
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

test('release packaging enables macOS notarization only with credentials', () => {
  const notarized = electronBuilderArgs('macos', null, null, {
    releaseMode: true,
    publish: 'always',
    notarizeMacos: true,
  });
  assert.deepEqual(notarized, [
    'electron-builder',
    '--mac',
    '-c.mac.notarize=true',
    '--publish',
    'always',
  ]);

  const unnotarized = electronBuilderArgs('macos', null, null, { releaseMode: true });
  assert.equal(unnotarized.includes('-c.mac.notarize=true'), false);
});

test('local packaging never enables macOS notarization', () => {
  // package.json pins mac.notarize to false, so an unsigned local build never
  // reaches out to Apple even on a machine that happens to have credentials.
  const args = electronBuilderArgs('macos', null, null, { notarizeMacos: true });

  assert.deepEqual(args, ['electron-builder', '--mac', '--publish', 'never']);
});

test('the macOS notarization override never leaks into Windows or Linux release builds', () => {
  for (const target of ['windows', 'linux']) {
    const args = electronBuilderArgs(target, null, null, {
      releaseMode: true,
      publish: 'always',
      notarizeMacos: true,
    });
    assert.equal(args.includes('-c.mac.notarize=true'), false, target);
  }
});

test('local packaging never re-enables Windows executable signing', () => {
  const args = electronBuilderArgs('windows', null, null, { signWindowsExecutable: true });

  assert.deepEqual(args, ['electron-builder', '--win', '--publish', 'never']);
});

test('the Windows signing override never leaks into macOS or Linux release builds', () => {
  for (const target of ['macos', 'linux']) {
    const args = electronBuilderArgs(target, null, null, {
      releaseMode: true,
      publish: 'always',
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
    {
      CSC_LINK: '',
      WIN_CSC_LINK: '   ',
      CSC_KEY_PASSWORD: '',
      WIN_CSC_KEY_PASSWORD: '',
      APPLE_API_KEY: '',
      APPLE_API_KEY_ID: '   ',
      APPLE_API_ISSUER: '',
    },
    { releaseMode: true },
  );

  assert.equal('CSC_LINK' in env, false);
  assert.equal('WIN_CSC_LINK' in env, false);
  assert.equal('CSC_KEY_PASSWORD' in env, false);
  assert.equal('WIN_CSC_KEY_PASSWORD' in env, false);
  // An empty APPLE_API_KEY would be resolved as a relative path and reported as
  // a missing key file rather than as an unconfigured release.
  assert.equal('APPLE_API_KEY' in env, false);
  assert.equal('APPLE_API_KEY_ID' in env, false);
  assert.equal('APPLE_API_ISSUER' in env, false);
});

test('Windows signing credential detection accepts either the scoped or shared link', () => {
  assert.equal(hasWindowsSigningCredentials({ WIN_CSC_LINK: 'file:///tmp/win.p12' }), true);
  assert.equal(hasWindowsSigningCredentials({ CSC_LINK: 'file:///tmp/shared.p12' }), true);
  assert.equal(hasWindowsSigningCredentials({ WIN_CSC_LINK: '   ' }), false);
  assert.equal(hasWindowsSigningCredentials({}), false);
});

test('installer args expose release mode and publish policy independently', () => {
  assert.deepEqual(
    [parseArgs([], {}).releaseMode, parseArgs([], {}).publish],
    [false, 'never'],
  );
  assert.equal(parseArgs(['--release'], {}).releaseMode, true);
  assert.equal(parseArgs(['--release'], {}).publish, 'never');
  assert.equal(parseArgs(['--preview'], {}).previewMode, true);
  assert.equal(parseArgs(['--publish', 'always'], {}).publish, 'always');
  assert.equal(parseArgs([], { CATS_DESKTOP_RELEASE_MODE: '1' }).releaseMode, true);
  assert.equal(parseArgs([], { CATS_DESKTOP_PREVIEW_MODE: '1' }).previewMode, true);
  assert.equal(parseArgs([], { CATS_DESKTOP_PUBLISH: 'always' }).publish, 'always');
  assert.equal(
    parseArgs(['--no-release'], { CATS_DESKTOP_RELEASE_MODE: 'true' }).releaseMode,
    false,
  );
});

test('an unsigned preview keeps tag and token gates but does not require signing', () => {
  const problems = resolveReleaseModeProblems({
    env: workflowEnv({ WIN_CSC_LINK: undefined, CSC_LINK: undefined }),
    target: 'windows',
    packageVersion: '0.2.0',
    publish: 'always',
    requireSigning: false,
  });

  assert.deepEqual(problems, []);
});

test('a complete workflow tag run passes every release precondition', () => {
  const problems = resolveReleaseModeProblems({
    env: workflowEnv(),
    target: 'windows',
    packageVersion: '0.2.0',
    publish: 'always',
  });

  assert.deepEqual(problems, []);
});

test('release mode refuses to run outside GitHub Actions', () => {
  const problems = resolveReleaseModeProblems({
    env: workflowEnv({ GITHUB_ACTIONS: undefined }),
    target: 'windows',
    packageVersion: '0.2.0',
  });

  assert.equal(problemCodes(problems).includes('release_not_in_workflow'), true);
});

test('a stable release refuses a branch ref even inside GitHub Actions', () => {
  const problems = resolveReleaseModeProblems({
    env: workflowEnv({ GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'main' }),
    target: 'windows',
    packageVersion: '0.2.0',
  });

  assert.equal(problemCodes(problems).includes('release_ref_not_tag'), true);
  assert.equal(problemCodes(problems).includes('release_tag_malformed'), true);
});

test('a preview accepts a branch ref because it creates its tag during the run', () => {
  // workflow_dispatch always runs on a branch. Requiring a tag ref here would
  // reject every preview.
  const problems = resolveReleaseModeProblems({
    env: workflowEnv({ GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'main' }),
    tag: 'v0.2.0',
    target: 'windows',
    packageVersion: '0.2.0',
    publish: 'always',
    requireSigning: false,
    requireTagRef: false,
  });

  assert.deepEqual(problems, []);
});

test('an explicit tag input wins over the runner-provided ref name', () => {
  // GITHUB_REF_NAME cannot be overridden from a workflow env block, so the
  // wrapper must accept the tag as a real argument.
  assert.equal(parseArgs(['--tag', 'v1.2.3'], { GITHUB_REF_NAME: 'main' }).tag, 'v1.2.3');
  assert.equal(parseArgs([], { CATS_DESKTOP_RELEASE_TAG: 'v1.2.3' }).tag, 'v1.2.3');
  assert.equal(parseArgs([], { GITHUB_REF_NAME: 'v0.9.0' }).tag, 'v0.9.0');
  assert.equal(parseArgs([], {}).tag, '');
});

test('release mode refuses a tag that disagrees with the package version', () => {
  const problems = resolveReleaseModeProblems({
    env: workflowEnv(),
    target: 'windows',
    packageVersion: '0.3.0',
  });

  assert.deepEqual(problemCodes(problems), ['release_version_mismatch']);
});

test('release mode rejects a missing or non-stable tag', () => {
  assert.equal(
    problemCodes(resolveReleaseModeProblems({
      env: workflowEnv({ GITHUB_REF_NAME: undefined }),
      target: 'windows',
    })).includes('release_tag_missing'),
    true,
  );
  assert.equal(
    problemCodes(resolveReleaseModeProblems({
      env: workflowEnv({ GITHUB_REF_NAME: 'v0.2.0-rc.1' }),
      target: 'windows',
    })).includes('release_tag_malformed'),
    true,
  );
});

test('an official Windows release refuses to build without signing credentials', () => {
  const problems = resolveReleaseModeProblems({
    env: workflowEnv({ WIN_CSC_LINK: undefined, CSC_LINK: undefined }),
    target: 'windows',
    packageVersion: '0.2.0',
  });

  assert.deepEqual(problemCodes(problems), ['release_windows_signing_missing']);
});

test('an official macOS release refuses to build without signing credentials', () => {
  const problems = resolveReleaseModeProblems({
    env: workflowEnv({ CSC_LINK: undefined }),
    target: 'macos',
    packageVersion: '0.2.0',
  });

  assert.deepEqual(problemCodes(problems), ['release_macos_signing_missing']);
});

test('Linux needs no signing credentials', () => {
  assert.deepEqual(
    resolveSigningProblems({ env: {}, target: 'linux' }),
    [],
  );
  assert.deepEqual(
    problemCodes(resolveSigningProblems({ env: {}, target: 'windows' })),
    ['release_windows_signing_missing'],
  );
  assert.deepEqual(
    problemCodes(resolveSigningProblems({ env: {}, target: 'macos' })),
    ['release_macos_signing_missing', 'release_macos_notarization_missing'],
  );
});

test('an official macOS release refuses to build without notarization credentials', () => {
  // Signed but un-notarized is the trap this gate exists for: electron-builder
  // only warns when the credentials are absent, and Gatekeeper then rejects the
  // download on every machine except the one that built it.
  const problems = resolveReleaseModeProblems({
    env: workflowEnv({ APPLE_API_ISSUER: undefined }),
    target: 'macos',
    packageVersion: '0.2.0',
  });

  assert.deepEqual(problemCodes(problems), ['release_macos_notarization_missing']);
});

test('macOS notarization detection requires the whole App Store Connect key', () => {
  assert.equal(hasMacosNotarizationCredentials({
    APPLE_API_KEY: '/tmp/apple-api-key.p8',
    APPLE_API_KEY_ID: 'ABCD123456',
    APPLE_API_ISSUER: '11111111-2222-3333-4444-555555555555',
  }), true);
  assert.equal(hasMacosNotarizationCredentials({
    APPLE_API_KEY: '/tmp/apple-api-key.p8',
    APPLE_API_KEY_ID: 'ABCD123456',
  }), false);
  assert.equal(hasMacosNotarizationCredentials({
    APPLE_API_KEY: '/tmp/apple-api-key.p8',
    APPLE_API_KEY_ID: '   ',
    APPLE_API_ISSUER: '11111111-2222-3333-4444-555555555555',
  }), false);
  assert.equal(hasMacosNotarizationCredentials({}), false);
  // The macOS certificate alone must not be read as permission to notarize.
  assert.equal(hasMacosNotarizationCredentials({ CSC_LINK: 'file:///tmp/mac.p12' }), false);
});

test('macOS signing detection ignores the Windows-scoped credential', () => {
  assert.equal(hasMacosSigningCredentials({ CSC_LINK: 'file:///tmp/mac.p12' }), true);
  assert.equal(hasMacosSigningCredentials({ WIN_CSC_LINK: 'file:///tmp/win.p12' }), false);
  assert.equal(hasMacosSigningCredentials({}), false);
});

test('a token is required only when the build actually publishes', () => {
  const withoutToken = workflowEnv({ GITHUB_TOKEN: undefined });

  assert.deepEqual(
    resolveReleaseModeProblems({
      env: withoutToken,
      target: 'linux',
      packageVersion: '0.2.0',
      publish: 'never',
    }),
    [],
  );
  assert.deepEqual(
    problemCodes(resolveReleaseModeProblems({
      env: withoutToken,
      target: 'linux',
      packageVersion: '0.2.0',
      publish: 'always',
    })),
    ['release_token_missing'],
  );
});

test('release mode reports every failed precondition together', () => {
  const problems = resolveReleaseModeProblems({
    env: {},
    target: 'windows',
    packageVersion: '0.2.0',
    publish: 'always',
  });

  assert.deepEqual(problemCodes(problems), [
    'release_not_in_workflow',
    'release_tag_missing',
    'release_windows_signing_missing',
    'release_token_missing',
  ]);
});

test('release mode prefers an explicit tag over the workflow ref name', () => {
  const problems = resolveReleaseModeProblems({
    env: workflowEnv({ GITHUB_REF_NAME: 'main' }),
    tag: 'v1.0.0',
    target: 'linux',
    packageVersion: '1.0.0',
  });

  assert.deepEqual(problems, []);
});

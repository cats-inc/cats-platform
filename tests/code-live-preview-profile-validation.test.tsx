import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BUILTIN_LIVE_PREVIEW_PROFILES,
  DEFAULT_LIVE_PREVIEW_CONFIG,
  VITE_LIVE_PREVIEW_PROFILE,
  type LivePreviewCommandProfile,
  type LivePreviewConfig,
} from '../src/products/code/livePreview/contracts.ts';
import {
  validateLivePreviewCommandProfile,
  validateLivePreviewConfig,
  validateLivePreviewStartRequest,
} from '../src/products/code/livePreview/profileValidation.ts';

const VITE_PROFILE: LivePreviewCommandProfile = {
  id: 'vite',
  label: 'Vite dev server',
  executable: 'npm',
  args: ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '{port}'],
  workingDirectory: 'workspaceRoot',
  port: { mode: 'argument', name: '--port' },
  readiness: { path: '/', timeoutMs: 30_000, intervalMs: 500, expectedStatus: 200 },
  stop: { graceMs: 2_000, killProcessTree: true },
};

function enabledConfig(profile: LivePreviewCommandProfile = VITE_PROFILE): LivePreviewConfig {
  return {
    ...DEFAULT_LIVE_PREVIEW_CONFIG,
    enabled: true,
    commandProfiles: [profile],
  };
}

test('Cats Code live preview command profiles allow declarative preview commands', () => {
  assert.doesNotThrow(() => validateLivePreviewCommandProfile(VITE_PROFILE));
  assert.doesNotThrow(() => validateLivePreviewConfig(enabledConfig()));
});

test('Cats Code live preview command profiles reject raw shell forms', () => {
  assert.throws(
    () => validateLivePreviewCommandProfile({ ...VITE_PROFILE, executable: 'npm run dev' }),
    /one command token/u,
  );
  assert.throws(
    () =>
      validateLivePreviewCommandProfile({
        ...VITE_PROFILE,
        args: ['run', 'dev', '&&', 'curl', 'https://example.com'],
      }),
    /shell metacharacters/u,
  );
  assert.throws(
    () =>
      validateLivePreviewCommandProfile({
        ...VITE_PROFILE,
        args: ['run', 'dev', '--', '--root', '{repoRoot}'],
      }),
    /unsupported placeholder/u,
  );
});

test('Cats Code live preview start validation requires enabled profiles', () => {
  const disabled = validateLivePreviewStartRequest(validStartRequest(), DEFAULT_LIVE_PREVIEW_CONFIG);
  assert.equal(disabled.status, 'rejected');
  if (disabled.status === 'rejected') {
    assert.equal(disabled.error.code, 'live_preview_disabled');
  }

  const accepted = validateLivePreviewStartRequest(validStartRequest(), enabledConfig());
  assert.equal(accepted.status, 'accepted');
  if (accepted.status === 'accepted') {
    assert.equal(accepted.profile.id, 'vite');
    assert.equal(accepted.request.workspace.rootPath, 'C:/repo/app');
  }
});

test('Cats Code live preview start validation rejects raw command bypass attempts', () => {
  const result = validateLivePreviewStartRequest(
    {
      ...validStartRequest(),
      command: 'npm run dev -- --port 47100',
    },
    enabledConfig(),
  );

  assert.equal(result.status, 'rejected');
  if (result.status === 'rejected') {
    assert.equal(result.error.code, 'live_preview_raw_command_not_allowed');
  }
});

test('Cats Code live preview start validation rejects missing or disabled profiles', () => {
  const missing = validateLivePreviewStartRequest(
    { ...validStartRequest(), commandProfileId: 'unknown' },
    enabledConfig(),
  );
  assert.equal(missing.status, 'rejected');
  if (missing.status === 'rejected') {
    assert.equal(missing.error.code, 'live_preview_command_profile_not_found');
  }

  const disabledProfile = validateLivePreviewStartRequest(
    validStartRequest(),
    enabledConfig({ ...VITE_PROFILE, enabled: false }),
  );
  assert.equal(disabledProfile.status, 'rejected');
  if (disabledProfile.status === 'rejected') {
    assert.equal(disabledProfile.error.code, 'live_preview_command_profile_disabled');
  }
});

test('Built-in Vite live preview profile is reviewed but stays disabled by default', () => {
  assert.doesNotThrow(() => validateLivePreviewCommandProfile(VITE_LIVE_PREVIEW_PROFILE));
  assert.equal(VITE_LIVE_PREVIEW_PROFILE.enabled, false);
  assert.equal(VITE_LIVE_PREVIEW_PROFILE.workingDirectory, 'artifactDirectory');
  assert.deepEqual(BUILTIN_LIVE_PREVIEW_PROFILES, [VITE_LIVE_PREVIEW_PROFILE]);
  assert.deepEqual(DEFAULT_LIVE_PREVIEW_CONFIG.commandProfiles, []);
});

function validStartRequest(): Record<string, unknown> {
  return {
    commandProfileId: 'vite',
    workspace: {
      kind: 'code_workspace',
      id: 'workspace-1',
      rootPath: 'C:/repo/app',
    },
    surface: {
      kind: 'code_task',
      surfaceId: 'task-1',
    },
    artifactTitle: 'Preview',
    readinessTimeoutMs: 30_000,
  };
}

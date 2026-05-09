import assert from 'node:assert/strict';
import test from 'node:test';

import { loadConfig } from '../src/config.ts';
import {
  DEFAULT_LIVE_PREVIEW_CONFIG,
  type LivePreviewCommandProfile,
} from '../src/products/code/livePreview/contracts.ts';

function baseEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    HOME: 'C:/Users/tester',
    ...overrides,
  };
}

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

test('loadConfig exposes disabled-by-default Cats Code live preview config', () => {
  const config = loadConfig(baseEnv());

  assert.deepEqual(config.codeLivePreview, DEFAULT_LIVE_PREVIEW_CONFIG);
});

test('loadConfig accepts Cats Code live preview env overrides and profiles', () => {
  const config = loadConfig(baseEnv({
    CATS_CODE_LIVE_PREVIEW_ENABLED: 'true',
    CATS_CODE_LIVE_PREVIEW_PORT_RANGE: '47150-47155',
    CATS_CODE_LIVE_PREVIEW_MAX_GLOBAL: '2',
    CATS_CODE_LIVE_PREVIEW_MAX_PER_WORKSPACE: '1',
    CATS_CODE_LIVE_PREVIEW_LEASE_TTL_MS: '60000',
    CATS_CODE_LIVE_PREVIEW_LOG_MAX_BYTES: '4096',
    CATS_CODE_LIVE_PREVIEW_ALLOW_IPV6_LOOPBACK: 'true',
    CATS_CODE_LIVE_PREVIEW_COMMAND_PROFILES: JSON.stringify([VITE_PROFILE]),
  }));

  assert.deepEqual(config.codeLivePreview, {
    enabled: true,
    useRealProcessAdapter: false,
    portRange: { start: 47_150, end: 47_155 },
    maxConcurrentGlobal: 2,
    maxConcurrentPerWorkspace: 1,
    defaultLeaseTtlMs: 60_000,
    logMaxBytes: 4096,
    allowIpv6Loopback: true,
    commandProfiles: [VITE_PROFILE],
  });
});

test('loadConfig validates Cats Code live preview boot config', () => {
  assert.throws(
    () =>
      loadConfig(baseEnv({
        CATS_CODE_LIVE_PREVIEW_PORT_RANGE: '47199-47100',
      })),
    /start must be <= end/u,
  );
  assert.throws(
    () =>
      loadConfig(baseEnv({
        CATS_CODE_LIVE_PREVIEW_MAX_GLOBAL: 'zero',
      })),
    /CATS_CODE_LIVE_PREVIEW_MAX_GLOBAL must be a positive integer/u,
  );
  assert.throws(
    () =>
      loadConfig(baseEnv({
        CATS_CODE_LIVE_PREVIEW_COMMAND_PROFILES: JSON.stringify([
          { ...VITE_PROFILE, executable: 'npm run dev' },
        ]),
      })),
    /executable must be one command token/u,
  );
});

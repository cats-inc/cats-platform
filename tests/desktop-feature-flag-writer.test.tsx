import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  COMPANION_PROFILE_IA_FLAG,
  applyDesktopFeatureFlagWrite,
  decideDesktopFeatureFlagWrite,
  readDesktopFeatureFlagsFile,
  writeDesktopFeatureFlagsFile,
} from '../desktop/host/featureFlagWriter.ts';

async function withTempFlags<T>(
  fn: (filePath: string) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cats-desktop-flags-'));
  try {
    return await fn(path.join(dir, 'state', 'feature-flags.json'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('decideDesktopFeatureFlagWrite mirrors the production guard from src/shared/featureFlags', () => {
  assert.equal(
    decideDesktopFeatureFlagWrite({
      name: 'cats.bogus',
      value: true,
      buildChannel: 'development',
    }).status,
    'unknown_flag',
  );

  const blocked = decideDesktopFeatureFlagWrite({
    name: COMPANION_PROFILE_IA_FLAG,
    value: true,
    buildChannel: 'production',
  });
  assert.equal(blocked.status, 'feature_flag_blocked');
  if (blocked.status === 'feature_flag_blocked') {
    assert.equal(blocked.unlockRequirement, 'phase2_profile_read_model_guards');
  }

  const ok = decideDesktopFeatureFlagWrite({
    name: COMPANION_PROFILE_IA_FLAG,
    value: true,
    buildChannel: 'development',
  });
  assert.equal(ok.status, 'ok');
});

test('decideDesktopFeatureFlagWrite always allows clearing back to false on production', () => {
  const decision = decideDesktopFeatureFlagWrite({
    name: COMPANION_PROFILE_IA_FLAG,
    value: false,
    buildChannel: 'production',
  });
  assert.equal(decision.status, 'ok');
});

test('writeDesktopFeatureFlagsFile + read round-trips silently dropping non-boolean values', async () => {
  await withTempFlags(async (filePath) => {
    await writeDesktopFeatureFlagsFile(filePath, {
      [COMPANION_PROFILE_IA_FLAG]: true,
      // @ts-expect-error — runtime-only invalid input
      'cats.weird.string': 'on',
    });
    const text = await readFile(filePath, 'utf8');
    assert.equal(
      text,
      `{\n  "${COMPANION_PROFILE_IA_FLAG}": true\n}\n`,
    );
    const parsed = await readDesktopFeatureFlagsFile(filePath);
    assert.deepEqual(parsed, { [COMPANION_PROFILE_IA_FLAG]: true });
  });
});

test('readDesktopFeatureFlagsFile returns {} for missing or malformed JSON', async () => {
  await withTempFlags(async (filePath) => {
    assert.deepEqual(await readDesktopFeatureFlagsFile(filePath), {});
  });
});

test('applyDesktopFeatureFlagWrite persists ok writes and skips writing on blocked / unknown', async () => {
  await withTempFlags(async (filePath) => {
    const blocked = await applyDesktopFeatureFlagWrite({
      filePath,
      name: COMPANION_PROFILE_IA_FLAG,
      value: true,
      buildChannel: 'production',
    });
    assert.equal(blocked.status, 'feature_flag_blocked');
    assert.deepEqual(await readDesktopFeatureFlagsFile(filePath), {});

    const ok = await applyDesktopFeatureFlagWrite({
      filePath,
      name: COMPANION_PROFILE_IA_FLAG,
      value: true,
      buildChannel: 'development',
    });
    assert.equal(ok.status, 'ok');
    assert.deepEqual(
      await readDesktopFeatureFlagsFile(filePath),
      { [COMPANION_PROFILE_IA_FLAG]: true },
    );

    const unknown = await applyDesktopFeatureFlagWrite({
      filePath,
      name: 'cats.bogus',
      value: true,
      buildChannel: 'development',
    });
    assert.equal(unknown.status, 'unknown_flag');
    assert.deepEqual(
      await readDesktopFeatureFlagsFile(filePath),
      { [COMPANION_PROFILE_IA_FLAG]: true },
    );
  });
});

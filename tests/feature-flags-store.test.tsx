import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  readPersistedPlatformFeatureFlags,
  writePersistedPlatformFeatureFlags,
} from '../src/shared/featureFlagsStore.ts';

async function withTempDir<T>(
  fn: (dir: string) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cats-feature-flags-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('readPersistedPlatformFeatureFlags returns an empty map when the file is missing', async () => {
  await withTempDir(async (dir) => {
    const result = await readPersistedPlatformFeatureFlags(
      path.join(dir, 'feature-flags.json'),
    );
    assert.deepEqual(result, {});
  });
});

test('readPersistedPlatformFeatureFlags returns an empty map when JSON is malformed', async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, 'feature-flags.json');
    await writeFile(filePath, '{not-json', 'utf8');
    const result = await readPersistedPlatformFeatureFlags(filePath);
    assert.deepEqual(result, {});
  });
});

test('readPersistedPlatformFeatureFlags returns an empty map when the root is not an object', async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, 'feature-flags.json');
    await writeFile(filePath, '[true, false]', 'utf8');
    const result = await readPersistedPlatformFeatureFlags(filePath);
    assert.deepEqual(result, {});
  });
});

test('readPersistedPlatformFeatureFlags drops non-boolean values silently', async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, 'feature-flags.json');
    await writeFile(
      filePath,
      JSON.stringify({
        'cats.chat.companionProfileIA': true,
        'cats.weird.string': 'on',
        'cats.weird.null': null,
        'cats.weird.number': 1,
      }),
      'utf8',
    );
    const result = await readPersistedPlatformFeatureFlags(filePath);
    assert.deepEqual(result, { 'cats.chat.companionProfileIA': true });
  });
});

test('writePersistedPlatformFeatureFlags writes a stable JSON layout', async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, 'feature-flags.json');
    await writePersistedPlatformFeatureFlags(filePath, {
      'cats.chat.companionProfileIA': true,
      'cats.future.flag': false,
    });
    const text = await readFile(filePath, 'utf8');
    assert.equal(
      text,
      '{\n  "cats.chat.companionProfileIA": true,\n  "cats.future.flag": false\n}\n',
    );
  });
});

test('writePersistedPlatformFeatureFlags is round-trippable via the reader', async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, 'feature-flags.json');
    await writePersistedPlatformFeatureFlags(filePath, {
      'cats.chat.companionProfileIA': true,
    });
    const result = await readPersistedPlatformFeatureFlags(filePath);
    assert.deepEqual(result, { 'cats.chat.companionProfileIA': true });
  });
});

test('writePersistedPlatformFeatureFlags strips non-boolean values before writing', async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, 'feature-flags.json');
    await writePersistedPlatformFeatureFlags(filePath, {
      // @ts-expect-error — intentionally invalid runtime value
      'cats.weird': 'on',
      'cats.real': true,
    });
    const result = await readPersistedPlatformFeatureFlags(filePath);
    assert.deepEqual(result, { 'cats.real': true });
  });
});

test('writePersistedPlatformFeatureFlags creates the parent directory when it does not exist', async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, 'nested', 'state', 'feature-flags.json');
    await writePersistedPlatformFeatureFlags(filePath, {
      'cats.chat.companionProfileIA': false,
    });
    const result = await readPersistedPlatformFeatureFlags(filePath);
    assert.deepEqual(result, { 'cats.chat.companionProfileIA': false });
  });
});

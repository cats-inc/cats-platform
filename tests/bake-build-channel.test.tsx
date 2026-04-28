import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { bakeBuildChannel } from '../scripts/shared/bake-build-channel.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILD_CHANNEL_FILE = path.resolve(
  HERE,
  '..',
  'src',
  'shared',
  'buildChannel.ts',
);

async function withRestoredBuildChannel<T>(fn: () => Promise<T>): Promise<T> {
  const original = await readFile(BUILD_CHANNEL_FILE, 'utf8');
  try {
    return await fn();
  } finally {
    await writeFile(BUILD_CHANNEL_FILE, original, 'utf8');
  }
}

test('bake helper rejects unknown channel values', async () => {
  await withRestoredBuildChannel(async () => {
    await assert.rejects(
      // @ts-expect-error — intentionally invalid runtime value
      () => bakeBuildChannel('staging'),
      /Invalid build channel/,
    );
  });
});

test('bake helper writes the production literal and reports the previous channel', async () => {
  await withRestoredBuildChannel(async () => {
    const result = await bakeBuildChannel('production');
    assert.equal(result.previousChannel, 'development');
    assert.equal(result.nextChannel, 'production');
    assert.equal(result.changed, true);
    const updated = await readFile(BUILD_CHANNEL_FILE, 'utf8');
    assert.match(
      updated,
      /export const BUILD_CHANNEL: PlatformBuildChannel = 'production';/,
    );
  });
});

test('bake helper round-trips production then development without leftover diffs', async () => {
  await withRestoredBuildChannel(async () => {
    const original = await readFile(BUILD_CHANNEL_FILE, 'utf8');
    await bakeBuildChannel('production');
    await bakeBuildChannel('development');
    const final = await readFile(BUILD_CHANNEL_FILE, 'utf8');
    assert.equal(final, original);
  });
});

test('bake helper is a no-op when the requested channel already matches', async () => {
  await withRestoredBuildChannel(async () => {
    const result = await bakeBuildChannel('development');
    assert.equal(result.previousChannel, 'development');
    assert.equal(result.nextChannel, 'development');
    assert.equal(result.changed, false);
  });
});

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  PLATFORM_SCOPE_FILE_NAME,
  ensurePlatformScopeId,
  readPlatformScopeId,
} from '../src/shared/platformScopeId.ts';

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cats-scope-id-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('readPlatformScopeId returns null when the file does not exist', async () => {
  await withTempDir(async (dir) => {
    const id = await readPlatformScopeId(path.join(dir, PLATFORM_SCOPE_FILE_NAME));
    assert.equal(id, null);
  });
});

test('readPlatformScopeId returns null when the file is malformed JSON', async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, PLATFORM_SCOPE_FILE_NAME);
    await writeFile(filePath, '{not-json', 'utf8');
    const id = await readPlatformScopeId(filePath);
    assert.equal(id, null);
  });
});

test('readPlatformScopeId returns null when scopeId is missing or non-string', async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, PLATFORM_SCOPE_FILE_NAME);
    await writeFile(filePath, JSON.stringify({}), 'utf8');
    assert.equal(await readPlatformScopeId(filePath), null);
    await writeFile(filePath, JSON.stringify({ scopeId: 42 }), 'utf8');
    assert.equal(await readPlatformScopeId(filePath), null);
  });
});

test('ensurePlatformScopeId generates and persists a fresh id when none exists', async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, 'state', PLATFORM_SCOPE_FILE_NAME);
    let counter = 0;
    const id = await ensurePlatformScopeId({
      filePath,
      generate: () => `fixture-uuid-${++counter}`,
      now: () => new Date('2026-04-28T00:00:00.000Z'),
    });
    assert.equal(id, 'fixture-uuid-1');
    const persisted = JSON.parse(await readFile(filePath, 'utf8')) as {
      scopeId: string;
      createdAt: string;
    };
    assert.equal(persisted.scopeId, 'fixture-uuid-1');
    assert.equal(persisted.createdAt, '2026-04-28T00:00:00.000Z');
  });
});

test('ensurePlatformScopeId reuses the existing id on subsequent calls', async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, PLATFORM_SCOPE_FILE_NAME);
    let counter = 0;
    const first = await ensurePlatformScopeId({
      filePath,
      generate: () => `fixture-uuid-${++counter}`,
    });
    const second = await ensurePlatformScopeId({
      filePath,
      generate: () => `fixture-uuid-${++counter}`,
    });
    assert.equal(first, second);
    assert.equal(counter, 1);
  });
});

test('ensurePlatformScopeId does not regenerate when the existing id is non-empty', async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, PLATFORM_SCOPE_FILE_NAME);
    await writeFile(
      filePath,
      JSON.stringify({ scopeId: 'pre-existing', createdAt: 'whenever' }),
      'utf8',
    );
    const id = await ensurePlatformScopeId({
      filePath,
      generate: () => {
        throw new Error('generate should not have been called');
      },
    });
    assert.equal(id, 'pre-existing');
  });
});

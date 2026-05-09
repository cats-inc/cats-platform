import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createEmptyPlatformAuthState,
  FileBackedPlatformAuthStore,
  MemoryPlatformAuthStore,
  normalizePlatformAuthState,
  PlatformAuthStateCorruptError,
} from '../src/platform/auth/index.ts';

const NOW = new Date('2026-05-10T00:00:00.000Z');

test('MemoryPlatformAuthStore clones auth state on read and write', async () => {
  const store = new MemoryPlatformAuthStore(createEmptyPlatformAuthState(NOW), () => NOW);
  const state = await store.readState();
  state.accounts.push({
    id: 'account-mutated-outside',
    displayName: 'Mutated Outside',
    email: null,
    avatarUrl: null,
    status: 'active',
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  });

  assert.equal((await store.readState()).accounts.length, 0);

  const written = await store.updateState((current) => ({
    ...current,
    accounts: [{
      id: 'account-1',
      displayName: 'Owner',
      email: 'owner@example.test',
      avatarUrl: null,
      status: 'active',
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    }],
  }));
  assert.equal(written.accounts[0]?.id, 'account-1');
  written.accounts[0]!.displayName = 'Changed Locally';
  assert.equal((await store.readState()).accounts[0]?.displayName, 'Owner');
});

test('FileBackedPlatformAuthStore reports missing/corrupt state separately', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-auth-state-'));
  const statePath = path.join(tempDir, 'state', 'auth-state.local.json');
  const store = new FileBackedPlatformAuthStore(statePath, () => NOW);

  assert.deepEqual(await store.readStateStatus(), { status: 'missing' });
  const empty = await store.readState();
  assert.equal(empty.version, 1);
  assert.equal((await store.readStateStatus()).status, 'ready');

  await writeFile(statePath, '{not-json', 'utf-8');
  const corrupt = await store.readStateStatus();
  assert.equal(corrupt.status, 'corrupt');
  await assert.rejects(() => store.readState(), Error);
});

test('FileBackedPlatformAuthStore persists only normalized auth state fields', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-auth-state-'));
  const statePath = path.join(tempDir, 'state', 'auth-state.local.json');
  const store = new FileBackedPlatformAuthStore(statePath, () => NOW);

  await store.writeState({
    ...createEmptyPlatformAuthState(NOW),
    accounts: [{
      id: 'account-1',
      displayName: 'Owner',
      email: 'owner@example.test',
      avatarUrl: null,
      status: 'active',
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    }],
  });
  const raw = await readFile(statePath, 'utf-8');
  assert.match(raw, /"accounts"/u);
  assert.doesNotMatch(raw, /plaintext-password/u);
});

test('normalizePlatformAuthState rejects too-new or missing required schema fields', () => {
  assert.throws(
    () => normalizePlatformAuthState({ version: 2 }),
    PlatformAuthStateCorruptError,
  );
  assert.throws(
    () => normalizePlatformAuthState({ version: 1, updatedAt: NOW.toISOString() }),
    PlatformAuthStateCorruptError,
  );
});

test('normalizePlatformAuthState allows unknown extra fields', () => {
  const state = normalizePlatformAuthState({
    ...createEmptyPlatformAuthState(NOW),
    futureField: { ignored: true },
  });
  assert.deepEqual(state.accounts, []);
});

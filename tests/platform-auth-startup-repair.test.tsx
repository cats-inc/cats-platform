import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadConfig } from '../src/config.ts';
import { reconcileAuthRepairOnStartup } from '../src/app/server/startupRecovery.ts';
import {
  createEmptyPlatformAuthState,
  type PlatformAuthRecoveryTokenState,
  type PlatformAuthState,
  type PlatformAuthStateReadStatus,
  type PlatformAuthStore,
} from '../src/platform/auth/index.ts';
import { MemoryChatStore } from '../src/products/chat/state/store.ts';

const NOW = new Date('2026-05-10T00:00:00.000Z');
const SESSION_SECRET = 'test-session-secret-at-least-sixteen-chars';

test('auth startup repair issues recovery token when setup is complete and auth state is missing', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'cats-auth-startup-repair-'));
  try {
    const config = loadConfig({
      HOME: tempDir,
      CATS_PLATFORM_DIR: path.join(tempDir, 'platform'),
      CATS_AUTH_SESSION_SECRET: SESSION_SECRET,
    });
    const coreStore = new MemoryChatStore();
    await coreStore.updateCore((core) => ({
      ...core,
      setupCompleteAt: NOW.toISOString(),
    }));
    let tokenState: PlatformAuthRecoveryTokenState | null = null;

    await reconcileAuthRepairOnStartup({
      shared: {
        config,
        coreStore,
        authStore: createStatusAuthStore({ status: 'missing' }),
        setAuthRecoveryTokenState: (state) => {
          tokenState = state;
        },
        now: () => NOW,
      } as never,
    });

    assert.ok(tokenState);
    assert.equal(tokenState.issuedAt, NOW.toISOString());
    assert.equal(tokenState.recoveryTokenPath, config.auth.recoveryTokenPath);
    const rawToken = await readFile(config.auth.recoveryTokenPath, 'utf-8');
    assert.notEqual(rawToken.trim(), '');
    assert.equal(tokenState.tokenHash.includes(rawToken.trim()), false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('auth startup repair is inert before setup is complete', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'cats-auth-startup-repair-'));
  try {
    const config = loadConfig({
      HOME: tempDir,
      CATS_PLATFORM_DIR: path.join(tempDir, 'platform'),
      CATS_AUTH_SESSION_SECRET: SESSION_SECRET,
    });
    let tokenState: PlatformAuthRecoveryTokenState | null = null;

    await reconcileAuthRepairOnStartup({
      shared: {
        config,
        coreStore: new MemoryChatStore(),
        authStore: createStatusAuthStore({ status: 'missing' }),
        setAuthRecoveryTokenState: (state) => {
          tokenState = state;
        },
        now: () => NOW,
      } as never,
    });

    assert.equal(tokenState, null);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

function createStatusAuthStore(status: PlatformAuthStateReadStatus): PlatformAuthStore {
  let current = status;
  return {
    async readStateStatus() {
      return current;
    },
    async readState() {
      if (current.status === 'ready') {
        return structuredClone(current.state);
      }
      if (current.status === 'corrupt') {
        throw current.error;
      }
      throw new Error('Auth state is missing.');
    },
    async writeState(state: PlatformAuthState) {
      current = { status: 'ready', state: structuredClone(state) };
      return structuredClone(state);
    },
    async updateState(mutator) {
      const base = current.status === 'ready'
        ? structuredClone(current.state)
        : createEmptyPlatformAuthState(NOW);
      const next = await mutator(base);
      current = { status: 'ready', state: structuredClone(next) };
      return structuredClone(next);
    },
  };
}

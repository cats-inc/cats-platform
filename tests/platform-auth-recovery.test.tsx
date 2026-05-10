import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  consumePlatformAuthRecoveryToken,
  issuePlatformAuthRecoveryToken,
  verifyPlatformAuthRecoveryToken,
} from '../src/platform/auth/index.ts';

const NOW = new Date('2026-05-10T00:00:00.000Z');
const SESSION_SECRET = 'test-session-secret-at-least-sixteen-chars';

test('platform auth recovery token writes raw token once and stores only hash in memory', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'cats-auth-recovery-'));
  try {
    const recoveryTokenPath = path.join(tempDir, 'state', 'auth-recovery-token.local.txt');
    const issued = await issuePlatformAuthRecoveryToken({
      sessionSecret: SESSION_SECRET,
      recoveryTokenPath,
      now: NOW,
    });

    assert.equal(await readFile(recoveryTokenPath, 'utf-8'), `${issued.token}\n`);
    assert.equal(issued.state.recoveryTokenPath, recoveryTokenPath);
    assert.equal(issued.state.issuedAt, NOW.toISOString());
    assert.equal(issued.state.consumedAt, null);
    assert.notEqual(issued.state.tokenHash, issued.token);
    assert.equal(
      verifyPlatformAuthRecoveryToken({
        state: issued.state,
        token: issued.token,
        sessionSecret: SESSION_SECRET,
      }),
      true,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('platform auth recovery token rejects wrong or consumed token values', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'cats-auth-recovery-'));
  try {
    const issued = await issuePlatformAuthRecoveryToken({
      sessionSecret: SESSION_SECRET,
      recoveryTokenPath: path.join(tempDir, 'auth-recovery-token.local.txt'),
      now: NOW,
    });
    assert.equal(
      verifyPlatformAuthRecoveryToken({
        state: issued.state,
        token: 'wrong-token',
        sessionSecret: SESSION_SECRET,
      }),
      false,
    );
    assert.equal(
      verifyPlatformAuthRecoveryToken({
        state: consumePlatformAuthRecoveryToken(issued.state, NOW),
        token: issued.token,
        sessionSecret: SESSION_SECRET,
      }),
      false,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

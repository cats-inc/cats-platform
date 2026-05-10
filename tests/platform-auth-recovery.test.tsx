import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  consumePlatformAuthRecoveryToken,
  issuePlatformAuthRecoveryToken,
  resolvePlatformAuthReadiness,
  startPlatformAuthRepairMode,
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

test('platform auth repair startup writes token file and keeps structured log secret-free', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'cats-auth-repair-startup-'));
  try {
    const recoveryTokenPath = path.join(tempDir, 'auth-recovery-token.local.txt');
    const readiness = resolvePlatformAuthReadiness({
      setupCompleteAt: NOW.toISOString(),
      authStateStatus: { status: 'missing' },
    });
    const started = await startPlatformAuthRepairMode({
      readiness,
      sessionSecret: SESSION_SECRET,
      recoveryTokenPath,
      now: NOW,
    });

    assert.ok(started);
    assert.equal(await readFile(recoveryTokenPath, 'utf-8'), `${started.localConsoleToken}\n`);
    assert.equal(started.structuredLog.status, 'repair_mode_started');
    assert.equal(started.structuredLog.repairReason, 'missing_auth_state_after_setup');
    assert.equal(started.structuredLog.recoveryTokenPath, recoveryTokenPath);
    assert.equal(started.structuredLog.issuedAt, NOW.toISOString());
    assert.equal(JSON.stringify(started.structuredLog).includes(started.localConsoleToken), false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('platform auth repair startup is inert outside repair mode', async () => {
  const readiness = resolvePlatformAuthReadiness({
    setupCompleteAt: null,
    authStateStatus: { status: 'missing' },
  });

  assert.equal(await startPlatformAuthRepairMode({
    readiness,
    sessionSecret: SESSION_SECRET,
    recoveryTokenPath: 'unused',
    now: NOW,
  }), null);
});

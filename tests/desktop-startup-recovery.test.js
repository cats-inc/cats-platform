import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isDesktopBootstrapLoadingPhase,
  resolveDesktopBootstrapError,
  retryDesktopBootstrapChecks,
  shouldAttemptDesktopLateReadyRecovery,
} from '../build/desktop/startupRecovery.js';

test('startup checks retry transient failures and stop after a successful read', async () => {
  let attempts = 0;
  let waits = 0;
  const result = await retryDesktopBootstrapChecks(async () => {
    if (++attempts < 3) throw new Error('temporary shell read failure');
    return { phase: 'ready_for_chat' };
  }, async () => { waits += 1; });
  assert.equal(result.phase, 'ready_for_chat');
  assert.equal(attempts, 3);
  assert.equal(waits, 2);
});

test('three failed startup checks reject with the final diagnostic error', async () => {
  let attempts = 0;
  const errors = [];
  await assert.rejects(retryDesktopBootstrapChecks(async () => {
    const error = new Error(`shell request timed out: attempt ${++attempts}`);
    errors.push(error);
    throw error;
  }, async () => {}), (error) => error === errors[2]);
  assert.equal(attempts, 3);
});

test('a completed probe that remains pending also exhausts retries instead of hanging', async () => {
  let attempts = 0;
  await assert.rejects(retryDesktopBootstrapChecks(async () => {
    attempts += 1;
    return { phase: 'checking_prerequisites' };
  }, async () => {}), /Desktop startup checks did not finish \(checking_prerequisites\)/);
  assert.equal(attempts, 3);
});

test('desktop startup recovery preserves the last bootstrap error until it is explicitly cleared', () => {
  assert.equal(
    resolveDesktopBootstrapError('Timed out waiting for cats-platform startup after 90000ms'),
    'Timed out waiting for cats-platform startup after 90000ms',
  );
  assert.equal(
    resolveDesktopBootstrapError('Timed out waiting for cats-platform startup after 90000ms', null),
    null,
  );
  assert.equal(
    resolveDesktopBootstrapError('old error', 'new error'),
    'new error',
  );
});

test('desktop startup recovery only late-recovers after a failed bootstrap once every service is ready', () => {
  assert.equal(shouldAttemptDesktopLateReadyRecovery({
    lastError: null,
    services: [{ ready: true }, { ready: true }],
  }), false);

  assert.equal(shouldAttemptDesktopLateReadyRecovery({
    lastError: 'Timed out waiting for cats-platform startup after 90000ms',
    services: [{ ready: true }, { ready: false }],
  }), false);

  assert.equal(shouldAttemptDesktopLateReadyRecovery({
    lastError: 'Timed out waiting for cats-platform startup after 90000ms',
    services: [{ ready: true }, { ready: true }],
  }), true);
});

test('desktop startup recovery keeps timeout failures on the recovery page while bootstrap is still loading', () => {
  assert.equal(isDesktopBootstrapLoadingPhase('starting_services'), true);
  assert.equal(isDesktopBootstrapLoadingPhase('checking_prerequisites'), true);
  assert.equal(isDesktopBootstrapLoadingPhase('failed'), false);
  assert.equal(isDesktopBootstrapLoadingPhase('ready_for_setup'), false);
  assert.equal(isDesktopBootstrapLoadingPhase('ready_for_chat'), false);
  assert.equal(isDesktopBootstrapLoadingPhase('needs_prerequisites'), false);
});

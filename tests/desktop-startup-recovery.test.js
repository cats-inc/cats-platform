import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isDesktopBootstrapLoadingPhase,
  resolveDesktopBootstrapError,
  shouldAttemptDesktopLateReadyRecovery,
} from '../build/desktop/startupRecovery.js';

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

import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldAutoScanRuntimeSetup } from '../build/server/shared/runtimeSetupFlow.js';

function createRuntimeSetupSummary(overrides = {}) {
  return {
    source: 'runtime',
    bootstrapRequired: true,
    status: 'scan_required',
    stateStatus: 'pending',
    summary: 'No persisted setup scan is available yet.',
    scannedAt: null,
    lastManualScanAt: null,
    appliedAt: null,
    providerCount: 0,
    availableCount: 0,
    providersReadyToApply: [],
    providersNeedingAttention: [],
    suggestedProviders: [],
    canRunManualScan: true,
    canApply: false,
    error: null,
    ...overrides,
  };
}

test('shouldAutoScanRuntimeSetup returns true for step 3 when runtime still needs its first scan', () => {
  assert.equal(
    shouldAutoScanRuntimeSetup(
      3,
      createRuntimeSetupSummary(),
      false,
    ),
    true,
  );
});

test('shouldAutoScanRuntimeSetup returns false after the initial auto-scan attempt', () => {
  assert.equal(
    shouldAutoScanRuntimeSetup(
      3,
      createRuntimeSetupSummary(),
      true,
    ),
    false,
  );
});

test('shouldAutoScanRuntimeSetup returns false once runtime setup is past scan_required', () => {
  assert.equal(
    shouldAutoScanRuntimeSetup(
      3,
      createRuntimeSetupSummary({
        status: 'ready_to_apply',
        stateStatus: 'ready',
        providerCount: 12,
        availableCount: 12,
        canApply: true,
      }),
      false,
    ),
    false,
  );
});


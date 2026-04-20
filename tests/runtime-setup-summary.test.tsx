import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAssumedReadyRuntimeSetupSummary,
  createUnavailableRuntimeSetupSummary,
  isRuntimeSetupReady,
  summarizeRuntimeSetupReadModel,
} from '../src/runtime/setup.ts';

test('createAssumedReadyRuntimeSetupSummary returns a ready non-bootstrap summary', () => {
  const summary = createAssumedReadyRuntimeSetupSummary();

  assert.equal(summary.source, 'assumed_ready');
  assert.equal(summary.status, 'ready');
  assert.equal(summary.bootstrapRequired, false);
  assert.equal(summary.canRunManualScan, false);
  assert.equal(summary.canApply, false);
  assert.equal(isRuntimeSetupReady(summary), true);
});

test('createUnavailableRuntimeSetupSummary captures explicit Error messages and marks setup unavailable', () => {
  const summary = createUnavailableRuntimeSetupSummary(new Error('runtime down'));

  assert.equal(summary.source, 'unavailable');
  assert.equal(summary.status, 'unavailable');
  assert.equal(summary.bootstrapRequired, true);
  assert.equal(summary.error, 'runtime down');
  assert.equal(isRuntimeSetupReady(summary), false);
});

test('summarizeRuntimeSetupReadModel promotes ready repair state to ready_to_apply and copies suggested providers', () => {
  const summary = summarizeRuntimeSetupReadModel({
    bootstrapRequired: true,
    state: {
      status: 'scanning',
      lastScanAt: '2026-04-20T01:00:00.000Z',
      lastManualScanAt: '2026-04-20T02:00:00.000Z',
      appliedAt: null,
      appliedConfigPath: null,
      error: null,
    },
    repair: {
      status: 'ready',
      summary: '2 providers ready to apply.',
      preferredScan: {
        source: 'scan',
        scannedAt: '2026-04-20T01:30:00.000Z',
        providerCount: 3,
        availableCount: 2,
        unavailableCount: 1,
        remediationCount: 1,
      },
      providersReadyToApply: [
        { provider: 'claude', family: 'anthropic' },
        { provider: 'codex', family: 'openai' },
      ],
      providersNeedingAttention: [
        { provider: 'gemini', family: 'google', remediationCount: 2 },
      ],
    },
  });

  assert.equal(summary.status, 'ready_to_apply');
  assert.equal(summary.summary, '2 providers ready to apply.');
  assert.equal(summary.providerCount, 3);
  assert.equal(summary.availableCount, 2);
  assert.deepEqual(summary.suggestedProviders, ['claude', 'codex']);
  assert.equal(summary.canRunManualScan, true);
  assert.equal(summary.canApply, true);
  assert.deepEqual(summary.providersNeedingAttention, [
    { provider: 'gemini', family: 'google', remediationCount: 2 },
  ]);
});

test('summarizeRuntimeSetupReadModel reports runtime-ready state when bootstrap is no longer required', () => {
  const summary = summarizeRuntimeSetupReadModel({
    bootstrapRequired: false,
    state: {
      status: 'applied',
      lastScanAt: '2026-04-20T01:00:00.000Z',
      lastManualScanAt: null,
      appliedAt: '2026-04-20T03:00:00.000Z',
      appliedConfigPath: 'C:/cats/runtime-config.json',
      error: null,
    },
    repair: {
      status: 'attention_required',
      summary: 'ignored after apply',
      preferredScan: {
        source: 'manualScan',
        scannedAt: '2026-04-20T02:00:00.000Z',
        providerCount: 1,
        availableCount: 1,
        unavailableCount: 0,
        remediationCount: 0,
      },
      providersReadyToApply: [],
      providersNeedingAttention: [],
    },
  });

  assert.equal(summary.status, 'ready');
  assert.equal(summary.summary, 'Runtime provider config is applied and Cats Runtime is ready.');
  assert.equal(summary.canRunManualScan, false);
  assert.equal(summary.canApply, false);
  assert.equal(isRuntimeSetupReady(summary), true);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveChildBudgetEnvelope } from '../src/platform/supervision/index.ts';

test('child budget envelope is capped by parent, request, and defaults', () => {
  const budget = deriveChildBudgetEnvelope({
    parent: {
      maxCostUsd: 2,
      maxTokens: 20_000,
      maxDurationMs: 120_000,
      hardStop: true,
    },
    requested: {
      maxCostUsd: 5,
      maxTokens: 8_000,
      maxDurationMs: 300_000,
    },
    defaults: {
      maxCostUsd: 1,
      maxTokens: 10_000,
      maxDurationMs: 60_000,
    },
  });

  assert.deepEqual(budget, {
    maxCostUsd: 1,
    maxTokens: 8_000,
    maxDurationMs: 60_000,
    hardStop: true,
  });
});

test('child budget envelope never becomes unlimited when parent is bounded', () => {
  const budget = deriveChildBudgetEnvelope({
    parent: {
      maxTokens: 4096,
    },
    requested: {},
  });

  assert.deepEqual(budget, {
    maxTokens: 4096,
    hardStop: false,
  });
});

test('child budget hard stop is inherited from request or defaults', () => {
  assert.equal(
    deriveChildBudgetEnvelope({
      parent: {},
      requested: { hardStop: true },
    }).hardStop,
    true,
  );
  assert.equal(
    deriveChildBudgetEnvelope({
      parent: {},
      defaults: { hardStop: true },
    }).hardStop,
    true,
  );
});

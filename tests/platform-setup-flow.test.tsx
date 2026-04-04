import assert from 'node:assert/strict';
import test from 'node:test';

import {
  nextSetupStep,
  previousSetupStep,
  TOTAL_SETUP_STEPS,
} from '../src/app/renderer/setup/flow.ts';

test('platform setup flow keeps the agreed four-step order', () => {
  assert.equal(TOTAL_SETUP_STEPS, 4);
  assert.equal(nextSetupStep(1), 2);
  assert.equal(nextSetupStep(2), 3);
  assert.equal(nextSetupStep(3), 4);
  assert.equal(nextSetupStep(4), 4);
});

test('platform setup flow supports stepping backward without skipping Guide Cat or runtime', () => {
  assert.equal(previousSetupStep(4), 3);
  assert.equal(previousSetupStep(3), 2);
  assert.equal(previousSetupStep(2), 1);
  assert.equal(previousSetupStep(1), 1);
});

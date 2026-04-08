import assert from 'node:assert/strict';
import test from 'node:test';

import {
  nextSetupStep,
  previousSetupStep,
  type SetupStep,
  TOTAL_SETUP_STEPS,
} from '../src/app/renderer/setup/flow.ts';
import { shouldPrefetchGuideCatProviderRegistry } from '../src/app/renderer/setup/PlatformSetupWizard.tsx';

test('platform setup flow keeps the agreed two-step order', () => {
  assert.equal(TOTAL_SETUP_STEPS, 2);
  assert.equal(nextSetupStep(1), 2);
  assert.equal(nextSetupStep(2), 2);
});

test('platform setup flow supports stepping backward without reintroducing removed wizard steps', () => {
  assert.equal(previousSetupStep(2), 1);
  assert.equal(previousSetupStep(1), 1);
});

test('platform setup only prefetches the guide cat selector after the guide cat option is enabled', () => {
  assert.equal(
    shouldPrefetchGuideCatProviderRegistry({
      step: 1 as SetupStep,
      createGuideCat: false,
    }),
    false,
  );
  assert.equal(
    shouldPrefetchGuideCatProviderRegistry({
      step: 2 as SetupStep,
      createGuideCat: false,
    }),
    false,
  );
  assert.equal(
    shouldPrefetchGuideCatProviderRegistry({
      step: 2 as SetupStep,
      createGuideCat: true,
    }),
    true,
  );
});

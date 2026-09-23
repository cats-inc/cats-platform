import assert from 'node:assert/strict';
import test from 'node:test';

import { clearLiveProviderModelLabels } from '../src/shared/providerModelLabelRegistry.ts';
import {
  buildExecutionTargetSummary,
  createExecutionTargetValueFromProviderSelection,
} from '../src/products/shared/renderer/components/ExecutionTarget.ts';

test('execution target summary centralizes provider and model labels', () => {
  clearLiveProviderModelLabels();

  const summary = buildExecutionTargetSummary({
    provider: 'copilot',
    instance: 'native',
    model: 'gpt-5.4',
    modelSelection: null,
  });

  assert.equal(summary.label, 'Copilot-CLI · gpt-5.4');
  assert.equal(summary.providerLabel, 'Copilot');
  assert.equal(summary.instanceLabel, 'native');
  assert.equal(summary.modelLabel, 'gpt-5.4');
});

test('provider target selections map to execution target values once', () => {
  const target = createExecutionTargetValueFromProviderSelection({
    provider: 'codex',
    instance: '',
    model: '',
    modelSelection: null,
    executionLabel: null,
  });

  assert.deepEqual(target, {
    provider: 'codex',
    instance: null,
    model: null,
    modelSelection: null,
    executionLabel: null,
  });
});

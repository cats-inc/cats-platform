import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canContinueGuideCatSetupStep,
  validateGuideCatSetupStep,
} from '../src/app/renderer/setup/plugins.tsx';

test('validateGuideCatSetupStep requires a selected model', () => {
  assert.equal(validateGuideCatSetupStep({ model: '' }), false);
  assert.equal(validateGuideCatSetupStep({ model: 'gpt-5.4' }), true);
});

test('unchecking Guide Cat setup always allows setup completion', () => {
  assert.equal(canContinueGuideCatSetupStep({
    createGuideCat: false,
    model: '',
  }), true);
  assert.equal(canContinueGuideCatSetupStep({
    createGuideCat: true,
    model: '',
  }), false);
  assert.equal(canContinueGuideCatSetupStep({
    createGuideCat: true,
    model: 'gpt-5.4',
  }), true);
});

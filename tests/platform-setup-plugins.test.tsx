import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validateGuideCatSetupStep,
} from '../src/app/renderer/setup/plugins.tsx';

test('validateGuideCatSetupStep requires a selected model', () => {
  assert.equal(validateGuideCatSetupStep({ model: '' }), false);
  assert.equal(validateGuideCatSetupStep({ model: 'gpt-5.4' }), true);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { createPlatformChildProcessEnv } from '../src/shared/platformChildProcessEnv.ts';

test('platform child process env strips auth secret after applying overrides', () => {
  const childEnv = createPlatformChildProcessEnv({
    CATS_AUTH_SESSION_SECRET: 'override-must-also-be-removed',
    CHILD_ONLY_VALUE: 'child',
  }, {
    CATS_AUTH_SESSION_SECRET: 'base-must-be-removed',
    BASE_ONLY_VALUE: 'base',
  });

  assert.equal(childEnv.CATS_AUTH_SESSION_SECRET, undefined);
  assert.equal(childEnv.BASE_ONLY_VALUE, 'base');
  assert.equal(childEnv.CHILD_ONLY_VALUE, 'child');
});

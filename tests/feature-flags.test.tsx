import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMPANION_PROFILE_IA_FLAG,
  readFeatureFlag,
  setFeatureFlag,
} from '../src/shared/featureFlags.ts';

test('setFeatureFlag returns unknown_flag for names not in the registry', () => {
  const result = setFeatureFlag({ name: 'cats.bogus', value: true });
  assert.equal(result.status, 'unknown_flag');
});

test('setFeatureFlag accepts the registered flag and reports the previous value', () => {
  const result = setFeatureFlag({
    name: COMPANION_PROFILE_IA_FLAG,
    value: true,
    current: { [COMPANION_PROFILE_IA_FLAG]: false },
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.status === 'ok' && result.previousValue, false);
  assert.equal(result.status === 'ok' && result.nextValue, true);
});

test('setFeatureFlag previousValue is null when nothing was persisted', () => {
  const result = setFeatureFlag({
    name: COMPANION_PROFILE_IA_FLAG,
    value: true,
  });
  assert.equal(result.status === 'ok' && result.previousValue, null);
});

test('readFeatureFlag returns true only for an exact persisted true', () => {
  assert.equal(
    readFeatureFlag({ name: COMPANION_PROFILE_IA_FLAG, raw: { [COMPANION_PROFILE_IA_FLAG]: true } }),
    true,
  );
  assert.equal(
    readFeatureFlag({ name: COMPANION_PROFILE_IA_FLAG, raw: { [COMPANION_PROFILE_IA_FLAG]: false } }),
    false,
  );
  assert.equal(
    readFeatureFlag({ name: COMPANION_PROFILE_IA_FLAG, raw: {} }),
    false,
  );
});

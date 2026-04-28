import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMPANION_PROFILE_IA_FLAG,
  DEFAULT_FEATURE_FLAG_REGISTRY,
  coerceFeatureFlagsForRead,
  readCoercedFeatureFlag,
  setFeatureFlag,
  type FeatureFlagRegistry,
} from '../src/shared/featureFlags.ts';

test('setFeatureFlag returns unknown_flag for names not in the registry', () => {
  const result = setFeatureFlag({
    name: 'cats.bogus',
    value: true,
    buildChannel: 'development',
  });
  assert.equal(result.status, 'unknown_flag');
});

test('setFeatureFlag accepts a development write to a locked entry', () => {
  const result = setFeatureFlag({
    name: COMPANION_PROFILE_IA_FLAG,
    value: true,
    buildChannel: 'development',
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.status === 'ok' && result.nextValue, true);
});

test('setFeatureFlag rejects a production true write to a locked entry with the unlock reason', () => {
  const result = setFeatureFlag({
    name: COMPANION_PROFILE_IA_FLAG,
    value: true,
    buildChannel: 'production',
  });
  assert.equal(result.status, 'feature_flag_blocked');
  assert.equal(
    result.status === 'feature_flag_blocked' && result.reason,
    'feature_flag_blocked: phase2_profile_read_model_guards',
  );
  assert.equal(
    result.status === 'feature_flag_blocked' && result.unlockRequirement,
    'phase2_profile_read_model_guards',
  );
});

test('setFeatureFlag accepts a production false write to a locked entry (clearing is always safe)', () => {
  const result = setFeatureFlag({
    name: COMPANION_PROFILE_IA_FLAG,
    value: false,
    buildChannel: 'production',
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.status === 'ok' && result.nextValue, false);
});

test('setFeatureFlag accepts a production true write once the registry entry is unlocked', () => {
  const unlockedRegistry: FeatureFlagRegistry = {
    [COMPANION_PROFILE_IA_FLAG]: {
      ...DEFAULT_FEATURE_FLAG_REGISTRY[COMPANION_PROFILE_IA_FLAG]!,
      productionUnlockState: 'unlocked',
    },
  };
  const result = setFeatureFlag({
    name: COMPANION_PROFILE_IA_FLAG,
    value: true,
    buildChannel: 'production',
    registry: unlockedRegistry,
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.status === 'ok' && result.nextValue, true);
});

test('setFeatureFlag carries the previousValue from the current state for audit trails', () => {
  const result = setFeatureFlag({
    name: COMPANION_PROFILE_IA_FLAG,
    value: true,
    buildChannel: 'development',
    current: { [COMPANION_PROFILE_IA_FLAG]: false },
  });
  assert.equal(result.status === 'ok' && result.previousValue, false);
});

test('coerceFeatureFlagsForRead returns the raw value verbatim on development builds', () => {
  const coerced = coerceFeatureFlagsForRead({
    raw: { [COMPANION_PROFILE_IA_FLAG]: true, 'cats.unknown': true },
    buildChannel: 'development',
  });
  assert.equal(coerced[COMPANION_PROFILE_IA_FLAG], true);
  assert.equal(coerced['cats.unknown'], true);
});

test('coerceFeatureFlagsForRead forces locked entries to false on production builds', () => {
  const coerced = coerceFeatureFlagsForRead({
    raw: { [COMPANION_PROFILE_IA_FLAG]: true },
    buildChannel: 'production',
  });
  assert.equal(coerced[COMPANION_PROFILE_IA_FLAG], false);
});

test('coerceFeatureFlagsForRead leaves unknown flags alone on production builds', () => {
  const coerced = coerceFeatureFlagsForRead({
    raw: { 'cats.unknown': true },
    buildChannel: 'production',
  });
  assert.equal(coerced['cats.unknown'], true);
});

test('coerceFeatureFlagsForRead respects an unlocked registry entry on production builds', () => {
  const unlockedRegistry: FeatureFlagRegistry = {
    [COMPANION_PROFILE_IA_FLAG]: {
      ...DEFAULT_FEATURE_FLAG_REGISTRY[COMPANION_PROFILE_IA_FLAG]!,
      productionUnlockState: 'unlocked',
    },
  };
  const coerced = coerceFeatureFlagsForRead({
    raw: { [COMPANION_PROFILE_IA_FLAG]: true },
    buildChannel: 'production',
    registry: unlockedRegistry,
  });
  assert.equal(coerced[COMPANION_PROFILE_IA_FLAG], true);
});

test('readCoercedFeatureFlag defaults to false for unknown names', () => {
  const value = readCoercedFeatureFlag({
    name: 'cats.bogus',
    raw: {},
    buildChannel: 'development',
  });
  assert.equal(value, false);
});

test('readCoercedFeatureFlag respects production locking', () => {
  assert.equal(
    readCoercedFeatureFlag({
      name: COMPANION_PROFILE_IA_FLAG,
      raw: { [COMPANION_PROFILE_IA_FLAG]: true },
      buildChannel: 'production',
    }),
    false,
  );
  assert.equal(
    readCoercedFeatureFlag({
      name: COMPANION_PROFILE_IA_FLAG,
      raw: { [COMPANION_PROFILE_IA_FLAG]: true },
      buildChannel: 'development',
    }),
    true,
  );
});

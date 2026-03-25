import assert from 'node:assert/strict';
import test from 'node:test';

import { buildProductSurfaceToggleStates } from '../src/design/components/productSurfaceToggles.ts';

test('unavailable surfaces still render but only block new additions', () => {
  const states = buildProductSurfaceToggleStates({
    surfaces: ['chat', 'work', 'code'],
    selected: ['chat', 'work'],
    enabledSurfaces: ['chat'],
  });

  assert.deepEqual(states, [
    { surface: 'chat', active: true, disabled: false, unavailable: false },
    { surface: 'work', active: true, disabled: false, unavailable: true },
    { surface: 'code', active: false, disabled: true, unavailable: true },
  ]);
});

test('required chat surface still cannot be removed for boss cats', () => {
  const states = buildProductSurfaceToggleStates({
    surfaces: ['chat', 'work', 'code'],
    selected: ['chat'],
    enabledSurfaces: ['chat'],
    requiredSurfaces: ['chat'],
  });

  assert.deepEqual(states[0], {
    surface: 'chat',
    active: true,
    disabled: true,
    unavailable: false,
  });
});

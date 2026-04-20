import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyAdvancedDraftControlsPatch,
  cloneAdvancedDraftControlsPreferences,
  createDefaultAdvancedDraftControlsPreferences,
  isAdvancedDraftControlsEnabled,
  normalizeAdvancedDraftControlsPreferences,
} from '../src/products/shared/advancedDraftControls.ts';

test('advanced draft controls default to disabled on every supported surface', () => {
  assert.deepEqual(createDefaultAdvancedDraftControlsPreferences(), {
    chat: false,
    code: false,
    work: false,
  });
});

test('advanced draft controls normalization keeps only explicit true booleans', () => {
  assert.deepEqual(
    normalizeAdvancedDraftControlsPreferences({
      chat: true,
      code: 'true',
      work: 1,
      ignored: true,
    }),
    {
      chat: true,
      code: false,
      work: false,
    },
  );
  assert.deepEqual(
    normalizeAdvancedDraftControlsPreferences(null),
    createDefaultAdvancedDraftControlsPreferences(),
  );
});

test('advanced draft controls clone and patch preserve unsupported keys and ignore non-boolean mutations', () => {
  const current = {
    chat: true,
    code: false,
    work: false,
  };

  assert.deepEqual(cloneAdvancedDraftControlsPreferences(current), current);
  assert.notEqual(cloneAdvancedDraftControlsPreferences(current), current);

  assert.deepEqual(
    applyAdvancedDraftControlsPatch(current, {
      code: true,
      work: false,
      chat: 'yes' as never,
      lobby: true as never,
    }),
    {
      chat: true,
      code: true,
      work: false,
    },
  );

  assert.deepEqual(
    applyAdvancedDraftControlsPatch(undefined, null),
    createDefaultAdvancedDraftControlsPreferences(),
  );
});

test('advanced draft controls enabled check always reads from normalized preferences', () => {
  assert.equal(
    isAdvancedDraftControlsEnabled({
      chat: true,
      code: false,
      work: false,
    }, 'chat'),
    true,
  );
  assert.equal(
    isAdvancedDraftControlsEnabled({
      chat: true,
      code: false,
      work: false,
    }, 'code'),
    false,
  );
  assert.equal(
    isAdvancedDraftControlsEnabled({
      chat: true,
      code: 'true' as never,
      work: false,
    }, 'code'),
    false,
  );
});

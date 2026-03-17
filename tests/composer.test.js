import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldSubmitComposerOnKeyDown } from '../dist-server/shared/composer.js';

test('shouldSubmitComposerOnKeyDown only submits on plain Enter', () => {
  assert.equal(
    shouldSubmitComposerOnKeyDown({
      key: 'Enter',
    }),
    true,
  );

  assert.equal(
    shouldSubmitComposerOnKeyDown({
      key: 'Enter',
      shiftKey: true,
    }),
    false,
  );

  assert.equal(
    shouldSubmitComposerOnKeyDown({
      key: 'Enter',
      ctrlKey: true,
    }),
    false,
  );

  assert.equal(
    shouldSubmitComposerOnKeyDown({
      key: 'Enter',
      metaKey: true,
    }),
    false,
  );

  assert.equal(
    shouldSubmitComposerOnKeyDown({
      key: 'Enter',
      altKey: true,
    }),
    false,
  );

  assert.equal(
    shouldSubmitComposerOnKeyDown({
      key: 'Enter',
      isComposing: true,
    }),
    false,
  );

  assert.equal(
    shouldSubmitComposerOnKeyDown({
      key: 'a',
    }),
    false,
  );
});

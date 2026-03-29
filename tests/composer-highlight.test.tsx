import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildComposerHighlightFragments,
  COMPOSER_HIGHLIGHT_ROOT_CLASS_NAME,
} from '../src/products/chat/renderer/components/ComposerHighlight.tsx';

const cats = [
  {
    id: 'cat-1',
    name: 'Mochi',
    avatarColor: '#c9895b',
  },
] as const;

test('buildComposerHighlightFragments matches valid mentions even before punctuation', () => {
  assert.deepEqual(
    buildComposerHighlightFragments('@Mochi, please check @Ghost.', [...cats]),
    [
      { kind: 'mention', value: '@Mochi', avatarColor: '#c9895b' },
      { kind: 'text', value: ', please check @Ghost.' },
    ],
  );
});

test('buildComposerHighlightFragments can leave excluded direct-lane mentions as plain text', () => {
  assert.deepEqual(
    buildComposerHighlightFragments('@Mochi, stay in this lane.', [...cats], ['Mochi']),
    [
      { kind: 'text', value: '@Mochi, stay in this lane.' },
    ],
  );
});

test('ComposerHighlight root class keeps the mirror bound to textarea metrics', () => {
  assert.equal(
    COMPOSER_HIGHLIGHT_ROOT_CLASS_NAME,
    'composerInput composerHighlight',
  );
});

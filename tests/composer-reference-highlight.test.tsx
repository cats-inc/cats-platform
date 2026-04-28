import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildComposerHighlightFragments,
} from '../src/products/chat/renderer/components/ComposerHighlight.tsx';

const REFERENCE_TEXT = 'cats://companion/v1/scope-A/cat-1/photo/s-photo';
const UNSUPPORTED = 'cats://companion/v2/scope-A/cat-1/post/p-1';
const MALFORMED = 'cats://companion/v2/%ZZ/cat/post/t';

test('a parsed reference becomes a single reference fragment with parsed status', () => {
  const fragments = buildComposerHighlightFragments(
    `Have a look ${REFERENCE_TEXT} please`,
    [],
  );
  const referenceFragment = fragments.find((frag) => frag.kind === 'reference');
  assert.ok(referenceFragment);
  assert.equal(referenceFragment.referenceStatus, 'parsed');
  assert.equal(referenceFragment.value, REFERENCE_TEXT);
});

test('an unsupported version reference produces an unsupported_version fragment carrying the version token', () => {
  const fragments = buildComposerHighlightFragments(
    `try ${UNSUPPORTED}`,
    [],
  );
  const referenceFragment = fragments.find((frag) => frag.kind === 'reference');
  assert.ok(referenceFragment);
  assert.equal(referenceFragment.referenceStatus, 'unsupported_version');
  assert.equal(referenceFragment.referenceVersion, 'v2');
});

test('a malformed reference produces an invalid fragment carrying the typed reason', () => {
  const fragments = buildComposerHighlightFragments(
    `nope ${MALFORMED}`,
    [],
  );
  const referenceFragment = fragments.find((frag) => frag.kind === 'reference');
  assert.ok(referenceFragment);
  assert.equal(referenceFragment.referenceStatus, 'invalid');
  assert.equal(referenceFragment.referenceInvalidReason, 'malformed_percent_encoding');
});

test('mention and reference fragments interleave in source order', () => {
  const fragments = buildComposerHighlightFragments(
    `@Mochi look at ${REFERENCE_TEXT} thanks`,
    [
      {
        id: 'cat-1',
        name: 'Mochi',
        avatarColor: '#abc',
      } as never,
    ],
  );
  const kinds = fragments.map((frag) => frag.kind);
  // Expect ['mention', 'text', 'reference', 'text'] (or starting 'text' if no leading text).
  assert.ok(kinds.includes('mention'));
  assert.ok(kinds.includes('reference'));
  // Mention comes before the reference in the input, so its index should be smaller.
  const mentionIndex = kinds.indexOf('mention');
  const referenceIndex = kinds.indexOf('reference');
  assert.ok(mentionIndex < referenceIndex);
});

test('text without any references returns a single text fragment', () => {
  const fragments = buildComposerHighlightFragments('plain message', []);
  assert.equal(fragments.length, 1);
  assert.equal(fragments[0]?.kind, 'text');
  assert.equal(fragments[0]?.value, 'plain message');
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  detectCompanionReferences,
  extractParsedCompanionReferences,
  replaceCompanionReferences,
} from '../src/products/chat/companion/composerReferenceDetector.ts';

const REF_A = 'cats://companion/v1/scope-A/cat-1/photo/s-photo';
const REF_B = 'cats://companion/v1/scope-A/cat-1/post/p-1';
const UNSUPPORTED = 'cats://companion/v2/scope-A/cat-1/post/p-1';
const MALFORMED_PERCENT = 'cats://companion/v2/%ZZ/cat/post/t';

test('detects a single reference at the start of text', () => {
  const matches = detectCompanionReferences(`${REF_A} from owner`);
  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.start, 0);
  assert.equal(matches[0]?.end, REF_A.length);
  assert.equal(matches[0]?.parseResult.status, 'parsed');
});

test('detects multiple references separated by whitespace', () => {
  const text = `look at ${REF_A} and ${REF_B}`;
  const matches = detectCompanionReferences(text);
  assert.equal(matches.length, 2);
  assert.equal(matches[0]?.rawText, REF_A);
  assert.equal(matches[1]?.rawText, REF_B);
});

test('reports unsupported_version inline without bailing on later text', () => {
  const text = `try ${UNSUPPORTED} or ${REF_A}`;
  const matches = detectCompanionReferences(text);
  assert.equal(matches.length, 2);
  assert.equal(matches[0]?.parseResult.status, 'unsupported_version');
  assert.equal(matches[1]?.parseResult.status, 'parsed');
});

test('reports invalid percent encoding inline', () => {
  const matches = detectCompanionReferences(MALFORMED_PERCENT);
  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.parseResult.status, 'invalid');
  if (matches[0]?.parseResult.status === 'invalid') {
    assert.equal(matches[0].parseResult.reason, 'malformed_percent_encoding');
  }
});

test('extractParsedCompanionReferences returns only successfully-parsed entries', () => {
  const text = `${UNSUPPORTED}\n${REF_A}\n${MALFORMED_PERCENT}\n${REF_B}`;
  const refs = extractParsedCompanionReferences(text);
  assert.equal(refs.length, 2);
  assert.equal(refs[0]?.targetId, 's-photo');
  assert.equal(refs[1]?.targetId, 'p-1');
});

test('terminator scan stops at whitespace, angle brackets, and quotes', () => {
  const text = `<${REF_A}> or "${REF_B}"`;
  const matches = detectCompanionReferences(text);
  assert.equal(matches.length, 2);
  assert.equal(matches[0]?.rawText, REF_A);
  assert.equal(matches[1]?.rawText, REF_B);
});

test('handles a trailing reference with no terminator', () => {
  const text = `closing ${REF_A}`;
  const matches = detectCompanionReferences(text);
  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.end, text.length);
});

test('returns an empty array for empty / non-string / no-match input', () => {
  assert.deepEqual(detectCompanionReferences(''), []);
  // @ts-expect-error — runtime non-string
  assert.deepEqual(detectCompanionReferences(null), []);
  assert.deepEqual(detectCompanionReferences('plain message with no refs'), []);
});

test('replaceCompanionReferences swaps each match for a placeholder while leaving surrounding text intact', () => {
  const text = `before ${REF_A} middle ${REF_B} end`;
  const swapped = replaceCompanionReferences(text, (match) =>
    `[${match.parseResult.status}]`,
  );
  assert.equal(swapped, 'before [parsed] middle [parsed] end');
});

test('replaceCompanionReferences is a no-op when no matches exist', () => {
  const original = 'plain text only';
  assert.equal(replaceCompanionReferences(original, () => '[!]'), original);
});

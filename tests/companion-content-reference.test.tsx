import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMPANION_CONTENT_REFERENCE_VERSION,
  parseCompanionContentReference,
  serializeCompanionContentReference,
  type CompanionContentReference,
} from '../src/products/chat/companion/contentReference.ts';

const SCOPE = 'scope-uuid';
const CAT = 'cat-1';
const TARGET = 's-photo';

function makeReference(
  overrides: Partial<CompanionContentReference> = {},
): CompanionContentReference {
  return {
    version: COMPANION_CONTENT_REFERENCE_VERSION,
    scopeId: SCOPE,
    catId: CAT,
    type: 'photo',
    targetId: TARGET,
    surface: 'companion',
    ...overrides,
  };
}

test('serialize → parse round-trips a v1 reference', () => {
  const reference = makeReference();
  const text = serializeCompanionContentReference(reference);
  assert.equal(
    text,
    `cats://companion/v1/${SCOPE}/${CAT}/photo/${TARGET}`,
  );
  const result = parseCompanionContentReference(text);
  assert.equal(result.status, 'parsed');
  assert.deepEqual(
    result.status === 'parsed' ? result.reference : null,
    reference,
  );
});

test('wrong scheme rejects with wrong_scheme before any other check', () => {
  const result = parseCompanionContentReference('https://companion/v1/a/b/post/c');
  assert.equal(result.status, 'invalid');
  assert.equal(
    result.status === 'invalid' ? result.reason : null,
    'wrong_scheme',
  );
});

test('wrong host rejects with wrong_host', () => {
  const result = parseCompanionContentReference('cats://elsewhere/v1/a/b/post/c');
  assert.equal(result.status, 'invalid');
  assert.equal(
    result.status === 'invalid' ? result.reason : null,
    'wrong_host',
  );
});

test('malformed percent encoding short-circuits ahead of the version decision', () => {
  const result = parseCompanionContentReference('cats://companion/v2/%ZZ/cat/post/t');
  assert.equal(result.status, 'invalid');
  assert.equal(
    result.status === 'invalid' ? result.reason : null,
    'malformed_percent_encoding',
  );
});

test('an unsupported version short-circuits ahead of the segment-count check', () => {
  const result = parseCompanionContentReference(
    'cats://companion/v2/scope/cat/post/target/extra',
  );
  assert.equal(result.status, 'unsupported_version');
  assert.equal(
    result.status === 'unsupported_version' ? result.version : null,
    'v2',
  );
});

test('wrong segment count rejects with bad_segment_count', () => {
  const result = parseCompanionContentReference('cats://companion/v1/scope/cat/post');
  assert.equal(result.status, 'invalid');
  assert.equal(
    result.status === 'invalid' ? result.reason : null,
    'bad_segment_count',
  );
});

test('unknown target type rejects with unknown_target_type', () => {
  const result = parseCompanionContentReference(
    'cats://companion/v1/scope/cat/mystery/target',
  );
  assert.equal(result.status, 'invalid');
  assert.equal(
    result.status === 'invalid' ? result.reason : null,
    'unknown_target_type',
  );
});

test('empty scopeId / catId / targetId segment rejects with empty_path_segment', () => {
  for (const text of [
    'cats://companion/v1//cat/post/t',
    'cats://companion/v1/scope//post/t',
    'cats://companion/v1/scope/cat/post/',
  ]) {
    const result = parseCompanionContentReference(text);
    assert.equal(result.status, 'invalid', text);
    assert.equal(
      result.status === 'invalid' ? result.reason : null,
      'empty_path_segment',
      text,
    );
  }
});

test('percent-decoding decodes scopeId / catId / targetId before validation', () => {
  const result = parseCompanionContentReference(
    `cats://companion/v1/${encodeURIComponent('scope with space')}/cat/post/${encodeURIComponent('id with space')}`,
  );
  assert.equal(result.status, 'parsed');
  if (result.status === 'parsed') {
    assert.equal(result.reference.scopeId, 'scope with space');
    assert.equal(result.reference.targetId, 'id with space');
  }
});

test('serializeCompanionContentReference percent-encodes scopeId / catId / targetId', () => {
  const text = serializeCompanionContentReference(
    makeReference({ scopeId: 'scope with space', targetId: 'id/with/slash' }),
  );
  assert.match(text, /scope%20with%20space/u);
  assert.match(text, /id%2Fwith%2Fslash/u);
});

test('every supported target type round-trips through serialize+parse', () => {
  for (const type of ['post', 'photo', 'video', 'music', 'file'] as const) {
    const ref = makeReference({ type });
    const text = serializeCompanionContentReference(ref);
    const back = parseCompanionContentReference(text);
    assert.equal(back.status, 'parsed', type);
    assert.equal(
      back.status === 'parsed' ? back.reference.type : null,
      type,
      type,
    );
  }
});

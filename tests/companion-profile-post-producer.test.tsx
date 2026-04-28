import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMPANION_PROFILE_POST_METADATA_KEYS,
  projectCompanionPosts,
} from '../src/products/chat/companion/profileReadModel.ts';
import {
  buildCompanionProfilePostDedupKey,
  CompanionProfilePostValidationError,
  promoteCompanionProfilePost,
  setCompanionProfilePostStatus,
} from '../src/products/chat/companion/profilePostProducer.ts';

const CAT_ID = 'cat-fixture';
const BOX_ID = 'box-fixture';
const NOW = '2026-04-28T01:00:00.000Z';

test('promoteCompanionProfilePost rejects empty titles', () => {
  assert.throws(
    () =>
      promoteCompanionProfilePost({
        catId: CAT_ID,
        boxId: BOX_ID,
        origin: { type: 'source', id: 's-photo' },
        title: '   ',
        mediaRefs: [],
        promotedAt: NOW,
      }),
    (error) =>
      error instanceof CompanionProfilePostValidationError
      && error.code === 'title_required',
  );
});

test('promoteCompanionProfilePost requires a non-empty origin id', () => {
  assert.throws(
    () =>
      promoteCompanionProfilePost({
        catId: CAT_ID,
        boxId: BOX_ID,
        origin: { type: 'source', id: '' },
        title: 'Has title',
        mediaRefs: [],
        promotedAt: NOW,
      }),
    (error) =>
      error instanceof CompanionProfilePostValidationError
      && error.code === 'origin_id_required',
  );
});

test('a fresh promote produces a new derived record with the PLAN-077 metadata shape', () => {
  const result = promoteCompanionProfilePost({
    catId: CAT_ID,
    boxId: BOX_ID,
    origin: { type: 'source', id: 's-photo' },
    title: 'Two days at the dome',
    body: 'concert recap',
    tags: ['#concert', '#concert', '  ', '#stella'],
    mediaRefs: [
      { kind: 'source', id: 's-photo' },
      { kind: 'source', id: 's-photo' }, // dedup
      { kind: 'mystery' as never, id: 's-bad-kind' }, // dropped
      { kind: 'source', id: '   ' }, // dropped
    ],
    promotedAt: NOW,
  });

  assert.equal(result.updated, false);
  assert.equal(result.dedupKey, `${CAT_ID}|source|s-photo`);
  assert.equal(result.derived.boxId, BOX_ID);
  assert.equal(result.derived.kind, 'normalized_note');
  assert.equal(result.derived.title, 'Two days at the dome');
  assert.equal(result.derived.content, 'concert recap');
  assert.deepEqual(result.derived.tags, ['#concert', '#stella']);
  assert.deepEqual(result.derived.sourceIds, ['s-photo']);
  assert.equal(
    result.derived.metadata[COMPANION_PROFILE_POST_METADATA_KEYS.surface],
    'post',
  );
  assert.equal(
    result.derived.metadata[COMPANION_PROFILE_POST_METADATA_KEYS.status],
    'active',
  );
  assert.equal(
    result.derived.metadata[COMPANION_PROFILE_POST_METADATA_KEYS.producer],
    'owner_promotion_v1',
  );
  assert.deepEqual(
    result.derived.metadata[COMPANION_PROFILE_POST_METADATA_KEYS.mediaRefs],
    [{ kind: 'source', id: 's-photo' }],
  );
  assert.equal(
    result.derived.metadata[COMPANION_PROFILE_POST_METADATA_KEYS.promotedAt],
    NOW,
  );
});

test('re-promoting the same origin updates the existing record and preserves promotedAt', () => {
  const initial = promoteCompanionProfilePost({
    catId: CAT_ID,
    boxId: BOX_ID,
    origin: { type: 'source', id: 's-photo' },
    title: 'First',
    mediaRefs: [{ kind: 'source', id: 's-photo' }],
    promotedAt: '2026-04-28T00:00:00.000Z',
  });

  const reupdate = promoteCompanionProfilePost(
    {
      catId: CAT_ID,
      boxId: BOX_ID,
      origin: { type: 'source', id: 's-photo' },
      title: 'Updated',
      body: 'edit body',
      mediaRefs: [],
      promotedAt: '2026-04-28T01:00:00.000Z',
    },
    { existingDerived: [initial.derived] },
  );
  assert.equal(reupdate.updated, true);
  assert.equal(reupdate.derived.id, initial.derived.id);
  assert.equal(reupdate.derived.title, 'Updated');
  assert.equal(reupdate.derived.content, 'edit body');
  assert.deepEqual(
    reupdate.derived.metadata[COMPANION_PROFILE_POST_METADATA_KEYS.mediaRefs],
    [],
  );
  // promotedAt is preserved across a re-promote (the original promotion time)
  assert.equal(
    reupdate.derived.metadata[COMPANION_PROFILE_POST_METADATA_KEYS.promotedAt],
    '2026-04-28T00:00:00.000Z',
  );
  assert.equal(reupdate.derived.updatedAt, '2026-04-28T01:00:00.000Z');
});

test('re-promoting a removed post updates status back to active via the producer call', () => {
  const initial = promoteCompanionProfilePost({
    catId: CAT_ID,
    boxId: BOX_ID,
    origin: { type: 'source', id: 's-photo' },
    title: 'First',
    mediaRefs: [],
    promotedAt: NOW,
  });
  const removed = setCompanionProfilePostStatus({
    record: initial.derived,
    status: 'removed',
    now: '2026-04-28T02:00:00.000Z',
  });
  assert.equal(
    removed.metadata[COMPANION_PROFILE_POST_METADATA_KEYS.status],
    'removed',
  );

  const repromote = promoteCompanionProfilePost(
    {
      catId: CAT_ID,
      boxId: BOX_ID,
      origin: { type: 'source', id: 's-photo' },
      title: 'First',
      mediaRefs: [],
      promotedAt: '2026-04-28T03:00:00.000Z',
    },
    { existingDerived: [removed] },
  );
  assert.equal(repromote.updated, true);
  assert.equal(
    repromote.derived.metadata[COMPANION_PROFILE_POST_METADATA_KEYS.status],
    'active',
  );

  // The projection should now treat this as an active post.
  const posts = projectCompanionPosts([repromote.derived]);
  assert.equal(posts.length, 1);
  assert.equal(posts[0]?.status, 'active');
});

test('setCompanionProfilePostStatus refuses to flip a non-post derived record', () => {
  const notPost = {
    id: 'd-summary',
    boxId: BOX_ID,
    catId: CAT_ID,
    kind: 'summary' as const,
    sourceIds: [],
    title: null,
    content: '',
    tags: [],
    metadata: {},
    createdAt: NOW,
    updatedAt: NOW,
  };
  assert.throws(
    () =>
      setCompanionProfilePostStatus({
        record: notPost,
        status: 'removed',
        now: NOW,
      }),
    (error) =>
      error instanceof CompanionProfilePostValidationError
      && error.code === 'not_a_profile_post',
  );
});

test('the dedup key threads through buildCompanionProfilePostDedupKey deterministically', () => {
  assert.equal(
    buildCompanionProfilePostDedupKey({
      catId: 'cat-1',
      originType: 'derived',
      originId: 'd-1',
    }),
    'cat-1|derived|d-1',
  );
});

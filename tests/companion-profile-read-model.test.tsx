import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  CompanionDerivedRecord,
  CompanionSourceRecord,
} from '../src/products/chat/companion/contracts.ts';
import {
  COMPANION_PROFILE_POST_METADATA_KEYS,
  projectCompanionPosts,
  projectCompanionProfile,
} from '../src/products/chat/companion/profileReadModel.ts';

const CAT_ID = 'cat-fixture';
const BOX_ID = 'box-fixture';

function makeSource(
  overrides: Partial<CompanionSourceRecord> & Pick<CompanionSourceRecord, 'id' | 'kind'>,
): CompanionSourceRecord {
  return {
    id: overrides.id,
    boxId: BOX_ID,
    catId: CAT_ID,
    kind: overrides.kind,
    storageMode: overrides.storageMode ?? 'uploaded_copy',
    title: overrides.title ?? null,
    ownerNote: overrides.ownerNote ?? null,
    sourceText: overrides.sourceText ?? null,
    textExcerpt: overrides.textExcerpt ?? null,
    linkedPath: overrides.linkedPath ?? null,
    storedPath: overrides.storedPath ?? null,
    sourceUrl: overrides.sourceUrl ?? null,
    mimeType: overrides.mimeType ?? null,
    originalFileName: overrides.originalFileName ?? null,
    metadata: overrides.metadata ?? {},
    createdAt: overrides.createdAt ?? '2026-04-28T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-28T00:00:00.000Z',
  };
}

function makeDerived(
  overrides: Partial<CompanionDerivedRecord> & Pick<CompanionDerivedRecord, 'id'>,
): CompanionDerivedRecord {
  return {
    id: overrides.id,
    boxId: BOX_ID,
    catId: CAT_ID,
    kind: overrides.kind ?? 'summary',
    sourceIds: overrides.sourceIds ?? [],
    title: overrides.title ?? null,
    content: overrides.content ?? '',
    tags: overrides.tags ?? [],
    metadata: overrides.metadata ?? {},
    createdAt: overrides.createdAt ?? '2026-04-28T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-28T00:00:00.000Z',
  };
}

test('projectCompanionProfile routes sources into the matching media tabs', () => {
  const result = projectCompanionProfile({
    sources: [
      makeSource({ id: 's-photo', kind: 'image', mimeType: 'image/jpeg' }),
      makeSource({ id: 's-video', kind: 'video', mimeType: 'video/mp4' }),
      makeSource({ id: 's-music', kind: 'audio', mimeType: 'audio/mpeg' }),
      makeSource({ id: 's-pdf', kind: 'note', mimeType: 'application/pdf' }),
      makeSource({ id: 's-note', kind: 'note', sourceText: 'a thought' }),
    ],
    derived: [],
  });
  assert.deepEqual(
    result.photos.map((p) => p.sourceId),
    ['s-photo'],
  );
  assert.deepEqual(
    result.videos.map((v) => v.sourceId),
    ['s-video'],
  );
  assert.deepEqual(
    result.music.map((m) => m.sourceId),
    ['s-music'],
  );
  assert.deepEqual(
    result.files.map((f) => f.sourceId),
    ['s-pdf'],
  );
  // The bare note is source_only and stays in the raw Sources list (which
  // is read directly from the input — not re-projected by this helper).
});

test('projectCompanionProfile leaves source_only records out of every projection', () => {
  const result = projectCompanionProfile({
    sources: [makeSource({ id: 's-note', kind: 'note', sourceText: 'thought' })],
    derived: [],
  });
  assert.deepEqual(result.photos, []);
  assert.deepEqual(result.videos, []);
  assert.deepEqual(result.music, []);
  assert.deepEqual(result.files, []);
  assert.deepEqual(result.posts, []);
});

test('a single PDF source projects only into Files (Sources is the raw read)', () => {
  const result = projectCompanionProfile({
    sources: [
      makeSource({
        id: 's-pdf',
        kind: 'note',
        mimeType: 'application/pdf',
        originalFileName: 'reading-list.pdf',
        title: 'Reading list',
      }),
    ],
    derived: [],
  });
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0]?.title, 'Reading list');
  assert.equal(result.files[0]?.sourceId, 's-pdf');
});

test('projectCompanionPosts surfaces derived records with profileSurface=post', () => {
  const posts = projectCompanionPosts([
    makeDerived({
      id: 'd-post-1',
      title: 'Two days at the dome',
      content: 'concert recap body',
      tags: ['#concert'],
      metadata: {
        [COMPANION_PROFILE_POST_METADATA_KEYS.surface]:
          COMPANION_PROFILE_POST_METADATA_KEYS.surfaceValue,
        [COMPANION_PROFILE_POST_METADATA_KEYS.status]: 'active',
        [COMPANION_PROFILE_POST_METADATA_KEYS.producer]:
          COMPANION_PROFILE_POST_METADATA_KEYS.producerValue,
        [COMPANION_PROFILE_POST_METADATA_KEYS.originType]: 'source',
        [COMPANION_PROFILE_POST_METADATA_KEYS.originId]: 's-photo',
        [COMPANION_PROFILE_POST_METADATA_KEYS.mediaRefs]: [
          { kind: 'source', id: 's-photo' },
        ],
        [COMPANION_PROFILE_POST_METADATA_KEYS.promotedAt]:
          '2026-04-28T01:00:00.000Z',
      },
      sourceIds: ['s-photo'],
    }),
    makeDerived({ id: 'd-summary', kind: 'summary' }),
  ]);
  assert.equal(posts.length, 1);
  assert.equal(posts[0]?.derivedId, 'd-post-1');
  assert.equal(posts[0]?.title, 'Two days at the dome');
  assert.equal(posts[0]?.status, 'active');
  assert.deepEqual(posts[0]?.mediaRefs, [{ kind: 'source', id: 's-photo' }]);
  assert.deepEqual(posts[0]?.sourceIds, ['s-photo']);
  assert.equal(posts[0]?.promotedAt, '2026-04-28T01:00:00.000Z');
});

test('projectCompanionPosts sorts newest promotions first', () => {
  const posts = projectCompanionPosts([
    makeDerived({
      id: 'd-old',
      title: 'Older',
      content: '',
      metadata: {
        [COMPANION_PROFILE_POST_METADATA_KEYS.surface]:
          COMPANION_PROFILE_POST_METADATA_KEYS.surfaceValue,
        [COMPANION_PROFILE_POST_METADATA_KEYS.promotedAt]:
          '2026-04-26T00:00:00.000Z',
      },
    }),
    makeDerived({
      id: 'd-new',
      title: 'Newer',
      content: '',
      metadata: {
        [COMPANION_PROFILE_POST_METADATA_KEYS.surface]:
          COMPANION_PROFILE_POST_METADATA_KEYS.surfaceValue,
        [COMPANION_PROFILE_POST_METADATA_KEYS.promotedAt]:
          '2026-04-28T00:00:00.000Z',
      },
    }),
  ]);
  assert.deepEqual(
    posts.map((p) => p.derivedId),
    ['d-new', 'd-old'],
  );
});

test('projectCompanionPosts marks a removed post as removed and keeps it in the projection', () => {
  const posts = projectCompanionPosts([
    makeDerived({
      id: 'd-removed',
      title: 'Deleted post',
      metadata: {
        [COMPANION_PROFILE_POST_METADATA_KEYS.surface]:
          COMPANION_PROFILE_POST_METADATA_KEYS.surfaceValue,
        [COMPANION_PROFILE_POST_METADATA_KEYS.status]: 'removed',
      },
    }),
  ]);
  assert.equal(posts.length, 1);
  assert.equal(posts[0]?.status, 'removed');
});

test('projectCompanionPosts drops malformed media refs silently', () => {
  const posts = projectCompanionPosts([
    makeDerived({
      id: 'd-post',
      title: 'Has bad refs',
      metadata: {
        [COMPANION_PROFILE_POST_METADATA_KEYS.surface]:
          COMPANION_PROFILE_POST_METADATA_KEYS.surfaceValue,
        [COMPANION_PROFILE_POST_METADATA_KEYS.mediaRefs]: [
          { kind: 'source', id: 's-real' },
          { kind: 'mystery', id: 's-bad-kind' },
          { kind: 'source', id: '' },
          'not-an-object',
          null,
        ],
      },
    }),
  ]);
  assert.deepEqual(posts[0]?.mediaRefs, [{ kind: 'source', id: 's-real' }]);
});

test('projectCompanionProfile yields empty arrays for an empty workspace', () => {
  const result = projectCompanionProfile({ sources: [], derived: [] });
  assert.deepEqual(result, {
    posts: [],
    photos: [],
    videos: [],
    music: [],
    files: [],
  });
});

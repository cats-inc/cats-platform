import assert from 'node:assert/strict';
import test from 'node:test';

import type { CompanionDerivedRecord } from '../src/products/chat/companion/contracts.ts';
import {
  COMPANION_PROFILE_METADATA_KEYS,
  projectCompanionProfile,
} from '../src/products/chat/companion/profileReadModel.ts';

const CAT_ID = 'cat-fixture';
const BOX_ID = 'box-fixture';

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

test('projectCompanionProfile yields empty arrays when there are no derived records', () => {
  const result = projectCompanionProfile({ derived: [] });
  assert.deepEqual(result, {
    posts: [],
    photos: [],
    videos: [],
    music: [],
    files: [],
  });
});

test('projectCompanionProfile routes derived records into the matching surface tab', () => {
  const result = projectCompanionProfile({
    derived: [
      makeDerived({
        id: 'd-post',
        title: 'A cat post',
        content: 'hello world',
        metadata: {
          [COMPANION_PROFILE_METADATA_KEYS.surface]:
            COMPANION_PROFILE_METADATA_KEYS.postSurface,
        },
      }),
      makeDerived({
        id: 'd-photo',
        title: 'snap.png',
        metadata: {
          [COMPANION_PROFILE_METADATA_KEYS.surface]:
            COMPANION_PROFILE_METADATA_KEYS.photoSurface,
          [COMPANION_PROFILE_METADATA_KEYS.mediaMimeType]: 'image/png',
          [COMPANION_PROFILE_METADATA_KEYS.mediaStoredPath]: '/agent/photos/snap.png',
        },
      }),
      makeDerived({
        id: 'd-video',
        title: 'clip.mp4',
        metadata: {
          [COMPANION_PROFILE_METADATA_KEYS.surface]:
            COMPANION_PROFILE_METADATA_KEYS.videoSurface,
          [COMPANION_PROFILE_METADATA_KEYS.mediaMimeType]: 'video/mp4',
        },
      }),
      makeDerived({
        id: 'd-music',
        title: 'song.mp3',
        metadata: {
          [COMPANION_PROFILE_METADATA_KEYS.surface]:
            COMPANION_PROFILE_METADATA_KEYS.musicSurface,
        },
      }),
      makeDerived({
        id: 'd-file',
        title: 'notes.md',
        metadata: {
          [COMPANION_PROFILE_METADATA_KEYS.surface]:
            COMPANION_PROFILE_METADATA_KEYS.fileSurface,
        },
      }),
      makeDerived({
        id: 'd-untagged',
        title: 'plain summary, no surface',
      }),
    ],
  });

  assert.deepEqual(result.posts.map((p) => p.derivedId), ['d-post']);
  assert.deepEqual(result.photos.map((p) => p.derivedId), ['d-photo']);
  assert.deepEqual(result.videos.map((v) => v.derivedId), ['d-video']);
  assert.deepEqual(result.music.map((m) => m.derivedId), ['d-music']);
  assert.deepEqual(result.files.map((f) => f.derivedId), ['d-file']);
  assert.equal(result.photos[0]?.mimeType, 'image/png');
  assert.equal(result.photos[0]?.storedPath, '/agent/photos/snap.png');
});

test('a removed post stays in the projection but flagged as removed', () => {
  const result = projectCompanionProfile({
    derived: [
      makeDerived({
        id: 'd-removed',
        title: 'gone',
        metadata: {
          [COMPANION_PROFILE_METADATA_KEYS.surface]:
            COMPANION_PROFILE_METADATA_KEYS.postSurface,
          [COMPANION_PROFILE_METADATA_KEYS.postStatus]: 'removed',
        },
      }),
    ],
  });
  assert.equal(result.posts.length, 1);
  assert.equal(result.posts[0]?.status, 'removed');
});

test('posts sort newest publishedAt first; falls back to createdAt when missing', () => {
  const result = projectCompanionProfile({
    derived: [
      makeDerived({
        id: 'd-old',
        metadata: {
          [COMPANION_PROFILE_METADATA_KEYS.surface]:
            COMPANION_PROFILE_METADATA_KEYS.postSurface,
          [COMPANION_PROFILE_METADATA_KEYS.publishedAt]:
            '2026-04-26T00:00:00.000Z',
        },
      }),
      makeDerived({
        id: 'd-new',
        metadata: {
          [COMPANION_PROFILE_METADATA_KEYS.surface]:
            COMPANION_PROFILE_METADATA_KEYS.postSurface,
          [COMPANION_PROFILE_METADATA_KEYS.publishedAt]:
            '2026-04-28T00:00:00.000Z',
        },
      }),
      makeDerived({
        id: 'd-fallback',
        createdAt: '2026-04-27T00:00:00.000Z',
        metadata: {
          [COMPANION_PROFILE_METADATA_KEYS.surface]:
            COMPANION_PROFILE_METADATA_KEYS.postSurface,
        },
      }),
    ],
  });
  assert.deepEqual(
    result.posts.map((p) => p.derivedId),
    ['d-new', 'd-fallback', 'd-old'],
  );
});

test('malformed mediaRefs are dropped silently while other refs survive', () => {
  const result = projectCompanionProfile({
    derived: [
      makeDerived({
        id: 'd-post',
        metadata: {
          [COMPANION_PROFILE_METADATA_KEYS.surface]:
            COMPANION_PROFILE_METADATA_KEYS.postSurface,
          [COMPANION_PROFILE_METADATA_KEYS.mediaRefs]: [
            { kind: 'source', id: 's-real' },
            { kind: 'mystery', id: 's-bad-kind' },
            { kind: 'source', id: '' },
            'not-an-object',
            null,
          ],
        },
      }),
    ],
  });
  assert.deepEqual(result.posts[0]?.mediaRefs, [{ kind: 'source', id: 's-real' }]);
});

test('owner-supplied sources are NOT projected into media tabs (input no longer accepts sources)', () => {
  const result = projectCompanionProfile({ derived: [] });
  assert.deepEqual(result.photos, []);
  assert.deepEqual(result.videos, []);
  assert.deepEqual(result.music, []);
  assert.deepEqual(result.files, []);
});

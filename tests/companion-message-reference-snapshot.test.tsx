import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMPANION_CONTENT_REFERENCE_VERSION,
  type CompanionContentReference,
} from '../src/products/chat/companion/contentReference.ts';
import type { CompanionContentPreview } from '../src/products/chat/companion/contentResolver.ts';
import {
  COMPANION_MESSAGE_REFERENCE_SNAPSHOT_VERSION,
  buildCompanionMessageReferenceSnapshot,
  readCompanionMessageReferenceSnapshot,
  snapshotToFallbackPreview,
} from '../src/products/chat/companion/messageReferenceSnapshot.ts';

const REFERENCE: CompanionContentReference = {
  version: COMPANION_CONTENT_REFERENCE_VERSION,
  scopeId: 'scope-A',
  catId: 'cat-1',
  type: 'photo',
  targetId: 's-photo',
  surface: 'companion',
};

function fixturePreview(): CompanionContentPreview {
  return {
    reference: REFERENCE,
    availability: 'available',
    title: 'Beach snap',
    subtitle: 'Captured 2026-04-26',
    description: 'A summer photo',
    thumbnailUrl: 'cid:thumb-1',
    icon: 'image',
    catName: 'Mochi',
    openRoute: '/cats/cat-1/companion/photos/s-photo',
    snapshot: { title: 'Beach snap' },
    resolvedAt: '2026-04-28T01:00:00.000Z',
  };
}

test('buildCompanionMessageReferenceSnapshot mirrors the available preview', () => {
  const snapshot = buildCompanionMessageReferenceSnapshot(fixturePreview());
  assert.equal(snapshot.schemaVersion, COMPANION_MESSAGE_REFERENCE_SNAPSHOT_VERSION);
  assert.equal(
    snapshot.referenceText,
    'cats://companion/v1/scope-A/cat-1/photo/s-photo',
  );
  assert.deepEqual(snapshot.reference, REFERENCE);
  assert.equal(snapshot.title, 'Beach snap');
  assert.equal(snapshot.capturedAt, '2026-04-28T01:00:00.000Z');
  assert.deepEqual(snapshot.snapshot, { title: 'Beach snap' });
});

test('buildCompanionMessageReferenceSnapshot lets the caller override capturedAt', () => {
  const snapshot = buildCompanionMessageReferenceSnapshot(fixturePreview(), {
    capturedAt: '2026-04-28T02:00:00.000Z',
  });
  assert.equal(snapshot.capturedAt, '2026-04-28T02:00:00.000Z');
});

test('readCompanionMessageReferenceSnapshot accepts a freshly-built snapshot round-trip', () => {
  const built = buildCompanionMessageReferenceSnapshot(fixturePreview());
  const round = readCompanionMessageReferenceSnapshot(JSON.parse(JSON.stringify(built)));
  assert.deepEqual(round, built);
});

test('readCompanionMessageReferenceSnapshot rejects mismatched schemaVersion', () => {
  const result = readCompanionMessageReferenceSnapshot({
    schemaVersion: 99,
    referenceText: 'cats://companion/v1/scope-A/cat-1/photo/s-photo',
    title: 'x',
    catName: 'c',
    capturedAt: 'now',
  });
  assert.equal(result, null);
});

test('readCompanionMessageReferenceSnapshot rejects malformed referenceText', () => {
  const result = readCompanionMessageReferenceSnapshot({
    schemaVersion: COMPANION_MESSAGE_REFERENCE_SNAPSHOT_VERSION,
    referenceText: 'cats://elsewhere/v1/a/b/c/d',
    title: 'x',
    catName: 'c',
    capturedAt: 'now',
  });
  assert.equal(result, null);
});

test('readCompanionMessageReferenceSnapshot rejects missing capturedAt', () => {
  const result = readCompanionMessageReferenceSnapshot({
    schemaVersion: COMPANION_MESSAGE_REFERENCE_SNAPSHOT_VERSION,
    referenceText: 'cats://companion/v1/scope-A/cat-1/photo/s-photo',
    title: 'x',
    catName: 'c',
  });
  assert.equal(result, null);
});

test('readCompanionMessageReferenceSnapshot defaults catName when missing', () => {
  const result = readCompanionMessageReferenceSnapshot({
    schemaVersion: COMPANION_MESSAGE_REFERENCE_SNAPSHOT_VERSION,
    referenceText: 'cats://companion/v1/scope-A/cat-1/photo/s-photo',
    title: 'Snap',
    capturedAt: '2026-04-28T01:00:00.000Z',
  });
  assert.equal(result?.catName, 'Companion');
});

test('snapshotToFallbackPreview yields the lookup-fallback shape the resolver expects', () => {
  const snapshot = buildCompanionMessageReferenceSnapshot(fixturePreview());
  const fallback = snapshotToFallbackPreview(snapshot);
  assert.equal(fallback.title, 'Beach snap');
  assert.equal(fallback.catName, 'Mochi');
  assert.deepEqual(fallback.snapshot, { title: 'Beach snap' });
});

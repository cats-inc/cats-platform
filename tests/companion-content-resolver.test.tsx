import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMPANION_CONTENT_REFERENCE_VERSION,
  type CompanionContentReference,
} from '../src/products/chat/companion/contentReference.ts';
import {
  resolveCompanionContentReference,
  type CompanionContentLookupResult,
} from '../src/products/chat/companion/contentResolver.ts';
import type { CompanionContentPreview } from '../src/products/chat/companion/contentResolver.ts';

const REFERENCE: CompanionContentReference = {
  version: COMPANION_CONTENT_REFERENCE_VERSION,
  scopeId: 'scope-A',
  catId: 'cat-1',
  type: 'photo',
  targetId: 's-photo',
  surface: 'companion',
};

/**
 * A complete minimal preview.
 *
 * These tests are about resolver lifecycle -- whether a lookup is awaited, which
 * reference it receives, what gets frozen into the envelope -- not about preview
 * content. Spelling the untested fields out once here keeps each case short and
 * gives the contract a single place to reach when it grows.
 */
type LookupPreview = Omit<
  CompanionContentPreview,
  'reference' | 'availability' | 'snapshot' | 'resolvedAt'
>;

function lookupPreview(overrides: Partial<LookupPreview> = {}): LookupPreview {
  return {
    fallbackReason: null,
    title: 'Beach snap',
    generatedTitleKind: null,
    subtitle: null,
    description: null,
    thumbnailUrl: null,
    icon: null,
    catName: 'Mochi',
    openRoute: null,
    ...overrides,
  };
}

test('an available lookup populates the envelope from preview fields', async () => {
  const preview = await resolveCompanionContentReference({
    reference: REFERENCE,
    currentScopeId: 'scope-A',
    resolvedAt: '2026-04-28T01:00:00.000Z',
    lookup: () => ({
      status: 'available',
      preview: {
        fallbackReason: null,
        generatedTitleKind: null,
        title: 'Beach snap',
        subtitle: 'Captured 2026-04-26',
        description: 'A summer photo',
        thumbnailUrl: 'cid:thumb-1',
        icon: 'image',
        catName: 'Mochi',
        openRoute: '/cats/cat-1/companion/photos/s-photo',
      },
    } satisfies CompanionContentLookupResult),
  });

  assert.equal(preview.availability, 'available');
  assert.equal(preview.title, 'Beach snap');
  assert.equal(preview.subtitle, 'Captured 2026-04-26');
  assert.equal(preview.thumbnailUrl, 'cid:thumb-1');
  assert.equal(preview.catName, 'Mochi');
  assert.equal(preview.openRoute, '/cats/cat-1/companion/photos/s-photo');
  assert.equal(preview.resolvedAt, '2026-04-28T01:00:00.000Z');
});

test('a scope mismatch resolves as inaccessible with a localizable fallback marker and never invokes lookup', async () => {
  let lookupCalls = 0;
  const preview = await resolveCompanionContentReference({
    reference: REFERENCE,
    currentScopeId: 'scope-OTHER',
    lookup: () => {
      lookupCalls += 1;
      return { status: 'available' } as CompanionContentLookupResult;
    },
  });
  assert.equal(lookupCalls, 0);
  assert.equal(preview.availability, 'inaccessible');
  assert.equal(preview.fallbackReason, 'inaccessible');
  assert.equal(preview.title, '');
  assert.equal(preview.openRoute, null);
});

test('a missing lookup resolves with a localizable fallback marker and no snapshot', async () => {
  const preview = await resolveCompanionContentReference({
    reference: REFERENCE,
    currentScopeId: 'scope-A',
    lookup: () => ({ status: 'missing' }),
  });
  assert.equal(preview.availability, 'missing');
  assert.equal(preview.fallbackReason, 'missing');
  assert.equal(preview.title, '');
  assert.equal(preview.snapshot, null);
});

test('a missing lookup with a fallback preview keeps the prior title visible', async () => {
  const preview = await resolveCompanionContentReference({
    reference: REFERENCE,
    currentScopeId: 'scope-A',
    lookup: () => ({
      status: 'missing',
      fallback: {
        ...lookupPreview({ title: 'Beach snap (cached)' }),
        snapshot: { title: 'Beach snap (cached)' },
      },
    }),
  });
  assert.equal(preview.availability, 'missing');
  assert.equal(preview.title, 'Beach snap (cached)');
  assert.deepEqual(preview.snapshot, { title: 'Beach snap (cached)' });
});

test('a deleted lookup resolves with a localizable fallback marker', async () => {
  const preview = await resolveCompanionContentReference({
    reference: REFERENCE,
    currentScopeId: 'scope-A',
    lookup: () => ({ status: 'deleted' }),
  });
  assert.equal(preview.availability, 'deleted');
  assert.equal(preview.fallbackReason, 'deleted');
  assert.equal(preview.title, '');
});

test('the resolver passes the original reference through to lookup unchanged', async () => {
  let capturedReference: CompanionContentReference | null = null;
  await resolveCompanionContentReference({
    reference: REFERENCE,
    currentScopeId: 'scope-A',
    lookup: (reference) => {
      capturedReference = reference;
      return {
        status: 'available',
        preview: lookupPreview({ title: 't', catName: 'c' }),
      };
    },
  });
  assert.deepEqual(capturedReference, REFERENCE);
});

test('an async lookup is awaited', async () => {
  const preview = await resolveCompanionContentReference({
    reference: REFERENCE,
    currentScopeId: 'scope-A',
    lookup: async () => ({
      status: 'available',
      preview: lookupPreview({ title: 'async', catName: 'c' }),
    }),
  });
  assert.equal(preview.title, 'async');
});

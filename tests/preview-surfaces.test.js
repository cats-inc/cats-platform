import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPreviewSurfaceFallbackCandidates,
  normalizePreviewSurfaceUrl,
  resolvePreviewSurfaceTarget,
} from '../dist-server/core/previewSurfaces.js';

test('normalizePreviewSurfaceUrl accepts web-safe preview URLs and rejects filesystem paths', () => {
  assert.equal(normalizePreviewSurfaceUrl('https://example.test/preview'), 'https://example.test/preview');
  assert.equal(normalizePreviewSurfaceUrl('/artifacts/preview/index.html'), '/artifacts/preview/index.html');
  assert.equal(normalizePreviewSurfaceUrl('C:\\Users\\kenne\\project\\dist\\index.html'), null);
  assert.equal(normalizePreviewSurfaceUrl('./dist/index.html'), null);
  assert.equal(normalizePreviewSurfaceUrl('file:///tmp/index.html'), null);
});

test('resolvePreviewSurfaceTarget prefers runtime preview surfaces before artifact-path fallback', () => {
  const target = resolvePreviewSurfaceTarget([
    {
      id: 'surface-preview',
      renderHint: 'iframe',
      url: 'http://127.0.0.1:4173',
    },
    {
      id: 'artifact-preview',
      renderHint: 'download',
      path: '/artifacts/generated/report.html',
    },
  ]);

  assert.deepEqual(target, {
    inlineUrl: 'http://127.0.0.1:4173',
    actionUrl: 'http://127.0.0.1:4173',
    renderHint: 'iframe',
    artifactId: 'surface-preview',
    label: null,
  });
});

test('createPreviewSurfaceFallbackCandidates keeps non-web artifact paths from becoming fake previews', () => {
  const candidates = createPreviewSurfaceFallbackCandidates([
    {
      id: 'artifact-local-file',
      kind: 'preview',
      title: 'Preview HTML',
      path: 'C:\\Users\\kenne\\project\\dist\\index.html',
    },
  ]);

  assert.equal(resolvePreviewSurfaceTarget(candidates), null);
});

test('createPreviewSurfaceFallbackCandidates still enables safe app-served artifact fallback', () => {
  const candidates = createPreviewSurfaceFallbackCandidates([
    {
      id: 'artifact-served-preview',
      kind: 'preview',
      title: 'Published Preview',
      path: '/runtime/artifacts/published-preview/index.html',
    },
  ]);

  assert.deepEqual(resolvePreviewSurfaceTarget(candidates), {
    inlineUrl: '/runtime/artifacts/published-preview/index.html',
    actionUrl: '/runtime/artifacts/published-preview/index.html',
    renderHint: 'iframe',
    artifactId: 'artifact-served-preview',
    label: 'Published Preview',
  });
});

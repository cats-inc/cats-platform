import assert from 'node:assert/strict';
import test from 'node:test';

import {
  loadChatApp,
  loadCodeApp,
  loadProductSurface,
  loadWorkApp,
  resolveProductSurfaceLoader,
} from '../src/app/renderer/productSurfaceEntries.tsx';

test('resolveProductSurfaceLoader maps each platform surface to its dedicated loader', () => {
  assert.equal(resolveProductSurfaceLoader('chat'), loadChatApp);
  assert.equal(resolveProductSurfaceLoader('work'), loadWorkApp);
  assert.equal(resolveProductSurfaceLoader('code'), loadCodeApp);
});

test('loadProductSurface delegates through the resolved loader seam', async () => {
  const module = {
    default() {
      return null;
    },
  };
  const requestedSurfaces: string[] = [];

  const loaded = await loadProductSurface('work', (surface) => {
    requestedSurfaces.push(surface);
    return async () => module;
  });

  assert.deepEqual(requestedSurfaces, ['work']);
  assert.equal(loaded, module);
});

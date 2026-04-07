import assert from 'node:assert/strict';
import test from 'node:test';

import { resolvePlatformDocumentTitle } from '../src/app/renderer/App.tsx';

test('platform shell uses the neutral Cats title before setup completes', () => {
  assert.equal(resolvePlatformDocumentTitle({
    loadStatus: 'loading',
    pathname: '/setup',
    setupComplete: false,
  }), 'Cats');

  assert.equal(resolvePlatformDocumentTitle({
    loadStatus: 'ready',
    pathname: '/setup',
    setupComplete: false,
  }), 'Cats');
});

test('platform shell uses the neutral Cats title on lobby routes', () => {
  assert.equal(resolvePlatformDocumentTitle({
    loadStatus: 'ready',
    pathname: '/lobby',
    setupComplete: true,
  }), 'Cats');

  assert.equal(resolvePlatformDocumentTitle({
    loadStatus: 'ready',
    pathname: '/lobby/welcome',
    setupComplete: true,
  }), 'Cats');
});

test('product routes keep ownership of their own titles', () => {
  assert.equal(resolvePlatformDocumentTitle({
    loadStatus: 'ready',
    pathname: '/chat',
    setupComplete: true,
  }), null);
});

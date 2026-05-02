import assert from 'node:assert/strict';
import test from 'node:test';

import { resolvePlatformDocumentTitle } from '../src/app/renderer/App.tsx';
import { createTranslator } from '../src/shared/i18n/index.ts';

const t = createTranslator('en');

test('platform shell uses the neutral Cats title before setup completes', () => {
  assert.equal(resolvePlatformDocumentTitle({
    loadStatus: 'loading',
    pathname: '/setup',
    setupComplete: false,
    t,
  }), 'Cats');

  assert.equal(resolvePlatformDocumentTitle({
    loadStatus: 'ready',
    pathname: '/setup',
    setupComplete: false,
    t,
  }), 'Cats');
});

test('platform shell uses the neutral Cats title on lobby routes', () => {
  assert.equal(resolvePlatformDocumentTitle({
    loadStatus: 'ready',
    pathname: '/lobby',
    setupComplete: true,
    t,
  }), 'Cats');

  assert.equal(resolvePlatformDocumentTitle({
    loadStatus: 'ready',
    pathname: '/lobby/welcome',
    setupComplete: true,
    t,
  }), 'Cats');
});

test('product routes keep ownership of their own titles', () => {
  assert.equal(resolvePlatformDocumentTitle({
    loadStatus: 'ready',
    pathname: '/chat',
    setupComplete: true,
    t,
  }), null);
});

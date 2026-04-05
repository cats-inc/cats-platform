import assert from 'node:assert/strict';
import test from 'node:test';

import { matchRoute } from '../build/server/shared/http.js';

test('matchRoute preserves undefined optional captures instead of coercing them to strings', () => {
  assert.deepEqual(
    matchRoute(
      '/api/transports/telegram/webhook',
      /^\/api\/transports\/telegram\/webhook(?:\/([^/]+))?$/u,
    ),
    [undefined],
  );
});

test('matchRoute still decodes literal route segments that happen to spell undefined', () => {
  assert.deepEqual(
    matchRoute(
      '/api/transports/telegram/webhook/undefined',
      /^\/api\/transports\/telegram\/webhook(?:\/([^/]+))?$/u,
    ),
    ['undefined'],
  );
});


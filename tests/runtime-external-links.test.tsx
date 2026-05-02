import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveRuntimeExternalBaseUrl,
  resolveRuntimeSetupExternalHref,
} from '../src/shared/runtimeExternalLinks.ts';

test('runtime setup external href prefers the runtime origin over browser ingress', () => {
  const runtime = {
    baseUrl: '/runtime',
    externalBaseUrl: 'http://127.0.0.1:3110/',
  };

  assert.equal(resolveRuntimeExternalBaseUrl(runtime), 'http://127.0.0.1:3110');
  assert.equal(resolveRuntimeSetupExternalHref(runtime), 'http://127.0.0.1:3110/setup');
});

test('runtime setup external href falls back to baseUrl when no external origin exists', () => {
  assert.equal(
    resolveRuntimeSetupExternalHref({ baseUrl: '/runtime/' }),
    '/runtime/setup',
  );
});

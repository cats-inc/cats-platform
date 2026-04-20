import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PLATFORM_CHAT_API_BASE,
  PLATFORM_CODE_API_BASE,
  PLATFORM_SURFACE_API_BASES,
  PLATFORM_WORK_API_BASE,
  resolvePlatformSurfaceApiBase,
} from '../src/shared/platformSurfaceApi.ts';

test('platform surface api helpers expose stable per-surface API bases', () => {
  assert.equal(PLATFORM_CHAT_API_BASE, null);
  assert.equal(PLATFORM_WORK_API_BASE, '/api/work');
  assert.equal(PLATFORM_CODE_API_BASE, '/api/code');
  assert.deepEqual(PLATFORM_SURFACE_API_BASES, {
    chat: null,
    work: '/api/work',
    code: '/api/code',
  });
  assert.equal(resolvePlatformSurfaceApiBase('chat'), null);
  assert.equal(resolvePlatformSurfaceApiBase('work'), '/api/work');
  assert.equal(resolvePlatformSurfaceApiBase('code'), '/api/code');
});

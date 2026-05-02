import assert from 'node:assert/strict';
import test from 'node:test';

import {
  attachPlatformRuntimeRoot,
  createPlatformAppDescriptor,
  createPlatformResponseMetadata,
  createPlatformWarmRuntimeSummary,
  PLATFORM_APP_NAME,
  PLATFORM_APP_STAGE,
  PLATFORM_RUNTIME_BOUNDARY,
  PLATFORM_RUNTIME_SERVICE,
} from '../src/shared/platformEnvelopeMetadata.ts';

test('platform envelope metadata helpers expose stable app, runtime, and response metadata', () => {
  assert.equal(PLATFORM_APP_NAME, 'cats-platform');
  assert.equal(PLATFORM_APP_STAGE, 'phase-2-shell');
  assert.equal(PLATFORM_RUNTIME_BOUNDARY, 'cats-runtime');
  assert.equal(PLATFORM_RUNTIME_SERVICE, 'cats-runtime');
  assert.deepEqual(createPlatformAppDescriptor(), {
    name: 'cats-platform',
    stage: 'phase-2-shell',
    runtimeBoundary: 'cats-runtime',
  });
  assert.deepEqual(
    attachPlatformRuntimeRoot({
      baseUrl: 'http://localhost:8123',
      reachable: true,
      status: 'ready',
      service: 'runtime-dev',
    }),
    {
      baseUrl: '/runtime',
      externalBaseUrl: 'http://localhost:8123',
      reachable: true,
      status: 'ready',
      service: 'runtime-dev',
    },
  );
  assert.deepEqual(createPlatformWarmRuntimeSummary(), {
    baseUrl: '/runtime',
    reachable: false,
    status: 'warm',
    service: 'cats-runtime',
  });
  assert.deepEqual(
    createPlatformResponseMetadata({
      generatedAt: new Date('2026-04-20T15:00:00.000Z'),
      host: '127.0.0.1',
      port: 3000,
    }),
    {
      generatedAt: '2026-04-20T15:00:00.000Z',
      host: '127.0.0.1',
      port: 3000,
    },
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  inspectOriginSurfaceCompatibilityTelemetry,
  recordOriginSurfaceCompatibilityFallback,
  resetOriginSurfaceCompatibilityTelemetry,
} from '../build/server/products/chat/api/originSurfaceCompatibilityTelemetry.js';

test('origin-surface compatibility telemetry records fallback counts and latest sample', () => {
  resetOriginSurfaceCompatibilityTelemetry();

  recordOriginSurfaceCompatibilityFallback('channel', 'chat');
  recordOriginSurfaceCompatibilityFallback('parallel_group', 'chat');
  recordOriginSurfaceCompatibilityFallback('channel', 'chat');

  assert.deepEqual(inspectOriginSurfaceCompatibilityTelemetry(), {
    fallbackCount: 3,
    fallbackTargetCounts: {
      channel: 2,
      parallel_group: 1,
    },
    latestFallback: {
      targetNoun: 'channel',
      resolvedSurface: 'chat',
    },
  });
});

test('origin-surface compatibility telemetry inspect result is defensive and reset clears prior state', () => {
  resetOriginSurfaceCompatibilityTelemetry();
  recordOriginSurfaceCompatibilityFallback('channel', 'chat');

  const snapshot = inspectOriginSurfaceCompatibilityTelemetry();
  snapshot.fallbackCount = 999;
  snapshot.fallbackTargetCounts.channel = 999;
  snapshot.latestFallback.targetNoun = 'mutated';

  assert.deepEqual(inspectOriginSurfaceCompatibilityTelemetry(), {
    fallbackCount: 1,
    fallbackTargetCounts: {
      channel: 1,
    },
    latestFallback: {
      targetNoun: 'channel',
      resolvedSurface: 'chat',
    },
  });

  resetOriginSurfaceCompatibilityTelemetry();
  assert.deepEqual(inspectOriginSurfaceCompatibilityTelemetry(), {
    fallbackCount: 0,
    fallbackTargetCounts: {},
    latestFallback: null,
  });
});

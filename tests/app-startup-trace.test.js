import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAppStartupTrace,
  isAppStartupTraceEnabled,
} from '../build/server/app/server/startupTrace.js';

test('app startup trace stays disabled by default', () => {
  assert.equal(isAppStartupTraceEnabled({}), false);
});

test('app startup trace accepts common truthy env values', () => {
  assert.equal(isAppStartupTraceEnabled({ CATS_PLATFORM_STARTUP_TRACE: 'true' }), true);
  assert.equal(isAppStartupTraceEnabled({ CATS_PLATFORM_STARTUP_TRACE: '1' }), true);
  assert.equal(isAppStartupTraceEnabled({ CATS_PLATFORM_STARTUP_TRACE: 'yes' }), true);
  assert.equal(isAppStartupTraceEnabled({ CATS_PLATFORM_STARTUP_TRACE: 'on' }), true);
});

test('app startup trace writes structured payloads when enabled', () => {
  const writes = [];
  const trace = createAppStartupTrace({
    env: { CATS_PLATFORM_STARTUP_TRACE: 'true' },
    now: () => new Date('2026-04-16T01:02:03.000Z'),
    write: (line) => {
      writes.push(line);
    },
    startedAtMs: new Date('2026-04-16T01:02:00.000Z').getTime(),
    pid: 5252,
  });

  trace.trace('server.listen.ready', { port: 8181 });

  assert.equal(writes.length, 1);
  assert.deepEqual(JSON.parse(writes[0]), {
    event: 'app.startup_trace',
    service: 'cats-platform',
    pid: 5252,
    phase: 'server.listen.ready',
    timestamp: '2026-04-16T01:02:03.000Z',
    elapsedMs: 3000,
    details: {
      port: 8181,
    },
  });
});

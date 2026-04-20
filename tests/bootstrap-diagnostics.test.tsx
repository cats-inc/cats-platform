import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ensureBootstrapEventTimestamp,
  normalizeBootstrapEventStatus,
  sortBootstrapEventsByTimestamp,
  summarizeBootstrapEvents,
  toBootstrapEventError,
  trimBootstrapEvents,
  type BootstrapEvent,
} from '../src/shared/bootstrapDiagnostics.ts';

function createEvent(overrides: Partial<BootstrapEvent> = {}): BootstrapEvent {
  return {
    layer: 'runtime',
    kind: 'health',
    timestamp: '2026-04-20T01:00:00.000Z',
    summary: 'Runtime ready',
    status: 'ok',
    ...overrides,
  };
}

test('ensureBootstrapEventTimestamp preserves monotonic chronology by nudging stale timestamps forward', () => {
  assert.equal(
    ensureBootstrapEventTimestamp('2026-04-20T01:00:01.000Z', '2026-04-20T01:00:00.000Z'),
    '2026-04-20T01:00:01.000Z',
  );
  assert.equal(
    ensureBootstrapEventTimestamp('2026-04-20T01:00:00.000Z', '2026-04-20T01:00:00.000Z'),
    '2026-04-20T01:00:00.001Z',
  );
});

test('bootstrap diagnostics sorting and trimming keep newest events first', () => {
  const events = [
    createEvent({ kind: 'z-kind', timestamp: '2026-04-20T01:00:00.000Z' }),
    createEvent({ kind: 'a-kind', timestamp: '2026-04-20T01:00:00.000Z' }),
    createEvent({ kind: 'latest', timestamp: '2026-04-20T02:00:00.000Z' }),
  ];

  assert.deepEqual(
    sortBootstrapEventsByTimestamp(events).map((event) => event.kind),
    ['latest', 'a-kind', 'z-kind'],
  );
  assert.deepEqual(
    trimBootstrapEvents(events, 2).map((event) => event.kind),
    ['latest', 'a-kind'],
  );
  assert.deepEqual(trimBootstrapEvents(events, 0), []);
});

test('normalizeBootstrapEventStatus and toBootstrapEventError fall back to safe shapes', () => {
  assert.equal(normalizeBootstrapEventStatus('ok'), 'ok');
  assert.equal(normalizeBootstrapEventStatus('weird', 'degraded'), 'degraded');

  assert.deepEqual(toBootstrapEventError(' boom '), { message: ' boom ' });
  assert.equal(toBootstrapEventError('   '), undefined);
  const errorPayload = toBootstrapEventError(new Error('failure'));
  assert.equal(errorPayload?.message, 'failure');
  assert.equal(errorPayload?.cause, undefined);
  assert.equal(typeof errorPayload?.stack, 'string');
  const objectError = toBootstrapEventError({ code: 500 });
  assert.equal(objectError?.message, '[object Object]');
});

test('summarizeBootstrapEvents uses the latest event when present and the fallback when history is empty', () => {
  const summary = summarizeBootstrapEvents(
    [
      createEvent({
        status: 'degraded',
        summary: 'Runtime warming up',
        timestamp: '2026-04-20T02:00:00.000Z',
        reference: { artifactId: 'artifact-1' },
      }),
      createEvent({
        status: 'ok',
        summary: 'Older event',
        timestamp: '2026-04-20T01:00:00.000Z',
      }),
    ],
    { status: 'info', summary: 'No history' },
  );

  assert.deepEqual(summary, {
    status: 'degraded',
    summary: 'Runtime warming up',
    latestTimestamp: '2026-04-20T02:00:00.000Z',
    latestReference: { artifactId: 'artifact-1' },
  });

  assert.deepEqual(
    summarizeBootstrapEvents([], { status: 'info', summary: 'No history' }),
    {
      status: 'info',
      summary: 'No history',
      latestTimestamp: null,
    },
  );
});

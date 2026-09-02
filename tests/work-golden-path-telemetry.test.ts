/**
 * Delivery-path counters (PLAN-105 Phase 6).
 *
 * The requirement has two halves and the second is the one worth guarding: count
 * enough to answer "is the golden path healthy?", and record **no message bodies
 * or secrets** while doing it. A counter module that accepts free-text labels
 * satisfies the first half and quietly violates the second, so these tests are
 * mostly about what cannot get in.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTransportWorkTelemetry,
  resolveDecisionLatencyBucket,
  TRANSPORT_WORK_COUNTERS,
} from '../src/platform/transports/work-delivery/telemetry.js';

// --- What cannot get in --------------------------------------------------------

test('a label outside the declared set is refused, not recorded', () => {
  const telemetry = createTransportWorkTelemetry();

  // The shapes a leak would actually take: a goal, a chat id, a token.
  telemetry.record(
    'admission_result',
    'Add a changelog entry for 0.1.21' as never,
  );
  telemetry.record('delivery_receipt', '5150' as never);
  telemetry.record('dedupe_hit', '123456:AAH-token' as never);
  telemetry.record('not_a_counter' as never, 'anything' as never);

  assert.deepEqual(
    telemetry.snapshot().counters,
    {},
    'nothing outside the closed set reached a counter name',
  );
});

test('every declared label is accepted, so the closed set is not too closed', () => {
  const telemetry = createTransportWorkTelemetry();
  let expected = 0;
  for (const [name, labels] of Object.entries(TRANSPORT_WORK_COUNTERS)) {
    for (const label of labels) {
      telemetry.record(name as never, label as never);
      expected += 1;
    }
  }
  const counters = telemetry.snapshot().counters;
  assert.equal(Object.keys(counters).length, expected);
  assert.ok(Object.values(counters).every((value) => value === 1));
});

test('latency is kept as counts and totals, never as samples', () => {
  const telemetry = createTransportWorkTelemetry();
  telemetry.recordDecisionLatency(5_000);
  telemetry.recordDecisionLatency(15_000);
  telemetry.recordDecisionLatency(7_200_000);

  const { decisionLatency } = telemetry.snapshot();
  assert.deepEqual(decisionLatency.under_1m, { count: 2, totalMs: 20_000 });
  assert.deepEqual(decisionLatency.over_1h, { count: 1, totalMs: 7_200_000 });
  assert.deepEqual(decisionLatency.under_10m, { count: 0, totalMs: 0 });
  // A per-decision timeline would be a record of one owner's activity; buckets
  // answer the operational question without being that.
  assert.deepEqual(
    Object.keys(decisionLatency).sort(),
    ['over_1h', 'under_10m', 'under_1h', 'under_1m'],
  );
});

test('a nonsensical latency is dropped rather than skewing a bucket', () => {
  const telemetry = createTransportWorkTelemetry();
  telemetry.recordDecisionLatency(-1);
  telemetry.recordDecisionLatency(Number.NaN);
  telemetry.recordDecisionLatency(Number.POSITIVE_INFINITY);

  const { decisionLatency } = telemetry.snapshot();
  assert.ok(
    Object.values(decisionLatency).every((bucket) => bucket.count === 0),
    'a clock that went backwards must not become an hour-long decision',
  );
});

// --- Bucket boundaries ---------------------------------------------------------

test('latency buckets are contiguous at their boundaries', () => {
  assert.equal(resolveDecisionLatencyBucket(0), 'under_1m');
  assert.equal(resolveDecisionLatencyBucket(59_999), 'under_1m');
  assert.equal(resolveDecisionLatencyBucket(60_000), 'under_10m');
  assert.equal(resolveDecisionLatencyBucket(599_999), 'under_10m');
  assert.equal(resolveDecisionLatencyBucket(600_000), 'under_1h');
  assert.equal(resolveDecisionLatencyBucket(3_599_999), 'under_1h');
  assert.equal(resolveDecisionLatencyBucket(3_600_000), 'over_1h');
});

// --- Counting ------------------------------------------------------------------

test('repeated events accumulate rather than overwrite', () => {
  const telemetry = createTransportWorkTelemetry();
  telemetry.record('admission_result', 'admitted');
  telemetry.record('admission_result', 'admitted');
  telemetry.record('admission_result', 'already_admitted');

  assert.deepEqual(telemetry.snapshot().counters, {
    'admission_result.admitted': 2,
    'admission_result.already_admitted': 1,
  });
});

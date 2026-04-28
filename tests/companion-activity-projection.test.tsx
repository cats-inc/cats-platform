import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMPANION_ACTIVITY_GROUP_VALUES,
  projectCompanionActivity,
  type CompanionActivityEvent,
} from '../src/products/chat/companion/activityProjection.ts';

const CAT_ID = 'cat-fixture';

function ev(
  overrides: Partial<CompanionActivityEvent>
    & Pick<CompanionActivityEvent, 'id' | 'group' | 'targetKind' | 'occurredAt'>,
): CompanionActivityEvent {
  return {
    catId: CAT_ID,
    targetId: overrides.targetId ?? `${overrides.group}:${overrides.id}`,
    ...overrides,
  } as CompanionActivityEvent;
}

test('the v1 vocabulary is exhaustive — only the listed groups render', () => {
  const events: CompanionActivityEvent[] = [
    // legitimate vocabulary entries
    ev({ id: 'e1', group: 'source_added', targetKind: 'source', occurredAt: '2026-04-28T00:00:00.000Z' }),
    // unsupported group should be silently dropped
    ev({
      id: 'e2',
      // @ts-expect-error — intentionally invalid runtime group
      group: 'derived_record_created',
      targetKind: 'derived',
      occurredAt: '2026-04-28T00:00:01.000Z',
    }),
  ];
  const { entries } = projectCompanionActivity(events);
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.group, 'source_added');
});

test('the published vocabulary list matches SPEC-085 exactly', () => {
  assert.deepEqual([...COMPANION_ACTIVITY_GROUP_VALUES], [
    'presence_changed',
    'source_added',
    'source_removed',
    'memory_added',
    'memory_updated',
    'memory_removed',
    'post_promoted',
    'post_edited',
    'post_removed',
    'share_inserted',
    'transport_ingested',
  ]);
});

test('events sharing a correlationId collapse into one entry regardless of timestamp spread', () => {
  const events: CompanionActivityEvent[] = [
    ev({
      id: 'e-a',
      group: 'source_added',
      targetKind: 'source',
      occurredAt: '2026-04-28T00:00:00.000Z',
      correlationId: 'import-1',
    }),
    ev({
      id: 'e-b',
      group: 'source_added',
      targetKind: 'source',
      occurredAt: '2026-04-28T00:30:00.000Z',
      correlationId: 'import-1',
    }),
    ev({
      id: 'e-c',
      group: 'source_added',
      targetKind: 'source',
      occurredAt: '2026-04-28T00:31:00.000Z',
      correlationId: 'import-1',
    }),
  ];
  const { entries } = projectCompanionActivity(events);
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.count, 3);
  assert.equal(entries[0]?.occurredAt, '2026-04-28T00:31:00.000Z');
  assert.match(entries[0]?.summary ?? '', /×3/);
});

test('events without a correlationId fall back to a 60-second bucket', () => {
  const events: CompanionActivityEvent[] = [
    ev({ id: 'e-1', group: 'memory_added', targetKind: 'memory', occurredAt: '2026-04-28T00:00:05.000Z' }),
    ev({ id: 'e-2', group: 'memory_added', targetKind: 'memory', occurredAt: '2026-04-28T00:00:42.000Z' }),
    ev({ id: 'e-3', group: 'memory_added', targetKind: 'memory', occurredAt: '2026-04-28T00:01:01.000Z' }),
  ];
  const { entries } = projectCompanionActivity(events);
  assert.equal(entries.length, 2);
  // Newest bucket first (sorted by occurredAt desc).
  assert.equal(entries[0]?.count, 1);
  assert.equal(entries[1]?.count, 2);
});

test('different groups in the same minute do NOT collapse', () => {
  const events: CompanionActivityEvent[] = [
    ev({ id: 'e-1', group: 'source_added', targetKind: 'source', occurredAt: '2026-04-28T00:00:10.000Z' }),
    ev({ id: 'e-2', group: 'memory_added', targetKind: 'memory', occurredAt: '2026-04-28T00:00:20.000Z' }),
  ];
  const { entries } = projectCompanionActivity(events);
  assert.equal(entries.length, 2);
});

test('projection enforces the 100-entry cap and reports olderHidden', () => {
  const baseMs = new Date('2026-05-15T00:00:00.000Z').getTime();
  const events: CompanionActivityEvent[] = Array.from({ length: 150 }, (_unused, index) => ({
    id: `e-${index}`,
    catId: CAT_ID,
    group: 'source_added',
    targetKind: 'source',
    targetId: `s-${index}`,
    occurredAt: new Date(baseMs - index * 60_000).toISOString(),
    correlationId: `import-${index}`, // distinct correlations so each event is its own bucket
  }));
  const { entries, olderHidden } = projectCompanionActivity(events, {
    now: new Date('2026-05-30T00:00:00.000Z'),
  });
  assert.equal(entries.length, 100);
  assert.equal(olderHidden, true);
});

test('projection enforces the 30-day window even when under the entry cap', () => {
  const events: CompanionActivityEvent[] = [
    ev({
      id: 'e-old',
      group: 'source_added',
      targetKind: 'source',
      occurredAt: '2026-03-01T00:00:00.000Z',
    }),
    ev({
      id: 'e-new',
      group: 'source_added',
      targetKind: 'source',
      occurredAt: '2026-04-28T00:00:00.000Z',
    }),
  ];
  const { entries, olderHidden } = projectCompanionActivity(events, {
    now: new Date('2026-04-29T00:00:00.000Z'),
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.id.includes('|min:'), true);
  assert.equal(olderHidden, true);
});

test('an empty input returns empty entries and olderHidden=false', () => {
  const { entries, olderHidden } = projectCompanionActivity([]);
  assert.deepEqual(entries, []);
  assert.equal(olderHidden, false);
});

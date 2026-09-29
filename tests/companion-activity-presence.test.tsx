import assert from 'node:assert/strict';
import test from 'node:test';

import { describeActivityEntry } from '../src/app/renderer/entities/companion/CompanionFeed.tsx';
import {
  projectCompanionActivity,
  type CompanionActivityEvent,
} from '../src/products/chat/companion/activityProjection.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';

function presenceEvent(id: string, metadata: Record<string, unknown>, occurredAt: string): CompanionActivityEvent {
  return {
    id,
    catId: 'cat-1',
    group: 'presence_changed',
    targetKind: 'presence',
    targetId: 'lane-1',
    occurredAt,
    metadata,
  };
}

test('presence activity keeps the newest event metadata through projection', () => {
  const { entries } = projectCompanionActivity([
    presenceEvent('e1', { presence: 'awake', reason: 'rhythm' }, '2026-09-29T07:12:00.000Z'),
    presenceEvent('e2', { presence: 'sleeping', reason: 'rest' }, '2026-09-29T23:20:00.000Z'),
  ]);
  assert.deepEqual(
    entries.map((entry) => entry.metadata),
    [{ presence: 'sleeping', reason: 'rest' }, { presence: 'awake', reason: 'rhythm' }],
  );
});

test('presence activity reads as a localized sentence, never the raw group', () => {
  const en = createTranslator('en');
  const zh = createTranslator('zh-TW');
  const describe = (metadata: Record<string, unknown>, translate = en) => {
    const [entry] = projectCompanionActivity([presenceEvent('e', metadata, '2026-09-29T08:00:00.000Z')]).entries;
    return describeActivityEntry(entry!, translate);
  };
  assert.equal(describe({ presence: 'awake', reason: 'rhythm' }), 'Woke up');
  assert.equal(describe({ presence: 'awake', reason: 'keep_alive' }), 'Woke up again after the session stopped');
  assert.equal(describe({ presence: 'sleeping', reason: 'idle' }), 'Dozed off again');
  assert.equal(describe({ presence: 'sleeping', reason: 'no_capacity' }), "Couldn't wake up: no free session slot");
  assert.equal(describe({ presence: 'sleeping', reason: 'owner' }, zh), '被你哄去睡了');
  assert.equal(describe({ presence: 'awake', reason: 'owner' }, zh), '被你叫醒了');
});

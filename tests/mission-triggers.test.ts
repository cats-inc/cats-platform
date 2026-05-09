import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MISSION_METADATA_SCHEDULE_KEY,
  MISSION_METADATA_TRIGGER_KEY,
  isMissionScheduleRule,
  isMissionTriggerEvent,
  readMissionScheduleRuleFromMetadata,
  readMissionTriggerEventFromMetadata,
  withMissionScheduleRule,
  withMissionTriggerEvent,
} from '../src/core/missionTriggers.js';

test('isMissionScheduleRule accepts the cron and manual variants', () => {
  assert.equal(
    isMissionScheduleRule({
      kind: 'cron',
      cronExpression: '0 9 * * 1-5',
      timezone: 'Asia/Taipei',
      expiresAt: null,
    }),
    true,
  );
  assert.equal(
    isMissionScheduleRule({
      kind: 'manual',
      note: 'Owner triggers this from the Work board',
    }),
    true,
  );
  assert.equal(
    isMissionScheduleRule({ kind: 'manual', note: null }),
    true,
  );
});

test('isMissionScheduleRule rejects unknown kinds and missing cron expression', () => {
  assert.equal(isMissionScheduleRule(null), false);
  assert.equal(isMissionScheduleRule('cron'), false);
  assert.equal(isMissionScheduleRule({ kind: 'webhook' }), false);
  assert.equal(
    isMissionScheduleRule({ kind: 'cron', cronExpression: '   ', timezone: null, expiresAt: null }),
    false,
  );
});

test('isMissionTriggerEvent validates each trigger variant', () => {
  assert.equal(
    isMissionTriggerEvent({
      kind: 'cron',
      scheduleRuleId: null,
      firedAt: '2026-05-09T01:00:00.000Z',
    }),
    true,
  );
  assert.equal(
    isMissionTriggerEvent({
      kind: 'transport_ingress',
      transportBindingId: 'binding-telegram-1',
      conversationId: 'conversation-1',
      receivedAt: '2026-05-09T01:01:00.000Z',
    }),
    true,
  );
  assert.equal(
    isMissionTriggerEvent({
      kind: 'owner_action',
      ownerActorId: 'agent-owner',
      invokedAt: '2026-05-09T01:02:00.000Z',
      reason: null,
    }),
    true,
  );
  assert.equal(
    isMissionTriggerEvent({
      kind: 'workflow_continuation',
      parentMissionId: 'mission-1',
      parentRunId: null,
      continuedAt: '2026-05-09T01:03:00.000Z',
    }),
    true,
  );
  assert.equal(
    isMissionTriggerEvent({
      kind: 'webhook',
      source: 'github.pull_request',
      receivedAt: '2026-05-09T01:04:00.000Z',
      metadata: { actionType: 'opened' },
    }),
    true,
  );
});

test('isMissionTriggerEvent rejects malformed payloads', () => {
  assert.equal(isMissionTriggerEvent(null), false);
  assert.equal(isMissionTriggerEvent({ kind: 'cron' }), false);
  assert.equal(
    isMissionTriggerEvent({ kind: 'owner_action', ownerActorId: '   ', invokedAt: '', reason: null }),
    false,
  );
  assert.equal(
    isMissionTriggerEvent({
      kind: 'webhook',
      source: 'github.pull_request',
      receivedAt: '2026-05-09T01:04:00.000Z',
      metadata: null,
    }),
    false,
  );
  assert.equal(isMissionTriggerEvent({ kind: 'unknown_kind' }), false);
});

test('withMissionTriggerEvent and withMissionScheduleRule round-trip through metadata', () => {
  const initial = { existing: 'value' };
  const trigger = {
    kind: 'cron' as const,
    scheduleRuleId: 'rule-1',
    firedAt: '2026-05-09T02:00:00.000Z',
  };
  const schedule = {
    kind: 'cron' as const,
    cronExpression: '*/15 * * * *',
    timezone: null,
    expiresAt: null,
  };

  const withTrigger = withMissionTriggerEvent(initial, trigger);
  assert.equal(withTrigger.existing, 'value');
  assert.deepEqual(withTrigger[MISSION_METADATA_TRIGGER_KEY], trigger);
  assert.deepEqual(readMissionTriggerEventFromMetadata(withTrigger), trigger);
  // Original metadata is untouched.
  assert.equal((initial as Record<string, unknown>)[MISSION_METADATA_TRIGGER_KEY], undefined);

  const withSchedule = withMissionScheduleRule(withTrigger, schedule);
  assert.deepEqual(readMissionScheduleRuleFromMetadata(withSchedule), schedule);
  assert.deepEqual(withSchedule[MISSION_METADATA_SCHEDULE_KEY], schedule);
  // Trigger is preserved alongside the schedule rule.
  assert.deepEqual(withSchedule[MISSION_METADATA_TRIGGER_KEY], trigger);
});

test('readMissionTriggerEventFromMetadata returns null when value is missing or invalid', () => {
  assert.equal(readMissionTriggerEventFromMetadata({}), null);
  assert.equal(
    readMissionTriggerEventFromMetadata({ [MISSION_METADATA_TRIGGER_KEY]: 'not-an-object' }),
    null,
  );
  assert.equal(
    readMissionScheduleRuleFromMetadata({ [MISSION_METADATA_SCHEDULE_KEY]: { kind: 'cron' } }),
    null,
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DAILY_MORNING_GREETING_TITLE,
  DAILY_CODE_CHECK_TITLE,
  DAILY_MEMORY_FLUSH_TITLE,
  DAILY_TRANSPORT_DIGEST_TITLE,
  DAILY_WORK_REVIEW_TITLE,
  buildDailyCodeCheckScheduleInput,
  buildDailyMemoryFlushScheduleInput,
  buildDailyMorningGreetingScheduleInput,
  buildDailyTransportDigestScheduleInput,
  buildDailyWorkReviewScheduleInput,
  buildScheduleAuditExport,
  findDailyMorningGreetingRule,
  resolveDailyMorningGreetingShortcut,
  serializeScheduleAuditExport,
} from '../src/products/work/renderer/components/schedules/scheduleUiSupport.ts';
import type {
  WorkScheduleRule,
  WorkScheduleTriggerReceipt,
} from '../src/products/work/renderer/api/schedules.ts';

test('daily morning greeting shortcut creates a generic schedule rule input', () => {
  const input = buildDailyMorningGreetingScheduleInput({
    catId: 'cat-guide',
    bindingId: 'telegram-guide',
    timezone: 'Asia/Taipei',
  });

  assert.equal(input.title, DAILY_MORNING_GREETING_TITLE);
  assert.equal(input.enabled, true);
  assert.deepEqual(input.schedule, {
    kind: 'daily',
    time: '08:00',
  });
  assert.deepEqual(input.missionTemplate.target, {
    kind: 'cat',
    id: 'cat-guide',
  });
  assert.equal(input.missionTemplate.originSurface, 'schedule');
  assert.deepEqual(input.missionTemplate.transportTargets, [
    {
      platform: 'telegram',
      bindingId: 'telegram-guide',
    },
  ]);
  assert.deepEqual(input.missionTemplate.resourceScopes, [
    {
      kind: 'companion_content',
      catId: 'cat-guide',
    },
  ]);
  assert.deepEqual(input.missionTemplate.toolScopes, [
    'companion.content.list',
    'companion.content.read',
    'companion.content.post.create',
    'transport.telegram.text.send',
    'transport.telegram.media.send',
  ]);
  assert.deepEqual(input.executionPolicy, {
    missionPolicy: 'per_fire',
    concurrencyPolicy: 'skip',
    misfirePolicy: 'fire_once',
    retryPolicy: {
      maxAttempts: 0,
      backoff: 'none',
      pauseAfterConsecutiveFailures: 3,
    },
  });
});

test('daily morning greeting shortcut requires a ready Telegram binding', () => {
  const shortcut = resolveDailyMorningGreetingShortcut({
    payload: {
      chat: {
        cats: [
          {
            id: 'cat-guide',
            name: 'Guide Cat',
            status: 'active',
          },
        ],
        botBindings: [
          {
            id: 'telegram-guide',
            platform: 'telegram',
            botName: 'Guide Bot',
            catId: 'cat-guide',
            status: 'active',
            hasBotToken: false,
          },
        ],
      },
    },
    rules: [],
    timezone: 'Asia/Taipei',
  });

  if (shortcut.available) {
    assert.fail('shortcut should be unavailable without a bot token');
  }
  assert.equal(shortcut.reason, 'telegram_binding_not_ready');
});

test('daily morning greeting shortcut detects an existing generic rule', () => {
  const existingRule = createRuleFixture('cat-guide', 'telegram-guide');
  const shortcut = resolveDailyMorningGreetingShortcut({
    payload: {
      chat: {
        cats: [
          {
            id: 'cat-guide',
            name: 'Guide Cat',
            status: 'active',
          },
        ],
        botBindings: [
          {
            id: 'telegram-guide',
            platform: 'telegram',
            botName: 'Guide Bot',
            catId: 'cat-guide',
            status: 'active',
            hasBotToken: true,
          },
        ],
      },
    },
    rules: [existingRule],
    timezone: 'Asia/Taipei',
  });

  if (!shortcut.available) {
    assert.fail(`shortcut should be available: ${shortcut.message}`);
  }
  assert.equal(shortcut.existingRule?.id, existingRule.id);
  assert.equal(findDailyMorningGreetingRule([existingRule], {
    catId: 'cat-guide',
    bindingId: 'telegram-guide',
  })?.id, existingRule.id);
});

test('schedule audit export serializes rules and receipts without mutating inputs', () => {
  const rule = createRuleFixture('cat-guide', 'telegram-guide');
  const receipt: WorkScheduleTriggerReceipt = {
    id: 'receipt-retry',
    ruleId: rule.id,
    ruleRevision: 1,
    scheduledFireAt: '2026-04-29T00:00:00.000Z',
    actualFireAt: '2026-04-29T00:05:00.000Z',
    idempotencyKey: 'schedule-retry:schedule-daily-greeting:1:2026-04-29T00:00:00.000Z:1',
    reason: 'retry',
    status: 'admitted',
    missionId: 'mission-retry',
    runId: 'run-retry',
    message: null,
    createdAt: '2026-04-29T00:05:00.000Z',
    updatedAt: '2026-04-29T00:05:00.000Z',
    metadata: {
      retryAttempt: 1,
    },
  };

  const exported = buildScheduleAuditExport({
    exportedAt: '2026-04-29T01:00:00.000Z',
    rules: [rule],
    triggerReceipts: [receipt],
  });
  rule.title = 'Changed after export';

  assert.equal(exported.rules[0]?.title, DAILY_MORNING_GREETING_TITLE);
  assert.equal(exported.triggerReceipts[0]?.metadata.retryAttempt, 1);
  assert.match(serializeScheduleAuditExport(exported), /"exportedAt": "2026-04-29T01:00:00.000Z"/u);
});

test('follow-on schedule templates still emit generic rule inputs', () => {
  const target = { kind: 'agent' as const, id: 'agent-ops' };
  const workReview = buildDailyWorkReviewScheduleInput({
    target,
    timezone: 'UTC',
  });
  const codeCheck = buildDailyCodeCheckScheduleInput({
    target,
    timezone: 'UTC',
  });
  const memoryFlush = buildDailyMemoryFlushScheduleInput({
    target,
    timezone: 'UTC',
  });
  const transportDigest = buildDailyTransportDigestScheduleInput({
    target,
    bindingId: 'telegram-digest',
    timezone: 'UTC',
  });

  assert.equal(workReview.title, DAILY_WORK_REVIEW_TITLE);
  assert.equal(workReview.missionTemplate.originSurface, 'schedule');
  assert.deepEqual(workReview.missionTemplate.target, target);
  assert.equal(workReview.schedule.kind, 'daily');
  assert.equal(workReview.executionPolicy.missionPolicy, 'per_fire');
  assert.equal(codeCheck.title, DAILY_CODE_CHECK_TITLE);
  assert.equal(codeCheck.missionTemplate.originSurface, 'schedule');
  assert.equal(memoryFlush.title, DAILY_MEMORY_FLUSH_TITLE);
  assert.equal(memoryFlush.missionTemplate.originSurface, 'schedule');
  assert.equal(transportDigest.title, DAILY_TRANSPORT_DIGEST_TITLE);
  assert.deepEqual(transportDigest.missionTemplate.transportTargets, [
    {
      platform: 'telegram',
      bindingId: 'telegram-digest',
    },
  ]);
  assert.deepEqual(transportDigest.missionTemplate.toolScopes, [
    'transport.telegram.text.send',
  ]);
});

function createRuleFixture(catId: string, bindingId: string): WorkScheduleRule {
  return {
    id: 'schedule-daily-greeting',
    title: DAILY_MORNING_GREETING_TITLE,
    enabled: true,
    revision: 1,
    timezone: 'Asia/Taipei',
    schedule: {
      kind: 'daily',
      time: '08:00',
    },
    missionTemplate: {
      target: {
        kind: 'cat',
        id: catId,
      },
      originSurface: 'schedule',
      intent: 'Send a morning greeting.',
      transportTargets: [
        {
          platform: 'telegram',
          bindingId,
        },
      ],
    },
    executionPolicy: {
      missionPolicy: 'per_fire',
      concurrencyPolicy: 'skip',
      misfirePolicy: 'fire_once',
      retryPolicy: {
        maxAttempts: 0,
        backoff: 'none',
        pauseAfterConsecutiveFailures: 3,
      },
    },
    createdAt: '2026-04-29T00:00:00.000Z',
    updatedAt: '2026-04-29T00:00:00.000Z',
    createdByActorId: 'actor-owner',
    nextFireAt: '2026-04-29T00:00:00.000Z',
    lastFireAt: null,
    lastRunId: null,
    lastFailure: null,
  };
}

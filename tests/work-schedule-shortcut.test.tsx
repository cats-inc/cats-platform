import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DAILY_MORNING_GREETING_TITLE,
  buildDailyMorningGreetingScheduleInput,
  findDailyMorningGreetingRule,
  resolveDailyMorningGreetingShortcut,
} from '../src/products/work/renderer/components/schedules/scheduleUiSupport.ts';
import type { WorkScheduleRule } from '../src/products/work/renderer/api/schedules.ts';

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

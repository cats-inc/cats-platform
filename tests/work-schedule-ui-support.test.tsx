import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildScheduleAuditExport,
  formatScheduleSummary,
  serializeScheduleAuditExport,
} from '../src/products/work/renderer/components/schedules/scheduleUiSupport.ts';
import type {
  WorkScheduleRule,
  WorkScheduleTriggerReceipt,
} from '../src/products/work/renderer/api/schedules.ts';

test('schedule audit export serializes rules and receipts without mutating inputs', () => {
  const rule = createRuleFixture();
  const receipt: WorkScheduleTriggerReceipt = {
    id: 'receipt-retry',
    ruleId: rule.id,
    ruleRevision: 1,
    scheduledFireAt: '2026-04-29T00:00:00.000Z',
    actualFireAt: '2026-04-29T00:05:00.000Z',
    idempotencyKey: 'schedule-retry:schedule-generic:1:2026-04-29T00:00:00.000Z:1',
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

  assert.equal(exported.rules[0]?.title, 'Generic schedule');
  assert.equal(exported.triggerReceipts[0]?.metadata.retryAttempt, 1);
  assert.match(serializeScheduleAuditExport(exported), /"exportedAt": "2026-04-29T01:00:00.000Z"/u);
});

test('Work schedule helpers stay product-neutral', async () => {
  const supportSource = await readFile(
    'src/products/work/renderer/components/schedules/scheduleUiSupport.ts',
    'utf-8',
  );
  const listSource = await readFile(
    'src/products/work/renderer/components/schedules/SchedulesListPage.tsx',
    'utf-8',
  );

  assert.doesNotMatch(supportSource, /morning|greeting|companion|telegram/i);
  assert.doesNotMatch(listSource, /morning|greeting|companion|telegram/i);
});

test('schedule summary formats generic once and daily rules', () => {
  assert.match(formatScheduleSummary(createRuleFixture()), /^Daily at 09:00 UTC$/u);
  assert.match(formatScheduleSummary({
    ...createRuleFixture(),
    schedule: {
      kind: 'once',
      fireAt: '2026-04-29T09:00:00.000Z',
    },
  }), /^Once at /u);
});

function createRuleFixture(): WorkScheduleRule {
  return {
    id: 'schedule-generic',
    title: 'Generic schedule',
    enabled: true,
    revision: 1,
    timezone: 'UTC',
    schedule: {
      kind: 'daily',
      time: '09:00',
    },
    missionTemplate: {
      target: {
        kind: 'agent',
        id: 'agent-schedule',
      },
      originSurface: 'schedule',
      intent: 'Run a generic scheduled mission.',
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
    nextFireAt: '2026-04-29T09:00:00.000Z',
    lastFireAt: null,
    lastRunId: null,
    lastFailure: null,
  };
}

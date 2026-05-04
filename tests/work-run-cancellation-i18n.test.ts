import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatMissionCancelBlockedMessage,
  formatMissionCancelBlockerDetail,
  formatRunCancellationBlockerReason,
  formatRunStopBlockerMessage,
} from '../src/products/work/renderer/components/runCancellationLabels.ts';
import type { WorkRunStopResponse } from '../src/products/work/renderer/api/runCancellation.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';

test('work run cancellation blocker reasons localize known deterministic messages', () => {
  const t = createTranslator('zh-TW');

  assert.equal(
    formatRunCancellationBlockerReason(
      'Running run is not stoppable: no supervised runtime session is bridged.',
      t,
    ),
    '此執行沒有橋接監督式執行階段工作階段。',
  );
  assert.equal(
    formatRunCancellationBlockerReason(
      'Runtime client is unavailable; cannot request runtime cancellation.',
      t,
    ),
    '執行階段用戶端無法使用。',
  );
  assert.equal(
    formatRunCancellationBlockerReason('Runtime cancellation failed: access denied', t),
    '取消執行階段失敗：access denied',
  );
  assert.equal(
    formatRunCancellationBlockerReason('Retry after owner review', t),
    'Retry after owner review',
  );
});

test('work mission cancel blocked feedback formats localized blocker detail', () => {
  const t = createTranslator('zh-TW');

  const detail = formatMissionCancelBlockerDetail([
    {
      runId: 'run-1',
      reason:
        'Running run is not stoppable: no supervised runtime session is bridged.',
    },
  ], t);
  assert.equal(
    detail,
    'run-1: 此執行沒有橋接監督式執行階段工作階段。',
  );

  const message = formatMissionCancelBlockedMessage([
    {
      runId: 'run-1',
      reason:
        'Running run is not stoppable: no supervised runtime session is bridged.',
    },
  ], t);
  assert.match(message, /任務取消遭阻擋。run-1: 此執行沒有/u);
  assert.doesNotMatch(message, /Mission cancel blocked|Running run/u);
});

test('work run stop blocker ignores deterministic raw server summary', () => {
  const t = createTranslator('zh-TW');
  const response = {
    status: 'not_stoppable',
    runtimeAbort: {
      attempted: false,
      sessionId: null,
      status: 'not_applicable',
    },
    message:
      'Running run is not stoppable: no supervised runtime session is bridged.',
  } as unknown as WorkRunStopResponse;

  assert.equal(
    formatRunStopBlockerMessage(response, t),
    '此執行沒有橋接監督式執行階段工作階段。',
  );
});

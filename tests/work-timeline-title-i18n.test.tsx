import assert from 'node:assert/strict';
import test from 'node:test';

import { presentWorkTimelineTitle } from '../src/products/work/renderer/components/workTimelineLabels.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';

test('work timeline titles localize deterministic Core timeline titles', () => {
  const t = createTranslator('zh-TW');

  assert.equal(presentWorkTimelineTitle('Approval requested', t), '已要求核准');
  assert.equal(presentWorkTimelineTitle('Operator action', t), '操作員動作');
  assert.equal(presentWorkTimelineTitle('Trace (dispatch)', t), '追蹤（派工）');
  assert.equal(presentWorkTimelineTitle('Checkpoint: Ship gate', t), '檢查點：Ship gate');
  assert.equal(
    presentWorkTimelineTitle('Evidence: provider-agent run loop', t),
    '證據：供應器代理人執行迴圈',
  );
  assert.equal(
    presentWorkTimelineTitle('Provider-agent plan: plan-123', t),
    '供應器代理人計畫：plan-123',
  );
});

test('work timeline titles preserve runtime-authored titles', () => {
  const t = createTranslator('zh-TW');

  assert.equal(
    presentWorkTimelineTitle('Customer kickoff summary recorded', t),
    'Customer kickoff summary recorded',
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  labelCodeBlockedReasonForLocale,
  labelCodeDeliveryDecisionForLocale,
  labelCodeDeliveryModeForLocale,
  labelCodeTaskStrategyForLocale,
} from '../src/products/code/renderer/components/codeStatusLabels.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';

test('code execution control labels localize known enum tokens', () => {
  const t = createTranslator('zh-TW');

  assert.equal(labelCodeDeliveryModeForLocale('commit_only', t), '僅提交');
  assert.equal(labelCodeTaskStrategyForLocale('reflexion', t), 'Reflexion');
  assert.equal(labelCodeDeliveryDecisionForLocale('reroute', t), '重新指派');
  assert.equal(labelCodeBlockedReasonForLocale('approval_pending', t), '等待核准');
  assert.equal(labelCodeBlockedReasonForLocale('max_dispatches', t), '已達分派上限');
  assert.equal(labelCodeBlockedReasonForLocale('no_valid_targets', t), '沒有有效目標');
});

test('code execution control labels preserve unknown runtime tokens', () => {
  const t = createTranslator('zh-TW');

  assert.equal(labelCodeBlockedReasonForLocale('custom_guard', t), 'custom_guard');
  assert.equal(labelCodeDeliveryDecisionForLocale('external_gate', t), 'external_gate');
});

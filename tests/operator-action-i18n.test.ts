import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveApprovalActionDescription,
  resolveApprovalActionLabel,
  resolveOperatorActionDescription,
  resolveOperatorActionLabel,
  resolveOperatorActionStatusLabel,
} from '../src/design/components/operator/actionI18n.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';

const zh = createTranslator('zh-TW');

test('operator action labels and statuses localize known values', () => {
  assert.equal(resolveOperatorActionLabel('Request Retry', zh), '要求重試');
  assert.equal(resolveOperatorActionLabel('Retry Again', zh), '再次重試');
  assert.equal(
    resolveOperatorActionStatusLabel('Retry failed: boom', zh),
    '重試失敗：boom',
  );
  assert.equal(
    resolveOperatorActionDescription(
      'Record that the operator has seen the current guardrail or incident state.',
      zh,
    ),
    '記錄操作員已查看目前的保護條件或事件狀態。',
  );
  assert.equal(
    resolveOperatorActionDescription(
      'Record that the operator wants this blocked or failed task retried.',
      zh,
    ),
    '記錄操作員希望重試這個受阻或失敗的任務。',
  );
  assert.equal(
    resolveOperatorActionDescription(
      'Replay the stored dispatch or workflow continuation through the existing operator seam.',
      zh,
    ),
    '透過既有操作員路徑重放已儲存的派工或工作流程延續。',
  );
  assert.equal(
    resolveOperatorActionDescription(
      'Record that the operator has seen the current blocked or failed state.',
      zh,
    ),
    '記錄操作員已查看目前受阻或失敗的狀態。',
  );
});

test('approval action labels and descriptions localize by action kind', () => {
  assert.equal(resolveApprovalActionLabel('approve', 'Approve', zh), '核准');
  assert.equal(resolveApprovalActionLabel('reroute', 'Reroute', zh), '改派路徑');
  assert.equal(
    resolveApprovalActionDescription(
      'reject',
      'Do not allow the plan to proceed.',
      zh,
    ),
    '不允許計畫繼續。',
  );
});

test('operator action localization preserves unknown fallback values', () => {
  assert.equal(resolveOperatorActionLabel('Escalate', zh), 'Escalate');
  assert.equal(
    resolveOperatorActionStatusLabel('Custom status', zh),
    'Custom status',
  );
  assert.equal(resolveApprovalActionLabel('custom', 'Custom', zh), 'Custom');
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getWorkGraphDiagnosticKindLabel,
  getWorkGraphDiagnosticSeverityLabel,
} from '../src/products/work/renderer/components/topdown/shared.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';

test('work graph diagnostic severity and kind labels localize known tokens', () => {
  const t = createTranslator('zh-TW');

  assert.equal(getWorkGraphDiagnosticSeverityLabel('error', t), '錯誤');
  assert.equal(getWorkGraphDiagnosticSeverityLabel('warning', t), '警告');
  assert.equal(getWorkGraphDiagnosticSeverityLabel('info', t), '資訊');
  assert.equal(getWorkGraphDiagnosticKindLabel('orphan_link', t), '孤立連結');
  assert.equal(getWorkGraphDiagnosticKindLabel('link_cycle', t), '連結循環');
  assert.equal(
    getWorkGraphDiagnosticKindLabel('missing_planning_execution_bridge', t),
    '缺少規劃/執行橋接',
  );
});

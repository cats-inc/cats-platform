import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatRunArtifactStatusLabel,
  formatRunOutcomeStatusLabel,
  formatRunTraceKindLabel,
} from '../src/products/work/renderer/components/runs/runDetailLabels.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';

test('work run detail labels localize trace kind and result status tokens', () => {
  const t = createTranslator('zh-TW');

  assert.equal(formatRunTraceKindLabel('dispatch', t), '派工');
  assert.equal(formatRunTraceKindLabel('outcome', t), '結果');
  assert.equal(formatRunOutcomeStatusLabel('succeeded', t), '成功');
  assert.equal(formatRunOutcomeStatusLabel('blocked', t), '受阻');
  assert.equal(formatRunArtifactStatusLabel('published', t), '已發佈');
  assert.equal(formatRunArtifactStatusLabel('archived', t), '已封存');
  assert.equal(formatRunTraceKindLabel('custom_trace', t), '未知追蹤（custom trace）');
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { createTranslator } from '../src/shared/i18n/index.ts';
import { presentWorkRunSummary } from '../src/products/work/renderer/components/runs/runSummaryLabels.ts';

test('work run summaries localize Cats-owned deterministic runtime summaries', () => {
  const t = createTranslator('zh-TW');

  assert.equal(
    presentWorkRunSummary('Queued supervised Work run.', t),
    '已排入監督式工作執行。',
  );
  assert.equal(
    presentWorkRunSummary('Started supervised Code task execution.', t),
    '已啟動監督式程式任務執行。',
  );
  assert.equal(
    presentWorkRunSummary('Relay fan-out dispatch for Codex.', t),
    '已為 Codex 建立分派執行。',
  );
});

test('work run summaries preserve runtime-authored content', () => {
  const t = createTranslator('zh-TW');

  assert.equal(
    presentWorkRunSummary('The agent summarized the migration plan.', t),
    'The agent summarized the migration plan.',
  );
});


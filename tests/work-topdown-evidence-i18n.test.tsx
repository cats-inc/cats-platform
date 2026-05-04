import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getWorkGraphEvidenceRelationLabel,
} from '../src/products/work/renderer/components/topdown/shared.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';

test('work top-down evidence relation labels localize known relation tokens', () => {
  const t = createTranslator('zh-TW');

  assert.equal(getWorkGraphEvidenceRelationLabel('artifact', t), '證據物件');
  assert.equal(getWorkGraphEvidenceRelationLabel('activity', t), '活動');
  assert.equal(getWorkGraphEvidenceRelationLabel('outcome', t), '成果');
});

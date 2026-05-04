import assert from 'node:assert/strict';
import test from 'node:test';

import { getWorkGraphLayerLabel } from '../src/products/work/renderer/components/topdown/shared.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';

test('work top-down layer labels localize known structural layer tokens', () => {
  const t = createTranslator('zh-TW');

  assert.equal(getWorkGraphLayerLabel('interaction', t), '互動');
  assert.equal(getWorkGraphLayerLabel('planning', t), '規劃');
  assert.equal(getWorkGraphLayerLabel('execution', t), '執行');
});

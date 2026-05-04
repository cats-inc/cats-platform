import assert from 'node:assert/strict';
import test from 'node:test';

import { getWorkTaskProductBindingLabel } from '../src/products/work/renderer/components/topdown/shared.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';

test('work task product binding labels localize known binding tokens', () => {
  const t = createTranslator('zh-TW');

  assert.equal(getWorkTaskProductBindingLabel('work', t), '工作');
  assert.equal(getWorkTaskProductBindingLabel('code', t), '程式碼');
  assert.equal(getWorkTaskProductBindingLabel('chat', t), '聊天');
  assert.equal(getWorkTaskProductBindingLabel('unbound', t), '未綁定');
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { getWorkActorRoleLabel } from '../src/products/work/renderer/components/topdown/shared.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';

test('work actor role labels localize known role tokens', () => {
  const t = createTranslator('zh-TW');

  assert.equal(getWorkActorRoleLabel('planner', t), '規劃者');
  assert.equal(getWorkActorRoleLabel('reviewer', t), '審核者');
  assert.equal(getWorkActorRoleLabel('main_coder', t), '主程式撰寫者');
});

test('work actor role labels preserve unknown user-authored roles', () => {
  const t = createTranslator('zh-TW');

  assert.equal(getWorkActorRoleLabel('launch wrangler', t), 'launch wrangler');
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveRuntimeConnectionChip } from '../src/design/components/runtimeChips.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';

const zh = createTranslator('zh-TW');

test('runtime connection chip labels use the provided translator', () => {
  assert.deepEqual(
    resolveRuntimeConnectionChip({ reachable: false }, zh),
    { tone: 'warm', label: '執行階段無法使用' },
  );

  assert.deepEqual(
    resolveRuntimeConnectionChip({ reachable: true, status: 'warming' }, zh),
    { tone: 'warm', label: '執行階段降級' },
  );

  assert.deepEqual(
    resolveRuntimeConnectionChip({ reachable: true, status: 'ready' }, zh),
    { tone: 'ready', label: '執行階段已連線' },
  );
});

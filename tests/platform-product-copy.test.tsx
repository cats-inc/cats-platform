import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolvePlatformProductDisplayNameById,
  resolvePlatformProductShortLabelById,
  resolvePlatformProductSubtitleById,
} from '../src/app/renderer/platformProductCopy.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';

test('platform product copy localizes known surface ids and preserves unknown products', () => {
  const t = createTranslator('zh-TW');

  assert.equal(resolvePlatformProductDisplayNameById('code', 'Cats Code', t), 'Cats Code');
  assert.equal(resolvePlatformProductShortLabelById('code', 'Code', t), '程式碼');
  assert.equal(
    resolvePlatformProductSubtitleById('code', 'Repos, runs, and codespaces', t),
    '程式碼庫、執行與程式工作區',
  );
  assert.equal(resolvePlatformProductDisplayNameById('learn', 'Cats Learn', t), 'Cats Learn');
  assert.equal(resolvePlatformProductShortLabelById('learn', 'Learn', t), 'Learn');
  assert.equal(
    resolvePlatformProductSubtitleById('learn', 'Courses and flashcards', t),
    'Courses and flashcards',
  );
});

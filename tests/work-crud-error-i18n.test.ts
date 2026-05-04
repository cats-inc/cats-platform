import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatWorkCrudMutationError,
  localizeWorkCrudErrorMessage,
} from '../src/products/work/renderer/components/workCrudErrorLabels.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';

test('work CRUD validation errors localize known deterministic API messages', () => {
  const t = createTranslator('zh-TW');

  assert.equal(localizeWorkCrudErrorMessage('title is required.', t), '標題為必填。');
  assert.equal(localizeWorkCrudErrorMessage('Invalid input', t), '輸入內容無效。');
  assert.equal(
    localizeWorkCrudErrorMessage('No project with id project-1.', t),
    '找不到 id 為 project-1 的專案。',
  );
  assert.equal(
    localizeWorkCrudErrorMessage('summary must be a string or null.', t),
    '欄位 summary 必須是字串或 null。',
  );
  assert.equal(
    localizeWorkCrudErrorMessage('assignedActorIds must be a string[].', t),
    '欄位 assignedActorIds 必須是字串陣列。',
  );
  assert.equal(
    localizeWorkCrudErrorMessage('must be one of: draft, completed.', t),
    '值必須是以下其中一個：draft, completed。',
  );
});

test('work CRUD mutation errors preserve unknown server exceptions', () => {
  const t = createTranslator('zh-TW');

  assert.equal(
    formatWorkCrudMutationError(new Error('database unavailable'), 'fallback', t),
    'database unavailable',
  );
  assert.equal(formatWorkCrudMutationError('not an error', 'fallback', t), 'fallback');
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatWorkspaceCatAssignmentMutationError,
  localizeWorkspaceCatAssignmentErrorMessage,
} from '../src/products/shared/renderer/hooks/workspaceCatAssignmentErrorLabels.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';

test('workspace cat assignment localizes known channel assignment errors', () => {
  const t = createTranslator('zh-TW');

  assert.equal(
    localizeWorkspaceCatAssignmentErrorMessage('Channel not found: channel-1', t),
    '找不到這個聊天室。',
  );
  assert.equal(
    localizeWorkspaceCatAssignmentErrorMessage(
      'Channel cat assignment not found: cat-1',
      t,
    ),
    '這隻貓咪尚未指派到選取的聊天室。',
  );
  assert.equal(
    localizeWorkspaceCatAssignmentErrorMessage(
      'Direct messages can only contain their direct recipient Cat',
      t,
    ),
    '直接對話只能保留該對話的主要貓咪。',
  );
  assert.equal(
    localizeWorkspaceCatAssignmentErrorMessage(
      'Chat participant limit reached (max 8)',
      t,
    ),
    '這個聊天室已達參與者上限（最多 8 位）。',
  );
});

test('workspace cat assignment reuses shared cat registry error translations', () => {
  const t = createTranslator('zh-TW');

  assert.equal(
    localizeWorkspaceCatAssignmentErrorMessage('Cat name is required', t),
    '請輸入貓咪名稱。',
  );
  assert.equal(
    localizeWorkspaceCatAssignmentErrorMessage('Cat is not active: cat-1', t),
    '這隻貓咪尚未啟用。',
  );
});

test('workspace cat assignment formatter hides local API fallback strings', () => {
  const t = createTranslator('zh-TW');

  assert.equal(
    formatWorkspaceCatAssignmentMutationError(
      new Error('cats channel cat assignment returned 500'),
      '指派貓失敗。',
      t,
    ),
    '指派貓失敗。',
  );
  assert.equal(
    formatWorkspaceCatAssignmentMutationError(
      new Error('cats channel cat removal returned 500'),
      '移除貓失敗。',
      t,
    ),
    '移除貓失敗。',
  );
  assert.equal(
    formatWorkspaceCatAssignmentMutationError(
      new Error('runtime unavailable'),
      '指派貓失敗。',
      t,
    ),
    'runtime unavailable',
  );
  assert.equal(
    formatWorkspaceCatAssignmentMutationError('not an error', '指派貓失敗。', t),
    '指派貓失敗。',
  );
});

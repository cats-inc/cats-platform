import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatWorkspaceNavigationMutationError,
  localizeWorkspaceNavigationErrorMessage,
} from '../src/products/shared/renderer/hooks/workspaceNavigationErrorLabels.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';

test('workspace navigation localizes known chat and parallel chat errors', () => {
  const t = createTranslator('zh-TW');

  assert.equal(
    localizeWorkspaceNavigationErrorMessage('Chat not found: main', t),
    '找不到這個聊天工作區。',
  );
  assert.equal(
    localizeWorkspaceNavigationErrorMessage('Channel not found: channel-1', t),
    '找不到這個聊天室。',
  );
  assert.equal(
    localizeWorkspaceNavigationErrorMessage('Channel not found.', t),
    '找不到這個聊天室。',
  );
  assert.equal(
    localizeWorkspaceNavigationErrorMessage(
      'Parallel chat group not found: group-1',
      t,
    ),
    '找不到這個平行聊天群組。',
  );
  assert.equal(
    localizeWorkspaceNavigationErrorMessage('Title must not be empty.', t),
    '聊天標題不可空白。',
  );
  assert.equal(
    localizeWorkspaceNavigationErrorMessage(
      'Parallel chat title must not be empty.',
      t,
    ),
    '平行聊天標題不可空白。',
  );
});

test('workspace navigation formatter hides local API fallback strings', () => {
  const t = createTranslator('zh-TW');

  assert.equal(
    formatWorkspaceNavigationMutationError(
      new Error('cats chat rename returned 500'),
      '重新命名聊天失敗。',
      t,
    ),
    '重新命名聊天失敗。',
  );
  assert.equal(
    formatWorkspaceNavigationMutationError(
      new Error('parallel chat deletion returned 500'),
      '刪除所有聊天失敗。',
      t,
    ),
    '刪除所有聊天失敗。',
  );
  assert.equal(
    formatWorkspaceNavigationMutationError(
      new Error('runtime unavailable'),
      '重新命名聊天失敗。',
      t,
    ),
    'runtime unavailable',
  );
  assert.equal(
    formatWorkspaceNavigationMutationError('not an error', '重新命名聊天失敗。', t),
    '重新命名聊天失敗。',
  );
});

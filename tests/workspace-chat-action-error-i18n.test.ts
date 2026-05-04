import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatWorkspaceChatActionError,
  localizeWorkspaceChatActionErrorMessage,
} from '../src/products/shared/renderer/hooks/workspaceChatActionErrorLabels.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';

test('workspace chat action localizes known governance and cancellation errors', () => {
  const t = createTranslator('zh-TW');

  assert.equal(
    localizeWorkspaceChatActionErrorMessage('Channel not found: channel-1', t),
    '找不到這個聊天室。',
  );
  assert.equal(
    localizeWorkspaceChatActionErrorMessage(
      'Parallel chat group not found: group-1',
      t,
    ),
    '找不到這個平行聊天群組。',
  );
  assert.equal(
    localizeWorkspaceChatActionErrorMessage(
      'The active chat is not part of this Parallel chat group.',
      t,
    ),
    '目前聊天不屬於這個平行聊天群組。',
  );
});

test('workspace chat action formatter hides local API fallback strings', () => {
  const t = createTranslator('zh-TW');

  assert.equal(
    formatWorkspaceChatActionError(
      new Error('cats core approval returned 500'),
      '更新核准狀態失敗。',
      t,
    ),
    '更新核准狀態失敗。',
  );
  assert.equal(
    formatWorkspaceChatActionError(
      new Error('cats channel cancel returned 500'),
      '停止回應失敗。',
      t,
    ),
    '停止回應失敗。',
  );
  assert.equal(
    formatWorkspaceChatActionError(
      new Error('parallel chat cancel returned 500'),
      '停止回應失敗。',
      t,
    ),
    '停止回應失敗。',
  );
  assert.equal(
    formatWorkspaceChatActionError(
      new Error('runtime unavailable'),
      '停止回應失敗。',
      t,
    ),
    'runtime unavailable',
  );
  assert.equal(
    formatWorkspaceChatActionError('not an error', '停止回應失敗。', t),
    '停止回應失敗。',
  );
});

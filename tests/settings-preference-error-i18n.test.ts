import assert from 'node:assert/strict';
import test from 'node:test';

import { formatSettingsPreferenceMutationError } from '../src/app/renderer/settings/settingsPreferenceErrorLabels.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';

test('settings preference formatter hides local preference API fallback strings', () => {
  const t = createTranslator('zh-TW');

  assert.equal(
    formatSettingsPreferenceMutationError(
      new Error('cats conversation behavior update returned 500'),
      '更新對話行為失敗',
      t,
    ),
    '更新對話行為失敗',
  );
  assert.equal(
    formatSettingsPreferenceMutationError(
      new Error('cats advanced draft controls update returned 500'),
      '更新偏好失敗。',
      t,
    ),
    '更新偏好失敗。',
  );
});

test('settings preference formatter localizes shared workspace preference failures', () => {
  const t = createTranslator('zh-TW');

  assert.equal(
    formatSettingsPreferenceMutationError(
      new Error('Chat not found: main'),
      '更新偏好失敗。',
      t,
    ),
    '找不到這個聊天工作區。',
  );
  assert.equal(
    formatSettingsPreferenceMutationError(
      new Error('runtime unavailable'),
      '更新偏好失敗。',
      t,
    ),
    'runtime unavailable',
  );
  assert.equal(
    formatSettingsPreferenceMutationError('not an error', '更新偏好失敗。', t),
    '更新偏好失敗。',
  );
});

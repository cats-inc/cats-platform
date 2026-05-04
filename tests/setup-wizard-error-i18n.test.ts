import assert from 'node:assert/strict';
import test from 'node:test';

import { formatSetupWizardCompletionError } from '../src/app/renderer/setup/setupWizardErrorLabels.ts';
import { createTranslator, messageKeys } from '../src/shared/i18n/index.ts';

test('setup wizard completion formatter localizes deterministic desktop host bridge errors', () => {
  const t = createTranslator('zh-TW');
  const fallback = t(messageKeys.setupWizardFailedMessage);

  assert.equal(
    formatSetupWizardCompletionError(
      new Error('Invalid desktop platform shell payload.'),
      fallback,
      t,
    ),
    '設定失敗。',
  );
  assert.equal(
    formatSetupWizardCompletionError(
      new Error('設定請求無效。'),
      fallback,
      t,
    ),
    '設定請求無效。',
  );
  assert.equal(
    formatSetupWizardCompletionError(
      new Error('Failed to fetch'),
      fallback,
      t,
    ),
    'Failed to fetch',
  );
  assert.equal(formatSetupWizardCompletionError('not an error', fallback, t), '設定失敗。');
});

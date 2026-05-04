import assert from 'node:assert/strict';
import test from 'node:test';

import { formatSettingsDataMutationError } from '../src/app/renderer/settings/settingsDataErrorLabels.ts';
import { createTranslator, messageKeys } from '../src/shared/i18n/index.ts';

test('settings data formatter hides setup reset fallback strings', () => {
  const t = createTranslator('zh-TW');
  const fallback = t(messageKeys.settingsDataResetFailure);

  assert.equal(
    formatSettingsDataMutationError(new Error('setup reset returned 500'), fallback),
    fallback,
  );
  assert.equal(
    formatSettingsDataMutationError(new Error('disk unavailable'), fallback),
    'disk unavailable',
  );
  assert.equal(formatSettingsDataMutationError('not an error', fallback), fallback);
});

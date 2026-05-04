import assert from 'node:assert/strict';
import test from 'node:test';

import { formatSettingsCatsTelegramLoadError } from '../src/products/shared/renderer/hooks/settingsCatsTelegramErrorLabels.ts';
import { createTranslator, messageKeys } from '../src/shared/i18n/index.ts';

test('settings cats telegram load formatter hides local transport fallback strings', () => {
  const t = createTranslator('zh-TW');
  const fallback = t(messageKeys.sharedSettingsCatsTelegramDiagnosticsLoadError);

  assert.equal(
    formatSettingsCatsTelegramLoadError(
      new Error('telegram transport status returned 500'),
      fallback,
    ),
    '載入 Telegram 診斷資訊失敗。',
  );
  assert.equal(
    formatSettingsCatsTelegramLoadError('telegram transport diagnostics returned 503', fallback),
    '載入 Telegram 診斷資訊失敗。',
  );
  assert.equal(
    formatSettingsCatsTelegramLoadError(new Error('transport unavailable'), fallback),
    'transport unavailable',
  );
  assert.equal(formatSettingsCatsTelegramLoadError('boom', fallback), 'boom');
  assert.equal(formatSettingsCatsTelegramLoadError({ message: 'boom' }, fallback), fallback);
});

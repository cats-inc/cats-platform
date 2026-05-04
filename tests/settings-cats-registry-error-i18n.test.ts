import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatSettingsCatsRegistryMutationError,
  localizeSettingsCatsRegistryErrorMessage,
} from '../src/products/shared/renderer/hooks/settingsCatsRegistryErrorLabels.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';

test('settings cats registry localizes known cat mutation errors', () => {
  const t = createTranslator('zh-TW');

  assert.equal(
    localizeSettingsCatsRegistryErrorMessage('Cat name is required', t),
    '請輸入貓咪名稱。',
  );
  assert.equal(
    localizeSettingsCatsRegistryErrorMessage('A cat named "Milo" already exists', t),
    '已存在名為「Milo」的貓咪。',
  );
  assert.equal(
    localizeSettingsCatsRegistryErrorMessage('Cat limit reached (max 12)', t),
    '已達貓咪數量上限（最多 12 隻）。',
  );
  assert.equal(
    localizeSettingsCatsRegistryErrorMessage('Cat not found: cat-1', t),
    '找不到這隻貓咪。',
  );
  assert.equal(
    localizeSettingsCatsRegistryErrorMessage('Cat is not available in Cats Chat: cat-1', t),
    '這隻貓咪無法在 Cats Chat 使用。',
  );
});

test('settings cats registry localizes known telegram binding mutation errors', () => {
  const t = createTranslator('zh-TW');

  assert.equal(
    localizeSettingsCatsRegistryErrorMessage(
      'Bot token is already used by another binding',
      t,
    ),
    '這個 bot token 已被另一個綁定使用。',
  );
  assert.equal(
    localizeSettingsCatsRegistryErrorMessage('Bot binding not found: binding-1', t),
    '找不到 bot 綁定。',
  );
});

test('settings cats registry formatter uses local fallback for API fallback strings', () => {
  const t = createTranslator('zh-TW');

  assert.equal(
    formatSettingsCatsRegistryMutationError(
      new Error('cat profile update returned 500'),
      '更新失敗。',
      t,
    ),
    '更新失敗。',
  );
  assert.equal(
    formatSettingsCatsRegistryMutationError(new Error('runtime unavailable'), '更新失敗。', t),
    'runtime unavailable',
  );
  assert.equal(
    formatSettingsCatsRegistryMutationError('not an error', '更新失敗。', t),
    '更新失敗。',
  );
});

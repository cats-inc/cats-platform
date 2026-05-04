import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getCatProductSurfaceLabel,
  getCatRecordStatusLabel,
  formatTransportTimestamp,
  MEMORY_CATEGORIES,
  SKILL_PROFILES,
} from '../src/products/shared/renderer/components/settings-cats/viewSupport.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';
import { messageKeys } from '../src/shared/i18n/messageKeys.ts';

test('settings-cats view support keeps the curated skill profile and memory category lists', () => {
  assert.deepEqual(SKILL_PROFILES, [
    { value: 'chat-default', label: messageKeys.sharedSettingsCatsSkillProfileDefaultLabel },
    { value: 'companion', label: messageKeys.sharedSettingsCatsSkillProfileCompanionLabel },
  ]);
  assert.deepEqual(MEMORY_CATEGORIES, [
    { value: 'preference', label: messageKeys.sharedSettingsCatsMemoryCategoryPreferenceLabel },
    { value: 'fact', label: messageKeys.sharedSettingsCatsMemoryCategoryFactLabel },
    { value: 'policy', label: messageKeys.sharedSettingsCatsMemoryCategoryPolicyLabel },
    { value: 'style', label: messageKeys.sharedSettingsCatsMemoryCategoryStyleLabel },
    { value: 'relationship', label: messageKeys.sharedSettingsCatsMemoryCategoryRelationshipLabel },
    { value: 'lesson', label: messageKeys.sharedSettingsCatsMemoryCategoryLessonLabel },
  ]);
});

test('formatTransportTimestamp returns an em dash for empty values and delegates to Date localization otherwise', () => {
  assert.equal(formatTransportTimestamp(null), '—');
  assert.equal(formatTransportTimestamp(undefined), '—');

  const originalToLocaleString = Date.prototype.toLocaleString;
  try {
    Date.prototype.toLocaleString = function toLocaleString() {
      return `localized:${this.toISOString()}`;
    };

    assert.equal(
      formatTransportTimestamp('2026-04-20T12:34:56.000Z'),
      'localized:2026-04-20T12:34:56.000Z',
    );
  } finally {
    Date.prototype.toLocaleString = originalToLocaleString;
  }
});

test('settings-cats registry status and product labels localize known tokens', () => {
  const t = createTranslator('zh-TW');
  const activeKey = getCatRecordStatusLabel('active');
  const archivedKey = getCatRecordStatusLabel('archived');
  const chatKey = getCatProductSurfaceLabel('chat');
  const codeKey = getCatProductSurfaceLabel('code');
  const workKey = getCatProductSurfaceLabel('work');

  assert.ok(activeKey);
  assert.ok(archivedKey);
  assert.ok(chatKey);
  assert.ok(codeKey);
  assert.ok(workKey);
  assert.equal(t(activeKey), '啟用');
  assert.equal(t(archivedKey), '已封存');
  assert.equal(t(chatKey), '聊天');
  assert.equal(t(codeKey), '程式碼');
  assert.equal(t(workKey), '工作');
  assert.equal(getCatProductSurfaceLabel('custom'), null);
});

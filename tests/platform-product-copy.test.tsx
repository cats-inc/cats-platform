import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolvePlatformProductDisplayNameById,
  resolvePlatformProductShortLabelById,
  resolvePlatformProductSubtitleById,
} from '../src/app/renderer/platformProductCopy.ts';
import { createTranslator, messageKeys } from '../src/shared/i18n/index.ts';

test('platform product copy localizes known surface ids and preserves unknown products', () => {
  const t = createTranslator('zh-TW');

  assert.equal(resolvePlatformProductDisplayNameById('code', 'Cats Code', t), 'Cats Code');
  assert.equal(resolvePlatformProductShortLabelById('code', 'Code', t), '程式碼');
  assert.equal(
    resolvePlatformProductSubtitleById('code', 'Repos, runs, and codespaces', t),
    '程式碼庫、執行與程式工作區',
  );
  assert.equal(resolvePlatformProductDisplayNameById('learn', 'Cats Learn', t), 'Cats Learn');
  assert.equal(resolvePlatformProductShortLabelById('learn', 'Learn', t), 'Learn');
  assert.equal(
    resolvePlatformProductSubtitleById('learn', 'Courses and flashcards', t),
    'Courses and flashcards',
  );
});

test('shared zh-TW catalog avoids raw English for known product chrome fallbacks', () => {
  const t = createTranslator('zh-TW');

  assert.equal(t(messageKeys.sharedPlatformSurfaceSwitcherOpenLobby), '開啟大廳');
  assert.equal(t(messageKeys.appHostBackToLobby), '返回大廳');
  assert.equal(
    t(messageKeys.settingsGeneralProfileDescription),
    '這是跨聊天、程式碼、工作與大廳的平台統一個人檔案。',
  );
  assert.equal(
    t(messageKeys.settingsGeneralLobbyMotionDescription),
    '選擇大廳背景的動態感。預設使用較為平緩版本。',
  );
  assert.equal(t(messageKeys.settingsGeneralUpdateLobbyAnimationError), '無法更新大廳動畫');
  assert.equal(
    t(messageKeys.settingsRuntimeUninstallDescriptionSuffix).startsWith('驗證檔案'),
    true,
  );
  assert.equal(t(messageKeys.settingsAppsNoLobbyRoute), '沒有大廳路由');
  assert.equal(
    t(messageKeys.settingsDesktopMobilePairingEnableDescription),
    '將寫入桌面端需要的環境變數值以開啟 LAN 存取。套用後請重新啟動 Cats 桌面版。',
  );
  assert.equal(t(messageKeys.settingsDesktopStartupSignInLabel), '登入電腦時啟動 Cats 桌面版');
  assert.equal(t(messageKeys.codeBuilderModelPlaceholder), '預設');
  assert.equal(t(messageKeys.codeExecutionDefaultModel), '預設');
  assert.equal(t(messageKeys.codeRelayLabelDefault), '預設');
});

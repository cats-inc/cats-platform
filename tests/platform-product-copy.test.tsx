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
  assert.equal(resolvePlatformProductShortLabelById('code', 'Code', t), 'Code');
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
  assert.equal(
    t(messageKeys.appLoadStateFailedWithStatus, { status: 503 }),
    '載入應用程式狀態失敗（503）',
  );
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
  assert.equal(t(messageKeys.settingsRuntimeRefreshCatalogsButton), '重新整理模型目錄');
  assert.equal(t(messageKeys.settingsRuntimeRefreshFailure), '重新整理失敗。');
  assert.equal(t(messageKeys.settingsAppsNoLobbyRoute), '沒有大廳路由');
  assert.equal(
    t(messageKeys.settingsDesktopMobilePairingEnableDescription),
    '將寫入桌面端需要的環境變數值以開啟 LAN 存取。套用後請重新啟動 Cats 桌面版。',
  );
  assert.equal(t(messageKeys.settingsDesktopStartupSignInLabel), '登入電腦時啟動 Cats 桌面版');
  assert.equal(
    t(messageKeys.workRunsListLede),
    '所有核心執行的平面清單。點入執行可檢視追蹤與子執行。執行由協調器派發建立，不在此頁建立。',
  );
  assert.equal(
    t(messageKeys.workSchedulesListLede),
    '目前版本中，排程執行只會在 Cats 運行時觸發。',
  );
  assert.equal(
    t(messageKeys.workScheduleNoTriggerReceipts),
    '尚無觸發回條。',
  );
  assert.equal(
    t(messageKeys.workTaskNoActorsAssignedFallback),
    '（未指派核心對象）',
  );
  assert.equal(
    t(messageKeys.workTopdownCockpitNoActorRoles),
    '尚無擁有者角色。',
  );
  assert.equal(t(messageKeys.workTopdownLinkageTitle), '連結關係');
  assert.equal(
    t(messageKeys.workTopdownUpstreamBlocksLine, { maxDepth: 3 }),
    '每列項目的上游阻擋鏈（深度 ≤ 3）',
  );
  assert.equal(t(messageKeys.workTopdownBrokenLinksTitle), '斷裂連結');
  assert.equal(
    t(messageKeys.workTopdownBrokenLinksRemoveTooltipRemovable),
    '請透過產生器管線移除此連結。',
  );
  assert.equal(t(messageKeys.workWarRoomLoadingBody), '正在更新最新戰情室快照。');
  assert.equal(t(messageKeys.codeBuilderErrorTaskCreate), '無法建立程式碼任務。');
  assert.equal(
    t(messageKeys.codeBuilderErrorCodespacePathInvalid, { path: 'C:/missing' }),
    '選取的路徑不存在或不是資料夾：C:/missing',
  );
  assert.equal(
    t(messageKeys.codeBuilderErrorCodespaceNoPath),
    '找不到有效的程式工作區路徑。請選擇資料夾，或確認房間工作區存在。',
  );
  assert.equal(t(messageKeys.codeBuilderErrorTaskExecution), '無法啟動程式碼任務。');
  assert.equal(t(messageKeys.codeBuilderErrorTaskResume), '無法接續這個程式碼任務。');
  assert.equal(
    t(messageKeys.codeBuilderWorkspaceResumeHelp),
    '接續功能適用於你想繼續處理的草稿、已阻擋或失敗程式碼任務。',
  );
  assert.equal(
    t(messageKeys.codeWorkspaceDetailNoTasks),
    '目前沒有程式碼任務連結到這個程式工作區。',
  );
  assert.equal(t(messageKeys.chatCompanionResourcesLoadingState), '載入中…');
  assert.equal(
    t(messageKeys.sharedProviderModelFieldLoadingProviders),
    '正在載入可用的供應器…',
  );
  assert.equal(t(messageKeys.sharedProviderModelFieldCustomLegacyModelLabel), '自訂舊版模型…');
  assert.equal(t(messageKeys.sharedProviderModelFieldLegacyModelIdLabel), '舊版模型 ID');
  assert.equal(
    t(messageKeys.sharedProviderModelFieldLegacyModelIdHint),
    '手動輸入模型 ID 會直接傳遞。執行階段會把它視為舊版 `model` 欄位，而不是結構化項目/預設選擇。',
  );
  assert.equal(
    t(messageKeys.setupWizardFailedWithStatus, { status: 500 }),
    '設定失敗（500）',
  );
  assert.equal(t(messageKeys.setupWizardAlreadyCompleteError), '設定已完成。');
  assert.equal(t(messageKeys.setupWizardInvalidRequestError), '設定請求無效。');
  assert.equal(t(messageKeys.setupWizardServerError), '無法完成設定，請稍後再試。');
  assert.equal(
    t(messageKeys.setupWizardRecordOpenFailedWithStatus, { status: 503 }),
    '記錄設定開啟狀態失敗（503）',
  );
  assert.equal(t(messageKeys.setupWizardOpeningCatsAction), '正在開啟 Cats…');
  assert.equal(t(messageKeys.conversationSidebarRenamingLabel), '重新命名中…');
  assert.equal(t(messageKeys.sharedCommonSaving), '儲存中…');
  assert.equal(
    t(messageKeys.chatNewChatDraftChooseCodespaceActionLabel),
    '選擇程式工作區',
  );
  assert.equal(t(messageKeys.codeSidebarSourceCodeTask), '程式碼任務');
  assert.equal(t(messageKeys.codeWorkspaceSourceTask), '程式碼任務');
  assert.equal(t(messageKeys.codeWorkspacesListSourceCodes), '程式碼任務');
  assert.equal(
    t(messageKeys.chatCompanionSettingsTelegramBindingSettingsLabel),
    '設定 > 我的貓咪',
  );
  assert.equal(t(messageKeys.chatCompanionSettingsTelegramBindingConnected), '已連線');
  assert.equal(t(messageKeys.sharedTelegramConnectDialogTitle), '連線 Telegram');
  assert.equal(t(messageKeys.sharedSettingsCatsDisconnectTelegram), '中斷連線');
  assert.equal(t(messageKeys.sharedSettingsCatsConnectTelegramLabel), '連線 Telegram');
  assert.equal(
    t(messageKeys.conversationSidebarOpenAccountSettingsLabel),
    '開啟帳號設定',
  );
  assert.equal(t(messageKeys.designAccountIdentityMenuLabel), '帳號選單');
  assert.equal(t(messageKeys.designAccountIdentityMenuMenuLabel), '帳號選單');
  assert.equal(
    t(messageKeys.chatComposerErrorNoActiveParallelThread),
    '已建立平行聊天室，但沒有作用中的討論串。',
  );
  assert.equal(
    t(messageKeys.chatParallelFooterThreadLabel, { threadIndex: 2 }),
    '討論串 2',
  );
  assert.equal(
    t(messageKeys.workRunStopConfirmation, { runTitle: 'demo' }),
    '要停止執行「demo」嗎？\n\n'
      + 'Cats 會先透過監督式執行階段工作階段要求執行階段取消，再將執行標記為已取消。已送出的外部副作用不會回復。',
  );
  assert.equal(t(messageKeys.codeBuilderModelPlaceholder), '預設');
  assert.equal(t(messageKeys.codeExecutionDefaultModel), '預設');
  assert.equal(t(messageKeys.codeRelayLabelDefault), '預設');
});

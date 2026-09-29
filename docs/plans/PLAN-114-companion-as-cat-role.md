# PLAN-114: Companion as a Cat Role

## Metadata

| Field | Value |
| --- | --- |
| Status | Implemented; focused and full local tests recorded below; Settings visual acceptance pending |
| Owner | Platform integration |
| Reviewer | Product owner |
| Decision | [ADR-124](../decisions/124-model-companion-as-a-cat-role-not-a-skill-profile.md) |
| Related | [ADR-040](../decisions/040-make-companion-a-first-class-chat-mode-with-workspace-and-presence.md) §6、[ADR-065](../decisions/065-keep-my-cats-as-one-platform-agent-home-with-lenses.md)、[SPEC-019](../specs/SPEC-019-product-skill-profiles-and-runtime-skill-manifests.md)、[SPEC-121](../specs/SPEC-121-managed-plugin-capabilities.md)、[PLAN-113](PLAN-113-managed-plugin-capabilities.md) |
| Version boundary | cats-platform `0.6.0`（移除公開 API 可接受值並改寫既有資料）；本計畫只記錄，不 bump |

## Overview

companion 原本是 `skillProfile` 的一個值（`'companion'`）。`hasCompanionSkill` 與
`shouldHydrateCompanionSession` 雖然也接受 `roles.includes('companion')`，但這條路使用者
走不到：`roles` 只能在 `POST /api/cats` 建立時帶入，PATCH body 沒有這個欄位，UI 也不能編輯。

PLAN-113（#163，2026-09-29）把 Agency plugin skill 放進同一個 `skillProfile` 欄位，
companion 與 Agency skill 因此互斥，出現三個症狀：

- Settings 的 `PluginSkillOptions` 與 companion pill 寫同一個欄位。選 Agency skill 後，
  這隻貓不再是 companion：個人頁 feed 被隱藏，runtime 也不再請求 companion skill。
- Telegram `/mode agent` 寫入 `'chat-default'`，會蓋掉 Agency skill；`/mode` 也只看
  `skillProfile`，用 role 標記的 companion 會被顯示成 agent。
- 判斷已經不一致：hydration 看 role 或 skillProfile，但 runtime companion skill 只看
  `skillProfile`。

ADR-040 §6 的方向是「同一個 Cat 身分，依 mode 疊加行為」，不是一個粗糙的全域 mode
開關。本計畫把 companion 身分移到 Cat 層級的 `roles`，讓它與 `skillProfile` 各自獨立。

Cats Work 不讀 `skillProfile`，Cat 是否參與 Work 由 `products[]` 決定，這部分不受影響。
改完之後，一隻 companion 貓可以在 Chat 裡帶 Agency skill，而不會失去 companion 身分。

## Goals

- companion 身分等於 Cat 層級的 `'companion'` role，與 `skillProfile` 無關。
- 帶 Agency skill 的 companion 貓保留個人頁 feed、companion box、Telegram `/mode` 狀態
  與 registry 標示。
- `'companion'` 不再是合法的 `skillProfile` 值；依 pre-release 政策不留 alias。
- 既有資料做一次性遷移，符合 AGENTS.md 的驗證、備份、原子替換與失敗保留要求。
- Settings 畫面變動最小（owner 要求）。

## Non-Goals

- 不做 companion 從 Chat 搬到平台 entity 的工作（SPEC-102 收尾），那是另一份計畫。
- 不動 `src/products/chat/renderer/components/companion/` 與相關 hooks。那是 owner
  刻意保留的舊版 DM toolbar 切換頁（見 `abbe6a15` 的 commit 訊息）。
- 不解除 cats-runtime managed plugin「只允許 managed skills」的限制（見 Decision 1），
  列為 cats-runtime 後續工作。
- 不改變 companion skill 適用的 room mode：維持原本的行為，Cat 參與的每個 Chat
  channel 都會請求。
- 不改 channel 與 orchestrator 的 `skillProfile`（`'chat-default'`、`'aaif-a2a-default'`）。

## Technical Decisions

### 1. 身分與行為分開判斷

- `'companion'` role 決定身分面：個人頁 feed（`CatProfilePage.tsx` 的 `hideFeed`）、
  companion box hydration 條件、Telegram `/mode`、registry 標示。
- runtime `companion` skill 在「有 companion role，且 `skillProfile` 是內建值（`null`
  或 `'chat-default'`）」時請求，由 `resolveSkillProfileManifest` 的 `companion` 輸入推導。
- 由 role 推導出 companion、且沒有內建 profile 貢獻 skill 時，manifest 不帶 `profileId`。
  runtime 的 `RuntimeSkillManifest.profileId` 是選填，cats-runtime
  `src/core/hydration/sessionHydration.test.ts:80` 已涵蓋沒有 `profileId` 的
  `['companion']`。
- 選到的 skill 含 `plugin:*` 時不請求 companion skill。原因是 cats-runtime
  `src/core/skills/managedPlugins.ts:193` 只要看到非 Agency 的 skill 就回 conflict
  （"with managed skills only"）；硬疊上去，這隻貓在 Chat 會完全無法回覆。
- companion box 的記憶上下文不受影響：它經由 `manifest.context.metadata.companionSession`
  送出（`runtimeTargeting.ts` 的 `enrichSkillManifestWithCompanionSession`），managed
  plugin 路徑只檢查 `requestedSkills`。
- 取捨：Agency 加 companion 的貓在 Chat 會有 Agency 的角色指令和 companion 記憶，但沒有
  companion 的語氣 skill。等 cats-runtime 允許混用後，再移除這個排除條件。

### 2. 單一判斷 helper

- `src/shared/companionRole.ts`：`COMPANION_ROLE`、`COMPANION_SKILL_ID`、`isCompanionCat`、
  `withCompanionRole`。它放在 `src/shared`，只依賴結構型別，不違反
  `tests/dependency-graph.test.js` 的方向規則。
- `hasCompanionSkill` 保留名稱與位置，內容改為呼叫 `isCompanionCat`。這樣
  `CatProfilePage.tsx` 與保留中的 chat 檔案不必改 import；改名留給 companion 搬家計畫。

### 3. API 形狀

- 建立 Cat：沿用凍結 contract `CatDraftInput` 既有的 `roles?: string[]`，不改凍結檔。
- 更新 Cat：`PATCH /api/cats/{catId}` 的 inline body 加 `companion?: boolean`
  （`canonicalCatRoutes.ts`，不在凍結清單內）；非布林值回 `400 bad_request`。renderer 的
  `updateCatProfile` 輸入型別同步。
- 不開放 PATCH 自由編輯 `roles`：`cat.roles` 是自由字串，沒有 UI 編輯需求；專用布林可以
  讓 contract 保持窄。
- `normalizeCatSkillProfile`（`src/shared/skillProfiles.ts`）拒絕 `'companion'`；
  `createCatRecord` 與 `updateCatSkillProfile` 都經過它，回 `400 bad_request`，避免產生新的
  舊格式資料。

### 4. Channel 視圖投影 companion，不在寫入時同步

- channel assignment 的 roles 是加入 channel 當下的快照，而且使用者可以設定 channel
  專屬 role（例如 `['reviewer']`）。read model 會優先使用 assignment roles。
- 所有 channel cat 視圖都經過 `hydrateChannelCat`（`readModels.ts`），prompt 的
  assigned cats 則在 `memoryLayers.ts` 組出。兩處都用 `withCompanionRole` 以 Cat 本身的
  狀態投影 companion，因此：
  - 切換 companion 立即反映在每個 channel，不必改寫任何 assignment。
  - 舊 assignment 快照裡殘留的 `'companion'` 會在視圖中被移除。
  - `orchestratorPlan.ts` 可以直接用視圖 roles 判斷（凍結的 `OrchestratorChannelCat` 沒有
    Cat 層級 roles），不需要改凍結 contract。
- 這比原先規劃的「四個寫入點同步」簡單，也不需要遷移 assignment。

### 5. Telegram `/mode`

- `/mode companion` 打開 role，`/mode agent` 關掉 role，兩者都不再寫 `skillProfile`。
  指令名稱與回覆文字不變。

### 6. 一次性資料遷移

- 實作：`src/products/chat/state/companionRoleMigration.ts`，由
  `FileChatStore.tryReadSnapshotFile` 在 `repairPersistedSetupCompletion` 之後呼叫。
- 辨識：`cats[]` 裡任何 `skillProfile === 'companion'` 的貓。
- 轉換：在 `cat.roles` 加上 `'companion'`、把 `skillProfile` 設為 `null`。assignment
  不需要遷移（Decision 4）。channel 與 orchestrator 的 `skillProfile` 不動。
- 備份：替換前以 `wx` 寫一份專用的 `<state>.pre-companion-role.bak`，內容是讀到的原始
  bytes。滾動的 `.bak` 每次寫入都會被覆蓋，不符合政策。專用備份已存在時不覆蓋。
- 驗證：轉換後的 snapshot 再跑一次 `normalizePersistedChatSnapshot`，並確認每隻被遷移
  的 Cat 帶有 role、不再帶 `'companion'` skillProfile，且 Cat 數量不變。
- 替換：`writePersistedChatSnapshot`（temp 檔加 rename 的原子替換）。
- 失敗處理：
  - 驗證或備份失敗：不遷移，原檔不動，送出
    `reportStoreDiagnostic('companion_role_migration_failed', …)`，下次讀取再試。
  - 備份成功、寫入失敗：記憶體中提供遷移後的狀態並送出診斷；下次正常寫入時落地。
- 復原路徑：`recoverFromBackup` 傳入的是 `.bak` 路徑。專用備份的檔名與寫入目標一律由
  `this.filePath` 推導；讀的是 `.bak` 時，把 `.bak` 的原始內容寫成專用備份，只在記憶體中
  轉換，交給 `recoverFromBackup` 寫回主檔。
- `MemoryChatStore` 在建構時套用同樣的轉換，不做備份。
- core actor 每次建 snapshot 時都會從 `chat.cats` 重新投影，不需要另外遷移。
- 移除時機：`0.6.0` 之後的下一個 minor 可以刪掉遷移程式碼。

### 7. ADR

- 2026-09-29 owner 同意後已寫成
  [ADR-124](../decisions/124-model-companion-as-a-cat-role-not-a-skill-profile.md)，
  ADR-040 也加上 amendment 指向它。

### 8. UI 納入本次範圍，採最小變動

- owner 決定把 UI 納入本次範圍，並要求畫面變動最小，不滿意之後再調整。
- 做法：Settings Cat 面板「技能檔案」那一排的 Companion pill 留在原位，外觀與文字
  （zh-TW「助手」）不變，但改成獨立的開關（`aria-pressed`），呼叫 `companion` API，
  不再寫 `skillProfile`。
- 可見的差異只有一個：它不再與「預設」和 Agency pills 互斥，所以陪伴者搭配預設技能時
  「預設」與「助手」兩顆會同時亮。
- 建立表單的同一顆 pill 改為切換 `catForm.companion`，建立時送出 `roles: ['companion']`。
- registry 的 `catMeta` 由 `describeCatSkillProfile` 產生：陪伴者照舊顯示「助手」，
  另選了非預設 skill 時顯示「助手 · <skill>」。
- `CatInspectPanel` 目前沒有任何地方渲染，不改。
- 沒有新增 i18n key，也沒有新增 UI 元件。

## Implementation

- [x] `src/shared/companionRole.ts`；`skillProfiles.ts` 的 `companion` 推導、plugin 排除、
      `normalizeCatSkillProfile`。
- [x] 三個 manifest 呼叫點：`runtimeTargeting.ts`、`orchestratorPlan.ts`、
      `companionBoxRoutes.ts`。
- [x] `hasCompanionSkill` 與 `hydration.ts` 改用 `isCompanionCat`。
- [x] 刪除 `src/products/chat/state/skillResolution.ts`（沒有任何呼叫者）。
- [x] `setCatCompanion`；`createCatRecord` 與 `updateCatSkillProfile` 拒絕 `'companion'`。
- [x] `hydrateChannelCat` 與 `memoryLayers.ts` 的 companion 投影。
- [x] `PATCH /api/cats/{catId}` 的 `companion`；Telegram `/mode` 改為切換 role。
- [x] 一次性資料遷移與專用備份。
- [x] UI：`cats/` 與 `settings-cats/` 兩組面板（編輯面板、建立表單、detail panel、
      registry），以及 `settingsCatsRegistryActions` 的 `onCompanionChange`。
- [x] 文件：`docs/api.md`、SPEC-019、SPEC-121、ADR-040 amendment、ADR-124。
- [ ] 以 source candidate 截圖給 owner 確認 Settings 面板。
- [ ] `docs/release-notes.md` 在 release 時記錄 `0.6.0` 邊界（依 release guide，不在本分支 bump）。

## Testing

- 新增 `tests/companion-role.test.js`：
  - manifest 推導：只有 companion、預設加 companion、plugin 加 companion、兩者皆無。
  - `normalizeCatSkillProfile`、`createCat`、`updateCatSkillProfile` 拒絕 `'companion'`。
  - `withCompanionRole` 保持順序。
  - channel 視圖投影：assignment 為 `['reviewer']` 時開關 companion 立即反映。
  - `FileChatStore` 遷移：專用備份內容等於原始 bytes、主檔改寫、第二次讀取不再變動。
  - `.bak` 復原路徑的遷移與備份。
  - `MemoryChatStore` 遷移。
- `tests/rest-api.test.js`：PATCH `companion` 開關、與 plugin skill 並存、`skillProfile:
  'companion'` 與非布林值回 400。
- `tests/provider-telegram-routes.test.js`：`/mode` 只切換 role，`skillProfile` 保持 `null`。
- `tests/settings-cats-view-support.test.tsx`：`SKILL_PROFILES`、`COMPANION_PILL_LABEL`、
  `describeCatSkillProfile`。
- 12 個測試檔共 59 處 `skillProfile: 'companion'` fixture 改為 `roles` 裡的 `'companion'`。
- 測試只在暫存目錄進行，不寫入使用者的 dev state（State Hygiene Policy）。

### 2026-09-29 local validation（Windows，Git Bash）

- `tsc --noEmit`：`tsconfig.server.json`、`tsconfig.json`、`tsconfig.desktop.json`、
  `tsconfig.test.json` 通過；`tsconfig.test.json` 只剩 worktree 未安裝 mobile 依賴造成的
  `mobile/src/api/persistence.ts` 兩個 module-not-found，與本變更無關。未跑 `mobile:typecheck`。
- 完整 node 測試集（`tests/**/*.test.js`、`build/test/*.test.js`）：5325 個，5304 過、
  10 skipped、11 失敗。
  - `emptyCatForm` 的預期值缺少新的 `companion` 欄位，已修正並重跑通過。
  - 其餘 10 個是環境造成，與本變更無關：`orchestrator-distribution.test.js` 的 GNU `tar`
    把 `C:` 當成遠端主機；`unix-installer-observations.test.js` 的 9 個測試需要
    `/mnt/c` 路徑的 bash。
- 修正 fixture 後重跑受影響的檔案全數通過；完整結果以 PR CI（`validate`、`nodejs (24)`）為準。

## Risks & Mitigations

- Agency 加 companion 的貓沒有 companion 語氣 skill（中）：已在 Decision 1 明確記錄，
  cats-runtime 後續放寬 managed plugin 限制後移除排除條件。
- 遷移作用於使用者的真實狀態檔（高）：先寫專用備份、驗證後才原子替換；失敗時保留原檔
  並送出診斷。
- 兩份幾乎相同的 Cats 面板（`cats/` 與 `settings-cats/`）：兩者同步修改，
  view-support 測試涵蓋共用 helper。
- 「預設」與「助手」同時亮可能讓人誤以為是單選（低）：owner 已知並接受，之後再調整。

## Progress Log

- 2026-09-29：計畫建立（Draft），待 owner 審閱 UI 第 1 點與 Decision 7。
- 2026-09-29：owner 同意寫 ADR，已新增 ADR-124。
- 2026-09-29：owner 決定 UI 納入本次範圍並採最小變動；在 `feat/companion-cat-role` 實作
  完成。assignment 同步改為讀取時投影（Decision 4）。

---

*Created: 2026-09-29*
*Author: Claude*

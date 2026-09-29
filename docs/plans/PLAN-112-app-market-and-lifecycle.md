# PLAN-112: App Market and Lifecycle

## Metadata

| Field | Value |
| --- | --- |
| Status | Planned; documentation only; implementation not started |
| Owner | cats-platform integration；cats-apps package/catalog；Runtime scoped operations |
| Spec | [SPEC-120](../specs/SPEC-120-app-market-and-lifecycle.md) |
| Decision | [ADR-121](../decisions/121-distribute-apps-independently-with-host-owned-lifecycle.md) |
| App delivery | [Apps PLAN-004](../../../cats-apps/docs/plans/PLAN-004-independent-app-distribution.md) |

## Outcome

一次宿主升級補齊 App 生命週期與官方 Market。Usage 預裝並可恢復；Studio 從目錄選裝，
之後相容的 App 更新不必重打 Desktop。停用停止活動，移除真實清掉安裝副本。
以下階段是依賴順序，不是分別宣布產品完成；首版發布 gate 必須覆蓋完整交付範圍。

## Ownership and integration seams

[PLAN-115](PLAN-115-app-components-and-private-services.md) extends the same App
installation with multiple frontends/services/workers. Coordinate manifest,
journal, migration and lifecycle work in M0; each release activates/stops/removes
its components together. The renderer-only scope below describes this plan's
initial consumer coverage, not a permanent restriction on Apps or a reason to
install their backends separately.

[PLAN-113](PLAN-113-managed-plugin-capabilities.md) 是另案的 managed Plugins 工作。
Agency content pilot 已交付，一般 SDK／目錄仍待實作。M0 與其 P0 協調可共用的
installer／catalog／journal 契約；本案維持 renderer Apps，不等待 Plugin executor，
也不新增任意背景程式。本段是交叉規劃，未新增本案已完成項目。

| Owner | 工作／契約 | 不越界的項目 |
| --- | --- | --- |
| Platform | SDK、Catalog consumer、下載、registry、journal、管理／Home、Core 作品資料 | 不解析 provider CLI 或讓 App 操作 host shell |
| Apps | Usage／Studio 套件、metadata、相容性證據、build/release、官方目錄 promotion | 不修改 Desktop pins 或自行授予預裝／system 權限 |
| Runtime | 工作終止證據、receipt retention 與必要 scoped cleanup | 不管理 Home／Market／安裝 registry |
| cats-one | 必要時更新跨 repo release guide／workspace 文件 | 不成為 App 更新服務 |

Platform freeze shared DTO 後 Apps 可並行做 artifact/catalog fixtures。Runtime 若需新增
停止查詢或 scoped deletion 契約，先在 Runtime owner repo 讀規範、補 SPEC／PLAN／ADR，
再實作與串接；本輪不修改 Runtime，也不假設目前已完整提供這些契約。

## M0 — Freeze contract and upgrade fixtures

- [x] 確認 Usage／Studio 出貨與 Home 規則、資料與資源邊界。
- [x] 查核既有 registry-only uninstall、corrupt same-version repair 與 bundle 選版缺口。
- [x] 同步 Apps 規劃：獨立 Marketplace／Home 醒目入口、Settings 已安裝管理，以及
      宿主驗證 Desktop management context 的要求；此項只完成規劃同步。
- [ ] 固定 Desktop management context 的簽發／傳遞、撤銷與防偽造／重播契約；
      所有管理入口共用授權，App SDK 不授予套件管理能力，建立 browser 拒絕 fixtures。
- [ ] 固定 schema 2／operation journal／bootstrap marker、catalog signature envelope、
      source transition、錯誤／進度 DTO；設定下載／目錄大小與逾時界限。
- [ ] 建立 schema 1 enabled／disabled／uninstalled／缺席／manifest-only／本機 Studio fixtures。
- [ ] 確認 Runtime 可提供的停止證據與資料清理 ownership，記錄必須擴充的 contract。
- [ ] 完成技術契約獨立 review；記錄下一 Platform minor 與 App range 更新依賴。

Exit：沒有未指定的刪除 owner 或以新 schema 覆蓋舊資料的捷徑。

## M1 — Local lifecycle, recovery and Home

- [ ] 實作驗證／backup／atomic migration、operation lock／journal、崩潰重啟恢復。
- [ ] 管理服務驗證 Desktop context；拒絕一般 browser／remote lifecycle mutation，
      含 owner 登入與 localhost；被拒絕的操作不得修改 registry／package／process。
- [ ] 實作宿主出貨／Home policy：Usage placeholder、Studio 安裝後卡片、跨視窗狀態同步。
- [ ] 停用：立即撤銷新工作權限、卸載所有活躍 renderer、追蹤取消與待確認狀態。
- [ ] 移除：真實清理 managed packages／cache，保留資料與 tombstone，支援 file-lock 重試。
- [ ] 修復：可信 local archive 同版 atomic replacement；壞 App 不阻擋 Home。
- [ ] 改寫 bundled reconciliation：首裝與使用者意圖分開，不 downgrade、不復活移除項目。
- [ ] 卸載說明資料保留，重裝接回作品／設定，不提供尚未實作的永久資料清除動作。

Exit：先用暫存套件完成 AC-01–AC-08、AC-11、AC-14 及 AC-16 的本機管理路徑；
不需要真 Grok 或公開 Market，Market 入口的 AC-16 驗收留到 M2。

## M2 — Official Catalog and Market

- [ ] 實作已簽章 Catalog 驗證、revision／expiry／withdrawal、信任根與 key rotation fixtures。
- [ ] bounded host downloader、URL／redirect allowlist、artifact digest／manifest／相容驗證。
- [ ] Home 醒目入口開獨立 Market，探索／已安裝／更新／詳情可直接安裝；
      整合 Home 修復與 Settings 共用授權、生命週期服務與狀態，不複製安裝邏輯。
- [ ] 安裝與手動更新 UX、新增權限確認、活動工作延後／停止選擇、離線／過期目錄提示。
- [ ] 驗證同 ID local-user→官方來源轉接；不能隱性升權或覆蓋本機開發套件。
- [ ] 整合 Apps 兩版本 fixture，驗證下載錯誤／中斷／同版修復／相容 rollback。

Exit：AC-02／03／07–AC-10／13／15 及 AC-16 的 Market 路徑成功；
Catalog 暫存簽章 key 僅用於測試。

## M3 — Developer SDK and independent App delivery

- [x] 從既有 host-owned SDK 整理可獨立取得的型別、文件、範例與 conformance fixtures；
      依 [ADR-123](../decisions/123-expose-app-sdk-contract-as-platform-npm-subpath.md)
      先以 `./app-sdk` subpath 提供 allowlist 契約與跨 OS byte-deterministic 官方 encoder，
      公開入口不載入 `build/server` 內部模組，`APP_SDK_VERSION` 與
      `packages/app-sdk/package.json` 版本以單一來源或 CI 斷言一致，Platform 測試 fixtures
      改用同一 encoder。2026-09-29 已實作 subpath、encoder、共用驗證與版本一致檢查，
      並補齊 fixture 轉換、範例與 conformance 向量；Platform npm 0.6.0 已於同日發布此入口。
- [ ] Apps 只依賴版本化開發契約；runtime bridge 不被重複打包或擴大能力。最低宿主不低於
      首個提供 subpath 版本的 App，以各自宣告的最低 `catsPlatform` 驗證產物，前提是該版本
      已在 npm 發布；逐 App 的安裝或 CI matrix 由 cats-apps 設計。
- [ ] Usage／Studio 對 candidate Desktop 新 minor 建立最低版本與實際驗證矩陣。
- [ ] Apps build/release 產生 immutable bytes、lock、來源證據；catalog promotion 是另一動作。
- [ ] 驗證 Usage 與 Studio 都在目錄，Desktop 只預裝 Usage，Studio 無預設 placeholder。
- [ ] 以 source-free 宿主完成 Studio A→B 更新，不 rebuild Desktop；通過 AC-12／13。

Exit：可 review 的 App／Catalog／SDK 候選產物與驗證紀錄齊備；尚不代表已公開發布。

## M4 — Installed acceptance and release preparation

- [ ] 跨 OS 隔離安裝／既有 schema 1 升級，含 Windows file locks、Unix path／permissions。
- [ ] 真宿主多視窗停用、取消中重啟、壞包恢復、套件前後 inventory／bytes 證據。
- [ ] 由另一位 reviewer 檢查 data ownership、刪除 containment、migration 與信任邊界。
- [ ] 完成 SPEC 全部 AC 對應表；未驗證 OS／行為明列，不用 fixture 冒充 installed acceptance。
- [ ] 準備版本／release notes／信任根與端點／exact pins；保留其他團隊的新變更。
- [ ] 依新的發布授權安排 SDK（如需）、App、Catalog、Desktop 的發布，不沿用 0.5.13 授權。

## Change map

| Surface | 預計工作 |
| --- | --- |
| `src/platform/apps/registry.ts`, `packageInstaller.ts`, `paths.ts` | schema、操作協調、bundle policy、修復與受限清理 |
| `src/platform/apps/envelope.ts`, `src/shared/catsAppManifest.ts` | 狀態投影、來源與 Home 政策；先 freeze 再串接 |
| `src/app/server/appPackageRoutes.ts`, `src/platform/apps/images.ts` | 管理操作、撤銷、停止追蹤、資料 owner 整合 |
| `src/app/renderer/AppRendererSurface.tsx`, `AppHostRoute.tsx` | 主動 teardown、失效與宿主恢復 UI |
| Home／Settings Apps／新 Market surface | 共用管理 client 與操作 DTO |
| `packages/app-sdk`, Desktop bundle config／packaging | 可取得開發契約、信任根、Usage pins 與出貨政策 |
| root `package.json` `exports` | 只允許 `.`、`./package.json` 與 `./app-sdk`；相容用的 `./*` 隨 0.6.0 移除（ADR-123） |
| Apps shared builder／release workflow／新 catalog tooling | immutable package 與獨立 promotion，見 Apps PLAN-004 |

變更地圖是規劃，尚未建立新 endpoint 或宣稱現有 API 支援新參數。

## Deferred data deletion

完整永久刪除跨 Platform／Runtime 的 App 資料是後續獨立 work package，不屬首版 gate。
M0 盤點 ownership，但 M1 只保證保留資料的卸載／重裝。後續必須先補各資料 owner 的
scoped deletion／retention contract，再驗證共享引用、權限、部分失敗與恢復，才能提供刪除操作。

## Validation and risks

文件階段僅檢查 diff、連結、需求一致性，不跑 App build、Desktop 安裝或 provider。
實作依各階段做單元／邊界／整合與真宿主檢查，全部合成資料放隔離 profile。
發布前依 release SOP 跑完整 candidate CI；不得用局部測試代表全部通過。

| 風險 | 必要驗證／防護 |
| --- | --- |
| 升級後舊 Desktop 啟動 | 明確 minor boundary、profile upgrade／restore 指引，不加雙套執行 API |
| App 獨立更新被 bundle 蓋回 | 較新 Market 版＋較舊 bundled 版＋重啟／Desktop 更新情境 |
| 卸載只隱藏但持續工作 | 主動 revoke、多視窗、假 CLI 終止證據與 pending 狀態 |
| 修復刪作品或越界 | 同版 staged replacement、資料外置、symlink/junction 與共享引用 tests |
| 同 ID 偽裝官方／目錄 replay | 已信任根、digest identity、source transition confirmation、revision gate |
| browser 或 App iframe 取得 Desktop 管理權 | 服務邊界驗證 context、拒絕偽造／失效／重播，並驗證無套件狀態副作用 |
| scope 擴成一般 extension host | 僅官方 renderer；新 background executor 另案 |

## Resume checkpoint

2026-09-28：規劃文件建立，沒有產品程式／manifest／版本／使用者資料變更。
下一步從 M0 的持久化狀態／操作契約與 fixtures 開始，再做 M1 本機生命周期。
公共 Catalog endpoint、正式 signing key 保管／輪替責任人與精確 release 版本留到發布準備；
這些部署選擇不阻擋隔離實作，也不授權生成正式 key 或上傳產物。

文件驗證：獨立唯讀審查已完成，首版資料保留與後續永久清除的範圍矛盾已修正，無剩餘阻擋。
Platform 本輪 10 份 Markdown 的 970 個本機連結目標存在；Apps 文件檢查也通過。
兩 repo 的 diff whitespace 檢查通過。未執行產品測試、build、安裝或 provider 呼叫；
這些結果僅驗證規劃文件，不勾選任何新增功能的 acceptance。

2026-09-29：補齊 Apps PLAN-004 的管理入口與 Desktop 授權要求，新增 AC-15／16 與
對應 M0–M2 工作。Agency Plugin pilot 的交付狀態已同步，但不抵免 App Market 驗收。
本次僅更新規劃，未實作管理限制、修改版本或發布。獨立唯讀審查無阻擋；兩 repo 的
6 份變更 Markdown、35 個本機檔案／anchor 目標以對應 worktree 檢查通過，Apps 的
`npm run check:docs` 通過（38 份 Markdown、156 個本機目標，無略過 sibling links）。
兩 repo 的 `git diff --check` 通過。未執行產品測試、build、安裝或 provider 呼叫；
未將任何新增功能的 acceptance 標記完成。

2026-09-29：新增 [ADR-123](../decisions/123-expose-app-sdk-contract-as-platform-npm-subpath.md)
（Proposed），記錄 SDK 開發契約先以 Platform npm 的 `./app-sdk` subpath 提供，第三方開發
啟動後再獨立發布 `@cats-inc/app-sdk`；同步 M3、change map、SPEC-120 FR-10 與索引。
僅文件變更，未修改 `package.json`、SDK、版本或發布。查證：npm registry 顯示 Platform
`latest` 0.5.8（unpacked 約 18.9 MB、3,609 檔），0.5 線只有 0.5.1 與 0.5.8；Usage 與 Studio
manifest 的最低宿主分別為 `^0.5.0` 與 `^0.5.11`。五個 checkout 分別搜尋裸套件名與
`<subpath>`，程式碼只有 cats-one 的 `package.json` 解析。本機 Windows 的 `zlib.gzipSync`
header OS byte 為 10，Linux／macOS 未驗證。6 份變更 Markdown 的 399 個本機連結目標
（含 sibling repo）存在，`git diff --check` 通過。未執行產品測試、build、安裝或 provider 呼叫。

2026-09-29：實作 ADR-123 第一階段（不含獨立 npm 發布）。新增 `./app-sdk` exports、
`packages/app-sdk/format.js`／`encode.js`、`src/app-sdk/` 公開入口與共用驗證，安裝器改用同一
驗證；`exports` 以保留 `.` 與 `./*` 的相容方式加入。未 bump 版本或發布。本機驗證：server、
desktop、renderer 的 `tsc --noEmit` 通過；test 設定只剩 worktree 未安裝 mobile 依賴造成的
2 個 `mobile/` 錯誤。`build:server`、`build:host`、`build:web`、`build:test-ui` 完成後，含新測試在內
與 App／SDK／package／Desktop 打包相關的 17 個測試檔共 97 項通過。另以外部 consumer
（NodeNext）完成型別檢查與執行期 import。未跑完整 `npm test`、mobile 檢查或 macOS；
fixture 轉換與 cats-apps 切換仍待後續。

2026-09-29：Platform 測試中有效的手組套件改用官方 encoder（無效套件與一份 zlib 基準包保留
手組）；新增 `examples/app-sdk-minimal-app` 與 25 個 conformance 向量。向量發現 decoder 的
base64 regex 對約 3 MiB 以上的檔案 stack overflow，已改為線性檢查。Desktop 源碼包在重建
宣告依賴的 App revision 前先 `npm ci --ignore-scripts`。#171 把下一版定為 0.6.0，
`exports` 隨之移除相容用的 `./*`，重做的 import 調查仍只有 `package.json` 解析。本機驗證：server、
desktop、renderer 的 `tsc --noEmit` 通過，test 設定只剩 2 個 `mobile/` 依賴錯誤；mobile
boundary 通過；重建後 15 個相關測試檔共 121 項通過。未跑完整 `npm test`、mobile 或 macOS。

*Last updated: 2026-09-29*

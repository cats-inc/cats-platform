# ADR-123: Expose the App SDK Contract as a Platform npm Subpath

## Status

Proposed, 2026-09-29。使用者要求把本次 npm／SDK 分發討論的建議整理成文件；實作、
`package.json` `exports` 變更、版本 bump 與任何 npm 發布都尚未授權，也不由本 ADR 授權。

本 ADR 採用 [ADR-094](094-adopt-cats-app-packages-as-extension-boundary.md)（Proposed）
Interface Direction 已提出的 `@cats-inc/cats-platform/app-sdk` 入口名稱，並為
[SPEC-120](../specs/SPEC-120-app-market-and-lifecycle.md) FR-10 與
[PLAN-112](../plans/PLAN-112-app-market-and-lifecycle.md) M3 的「可獨立取得的開發契約」
選定分階段交付方式。它不改變 [ADR-121](121-distribute-apps-independently-with-host-owned-lifecycle.md)
的 App 分發與生命週期決策，也不擴大 App 的執行能力。

## Context

### Apps 與 Plugins 已經以 artifact 分發

- cats-apps 逐 App 推送 `<slug>-vX.Y.Z` tag，把不可變的 `.catsapp` 發到 GitHub Releases；
  Desktop 以 `config/desktop-apps.lock.json` 的精確版本、URL 與 SHA-256 選用。
- cats-plugins 產生 canonical ZIP；宿主以自己的固定 digest allowlist 接納
  （[ADR-122](122-adopt-managed-plugins-for-upstream-capabilities.md)）。
- 各 owner 已寫明不走 npm：SPEC-120 FR-07 禁止安裝路徑執行 `npm install`；
  [cats-one architecture](../../../cats-one/docs/architecture.md) 說明 cats-apps 不是
  launcher 依賴；[cats-apps AGENTS.md](../../../cats-apps/AGENTS.md) 寫明 App 套件不是
  npm 發布目標；[cats-plugins deployment](../../../cats-plugins/docs/deployment.md) 以
  `private` 阻擋 npm 發布。
- 若改由 npm 依賴，每新增一個 App／Plugin 都要改 launcher 並發版；npm range 會在重新
  解析時換版或重新安裝已被使用者移除的單元，與 ADR-121 §1、§3、§6 的宿主政策、
  發布／推進／安裝分離與使用者選擇優先相衝突。

### 需要 npm 的是開發期契約

- SDK 現況：`packages/app-sdk`（`@cats-inc/app-sdk` 1.3.0，`private`）隨 Platform npm
  的 `files` 與 Desktop sidecar 出貨；Platform 透過內部 alias `#cats-app-package` 在執行時
  使用它，`scripts/bundle-server.mjs` 將該 alias 保持 external。
- `packages/app-sdk/package.js` 同時包含作者契約與宿主專用程式：
  - 作者契約：`decodeAppPackage`、`supportsVersion`、`MAX_PACKAGE_BYTES`、`APP_SDK_VERSION`。
  - 宿主專用：`PLATFORM_VERSION`（以 `createRequire` 讀 `../../package.json`）、
    `resolveAppLock`（含 GitHub 下載政策）、`materializeAppSelection`、`readBrowserSdk`。
- 安裝器實際套用的驗證分散兩處：`validateRendererPackage`
  （`src/platform/apps/packageInstaller.ts`）先呼叫 `decodeAppPackage`，再以
  `src/shared/catsAppValidation.ts` 的 `parseCatsAppManifestV1` 檢查 manifest。
  manifest 型別與驗證是 `src/shared/*.ts`，編譯進 `build/server`；`packages/app-sdk`
  則是沒有 build step 的原始 JS 與 `.d.ts`。
- `.catsapp` 格式沒有官方 encoder。cats-apps 的 `scripts/build-app.mjs` 自行組 gzip JSON
  envelope；Platform 也有 6 個測試檔各自手組 envelope。cats-apps CI 只 checkout 自己的
  repo，產物要等 Desktop packaging 或實際安裝時才被宿主驗證，那時對應的
  `<slug>-vX.Y.Z` Release 已不可變更。
- 現有 encoder 只在同一 OS 上可重現：Node `zlib.gzipSync` 會在 gzip header 寫入 OS byte，
  本機 Windows 實測為 10。cats-apps 的 CI 與 release 都在 `ubuntu-latest` 執行，
  所以在 Windows 重建同一版本會得到不同 bytes；Linux／macOS 的值未在本機驗證。
- cats-apps 規定「使用已發布的宿主契約，不 import sibling source」；沒有已發布契約時，
  只能重寫格式。

### 已查證的 npm 與 import 事實（2026-09-29）

- npm registry：Platform `latest` 為 0.5.8，unpacked 約 18.9 MB、3,609 個檔案；0.5 線上
  只發布過 0.5.1 與 0.5.8。App 宣告的最低宿主各不相同：Usage 0.4.0 為
  `catsPlatform ^0.5.0`／`appSdk ^1.2.0`，Studio 0.1.0 為 `^0.5.11`／`^1.3.0`。
- Platform `package.json` 沒有 `exports` 欄位，只有 `main`（`build/desktop/main.js`）、
  `bin` 與內部 `imports`。[ADR-013](013-ship-cats-inc-as-an-executable-self-hosted-npm-app.md)
  §2 定位此套件以應用為主，可以提供小型程式介面。
- cats-one 以 `require.resolve('@cats-inc/cats-platform/package.json')` 讀取 manifest，
  再依 `bin` 以檔案路徑啟動 Platform；cats-one CI 的封裝檢查也走同一路徑。
- cats-runtime 已用 `exports` 同時提供主入口、`./catalogs` 與 `./package.json`。
- 在五個 checkout（排除 `node_modules`、build 與 dist 輸出）分別搜尋裸套件名
  `'@cats-inc/cats-platform'` 與 `@cats-inc/cats-platform/<subpath>`：程式碼只有上述
  `package.json` 解析，沒有 import 主入口或其他 subpath；其餘是文件，包括 ADR-094／SPEC-098
  的 `app-sdk`，以及 ADR-092／SPEC-095／PLAN-084 規劃中給 mobile 的 `core`（mobile 程式目前未使用）。

## Decision

1. **Apps 與 Plugins 不經 npm 解析安裝（Platform 端重申）。** 宿主只接納經驗證的
   artifact，不從 `node_modules` 載入 App 或 Plugin，也不要求 launcher 或 Platform 以
   npm 依賴它們。npm 只承載開發期契約。其他 repo 的對應規則由各自 owner 維持，
   本 ADR 不替它們新增規則。

2. **第一階段：由 Platform npm 提供 `./app-sdk` subpath。** Platform 在 `exports` 宣告
   `./app-sdk`，指向只 re-export allowlist 的公開入口檔；宿主內部繼續以
   `#cats-app-package` 使用完整內容。檔案實體如何拆分屬實作細節，但不得改變
   `readBrowserSdk` 找到 `browser.js` 的方式（[app-packages](../app-packages.md) 記錄過
   `import.meta.url` 被 bundling 搬移後讀不到 SDK 的事故）。
   - 公開：`browser.d.ts` 的 `CatsAppBrowserSdkV1` 等型別、`cats.app.json` manifest 型別、
     安裝器所套用的同一套套件與 manifest 驗證、`supportsVersion`、大小限制常數、
     `APP_SDK_VERSION`，以及新增的官方 `encodeAppPackage`。
   - 不公開：`PLATFORM_VERSION`、`resolveAppLock`、`materializeAppSelection`、
     `readBrowserSdk`，以及 `browser.js` 本身。
   - `browser.d.ts` 是作者契約；`browser.js` 是宿主注入的執行 bridge，App 套件不得捆綁
     （ADR-121 §7、SPEC-120 FR-10）。
   - 公開驗證必須就是安裝器使用的驗證，不另寫第二套 validator；App CI 通過的套件
     不能在同版本宿主安裝時因格式或 manifest 規則被拒。
   - 公開入口必須能在不載入 `build/server` 內部模組或 Platform 執行期依賴的情況下
     import。manifest 驗證目前在 `src/shared/*.ts` 且編譯進 server，讓它從單一來源同時
     供安裝器與公開入口使用，是實作的主要工作。

3. **官方 encoder 必須跨 OS byte-deterministic。** 相同輸入在 Windows、macOS、Linux 上
   都必須產生相同 bytes，才能保留 cats-apps「同版本不同內容即失敗」的重建檢查與 SHA-256
   pin。encoder 必須固定 gzip header 中與平台或時間有關的欄位（OS byte、mtime），或改用
   能保證相同 bytes 的等效寫法，並以跨 OS 的 hash 比對測試證明；cats-plugins 的
   producer CI 已用同類方法比對 Windows、Linux、macOS。Platform 測試除了刻意構造的
   無效套件，也改用同一 encoder 產生 fixtures。

4. **`exports` 是公開 import 契約變更，隨 minor 邊界交付。** 宣告 `exports` 會封鎖所有
   未列出的套件路徑。
   - 必須列出 `./package.json`，否則 cats-one 無法找到 Platform。
   - `.` 目前解析到 Electron main，不是可 import 的函式庫 API；裸套件名與 subpath 調查都
     沒有 import 使用者，預設不宣告。
   - `bin` 與 Electron 的 `main` 不經 `exports` 解析，不受影響。
   - 實作時重做上述 import 調查，並把變更放在下一個 minor 邊界；SPEC-120 FR-11 已規劃
     0.6.0。本 ADR 不 bump 版本。

5. **SDK 版本只有一個來源。** `packages/app-sdk/package.json` 的 `version` 為權威；
   `APP_SDK_VERSION` 由它衍生，或以 CI 斷言兩者相等。宿主宣告的 SDK 版本、subpath
   內容與日後的獨立套件因此一致。

6. **cats-apps 以已發布的 Platform 作為開發依賴。** 每個 App 以它自己宣告的最低
   `catsPlatform` 版本（不是 `latest`）取得官方 encoder 與驗證，在 CI 檢查產物，並退役
   `build-app.mjs` 裡的 envelope 實作。candidate 宿主版本另依 PLAN-112 M3 測試。
   - 只有提供 `./app-sdk` 的 Platform 版本能這樣使用，因此只適用於最低宿主不低於該版本的
     App 新版本。SPEC-120 FR-11 已要求 0.6.0 後的 App 另發宣告新範圍的版本；已發布的
     `^0.5` 版本不重建，現有 builder 保留到切換為止。
   - 各 App 的最低宿主可能不同（目前 Usage 與 Studio 就不同），單一 workspace
     devDependency 無法同時滿足；以 CI matrix 或逐 App 安裝處理，由 cats-apps 設計。
   - 這些是 cats-apps 的工作，由其 owner 在自己的 repo 規劃。

7. **第二階段：獨立發布 `@cats-inc/app-sdk`。** 觸發條件是 ADR-121 §8 所述第三方 App
   開發另案啟動，或出現需要輕量安裝的非官方作者。屆時從 cats-platform 的同一目錄發布，
   套件版本即 SDK 版本，使用獨立 tag 或手動 workflow，不影響 Platform npm 與 Desktop。
   是否保留 `./app-sdk` subpath 依當時的版本政策決定；第二階段需要另外的發布授權。

8. **不另建 repository。** SDK 型別、宿主 bridge 與驗證器必須能在同一個 PR 修改，並以
   真實宿主測試。只有 ownership 或發布節奏實際分開時才重新評估拆分，標準與
   [cats-apps ADR-001](../../../cats-apps/docs/decisions/001-own-official-utility-apps-and-coordinate-desktop-distribution.md)
   對「每個 App 一個 repo」的評估相同。

## Consequences

### Positive

- `.catsapp` 只有一份官方 encoder 與驗證；App 產物在 App CI 就被宿主契約檢查，
  不必等到 Desktop packaging。
- 不需要新套件名稱、新 publish workflow 或新 repo，沿用現有 Platform npm 發布流程。
- cats-apps 以宣告的最低宿主版本測試，一次涵蓋 `catsPlatform` 與 `appSdk` 兩個宣告。
- 落實 ADR-094 已命名的入口，不引入新名稱。

### Negative

- 作者必須安裝整個 Platform 套件（0.5.8 約 18.9 MB，另含其 runtime dependencies）。
  對 cats-apps CI 可以接受，對第三方作者不友善；這是第二階段的觸發理由之一。
- 開發依賴寫的是 Platform 版本，manifest 宣告的是 SDK 版本，需要文件說明兩者對照。
  Platform 因與 SDK 無關的原因升 minor 時，作者的依賴範圍也得跟著調整。
- App 若要以某個宿主版本測試或使用新 SDK 能力，該 Platform 版本必須先發布到 npm。
  npm 目前落後 Desktop：0.5 線只有 0.5.1 與 0.5.8，Studio 宣告的 `^0.5.11` 在 npm 上
  沒有對應版本。首個提供 subpath 的 Platform 版本，以及之後各 App 採用的最低宿主版本，
  都必須先發布到 npm，cats-apps 才能切換；這些發布都需要另外授權。
- `exports` 會封鎖未列出的 deep import，必須在 minor 邊界交付並重做 import 調查。

### Neutral

- Desktop 與 Platform npm 仍攜帶完整的 `packages/app-sdk`；公開 subpath 只是其中
  allowlist 的入口。
- ADR-122 §4 的 Plugin SDK／validator 出現時採相同原則：格式與驗證放在 owner 端，
  producer 只當使用者；確切位置屆時決定。
- 跨 repo 後續不在本 ADR 範圍：cats-apps 的 PLAN-004、`build-app.mjs` 退役與 CI 驗證；
  cats-one release guide 說明 Platform npm 攜帶 SDK subpath，以及它與 App 相容性宣告的關係。

## Alternatives Considered

| 選項 | 取捨與決定 |
| --- | --- |
| Apps／Plugins 發 npm，由 cats-one 依賴 | 違反 SPEC-120 FR-07 與 ADR-121 §1、§3、§6，每新增單元都要發 launcher；不採用 |
| Apps／Plugins 發 npm 供需要者自取 | 沒有消費端，安裝仍走 artifact；GitHub Releases 與 npm 形成兩個不可變來源；不採用 |
| 立即發布獨立 `@cats-inc/app-sdk` | 輕量且版本清楚，但需先完成拆分、新 workflow 與發布順序；目前只有官方 Apps，延後為第二階段 |
| 為 SDK 建立獨立 repo | 無法在同一 PR 修改宿主與契約，ownership 與節奏也未分開；不採用 |
| cats-apps CI checkout Platform 原始碼驗證 | 違反「不 import sibling source」，且不對應已發布宿主；不採用 |
| 維持各自實作格式 | 格式漂移要到 Desktop packaging 或安裝才會發現；不採用 |

## References

- [ADR-094](094-adopt-cats-app-packages-as-extension-boundary.md)、
  [SPEC-098](../specs/SPEC-098-cats-app-package-and-extension-interface.md)
- [ADR-121](121-distribute-apps-independently-with-host-owned-lifecycle.md)、
  [SPEC-120](../specs/SPEC-120-app-market-and-lifecycle.md)、
  [PLAN-112](../plans/PLAN-112-app-market-and-lifecycle.md)
- [ADR-122](122-adopt-managed-plugins-for-upstream-capabilities.md)
- [目前套件能力](../app-packages.md)
- [cats-apps ADR-001](../../../cats-apps/docs/decisions/001-own-official-utility-apps-and-coordinate-desktop-distribution.md)、
  [cats-apps PLAN-004](../../../cats-apps/docs/plans/PLAN-004-independent-app-distribution.md)
- [Cross-repository release guide](../../../cats-one/docs/release-guide.md)
- [Node.js package entry points](https://nodejs.org/api/packages.html#package-entry-points)

*Last updated: 2026-09-29*

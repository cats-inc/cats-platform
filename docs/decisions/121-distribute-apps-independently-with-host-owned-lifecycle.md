# ADR-121: Distribute Apps Independently with Host-Owned Lifecycle

## Status

Accepted direction, 2026-09-28；使用者已核准整理規劃文件。實作、版本變更、SDK／App
發布與 Market 上線尚未開始，也不由這份 ADR 自動授權。

本決策接續 [ADR-114](114-separate-official-app-sources-and-coordinate-desktop-distribution.md)
的初期協同出貨階段；保留其 repo／SDK／Runtime 分工，將獨立下載與生命週期列為下一階段。
不代表 ADR-094 中一般 connector、server、worker、product module 已實作。

## Context

Related track: [ADR-122](122-adopt-managed-plugins-for-upstream-capabilities.md)
另案管理可選裝的外部能力 Plugins。2026-09-29 已交付 Agency content pilot，一般 Plugin
SDK／目錄仍待實作。兩案協調適用的安裝／來源／生命週期機制；本 ADR 的 renderer App
範圍不因此擴大，也不以一般 Plugin SDK 已完成作為本案實作前提。

Usage 已是獨立版本的 `.catsapp`，隨公開 Desktop 預裝。Studio 已有獨立套件與 SDK 1.3
生圖介面，但只在先前本機客製安裝時選入；公開 Desktop 0.5.13 的預設清單只有 Usage。
現有本機登記與停用／移除 API 不是完整 Market：移除不刪套件、一般修復沒有完成，
bundled activation 也尚未解決 Market 較新版本與 bundled 舊版本之間的選擇。

使用者確認兩種體驗：Usage 初次安裝即能從 Home 開啟，停用／移除後仍可從 Home 恢復；
Studio 未安裝時只在 Market 出現。兩者停用必須停止 App 活動，移除必須能釋放套件空間。

## Decision

1. **一種套件，兩種出貨政策。** Usage 與 Studio 共用套件、安裝、權限、更新、修復與
   移除機制。Desktop 自有清單分別指定 `preinstall` 與 `homePresence`，不由 App 自我宣告。
   Usage 為預裝＋固定入口；Studio 為選裝＋安裝後入口。官方身分、預裝與執行權限分開。
2. **Home 入口由宿主管理。** Usage placeholder 只需要宿主內建的名稱、圖示、說明與 App ID；
   不載入 App 程式、不讀即時用量、不啟動 App 背景工作。Studio 停用後仍是已安裝卡片，
   移除後消失。修復、重新安裝與啟用都由宿主操作，App 損壞時也可使用。
3. **發布、推廣與安裝分開。** cats-apps 逐 App build／發 immutable artifact；初期沿用
   GitHub Releases。官方簽章 Catalog 決定哪些版本供 stable／preview 選用；本機 registry
   記錄實際安裝。Catalog 是可替換的發現來源，不是執行遠端網頁的入口。
4. **Platform 擁有生命週期。** App 包裹、可清除快取與使用者資料分離。停用撤銷 bridge 並
   停止 App 活動；移除另清除受管理套件。預設保留作品／設定，另行確認資料刪除。
   共用 Runtime、provider 安裝／登入與其他 App 不受影響。
5. **修復是獨立動作。** 重新取得同一可信版本的原始 bytes、驗證並原子替換損壞副本，
   保留資料。相同版本不同內容仍不可發布。程式 bug／provider 問題不能聲稱靠重裝保證修好。
6. **使用者選擇優先於預裝。** Desktop 重啟／升級不得復活移除 App、重新啟用停用 App，
   也不得將 Market 較新版本覆蓋成 bundled 舊版。Usage 離線恢復包保留於 Desktop resources；
   App 移除不修改簽章安裝內容，磁碟回收應分開報告這份不可回收副本。
7. **SDK 是公開契約。** 開發套件提供型別、文件與隔離測試工具；執行 bridge 留在宿主。
   App 依相容範圍與實際能力使用功能，不內嵌另一套 Runtime、不直接取得 shell 或憑證。
   同 SDK 能力內的 App 更新可獨立交付；新宿主能力仍需先更新 Desktop。
8. **先官方 renderer Apps。** 第一階段只開放受信任官方目錄與既有 renderer 能力。
   來源簽章不能等同 `system` 特權；本機開發安裝維持明確 local-user 身分。
   第三方投稿、付款、評分與任意背景程式執行另案規劃。
9. **升級資料先於發布。** 新 registry、操作 journal 與來源／使用者意圖需要受測的升級與
   失敗恢復。詳見 SPEC-120；不得用清空 profile 或降版讀新資料替代 migration。
10. **商店與已安裝管理各有入口。** Apps Marketplace 是獨立 Desktop 頁面，由 Home
    醒目進入，可直接探索、查看詳情與安裝。Settings Apps 聚焦已安裝管理；兩者共用
    同一生命週期服務與狀態，不要求先到 Settings 才能安裝。Plugins 使用獨立 Settings
    分頁，Home 若提供 Plugin 管理入口則為小型捷徑，不套用到 Apps 商店入口。
11. **管理權限由宿主驗證。** 使用者發起的安裝、啟停、更新、修復、移除與機器層級
    設定變更，必須具備可驗證的 Desktop management context。一般 browser／remote
    client、owner 登入、localhost 或前端環境旗標都不足以取得此權限；App SDK 也不
    提供套件管理權。這不決定已安裝 App 的網頁可用性或 App 內一般偏好設定。

2026-09-29 管理入口與授權補充為已接受的規劃要求；具體 transport／驗證契約與
Desktop／browser 驗收仍在 PLAN-112 M0 起執行，不代表目前已實施此限制。

## Consequences

2026-09-29 component clarification: [ADR-125](125-own-multiple-frontends-and-backends-in-one-app.md)
applies this lifecycle to every frontend/service/worker inside an App as one
management unit. Multiple components never become separate user installations.
Current renderer delivery is the baseline; component execution remains planned.

### Positive

- Usage 保有初次開箱與損壞恢復入口，Studio 證明 App 能按需安裝與獨立更新。
- 使用者可停止 App 活動並回收安裝副本，不必移除整個 Desktop。
- App 發布不再要求同步出貨 Desktop；現有 repo 與 Runtime 分工維持一致。

### Costs and limits

- 需要簽章目錄、來源政策、migration、操作協調與真實磁碟清理，不能只加 Market 頁面。
- 保留 Desktop 內附恢復包與使用者作品，因此卸載不等於釋放所有相關 bytes。
- 未開啟的 renderer 原本就很少耗用活動資源；不承諾固定 RAM 節省或每 App 一個程序。
- 第一版手動確認更新；資源回收、跨視窗撤銷、故障恢復需在實際宿主與各 OS 驗證。

## Alternatives Considered

| 選項 | 取捨與決定 |
| --- | --- |
| 所有 App 跟 Desktop 一起更新 | 實作較少，但 Studio 交付仍綁宿主；保留預裝選擇，新增獨立更新 |
| Usage 不可移除 | 方便假設固定存在，但無法滿足使用者控制／恢復要求；不採用 |
| 移除後所有 Home 卡片都消失 | 簡單，但 Usage 失去恢復入口；採宿主明確的 Home 政策 |
| 把隱藏入口當成停用／移除 | 無法保證停止工作或釋放磁碟；不採用 |
| 先建完整第三方商店 | 上架治理與執行範圍遠超兩個官方 App；延後 |

## References

- [SPEC-120](../specs/SPEC-120-app-market-and-lifecycle.md)
- [PLAN-112](../plans/PLAN-112-app-market-and-lifecycle.md)
- [Apps PLAN-004](../../../cats-apps/docs/plans/PLAN-004-independent-app-distribution.md)
- [目前套件能力](../app-packages.md)
- [圖片與作品 ownership](../specs/SPEC-119-app-image-generation.md)

*Last updated: 2026-09-29*

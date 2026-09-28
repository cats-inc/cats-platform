# SPEC-120: App Market and Lifecycle

## Metadata

| Field | Value |
| --- | --- |
| Status | Draft implementation contract; product direction accepted; not implemented |
| Owner | cats-platform；App 產物與官方目錄內容由 cats-apps 負責 |
| Decision | [ADR-121](../decisions/121-distribute-apps-independently-with-host-owned-lifecycle.md) |
| Plan | [PLAN-112](../plans/PLAN-112-app-market-and-lifecycle.md) |
| Baseline | Desktop 0.5.13、SDK 1.3.0、Usage 0.4.0、Studio 本機套件 0.1.0 |

## Summary and scope

Related track: [SPEC-121](SPEC-121-managed-plugin-capabilities.md) 另案定義可選裝外部能力
Plugins，共用適用的安裝治理，但不放寬本 SPEC 的 renderer-only／無 install hook 邊界。
Agency content pilot 已交付；一般 Plugin SDK／目錄與本 SPEC 的 App Market 仍未實作，
不能把 pilot 當成共用生命週期契約已完成的證據。

讓一般使用者從 Cats Home／Market 安裝、啟用、停用、更新、修復與移除官方 Apps。
Usage 預裝啟用且保留恢復入口；Studio 選裝，沒有安裝就沒有 Home placeholder。
同一 App 可獨立發布更新；停用與卸載的資源效果必須可驗證。

本期包含官方靜態目錄、使用者確認更新、同版本修復、套件清理、資料保留與升級。
不包含跨 owner 永久資料清除、第三方投稿、付費／評論、跨裝置同步、自動更新、任意 server／worker、影片／修圖，
也不將 Chat／Work／Code 改成 Apps。SDK／CLI 已有能力不能被當成這些功能的實作證據。

## Existing implementation and gaps

| 項目 | 現況 | 本期增加 |
| --- | --- | --- |
| 套件 | 獨立版本、digest、Platform／SDK 檢查、opaque iframe | 遠端來源驗證與安裝操作協調 |
| Home | 目前只投影 enabled App 入口 | 宿主固定入口、停用卡片、修復入口 |
| 停用 | 拒絕後續 bridge；圖片工作要求取消 | 跨視窗主動撤銷、停止完成證據與重啟恢復 |
| 移除 | registry 標記；`purge` 只移除登記 | 真實套件／快取清理；保留移除意圖 |
| 修復 | 已有版本會驗證現有 bytes，損壞時失敗 | 經驗證同版重新下載、原子替換 |
| 預裝 | 保留 disabled／uninstalled 選擇 | 不覆蓋 Market 新版、壞 App 不阻斷 Home |
| SDK | 宿主內部 private 套件與 browser 型別 | 可獨立取得的開發契約／文件／測試工具 |
| Market | 未實作 | 官方目錄、版本選擇、下載、更新與恢復 UX |

現況依本輪 source inspection；不是新增功能的測試結果。

## FR-01 — 出貨與 Home 政策

Desktop 清單提供 `appId`、`preinstall`、`homePresence: pinned | installed-only`，
以及供 placeholder 使用的靜態名稱／圖示／說明。政策不放入 App 可自行修改的權限欄位。
`preinstall` 僅適用尚無使用者選擇的首次初始化，不是每次啟動強制安裝。

| 情境 | Usage：preinstall / pinned | Studio：optional / installed-only |
| --- | --- | --- |
| 新 profile 開啟 Home | 已安裝啟用，點擊直接開啟 | 不顯示；Market 可選裝 |
| 安裝並啟用 | 正常卡片 | 正常卡片 |
| 停用 | 保留卡片＋已停用；動作「啟用」 | 保留卡片＋已停用；動作「啟用」 |
| 移除 | placeholder＋未安裝；動作「重新安裝」 | 不顯示；Market 可重新安裝 |
| 套件損壞／缺少 | 宿主卡片顯示「修復」 | 保留已安裝卡片，顯示「修復」 |
| 與目前宿主不相容 | 保留卡片，說明需更新 App／Desktop | 保留已安裝卡片，說明下一步 |

點卡片可開宿主管理的詳情／恢復面板；不因點 placeholder 就靜默下載或執行。
初次正常啟動 Usage 不需 Market 網路。placeholder 不掛載 App iframe、不查 quota、
不維持 App polling；其小量卡片資料不宣稱為零記憶體。

## FR-02 — Market 與管理 UX

Home 提供醒目的「探索 Apps」，直接開啟獨立 Desktop Marketplace；商店有探索、已安裝、
更新與詳情視圖，可直接安裝，不必繞到 Settings。Settings Apps 聚焦已安裝清單、權限、
機器層級設定、啟停、更新、修復與移除；商店詳情可提供適用操作，兩者共用管理服務與狀態。
Home 保留既定 App 啟動／恢復卡片。Plugins 使用獨立 Settings 分頁；其 Home 管理捷徑
若提供則維持小型入口，不限制 Apps 商店的醒目入口。
詳情顯示名稱、用途、發布者、版本／更新說明、相容性、功能需求、權限與明確操作狀態。
一般流程不要求使用者輸入檔案路徑、digest、CLI 指令或 API key。

安裝不代表 provider 已準備好。Studio 缺少 Grok 設定／登入時，顯示現有 setup 導引；
不因安裝而呼叫生圖、切換 provider 選擇或自動安裝 CLI。作品讀取不依賴生成服務在線。
診斷 hash、路徑、來源與清理詳細資訊放進可展開區域；Settings 操作回饋沿用既有 toast 規則。

### Desktop management authorization

所有使用者發起的 install／enable／disable／update／repair／uninstall 與機器層級設定
變更，必須在宿主管理服務邊界驗證 Desktop management context；拒絕未獲授權的請求時，
不得改 registry、套件檔案或程序狀態。不能只藏 UI、信任 owner 登入、localhost、Origin
或前端傳入的環境旗標。一般 browser／remote client 直接呼叫 endpoint 也適用此限制。
M0 固定 context 的簽發／傳遞、生命週期與撤銷方式，以及拒絕偽造／重播的契約與 fixtures；
本文件不把目前既有 API 宣稱為已符合要求。

Desktop Marketplace、Settings 與 Home 恢復操作使用同一授權與生命週期服務，頁面路徑
不是授權條件。App iframe／SDK 不取得管理權限。Desktop 自有的首次 bundled 初始化
與重啟調和仍依 FR-01／FR-08 的宿主政策執行，不接受 browser 代為要求執行。
已安裝 App 能否從授權網頁使用、一般 App 內偏好設定，與此管理限制分開決定。

## FR-03 — 版本化狀態與操作協調

規劃 registry schema 2；至少分開保存以下資訊，不以 Home 是否可見推論執行狀態：

| 資訊 | 用途 |
| --- | --- |
| 安裝內容 | active version／digest、已驗證 rollback 候選、package source 與 artifact identity |
| 使用者意圖 | enabled／disabled／uninstalled、選用頻道、是否曾手動安裝／移除 |
| 健康狀態 | ready／missing／corrupt／incompatible；失敗不抹掉意圖與作品 |
| 來源證據 | bundle pin 或 catalog revision、publisher／key identity；不得自行提升權限 |
| 未完成操作 | operation ID、kind、stage、previous／target、stop／cleanup 結果 |
| 授權世代 | 每次停用／移除／版本切換遞增的 activation epoch，綁定所有 App context |

持久化 operation journal 與原子 registry 更新一起構成可恢復協定；不假設兩個檔案能同時提交。
安裝、更新、修復、移除、bundled reconciliation 對同一 App 串行；多程序／視窗也不可互相覆蓋。
同一操作 ID 重送回傳同一進度，不重做下載後的發布或 CLI 生成。
耗時 staging 後必須重查意圖／epoch，再決定能否提交；安裝不能蓋掉期間發生的停用／移除。
enable 前重新驗證 artifact、權限與 host／SDK 相容，壞包導向修復，不只翻轉旗標。
停用後再啟用必須發新 context；即使同版本同 hash，舊 iframe 的 epoch 也永遠失效。

## FR-04 — 停用與資源停止

先持久化 disabled 意圖並拒絕新工作，再撤銷所有該 App 的活躍 iframe／SDK context，
中止未完成 UI requests、輪詢、timer、subscription，釋放 blob 與 bridge。
所有已開視窗要收到失效通知；不能等下一次 App 自己 polling 才算停止。
Usage 已送出的 quota refresh 也要追蹤其 App 所有的工作；共用查詢只撤銷該 App 的訂閱，
不得取消其他消費者仍在使用的工作。需要的 Runtime contract 納入 M0 明確確認。

如有 App 專屬 Runtime 工作，持久化取消意圖並要求停止原工作。只有取得終止證據才顯示
「已停止」；timeout／Runtime 離線顯示「已停用，工作停止待確認」，重啟只恢復查詢／取消，
不新增生成。關閉 App 頁面仍沿用既有背景任務契約，與停用不同。
不停止共用 Runtime、Chat／Work／Code、CLI 安裝或其他 App 的工作。

## FR-05 — 卸載與磁碟回收

卸載先執行 FR-04，再讓 active package 不可執行。沒有活動使用者後，清除 App 受管理的
所有版本副本、staging、下載快取與修復隔離副本；保留小量 uninstalled tombstone。
共享 digest cache 只可在沒有其他引用時清除。所有刪除必須驗證實際路徑位於 App 管理根目錄，
拒絕 symlink／junction 逸出；不能將 manifest／renderer 提供的任意路徑當刪除目標。

檔案鎖住或工作仍可能運行時，先撤銷存取，保留 cleanup pending 並安全重試；不得聲稱空間已釋放。
清理失敗不復活 App。診斷分開記錄實際移除的邏輯 bytes、待清 bytes、保留資料 bytes，
不把壓縮／共享區塊推估稱成實際 OS 可用空間增量。

Desktop resources 內附 Usage 恢復包仍保留，不修改已簽章的安裝內容；其 bytes 不列入回收。
Runtime 共用用量記錄也保留。Usage 未開啟時本來就無頁面輪詢，不能保證顯著 CPU／RAM 下降。

## FR-06 — 使用者資料與刪除

安裝內容與資料分離；預設卸載保留設定、作品與必要歷史，重裝同 ID 可接回。
Studio 作品與 Core task/run/artifact 由 Platform 管理，Runtime receipt 由 Runtime 管理，
不能用刪除 `apps/data` 代替所有資料清除，也不能直接刪 Runtime 目錄。
provider 原始 session、憑證與共用遙測不屬於 App 卸載的可刪除範圍。

第一版卸載明示「保留作品與設定」，不提供可執行的永久資料刪除選項；重裝必須能接回。
若管理詳情提到資料清除，只能清楚標示尚未提供，不能把目前的 registry `purge` 包裝成它。

完整「刪除 App 資料」另列後續 scope：先建立各資料 owner 的 scoped deletion／retention
契約，預覽帳號／profile、會刪的作品與保留的共用／稽核資訊，再由 owner 確認。
停止工作、封鎖競爭寫入後才清理，處理共享引用並留下可恢復進度；部分失敗顯示剩餘項目。
其跨 owner 刪除／恢復驗收是後續獨立 gate，不阻擋第一版保留資料的卸載；不得宣稱清掉一切痕跡。

## FR-07 — 安裝、更新、修復與回復

所有來源走同一 staged validation／activation 服務，沿用大小界限、manifest、digest、
permissions、Platform／SDK 相容檢查；無 install hook、npm install、動態遠端程式或 shell。
下載後的 manifest identity、版本、相容範圍與權限必須與目錄已驗證項目一致；
不得先展示較少權限再啟用要求更多權限的套件。無相容候選時保留目前可用版，說明需更新
Desktop 或等待相容 App；不能以略過檢查解決。

更新由使用者確認。版本選擇只採目錄允許且符合 host／SDK 的精確版本；新增權限要重新確認，
舊授權不可自動擴張。活動工作期間顯示等待結束，或由使用者選擇停止後更新，不能靜默中斷。
下載可與工作並行，但停止／啟用切換與資料轉換必須持有操作鎖。

修復優先還原已安裝版的可信 digest；同版原始 bytes 可替換損壞副本，不容許新內容冒用版本。
先驗證新副本，保留故障現場的有限 metadata，原子切換後清除隔離 bytes；失敗保留資料與
修復入口。同版無可信來源或已撤回時，明確改選相容修正版；不信任損壞副本自帶的 hash。

僅 retained、verified、相容且未撤回的候選可用於 rollback。資料若已升級，必須有經驗證的
一致備份／還原路徑；不得只降程式版本讀新資料，也不得丟掉升級後新增作品。
第一期 App 更新不執行任意 App 提供的資料 migration；必要轉換由資料 owner 的宿主版本交付。

## FR-08 — 預裝調和與損壞隔離

| 本機狀態 | Desktop 啟動／升級 |
| --- | --- |
| 尚無選擇且為預裝 App | 驗證本機 bundled pin 後安裝啟用 |
| 手動移除 | 保留移除；Usage placeholder 仍在 |
| 已停用 | 保持停用；不自動更新既有安裝 |
| 已有可用版本 | 保留；bundled 更新作為手動更新候選，不覆蓋 Market 新版 |
| 已損壞或不相容 | 隔離 App、保留意圖／資料；Home 顯示修復，不靜默降版 |

App bundle 的內容錯誤必須對 App fail closed，但不能令整個 Home／Market 無法啟動。
新出貨產物仍須通過嚴格 bundle gate；runtime 恢復能力不放寬發布檢查。
修復／重裝可從可信 bundled 包離線恢復相容 Usage，或選 Market 中的相容版本。
較舊 bundled 包的恢復需要明示版本與資料相容性，不能假裝是原版修復。

## FR-09 — 官方 Catalog 與信任

規劃由 cats-apps 維護靜態 metadata，Platform 提供 consumer 與內建信任根。
Catalog 包含 schemaVersion、遞增 revision、issuedAt／expiresAt、publisher、App 清單、
stable／preview 精確版本選擇，以及每版本的 artifact URL／size／SHA-256、manifest identity、
相容範圍、權限、release notes 與 withdrawal 狀態。不得用 GitHub repo-wide latest 推斷 App 版本。

第一期採 Ed25519 簽署固定 payload bytes 的 envelope（algorithm、keyId、base64 payload、
signature）；驗章先於信任內容，拒絕未知 schema／key／algorithm、重複 ID／版本、非法尺寸。
傳輸、解碼、下載均有大小與時間上限；實作前在契約 fixtures 固定界限，沿用套件既有上限。
Host 保存最高已驗證 revision 防 rollback，檢查有效期限。換 key 須經既有信任根授權，
不得接受同一未知目錄提供的新 key；保留宿主更新提供緊急換根的路徑。

目錄／artifact 只由宿主下載，限制 HTTPS、允許的官方 endpoint 與 redirect 目的地，
禁止 loopback／私網與任意 URL 代理。簽章證明目錄來源，hash 綁定 artifact；兩者都需驗證。
Catalog 是官方來源，不授予 `system` 特權；local-user 套件不因 ID 相同而成為官方，
切換來源要由使用者確認並驗證 artifact，不能下載即覆蓋同 ID 的本機開發 App。

離線可用最後驗證的目錄作為帶時間的瀏覽資料，已安裝 App／作品照常開啟。
過期目錄不能授權新的遠端安裝／更新；可信 bundled 離線恢復不依賴網路目錄。
版本撤回阻止新安裝／更新／修復使用該版；已安裝者顯示通知與替代版，不遠端刪作品。
已知撤回同樣適用本機 cache／bundled 恢復候選，離線不能抹掉已知撤回紀錄。
第一期不提供強制遠端 kill switch；未連線時也不能保證即時得知撤回。

## FR-10 — SDK 與相容性

SDK 型別／能力定義／文件／隔離測試工具可獨立版本化取得，開發者不依賴 sibling source。
宿主仍注入唯一執行 bridge，App 套件不捆綁另一份特權實作。
保留既有 manifest `catsPlatform` 與 `appSdk` 的雙重驗證，沿用目前有限版本語法；
能力是否可用另經 Runtime projection，不靠 App 版本猜測 provider 可用性。

新增能力以相容 SDK minor 交付；breaking SDK 契約需要下一 major。套件壓縮格式與現有
SDK 1.3 image methods 本期可保留；Market 管理 API 屬宿主，不自動暴露給每個 App。
開發工具對 Usage／Studio 的 minimum-host 與 candidate-host 都跑契約 fixtures。
開發 SDK 的可取得產物與 npm 發布是另有發布範圍的交付，不因寫文件執行 publication。

取得方式依 [ADR-123](../decisions/123-expose-app-sdk-contract-as-platform-npm-subpath.md)（Proposed）
分階段：第一階段由 Platform npm 的 `@cats-inc/cats-platform/app-sdk` subpath 提供 allowlist
契約，包含型別、安裝器所用的同一套驗證與跨 OS byte-deterministic 的官方 encoder，不公開
`browser.js` bridge 與宿主專用函式；第三方開發啟動後，再從同一目錄獨立發布
`@cats-inc/app-sdk`。`exports` 變更屬公開 import 契約，隨 FR-11 的 minor 邊界交付。

## FR-11 — 現有 profile 升級與版本界線

registry schema 1 → 2 必須驗證、備份、原子替換、故障可恢復，重啟不可重複套用。
enabled／disabled／uninstalled 映射保留，manifest-only 未驗證項目不得變成可執行。
不再把 `purge` 解讀成刪除 tombstone；舊資料清空登記後無法確知過去意圖，
升級既有 profile 時保守地不對這類缺席 App 自動預裝，供 Usage placeholder 明確重裝。
新 minor 對舊 `purge=true` 管理請求明確回報不支援並指向一般卸載；不默默清登記，
也不把該參數改作尚未交付的永久資料刪除。這是管理 API 的 breaking boundary。
新 profile 的首次初始化必須有可辨識、可恢復的 bootstrap marker。

既有本機 Studio 保留相同 ID、啟用選擇、版本／hash 與既有作品／job ID。
它不再受預設 bundle 清單管理；轉接官方更新來源需要可信 identity 與使用者確認，
不能為轉接先移除作品或重送生成。未知 schema 原樣保留並提供宿主恢復指引。

schema 2 無法由舊 host 安全解讀，規劃下一個 Platform／Desktop 0.x minor 邊界
（目前基線 0.5.13，因此為 0.6.0；本輪不 bump）。舊執行檔不能直接使用已升級 profile。
Usage／Studio 的 ^0.5 範圍不接受 0.6，需另發布正確相容範圍的 immutable App 版本；
不可覆寫舊 artifact 或略過 compatibility check。發版時重新核對當時實際版本與其他團隊進度。

## Acceptance matrix

| ID | 必須驗證的結果 | 方法 |
| --- | --- | --- |
| AC-01 | 新 profile 離線可開 Usage；Studio 無 Home 卡片 | 真實 built bundles＋隔離 Desktop |
| AC-02 | Usage 停用／移除／重啟後 placeholder 正確；明確重裝成功 | Home／Market 整合 |
| AC-03 | Studio 安裝／停用保留卡片／移除消失／重裝接回作品 | App 套件＋fixture Runtime |
| AC-04 | 所有視窗撤銷，timer／bridge／訂閱消失；未知取消不假稱完成；重啟用不復活舊 epoch | 多視窗、quota in-flight、假程序、斷線與重啟 |
| AC-05 | 套件與快取實際刪除；資料與 bundled archive 保留 | 前後檔案清單／bytes／引用檢查 |
| AC-06 | file lock、symlink／junction、清理中重啟不誤刪且可恢復 | 各 OS 真實暫存 filesystem |
| AC-07 | 已損壞同版可修復；錯 hash 拒絕；Home 仍可操作 | 獨立損壞 fixture、failed activation |
| AC-08 | Desktop 舊 bundle 不降版／復活 App；離線恢復明示版本 | 先 Market 更新再升級 Desktop |
| AC-09 | 更新途中斷線／崩潰／權限增加／活動工作皆正確處理；install/update/repair 不覆蓋並行 disable/uninstall | transaction fault injection |
| AC-10 | 假簽章、過期／replay 目錄、任意 URL／redirect、撤回版本遭拒 | downloader／catalog 邊界 tests |
| AC-11 | schema 1→2 保留意圖與作品；失敗原檔可恢復；重跑安全 | migration fixtures＋backup hashes |
| AC-12 | 新 SDK 不破壞既有 App；不相容 App 安裝前攔下 | minimum/candidate host 契約測試 |
| AC-13 | 新 Studio artifact 可更新同一宿主，無需重打 Desktop | source-free 兩版本安裝演練 |
| AC-14 | 卸載明示保留資料；重裝接回作品／設定；共用引用與其他帳號無變更；不提供假資料清除動作 | owner fixtures、前後資料 digest／引用檢查 |
| AC-15 | Home 醒目入口直接開獨立 Marketplace，探索／詳情／安裝不跳 Settings；完成後 Home／Settings／Market 狀態一致 | 隔離 Desktop 與共用 lifecycle 操作證據 |
| AC-16 | owner browser／remote、localhost、偽造環境旗標、失效／重播 context 與 App iframe 均不能管理套件；拒絕後 registry／package／process 無變更；已授權 Desktop 操作仍成功 | 直接 API 拒絕 fixtures、context 撤銷、多入口 Desktop 驗收 |

以上均未執行。合成資料只能放暫存 profile／registry；不污染使用者狀態，不消耗 Grok 額度。
量測以活動資源與檔案證據為主，RAM/RSS 僅輔助，不以固定 MB 或立刻下降當驗收門檻。

*Last updated: 2026-09-29*

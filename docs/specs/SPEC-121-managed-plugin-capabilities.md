# SPEC-121: Managed Plugin Capabilities

## Metadata

| Field | Value |
| --- | --- |
| Status | Draft proposal; not implemented |
| Owner | Platform integration；Runtime execution contracts；未來 Plugin artifact owner |
| Reviewer | Product owner；跨 repo 契約 reviewer |
| Decision | [ADR-122](../decisions/122-adopt-managed-plugins-for-upstream-capabilities.md) |
| Plan | [PLAN-113](../plans/PLAN-113-managed-plugin-capabilities.md) |
| Baseline | Platform cbca3311；Runtime 3e47f46b；2026-09-28 source inspection |

## Summary

讓使用者安裝經 Cats 包裝的外部能力，在 Desktop Settings／Market 管理，再由 Runtime
或 Platform 消費其宣告能力。上游維持功能實作，Cats 提供薄橋接與可驗證的生命週期。
Plugins 是新的套件種類；provider adapter 只是其中一種貢獻。

## Goals and user stories

- 使用者可看見已安裝 Plugin 的用途、來源、版本、設定、健康與停止／移除結果。
- 安裝具執行能力的 Plugin 後，Runtime 可新增獨立 provider target，明確選用後提交任務。
- MCP／skills 套件不必假裝成 provider 或具有完整 App 頁面。
- 開發者可在隔離 profile 測試既有外部實作，之後另決定是否正式分發。

## Non-goals

重寫上游 agent loop／核心功能、Cats 自研有疑慮的 ChatGPT Web adapter、任意公開投稿、
付款／評分、任意宿主內程式載入、完整敵意 native code sandbox、Product-module、接管
使用者自行裝的 MCP／skills／CLI。本期也不把 Chat／Work／Code 改成套件、不實作 App 的
永久跨 owner 資料刪除、不要求第一版熱載入任意新協定。

## Existing implementation and gaps

| 項目 | 現況 | 本案規劃 |
| --- | --- | --- |
| App package | verified renderer／SDK 已交付；server／worker 未一般化 | 保留限制；另設 Plugin kind 與 validator |
| App Market | SPEC-120／PLAN-112 規劃中 | 共用適用的安裝治理，不能宣稱已存在 |
| Agent adapters | 內建 OpenClaw／Agent SDK bridge／ACP transport 選擇 | 已驗證 Plugin descriptor 可註冊獨立目標 |
| Provider readiness | Runtime selection、probe、session 契約已存在 | 加入 Plugin provenance 與撤銷，不繞過原規則 |
| Skills | Runtime 擁有產品 skill delivery 與 preview policy | 加入受管理來源，保留出貨／實驗與既有 context 邊界 |
| 外部 repo | 兩個 ChatGPT 案例僅文件研究 | P0 另選具許可與機器介面的真實 pilot |

## FR-01 — 套件身分與來源

Plugin 必須具穩定 ID、獨立版本、kind、發布者、上游 URL／revision、授權及 notices、
artifact digest、支援 OS／arch、host／Runtime／protocol 相容條件與 capability 宣告。
Cats bridge revision 與 upstream revision 分開，具體 build recipe 與必要 patch 可追溯。
檔案格式與版本語法在 P0 freeze；所有例名是提議，並非現有 endpoint／可安裝 schema。

同版不同 bytes 不可取代已發布產物；來源轉換、publisher／ID 衝突要明確處理。簽章證明
來源，不能授予 `system` 或未宣告能力。套件內容不直接修改 host／Runtime 設定檔或
執行任意安裝 hook；開發時 build upstream 與使用者安裝已驗證產物是兩個流程。

## FR-02 — 貢獻與執行介面

| 貢獻 | 最低語意 | Owner |
| --- | --- | --- |
| Provider／agent target | 可提交 turn、回傳事件／結果、辨識完成與失敗、宣告 continuation／cancel 等能力 | Runtime |
| MCP／tools | 指定 transport、工具範圍、auth reference 與連線生命週期，不隱性成為模型 provider | Runtime |
| Skills | namespaced ID、來源、相依工具與 delivery 支援；不可只靠 prompt 宣稱工具已安裝 | Runtime |
| Settings／integration status | 宿主呈現設定 schema、狀態與有限管理動作 | Platform |

同一套件可含多種貢獻。第一版 settings 採宿主表單／狀態，不載入任意 Plugin renderer。
背景 service 是能力的執行資源，必須有 owning Plugin、用途、啟停與存取界線，不能因安裝
就取得通用 host shell。第一版不開放任意 Platform server route 或 store extension。

優先選現有 Runtime 協定接入 upstream；需要小量轉換時，以獨立 process 的 Cats bridge
提供已支援的版本化協定。Runtime 不從下載目錄任意 import JavaScript，也不要求每個
Plugin 各加一條硬編碼 transport。未支援協定明確拒絕並列入 Runtime 後續契約工作。
不能把只提供工具的 MCP server 或必須由 Codex 發起的 skill 偽裝為獨立 ChatGPT provider。

## FR-03 — 已驗證註冊與 Runtime selection

Platform 保管安裝／啟用意圖與 artifact，透過受認證的 Runtime 管理契約送出完整描述。
Runtime 驗證來源範圍、host identity、相容版本、permission 與 contribution collision，
綁定 Plugin ID／version／digest／profile／activation generation，回傳接受或拒絕的觀察。
不得掃任意 Git checkout 後自動執行；manifest parsing／inventory 列舉不執行套件程式。

註冊與更新必須冪等且有 revision 檢查；舊回應不得復活停用項目。跨程序傳遞不能假設
共享絕對路徑；v1 僅承諾同機 Desktop 所管理的 Runtime。獨立 Runtime 留有不依賴 Platform
source 的輸入契約，遠端／多 host 套件配送另案。

安裝成功、Plugin 已啟用、已註冊、已登入、probe 可用與已被使用者選用是不同事實。
Plugin provider 增加候選目標，不自動改既有預設、ROI 或 model selection；執行前仍由
Runtime 驗證目前允許目標。能力 metadata 不得把不支援的 streaming／resume／fork／cancel
標為 true；回報完成不等於真 streaming，也不能以本機中止接收冒充遠端取消。
診斷失敗保留有來源的上次觀察，權限撤銷則立即禁止新執行，符合現有 picker continuity。

## FR-04 — 套件與執行生命週期

沿用 SPEC-120 適用的 staged verification、操作 journal、鎖與啟用前意圖重查，具體共用
程式仍待提取。記錄 desired state、installed identity、Runtime observed state、操作 revision
與待停止／待清理資源；不能用單一 enabled boolean 表示跨程序已停止。

| 操作 | 可驗證結果 |
| --- | --- |
| 安裝 | 驗證產物／相依項／相容性；設定未完成仍可顯示已安裝待設定，不冒充 ready |
| 啟用 | Runtime 接受此 generation 的貢獻；依既有 selection 決定是否可執行 |
| 停用 | 拒絕新工作、撤銷 tools／skills／provider 准入，再要求終止本套件所擁有的工作 |
| 移除 | 先停用；停止證據確認後清除受管理 package／cache，保留資料與移除意圖 |
| 更新 | 驗證新版本，等待活動工作結束或由使用者選停止；切換 generation 並重查權限 |
| 修復 | 以可信同版 bytes 替換損壞副本；保留設定、來源與資料 |

第一版停用採停止既有 Plugin 工作，不默認允許其持續至完成；cancel 不支援、Runtime
離線或停止逾時時，顯示「已停用，停止待確認」，不清掉可能仍被使用的 bytes。
Runtime 只終止自己為此 Plugin 建立的 process／session／subscription。Plugin skill／tool
也可能被既有使用者 session 使用：這時撤銷的是受影響 turn／context 的執行准入，按既有
session 契約取消該 turn，無法確認則標記 pending；不據此終止共享 provider process 或
無關 session。連接現有外部服務只撤銷本 Plugin 的連線與請求，不關閉服務或移除全域安裝。

journal 與 Runtime 註冊在啟動接受工作前調和：只重試停止／清理／查詢，不重送任務，
也不因 restart 或 bundle policy 復活已停用／移除項目。新的 generation 不接納舊 in-flight
回應。若 Runtime 未收到撤銷、失聯後如何限期停止准入，P0 必須固定 lease／reconciliation
契約與測試界限，不能靠無限期快取的 enabled 狀態維持執行權。

## FR-05 — 權限、依賴與資料 ownership

安裝／啟用前展示必要的檔案、網路、process、provider 與 skill 範圍；新增權限需重新確認。
宣告是准入與披露依據，不能聲稱 native process 已被完整 sandbox；P0 列明各 OS 實際可
強制的限制。Secret 只存宿主 credential store 的 reference，按需提供給對應 process／服務，
不寫進 archive、manifest、一般 log 或 renderer。Plugin 不能取得其他套件或 provider 憑證。

第一版支援 bundle 私有依賴與經宣告的外部 prerequisite；暫不做 Plugin 相依圖自動安裝。
缺 prerequisite 時說明並沿用宿主明確 setup；不隱性執行 npm install／curl shell。
共享 process／工具不因一套件移除而終止；相依能力失去時消費者顯示 unavailable。

安裝內容、快取、設定與使用者成果分離。卸載預設保留設定／成果／歷史；資料刪除另案。
只按宿主 ownership receipt 刪管理根目錄內的檔案，防 symlink／junction 逸出，處理共享引用、
file lock 與 cleanup pending。手動安裝的 MCP／skills／CLI 不入 managed registry、不被收編。
Plugin 產生的 skill 投影需有檔案 ownership 與 collision 檢查，不能覆蓋使用者同名 skill。

已送進模型 context 的 skill 文字無法靠刪檔收回。停用先禁止後續 delivery，對帶有此
provenance 的 in-flight turn 依 FR-04 取消或標記停止待確認；這不取得該 session 或共享
provider 的所有權。含已撤銷內容的 context 不可宣稱乾淨，需依既有 session 契約建立
乾淨 context 才能再次執行。保留 release／preview skill admission 規則，不刪歷史偽裝撤回。

## FR-06 — Desktop 設定與目錄

Settings 提供 Plugins 清單與詳情，與 Apps 有明確分類。顯示用途、發布者、版本、能力、
設定／連線狀態、權限與安裝／啟停／更新／修復／移除。共用管理服務，不複製 Apps installer。
主畫面不強制新增 Plugin App 卡片；provider target 透過 Runtime 現有 catalog／picker 消費。
Settings 操作回饋沿用 toast；長期健康與待清理是狀態，技術診斷放可展開區域。

先提供本地可 review 產物與受控目錄。遠端目錄採 SPEC-120 的可信來源、signature、digest、
相容性與 withdrawal 原則，獨立記錄 Plugin kind／版本，不能把 App catalog parser 直接
當作可接受 executable Plugin。完整目錄並非本地 pilot 前提；正式分發必須通過來源 gate。

## FR-07 — 實驗與發布

本地 internal-experiment 與 curated release 是明確的來源政策，與 enabled／disabled、
版本 stable／prerelease 各自獨立。實驗僅在明確允許的隔離開發 build／profile 接納；一般
Desktop／一般 preview 拒絕其註冊、啟動與 skill delivery，即使檔案被複製過來也一樣。
這個判斷由宿主可信政策決定，不能改 manifest 就升級身分。

研究可先做靜態閱讀與隔離 fixture；實際連外測試須先釐清所用 upstream、服務介面與許可。
內部測試、MIT 或不公開發布不是服務條款豁免。正式目錄 promotion 要綁定已 review 的
artifact／upstream revisions、授權 notices、使用介面及驗證結果；不自動沿用實驗通過。
本 SPEC 不選定 ChatGPT Web adapter、不要求 Cats 實作其網頁控制或規避機制。

## FR-08 — 相容性與升級

新 Plugin registry 與 Runtime registration 要有版本化 schema／protocol；Apps registry
與 `.catsapp` v1 不被暗中重新解讀成 Plugin。既有 capability-connector 宣告不是可執行
Plugin，保留原狀並提供明確轉換規劃，不自動啟動。

優先新增獨立資料 namespace。若共用 installer 抽取、Runtime config／API 或 skill policy
導致 breaking change，先記錄各 owner 下一個 0.x minor（穩定 SDK 則 major）與依賴次序，
不能假設必須與 PLAN-112 同版或可無條件沿用其 0.6.0 計畫。
資料格式升級須 validation、backup、atomic replacement、repeat-start 與失敗恢復測試；
程式回退不得讀不相容新資料，亦不得丟棄新成果。本輪不修改版本或持久化資料。

## Acceptance matrix

| ID | 必須驗證的結果 | 方法 |
| --- | --- | --- |
| AC-01 | 真實上游套件經薄橋接安裝／設定／使用；來源、revision 與 notices 可查 | 已選 pilot 的 source-free artifact |
| AC-02 | provider Plugin 增加獨立目標、提交 turn 並返回結果；Codex 不代跑，既有 ROI 不變 | Runtime 契約＋獨立 provider pilot；mock 不作真實接入證據 |
| AC-03 | MCP／skills 正確投影且不冒充 provider；必要工具缺少可診斷 | contribution fixtures＋真實工具／skill pilot |
| AC-04 | Platform→Runtime 註冊冪等、collision／舊 revision／錯 digest／不相容拒絕 | 邊界 fixtures、重啟／錯序測試 |
| AC-05 | 停用阻止新工作；停止未知不假稱成功；清理不干擾共用服務 | in-flight／斷線／cancel 不支援／恢復 |
| AC-06 | 卸載真實清 package／cache，資料與手動安裝項保留，無路徑逸出 | 各 OS 暫存 filesystem／前後 digest |
| AC-07 | 更新／修復原子化，活動工作／撤銷競爭與失敗可恢復 | operation journal fault injection |
| AC-08 | skill 撤銷阻止新 delivery；受影響 turn 取消／pending、殘留 context 不被當成乾淨，共享 provider 與無關 session 保留 | 既有 session 注入 skill／provenance／release-preview admission |
| AC-09 | internal-experiment 無法藉複製 profile、改 channel 或重啟進入正式執行 | build／profile／Runtime 啟動交叉矩陣 |
| AC-10 | Settings 與 catalog 狀態一致，provider picker 不繞過 selection；錯誤有下一步 | 隔離 Desktop 多視窗與 Runtime fixture |
| AC-11 | 未改 Apps 可照常執行；schema 變更可升級／恢復且不自動轉換舊 connector | 最低支援 host／App 契約與 migration |
| AC-12 | 發布產物與目錄 promotion 有獨立許可／驗證，實驗不自動出貨 | artifact／catalog／Desktop bundle inventory |

以上皆為未執行的未來驗收。所有合成資料使用隔離 profile／暫存 registry，不接觸使用者
真實資料、登入或付費 provider。靜態研究及文件檢查不代表任何 Plugin 已可安裝。

## Dependencies and open questions

- 共用生命週期來自 [SPEC-120](SPEC-120-app-market-and-lifecycle.md) 的契約協調，實作尚待交付。
- Runtime owner 需在 P0 記錄協定、registration／revocation、ROI 與 skill policy 的確切變更。
- [ ] 選擇可合法接入、具機器介面的 upstream pilot；provider 與 MCP／skill 各有驗收證據。
- [ ] 固定 package envelope／manifest、protocol 版本、大小／逾時／lease 與 OS 支援範圍。
- [ ] 確認 `cats-plugins` repo／產物 owner 與 catalog promotion 責任；尚不建立或發布。
- [ ] 若外部 process 所需權限無法符合接納政策，縮減支援範圍或更換 pilot。

*Last updated: 2026-09-28*

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

2026-09-28 execution scope：使用者已授權建立 `cats-plugins` repo 及 Agency Agents
內容封裝 MVP，直接 commit／push main。此處的宿主 lifecycle／registry／SDK 契約仍待
固定與實作；producer MVP 不等於 Platform／Runtime 已支援 Plugin 安裝或全部 AC 通過。

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
| 外部 repo | C2C 暫緩；Agency Agents 已靜態評估為 skills-only 候選 | P0 固定可驗證的接入／投遞介面；兩者皆未執行 pilot |

## FR-01 — 套件身分與來源

Plugin 必須具穩定 ID、獨立版本、kind、發布者、上游 URL／revision、授權及 notices、
artifact digest、支援 OS／arch、host／Runtime／protocol 相容條件與 capability 宣告。
Cats bridge revision 與 upstream revision 分開，具體 build recipe 與必要 patch 可追溯。
檔案格式與版本語法在 P0 freeze；所有例名是提議，並非現有 endpoint／可安裝 schema。

同版不同 bytes 不可取代已發布產物；來源轉換、publisher／ID 衝突要明確處理。簽章證明
來源，不能授予 `system` 或未宣告能力。套件內容不直接修改 host／Runtime 設定檔或
執行任意安裝 hook；額外步驟只能使用 FR-09 宣告且經宿主接納的操作。開發時 build
upstream 與使用者安裝已驗證產物是兩個流程；來源取得及無 release 情境依 FR-10。

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
關閉連線、停止 CLI process 或重啟 Desktop 不是 clean-context 證據；resume／fork／
自動恢復若帶回原有內容，仍受同一撤銷規則約束。FR-09 定義宿主應呈現的受影響範圍與操作。

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

## FR-09 — 生命週期協定、hooks 與最小 SDK

### 宣告與執行分工

Manifest 宣告 contribution／依賴／owned resources、資料保留需求，以及可選的 lifecycle
helper 與所需權限；不存在的 hook 按宿主預設流程處理。Platform 是操作計畫、使用者意圖、
journal 與 inventory 的唯一 writer；Runtime 提供影響／停止／投遞狀態並執行受控 helper。
helper 不 import 宿主模組，不直接改 host config／inventory，不代替 Runtime 判定 context。
Agency 等純內容套件的撤銷由宿主通用 skill policy 完成，通常不需 executable hooks。

下列階段是契約語意；具體 wire names／schema／逾時在 P0 固定，不宣稱 SDK 已存在。

| 階段 | 宿主保證與額外步驟 |
| --- | --- |
| Inspect／plan | 唯讀檢查相容性、依賴、資源、受影響工作／sessions 及必要操作，不執行安裝程式。無法觀察的項目標記 unknown，不推成沒有影響 |
| pre-install | 來源／digest／路徑驗證並 staging 後，才執行已宣告的準備步驟；失敗不啟用貢獻 |
| Install／post-install | 宿主記錄 artifact，執行受限設定／驗證；post 失敗保留可恢復的「已安裝、設定未完成」，不能冒充 ready。登入／啟用／provider 選用仍是各自的狀態 |
| Disable／pre-uninstall | 接受移除意圖後立即阻擋新准入並開始撤銷；pre-uninstall 指檔案清理前的額外工作，可用於解除自有外部註冊。hook 失敗不能阻擋撤銷或讓舊能力繼續接新工作 |
| Uninstall／post-uninstall | 協調受影響工作的停止並確認可清理後，移除 owned package／投影，執行必要後續驗證或外部收尾；所有必要步驟確認前維持「移除待完成」及 tombstone |
| Update／repair | 使用同一 operation 契約，區分新舊版本及 generation；staging／切換／migration／恢復順序明列，不能以另一套腳本繞過活動工作與資料保護 |

post-uninstall 需要的 helper／協定 metadata 及完整必要的自有執行依賴，必須在刪除套件前
封存到受驗證的 operation cache，直到收尾完成才回收；包括 helper 引用的 libraries、
resources 與自帶 interpreter，不能只保留 entrypoint。共享／外部 prerequisite 另記錄
版本／定位／readiness 契約，不複製或接管其所有權；執行前重查，缺失即 pending。
cache 不再提供 Plugin 業務能力。不得清檔後才發現無法恢復收尾，也不得在 retry 時下載
另一版 hook／依賴。必要 helper 或依賴破損時由宿主處理已知 owned files，未能確認的
外部副作用保留 pending／manual recovery，不能假稱已清除。

### Hook I/O、失敗與恢復

每個 step 帶有 operation／step ID、Plugin identity／digest、phase、generation、deadline
與宿主核准的資源／權限範圍。helper entrypoint 固定於驗證後產物，執行參數不經任意
shell 字串展開；process／網路／credentials 依 FR-05 限制，不把 out-of-process 當成完整 sandbox。

回應至少區分 succeeded、failed、pending、requires-action；附 bounded progress／diagnostics、
已完成副作用的 receipt、可重試性與必要操作清單。正常結果、stdout、log 均不得帶 secret。
必要操作可包含建立新 session／context、重啟某個 owned service、具體理由的 Desktop
restart 或使用者完成外部設定；每項都帶 target／scope／reason 與完成驗證方式。
它們可同時存在，restart 不是 new-context 的替代品。helper 只回報需求，宿主驗證後呈現。

宿主在執行前持久化 step 意圖，step 以相同 ID 安全重試／去重，完成後寫 receipt；
不承諾外部副作用 exactly-once。若 helper 已做事但回應遺失，先 reconcile／query，
無法確認時停在 pending，不能盲重跑非冪等操作。deadline／取消亦不代表副作用已撤回。
列出可補償步驟、補償失敗與人工恢復；外部帳號／註冊不假設能隨 local rollback 復原。
hook 不可讓停用無限等待或自行恢復 generation；更新失敗依已完成的 migration／資料
相容性決定可否回退。P0 固定各類 timeout、retry budget 與步驟終止條件。

### 使用者操作與 retained context

執行有中斷影響的移除前，Platform 依 Runtime 回報呈現哪些 Cat／session 正在使用技能、
哪些工作需要停止、哪些舊 context 之後不能續跑；使用者可取消本次移除，或確認停止並移除。
接受操作後，Runtime 在同一版本化准入界限建立 fence 並取得影響快照，阻止新 work／
delivery。Platform 對照已確認範圍，新增中斷影響需補充確認；期間維持 fence，不越權
停止新增受影響工作。取消此階段不自動恢復能力，清楚呈現已停用狀態與重新啟用選項。
停止狀態未知時保留「停止待確認」；已涵蓋相同影響的授權可沿用，不重複詢問。

Agency 例：2 個對話載入了 skill，其中 1 個有 active turn；確認後撤銷新 delivery，
取消／確認該 turn，清理安全可移除的檔案，保留兩段歷史及來源暴露記錄。即使 package
已清理，舊 context 仍不得 resume／fork 成可執行狀態；應引導建立不含撤銷內容的新
context。歷史仍可檢視，不能整段重播舊 skill 又宣稱乾淨。Desktop 重啟若恢復舊 session，
同樣須擋下。不得因此終止其他 session 或共享 CLI process；手動安裝不被納入管理。

SDK 初期只需 manifest／protocol types、validator、hook transport helpers 與 lifecycle
fixtures，並包含無 hooks 的內容套件範例。wire protocol 是跨語言契約，SDK 為可選輔助；
具體 package 名稱／owner 在 P0 固定。先實作 pilot 需要的部分，其餘不標為已支援。

## FR-10 — 上游沒有 release 時的來源與封裝

`cats-plugins` 建議預設使用 **source lock＋build recipe**，取得動作只在維護者／CI 的
隔離 build workspace 進行。每個 Plugin 記錄上游 URL、完整 commit ID、選定 source paths、
來源內容 hash／清單、license／notices、converter／bridge／patch revisions、build toolchain
與 dependency lock。此處描述必要資訊，未固定 lock 檔名或完整 schema。

| 取得方式 | 定位與要求 |
| --- | --- |
| Locked Git fetch／commit archive | 預設；按完整 commit 取得並驗證來源，輸出獨立 artifact。branch／tag 只供發現候選，入 lock 前必須解析成固定 revision |
| Submodule | 可選開發方式，適合頻繁讀碼／修改上游；gitlink 與 lock 必須一致，CI 檢查乾淨且精確的 checkout。不能用 submodule --remote 的 branch tip 當發布輸入 |
| Vendored snapshot／licensed mirror | 有保留來源或離線需求時採用；附來源、固定 revision、完整 notices 與變更差異，避免成為無來源的手工 fork |

來源是否有 release 和 Cats 是否能發布 Plugin 是不同問題。Agency 可釘
`479193dcce1cf6432ce0f5aa230ab8cc739a8c6b` 作候選，Cats Plugin 再依自身相容性規則
給版本與 channel；這個 SHA 不是已批准的出貨版本。上游下一個 commit 只成為更新候選，
經差異／授權／建置／契約與 pilot 驗證後，才產生新的 Cats artifact；不自動跟隨 main。

如上游含 submodules、LFS 或外部下載，recipe 必須明列是否需要、各自來源／固定 revision
或 digest，不能遞迴引入未釘選內容。commit ID 識別來源，不等於來源受信任或建置可重現；
build inputs、工具鏈、依賴與相應驗證仍必須固定。commit 無法取得時明確失敗，不退回最新版本。

保存已核對的來源 snapshot／build receipt 與授權所需材料，再保存 Cats 發布的 immutable
artifact 及其 digest，避免只靠原 repo 持續存在。若授權不允許所需封裝／保留方式，改採
其他接入方式或換候選。Desktop 只安裝已驗證 Cats artifact，不要求 Git、上游 build
工具或安裝時跑 converter。對 skills Plugin，Markdown 本文就是必要 payload；「不依賴
source checkout」不表示移除應交付的指令內容或授權要求的 source。

[Git submodule 文件](https://git-scm.com/docs/gitsubmodules) 說明 gitlink 記錄確切 commit；
[GitHub source archive 文件](https://docs.github.com/en/repositories/working-with-files/using-files/downloading-source-code-archives)
允許直接取得 commit snapshot，也指出重新產生 archive 時壓縮 bytes 可能改變。
因此 source-content identity 與 downloaded-archive／Cats-artifact digest 分開：保存已審查
archive bytes 或驗證預先固定的檔案清單／內容 hash；遇 digest 不同不可直接重算後放行。
解包前仍驗證來源及 archive 路徑／大小限制，解包驗證完成前不執行任何內容。

## Acceptance matrix

| ID | 必須驗證的結果 | 方法 |
| --- | --- | --- |
| AC-01 | 真實上游套件經薄橋接安裝／設定／使用；來源、revision 與 notices 可查 | 已選 pilot 的獨立 artifact；安裝不依賴上游 checkout |
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
| AC-13 | 無 hook 的 skills 套件使用共通 lifecycle；有 hooks 時依序執行、post 失敗不冒充 ready／removed | content-only＋受控 helper fixtures、逐 phase fault injection |
| AC-14 | hook deadline／重複呼叫／遺失回應／崩潰恢復不重複非冪等副作用；pre-uninstall 失敗不阻擋撤銷，post helper 可安全恢復 | journal／receipts／補償；清主套件後重啟，驗證 cache 執行依賴及外部 prerequisite 缺失 |
| AC-15 | 移除前影響可見並重新核對；CLI／Desktop 重啟或舊 session resume／fork 不能清除暴露證據，無關 sessions 保留 | Agency 隔離多 session、確認範圍競爭、新 context 恢復與 required-action UI |
| AC-16 | 無 tag／release 的 upstream 仍可按固定 commit 建置；ref 漂移／gitlink 不符／缺來源／錯 hash 拒絕，安裝／恢復 bytes 不依賴原 repo 在線 | Git／archive／mirror fixtures、子依賴／內容正規化驗證、已備 artifact 的離線安裝與前後 digest；不宣稱外部服務可離線執行 |

以上皆為未執行的未來驗收。所有合成資料使用隔離 profile／暫存 registry，不接觸使用者
真實資料、登入或付費 provider。靜態研究及文件檢查不代表任何 Plugin 已可安裝。

## Dependencies and open questions

- 共用生命週期來自 [SPEC-120](SPEC-120-app-market-and-lifecycle.md) 的契約協調，實作尚待交付。
- Runtime owner 需在 P0 記錄協定、registration／revocation、ROI 與 skill policy 的確切變更。
- [ ] 選擇具許可與可驗證接入／投遞介面的 upstream pilot；provider 與 MCP／skill 各有驗收證據。
- [ ] 固定 package envelope／manifest、protocol 版本、大小／逾時／lease 與 OS 支援範圍。
- [ ] 固定 lifecycle step／receipt／required-action schemas、helper runner／最小 SDK owner 與實際支援 hooks。
- [ ] 固定 source lock／recipe schema、來源封存／mirror retention 與 archive／內容 hash 驗證規則。
- [ ] 確認 `cats-plugins` repo／產物 owner 與 catalog promotion 責任；尚不建立或發布。
- [ ] 若外部 process 所需權限無法符合接納政策，縮減支援範圍或更換 pilot。

*Last updated: 2026-09-28*

# PLAN-113: Managed Plugin Capabilities

## Metadata

| Field | Value |
| --- | --- |
| Status | Agency host pilot implemented and locally validated 2026-09-29; delivery CI separate |
| Owner | Platform integration；Runtime execution；待確認 Plugin artifact owner |
| Reviewer | Product owner；跨 repo 獨立 reviewer |
| Spec | [SPEC-121](../specs/SPEC-121-managed-plugin-capabilities.md) |
| Decision | [ADR-122](../decisions/122-adopt-managed-plugins-for-upstream-capabilities.md) |
| Related work | [PLAN-112](PLAN-112-app-market-and-lifecycle.md) 的 Apps lifecycle／catalog |

## Overview

2026-09-29 execution update（優先於下方原提案的未授權敘述）：已開始 Platform＋Runtime
獨立 worktree 實作。Producer 的固定 0.1.0 artifact 不變。

- [x] Pinned archive gate、原子 inventory／套件寫入、install/enable 分離。
- [x] Runtime authenticated management、lease/generation 與 source exposure。
- [x] Settings Plugins、Cat skill profiles、影響確認與 pending removal。
- [x] Conversation/native context 防止自動 replay 繞過撤銷；保留歷史。
- [x] 跨 repo integration、隔離 Candidate renderer 操作與獨立 review。
- [ ] 遠端交付與 CI（不代表 release）。

驗證範圍與候選操作依 [pilot guide](../managed-plugins-pilot.md) 記錄。

### 2026-09-29 validation evidence

- Platform：28 個不同 focused tests 通過（Plugin state/replay 5、既有 Settings／Apps 18、
  Candidate command 5）；server／Desktop／renderer／test TypeScript checks 通過。
- Runtime：47 個 focused tests 通過，涵蓋 HTTP skills、直接 child close、Windows host
  啟動取消、lease／generation／native rediscovery／fork reset；Runtime typecheck 通過。
- Windows 隔離 Candidate `candidate-managed-plugins-20260929-03` 完成 Runtime、Platform
  server、Desktop 及 renderer build。Launch ID
  `ac12449e8609876484e15b7ef61f14131c646773380b0b56a33a85a4894b8f87`；Platform source digest
  `081191d4a807b8540c4d72b737671580cf3038dc2ec713f6f31b8f18a1a6da83`，Runtime source digest
  `6090aca083e794196e5eef8b8a7658fec28b31bb9dc385782c60dc9fa325fccb`。後續文件更新不改程式。
- 原生視窗確認正常 first-run；同一 Candidate server 的隔離 Edge renderer 自動操作完成
  upload→install→enable→Runtime catalog 兩個 skills→Cat draft 選取→disable→remove。
  `plugin-ui-report.json` 為全部成功、renderer errors 0、model requests 0；截圖已檢視。
  沒有保存測試 Cat 或呼叫真實模型。Candidate 與兩個 sidecars 已確認 drained。
- 獨立唯讀 reviewer 複查撤銷／conversation replay／owned-process startup，修正後無剩餘
  actionable findings。完整遠端 CI 與跨 OS／真實模型驗收分開記錄，未宣稱已發布。

下方 P0–P4 保留完整產品規劃，尚未勾選的通用 SDK／provider／hooks／目錄工作仍未交付。
本輪授權限於上方 Agency content pilot；實驗成果不自動成為正式發布。

## Ownership and integration seams

| Owner | 交付 | 邊界 |
| --- | --- | --- |
| Platform | Plugin installer／inventory／Settings、來源政策、與 Runtime 的管理 client | 不自行呼叫 provider、解析上游 agent loop 或接管手動安裝項 |
| Runtime | versioned registration、execution／probe／selection、process／MCP／skill 生命週期 | 不 import Platform、不維護第二套 Desktop install 意圖 |
| 未來 cats-plugins | upstream pins／notices、build recipe、薄橋接、各 OS artifact／驗證 | 不複製 Runtime、不把外部核心實作改寫成 Cats 功能 |
| cats-apps | 既有 renderer Apps；共用基礎的相容驗證 | 不被迫接納任意背景 executor |
| cats-one | 決定新 repo 後才更新 workspace／release 文件 | 不充當 Plugin runtime 或目錄服務 |

本輪修改 Platform 與 Runtime 的隔離 worktree。Apps／cats-one 和既有 Plugin artifact
不變；兩個 host 均不 bump／publish。

## P0 — 選候選並固定契約

- [x] 記錄使用者方向：重用上游、可管理能力、獨立 provider 可能性、實驗與分發分開。
- [x] 查核 Apps／Runtime 現況與 OpenChatX／C2C 的呼叫方向，沒有安裝或連外執行。
- [x] 釘定 C2C revision 並完成[靜態接入評估](../research/2026-09-28-c2c-plugin-fit-evaluation.md)：
      完整 workflow 等待可用宿主／上游入口；bridge 子集仍未選定，沒有 live pilot 證據。
- [x] 完成 [Agency Agents 靜態評估](../research/2026-09-28-agency-agents-plugin-fit.md)：
      推薦少量角色作 skills-only pilot；來源／投遞／遷移契約及實際驗收尚未完成。
- [x] 補入生命週期／可選 hooks／最小 SDK 與無 release 上游的來源政策（SPEC-121 FR-09／10）；
      此項只記文件需求完成，wire schema、runner、SDK、artifact 與驗收仍未交付。
- [ ] 確認 ADR／SPEC 範圍，選第一個具清楚授權、可驗證接入／投遞介面的 upstream。
- [ ] 明列 Plugin 外部能力、Cats 薄橋接、現有 Runtime transport；若需重造核心功能就換候選。
- [ ] 選 MCP／skills 與 provider 的 pilot 證據；可同一 repo，但不能以 MCP 成功代替 provider。
- [ ] 在 Runtime owner repo 固定註冊／撤銷／租約／probe／skill delivery 的版本化契約與 fixtures，
      明列 registry factory、provider universe、config validator、selection 與 catalog 消費者的變更。
- [ ] 與 PLAN-112 固定共用 installer／catalog 範圍；不把未實作功能算成既有基礎。
- [ ] 固定 manifest kind／envelope／相容語法／bounded I/O、OS／arch、process 權限與 secrets 邊界。
- [ ] 固定 desired／observed 狀態與 journal、activation generation、lease 撤銷上限、崩潰調和、
      未支援 cancel 的處理；設計 migration／backup／atomic recovery fixtures。
- [ ] 固定 inspect／pre-post install／pre-post uninstall／update／repair phase，step identity、
      receipts、required-action／affected-session DTO、逾時與去重／補償／manual recovery。
- [ ] 固定 Platform installer writer 與 Runtime helper runner 的權限／資源契約、post-uninstall
      operation cache 與完整自有執行依賴／外部 prerequisite、最小 SDK owner；無 hook 的
      skills 套件必須可只靠共通 lifecycle 運作。
- [ ] 定義重新核對移除影響與 admission fence；CLI／Desktop restart 不作 clean-context 證據，
      明列舊 session resume／fork、新 context 與歷史保留契約。
- [ ] 固定 source lock＋recipe schema、完整 commit／內容 digest、submodule 一致性、LFS／
      外部下載依賴、toolchain／patch pin 與來源封存；無上游 release 也可產生 Cats 候選版本。
- [ ] 確認 artifact owner／repo；獨立 review 契約，記錄必要版本界線而不 bump／publish。

Exit：有可 review 的精確契約、來源選擇與 failure fixtures，沒有「包一下就自動可用」假設。
這個 gate 不依賴 ChatGPT Web adapter，也不授權對有疑慮服務進行 live automation。

## P1 — 本地封裝與 Runtime 接入

- [ ] 以 source lock 取得 upstream 精確 revision，建立不依賴上游 checkout 的 artifact、
      notices、digest 與薄橋接；skill 本文與授權要求的 source 仍隨包交付。
- [ ] 以 Agency 等純內容套件驗證無 hooks 路徑；最小 SDK／validator／fixtures 與受控 helper
      只實作已固定且需要的階段，未實作的 hook 明確拒絕，不宣稱全生命週期已支援。
- [ ] Platform 建立 Plugin kind validator／registry namespace，重用已落地的驗證與操作機制。
- [ ] Runtime 接受已驗證 descriptor，透過支援的 transport 註冊獨立 target／MCP／skills。
- [ ] 補齊 identity collision、相容性、auth setup、capability truth 與 ROI 准入。
- [ ] 驗證原有 Codex／其他 provider 設定不變，新安裝不自動選用或消耗模型額度。
- [ ] 用授權清楚的真實 pilot 完成任務／工具呼叫；fixture 與 upstream live evidence 分開記錄。

Exit：AC-01–AC-04、AC-13 安裝部分及 AC-16 來源封裝可驗證；SDK 支援矩陣明列。
若本階段只有 MCP／skill 成功，明列 provider 未完成，
不宣稱 adapter 分發已交付。不要求公開 catalog 或正式 Desktop 安裝。

## P2 — 撤銷、更新與恢復

- [ ] 停用立即拒絕新 work／tool／skill 准入，協調工作取消與 process／subscription ownership。
- [ ] 補齊 Runtime 失聯、lease 到期、重啟、重複／錯序回應、舊 generation 等情境。
- [ ] 移除先 revoke 再清理；限定 package／cache 路徑，保留設定、歷史、作品與 tombstone。
- [ ] 驗證共享服務／依賴與手動 MCP／skill 不受損，file locks／junction cleanup 可恢復。
- [ ] staged update／同版 repair／新增權限確認；活動工作只在使用者明確停止後切換。
- [ ] skill delivery 按來源撤銷，取消／標記既有 session 的受影響 turn，保留共享 provider／
      無關 session；殘留 context 不能在正式或重新啟用流程被視作乾淨。
- [ ] 驗證 hook 回應遺失、重試／逾時／crash、補償失敗、無法確認外部副作用；停止准入
      不被 pre-uninstall 失敗阻擋，post helper 在清檔後仍能由固定 operation cache 恢復。
      包含清主套件並重啟後的自有執行依賴、共享 prerequisite 缺失與 pending 恢復。
- [ ] 驗證先前 skill context 經 CLI／Desktop restart、resume／fork 仍受撤銷限制；新 context
      不重播已撤銷技能，歷史、手動 skills、共享 CLI 與無關 sessions 保留。
- [ ] 若改持久化 schema，執行驗證、備份、原子替換、失敗恢復與重跑測試。

Exit：AC-05–AC-08／AC-11、AC-13 卸載部分／AC-14 與 AC-15 Runtime 部分有故障注入
及真實 filesystem 證據；pending 狀態有恢復路徑。

## P3 — Desktop 與實驗政策

- [ ] Settings Plugins 的 inventory／詳情／setup／啟停／移除／修復共用管理 client。
- [ ] provider 仍由 Runtime catalog 投影；保留既有 picker continuity 與 selection 契約。
- [ ] 宿主表單呈現設定，正常流程用一般語言，來源／digest／log 放展開診斷。
- [ ] 操作前呈現受影響 Cat／session／工作與必要動作，執行前重新核對；可取消或確認停止
      並移除。分辨「設定未完成」「停止待確認」「移除待完成」及「舊對話需新 session」。
- [ ] required-action 可同時要求新 context、特定 owned service restart 或具理由的 Desktop
      restart；由宿主驗證／執行，不能讓 Plugin 自行終止共享程序或宣稱 context 已清除。
- [ ] 將 internal-experiment admission 綁定可信 build／profile policy，獨立於版本 channel。
- [ ] 驗證實驗 profile／套件複製到一般 Desktop、一般 preview 或 Runtime 重啟後均不能提升權限。
- [ ] 用隔離 Desktop 檢查多視窗更新、停止待確認、Runtime 離線與壞套件恢復。

Exit：AC-09／AC-10 與 AC-15 UI 部分通過；本地實驗可完整管理，仍未公開分發。

## P4 — 受控目錄與發布準備

- [ ] 接入共用 catalog trust／download 機制，分辨 App 與 Plugin schema／kind。
- [ ] Plugin pin、來源／revision、授權、使用介面適用性、OS 驗證與 withdrawal 可追溯。
- [ ] 封存已驗證來源、build receipt 與 Cats artifact；模擬原 repo／commit 不可取得與離線
      安裝，禁止退回 main。上游 source pin、Cats Plugin version 與 channel 分開管理。
- [ ] 相容版本選擇、手動更新、來源轉換確認與離線行為均不得擴張權限。
- [ ] 證明正式 catalog／Desktop bundle 不含 internal-experiment 內容，沒有自動 promotion。
- [ ] 完成所有 AC 對照與獨立 review；未驗證平台與能力逐項列出。
- [ ] 依新授權另安排 Runtime／Platform／Plugin artifact／catalog 發布，記錄精確版本與升級依賴。

Exit：AC-12 及完整跨 OS／宿主驗收有證據，產物可供發布審查；沒有發布授權就停在候選產物。

## Change map

| Surface | 預計工作 |
| --- | --- |
| Platform `src/platform/apps/` 與新 Plugin 管理模組 | 從已交付程式提取真正共用驗證／操作基礎；保留 App validator／executor |
| Platform Runtime client／host API／Settings | 版本化管理 DTO、inventory／setup／進度與 Runtime observed state |
| Runtime agent adapter registry／bootstrap／provider config | 外部 descriptor 的准入、collision、selection、目錄與 transport 接入 |
| Runtime managed execution／MCP／skills | 擁有者範圍、撤銷、租約／恢復與 skill provenance |
| Platform operation journal／Runtime helper runner | lifecycle phases／step receipts／required actions／post-cleanup cache／補償與恢復 |
| 最小 Plugin SDK（owner 待 P0 固定） | 協定 types／validator／transport helpers／無 hook 內容套件與故障 fixtures |
| 新 Plugin artifact collection | source lock／recipe／來源封存／必要薄橋接／notices／compatibility／各 OS 產物 |
| Desktop packaging／catalog consumer | internal-experiment policy、來源釘選與正式清單驗證 |

這是工作範圍，不宣稱存在 Plugin SDK、安裝格式或 REST endpoint。P0 先完成各 owner
契約與資料升級設計，再依最低影響範圍實作；不為提案先改通用核心程式。

## Testing strategy and risks

文件階段僅驗證 diff、連結與一致性。實作階段採 contract fixtures、隔離 HTTP／process、
filesystem fault injection 與真宿主驗收；全部測試資料位於暫存 profile。
artifact 成功 build 不代表 upstream 可用；MCP server 可用也不代表 provider turn 可執行。

| 風險 | 驗證／處理 |
| --- | --- |
| 接入變成重寫上游 | P0 列出上游入口與橋接差異；無適合入口就換候選 |
| 宣告有 provider 但只能提供工具 | AC-02 獨立提交任務與結果；不借 Codex 代跑 |
| 關閉 UI 卻仍可執行 | Runtime 准入撤銷、lease／恢復與停止證據 |
| 誤刪手動安裝或共用服務 | ownership receipts、path containment、引用與前後資料檢查 |
| 實驗流入正式版本 | build／profile policy、catalog／artifact inventory、skill context provenance |
| 獨立更新與舊 host 不相容 | host／Runtime／protocol 版本交叉 fixtures、拒絕未知 schema |
| 套件有開源授權但服務使用有疑慮 | 分別記錄 code license 與 service access；不把內測當豁免 |
| 任意 hook 或重試擴張權限／重複外部副作用 | 受驗證 helper、步驟 receipts、先 reconcile、unknown 保持 pending |
| 把重啟當作 skill 已清除 | 保留 exposure provenance，擋舊 context resume／fork，驗證新 context |
| 上游沒 release、ref 漂移或消失 | 完整 commit＋內容校驗＋Cats 封存來源與 artifact，不退回 main |

## Progress log and resume checkpoint

2026-09-28：已在 `cats-platform-plugins-proposal` worktree 的 `docs/managed-plugins-proposal`
分支建立 ADR／SPEC／PLAN 與研究依據，補既有提案關係與索引。
沒有產品程式、manifest、使用者資料、版本或其他 repo 的變更。
沒有執行上游安裝、登入、provider 呼叫、build 或發布。所有新增能力的 AC 仍未執行。

文件驗證：16 份變更／新增 Markdown 的 1,073 個本機連結目標皆存在；新增文件的 LF、
結尾換行、whitespace 與編號唯一性通過，`git diff --check` 通過。Platform 原本 main
工作目錄與 Runtime 工作目錄乾淨。沒有執行產品測試，文件檢查不替代功能驗收。

獨立唯讀審查已完成：已釐清 skill 撤銷時 Plugin-owned resource 與既有 session 的受影響
turn／context 邊界，補 AC-08 與 P2，回讀確認無剩餘阻擋項目。精確 schema／協定／lease
與 OS enforcement 仍是 P0 待固定的設計，不記作已實作。

2026-09-28 follow-up：依使用者「開始」指示，在 `cats-platform-c2c-evaluation` worktree／
`research/c2c-plugin-fit` 分支，釘定 C2C `9663b88753e35c76796c5bce000293e0bd22cd9e`
並完成靜態 source 評估。Platform baseline 為已合併 PR #160 的 `55445aaf`，Runtime
baseline 為 `73f9def9`。C2C 目前缺 Cats 可用的 browser host／task controller，且原版
skill 更新／全域設定及程序停止語意需 managed 適配；不選為首個完整 workflow pilot。
bridge-only 有可封裝入口，但需另確認產品價值，尚未 build、安裝、啟動或驗證。
新增研究與索引，沒有改 ADR／SPEC 狀態、產品程式、版本、使用者設定或其他 repo。

本輪驗證：5 份 Markdown 的 309 個本機連結目標皆存在；新研究的 20 個 immutable
source links 對照本機 pinned checkout 的路徑／行號有效。LF、結尾換行、whitespace 與
diff 檢查通過。獨立唯讀 review 確認 skill Plugin／獨立 provider 的判定未混淆、
bridge-only 未過度承諾，沒有剩餘阻擋項目。沒有執行產品或上游測試；此為文件與靜態
來源驗證，未證明 build／實際宿主相容性或完成整個 dependency license audit。

2026-09-28 Agency follow-up：C2C 評估 PR #161 已以 auto-merge 合併為 `dec5af9b`，
CI required checks 通過。另在 `cats-platform-agency-evaluation` worktree／
`research/agency-plugin-fit` 分支，以此 commit 為 Platform baseline 評估 Agency Agents。
使用者既有 reference pin 為 `00fb28a4`，另取目前上游 `479193dc` 做靜態查核；兩者均未修改。
確認上游已有 SKILL.md converter，推薦 Code Reviewer／UX Researcher 為小型內容 Plugin
候選，未執行 converter／installer、未建立可安裝產物。Cats 33 個 release／36 個含 preview
skills 目前為 Runtime 自有內容；抽樣與上游不等價，不能視為可全數直接替換的 port。
下一步契約工作需明列 Runtime ADR-018／SPEC-013 的來源邊界擴充、collision／provenance／
撤銷與既有 skill refs 的遷移原則；本輪未改其 accepted 狀態，亦未進入 P1。

Agency 文件驗證：4 份 Markdown 的 301 個本機連結目標及新研究 9 個 pinned source
連結路徑有效；LF、結尾換行、whitespace 與 diff 檢查通過。獨立唯讀 review 已完成，
依建議釐清 Platform 為 installer writer，並移除標題對歷史 port 的預設。
本輪沒有產品程式／Runtime 文件變更，沒有執行產品測試、上游 scripts 或模型品質評估。

2026-09-28 lifecycle／source follow-up：依使用者要求補入 ADR-122、SPEC-121 FR-09／10
與本 PLAN 的 P0–P4。新增 AC-13–AC-16，明列 Platform 編排／Runtime helper 執行、
有界可選 hooks、無 hooks 內容套件、session 影響確認／准入 fence、新 context 恢復、
step receipts／去重／補償，以及 post-uninstall 所需完整自有執行依賴的保留。
來源預設為 source lock＋recipe；Submodule 可選且須一致性驗證，上游沒有 release
可選完整 commit，再以獨立 Cats 版本／channel 發布。沒有建立 cats-plugins repo、
SDK、source lock 實例或 artifact，沒有安裝／執行上游或改 Runtime／產品程式與版本。

文件驗證：5 份 Markdown 的 265 個本機連結目標有效，FR-01–FR-10／AC-01–AC-16
唯一且齊全；LF、結尾換行、whitespace 與 diff 檢查通過。獨立 review 指出的
post-uninstall 執行依賴保留缺口已補入 FR-09、AC-14 與 P0／P2；回讀確認無剩餘阻擋項目。
來源取得敘述已查核 Git／GitHub 官方文件。純文件改動未執行產品 tests／build，
所有新增功能 AC 仍未執行。

2026-09-28 implementation authorization：使用者要求先送出本規劃 PR，再直接建立
`cats-plugins`，透過 project-bootstrap 初始化，直接 commit／push main，並採 Agency
Agents 為首個 MVP。下一步交付 producer repo、固定來源、兩角色封裝、校驗、文件與 CI；
在 cats-plugins 自有 ADR／SPEC／PLAN 記錄精確實作及證據。Desktop／Runtime 完整接入、
新 provider、模型品質驗收與正式發布仍未交付，不把 producer 成功算作本 PLAN 全部完成。

*Last updated: 2026-09-28*

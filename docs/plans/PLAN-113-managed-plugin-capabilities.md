# PLAN-113: Managed Plugin Capabilities

## Metadata

| Field | Value |
| --- | --- |
| Status | Draft sequencing proposal; documentation only; implementation not started |
| Owner | Platform integration；Runtime execution；待確認 Plugin artifact owner |
| Reviewer | Product owner；跨 repo 獨立 reviewer |
| Spec | [SPEC-121](../specs/SPEC-121-managed-plugin-capabilities.md) |
| Decision | [ADR-122](../decisions/122-adopt-managed-plugins-for-upstream-capabilities.md) |
| Related work | [PLAN-112](PLAN-112-app-market-and-lifecycle.md) 的 Apps lifecycle／catalog |

## Overview

先確認能力與上游接入方式，再固定 Platform／Runtime 契約，用隔離的本地套件打通生命週期，
最後接入 Desktop 與受控目錄。各階段是提議的依賴順序，未取得實作授權；建立本 PLAN
不代表 SPEC 已批准。實驗成果不自動成為正式發布。

## Ownership and integration seams

| Owner | 交付 | 邊界 |
| --- | --- | --- |
| Platform | Plugin installer／inventory／Settings、來源政策、與 Runtime 的管理 client | 不自行呼叫 provider、解析上游 agent loop 或接管手動安裝項 |
| Runtime | versioned registration、execution／probe／selection、process／MCP／skill 生命週期 | 不 import Platform、不維護第二套 Desktop install 意圖 |
| 未來 cats-plugins | upstream pins／notices、build recipe、薄橋接、各 OS artifact／驗證 | 不複製 Runtime、不把外部核心實作改寫成 Cats 功能 |
| cats-apps | 既有 renderer Apps；共用基礎的相容驗證 | 不被迫接納任意背景 executor |
| cats-one | 決定新 repo 後才更新 workspace／release 文件 | 不充當 Plugin runtime 或目錄服務 |

本輪只在 Platform worktree 建立提案與索引。Runtime／Apps／cats-one 的 source、文件與
版本均不變；採納後才在各 owner repo 開對應 worktree 與必要 ADR／SPEC／PLAN。

## P0 — 選候選並固定契約

- [x] 記錄使用者方向：重用上游、可管理能力、獨立 provider 可能性、實驗與分發分開。
- [x] 查核 Apps／Runtime 現況與 OpenChatX／C2C 的呼叫方向，沒有安裝或連外執行。
- [ ] 確認 ADR／SPEC 範圍，選第一個具清楚授權、可機器呼叫的 upstream。
- [ ] 明列 Plugin 外部能力、Cats 薄橋接、現有 Runtime transport；若需重造核心功能就換候選。
- [ ] 選 MCP／skills 與 provider 的 pilot 證據；可同一 repo，但不能以 MCP 成功代替 provider。
- [ ] 在 Runtime owner repo 固定註冊／撤銷／租約／probe／skill delivery 的版本化契約與 fixtures，
      明列 registry factory、provider universe、config validator、selection 與 catalog 消費者的變更。
- [ ] 與 PLAN-112 固定共用 installer／catalog 範圍；不把未實作功能算成既有基礎。
- [ ] 固定 manifest kind／envelope／相容語法／bounded I/O、OS／arch、process 權限與 secrets 邊界。
- [ ] 固定 desired／observed 狀態與 journal、activation generation、lease 撤銷上限、崩潰調和、
      未支援 cancel 的處理；設計 migration／backup／atomic recovery fixtures。
- [ ] 確認 artifact owner／repo；獨立 review 契約，記錄必要版本界線而不 bump／publish。

Exit：有可 review 的精確契約、來源選擇與 failure fixtures，沒有「包一下就自動可用」假設。
這個 gate 不依賴 ChatGPT Web adapter，也不授權對有疑慮服務進行 live automation。

## P1 — 本地封裝與 Runtime 接入

- [ ] 以 upstream 精確 revision／版本建立 source-free artifact、notices、digest 與薄橋接。
- [ ] Platform 建立 Plugin kind validator／registry namespace，重用已落地的驗證與操作機制。
- [ ] Runtime 接受已驗證 descriptor，透過支援的 transport 註冊獨立 target／MCP／skills。
- [ ] 補齊 identity collision、相容性、auth setup、capability truth 與 ROI 准入。
- [ ] 驗證原有 Codex／其他 provider 設定不變，新安裝不自動選用或消耗模型額度。
- [ ] 用授權清楚的真實 pilot 完成任務／工具呼叫；fixture 與 upstream live evidence 分開記錄。

Exit：AC-01–AC-04 的本地路徑可驗證。若本階段只有 MCP／skill 成功，明列 provider 未完成，
不宣稱 adapter 分發已交付。不要求公開 catalog 或正式 Desktop 安裝。

## P2 — 撤銷、更新與恢復

- [ ] 停用立即拒絕新 work／tool／skill 准入，協調工作取消與 process／subscription ownership。
- [ ] 補齊 Runtime 失聯、lease 到期、重啟、重複／錯序回應、舊 generation 等情境。
- [ ] 移除先 revoke 再清理；限定 package／cache 路徑，保留設定、歷史、作品與 tombstone。
- [ ] 驗證共享服務／依賴與手動 MCP／skill 不受損，file locks／junction cleanup 可恢復。
- [ ] staged update／同版 repair／新增權限確認；活動工作只在使用者明確停止後切換。
- [ ] skill delivery 按來源撤銷，取消／標記既有 session 的受影響 turn，保留共享 provider／
      無關 session；殘留 context 不能在正式或重新啟用流程被視作乾淨。
- [ ] 若改持久化 schema，執行驗證、備份、原子替換、失敗恢復與重跑測試。

Exit：AC-05–AC-08／AC-11 有故障注入與真實 filesystem 證據；pending 狀態有恢復路徑。

## P3 — Desktop 與實驗政策

- [ ] Settings Plugins 的 inventory／詳情／setup／啟停／移除／修復共用管理 client。
- [ ] provider 仍由 Runtime catalog 投影；保留既有 picker continuity 與 selection 契約。
- [ ] 宿主表單呈現設定，正常流程用一般語言，來源／digest／log 放展開診斷。
- [ ] 將 internal-experiment admission 綁定可信 build／profile policy，獨立於版本 channel。
- [ ] 驗證實驗 profile／套件複製到一般 Desktop、一般 preview 或 Runtime 重啟後均不能提升權限。
- [ ] 用隔離 Desktop 檢查多視窗更新、停止待確認、Runtime 離線與壞套件恢復。

Exit：AC-09／AC-10 通過；本地實驗可完整管理，仍未公開分發。

## P4 — 受控目錄與發布準備

- [ ] 接入共用 catalog trust／download 機制，分辨 App 與 Plugin schema／kind。
- [ ] Plugin pin、來源／revision、授權、使用介面適用性、OS 驗證與 withdrawal 可追溯。
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
| 新 Plugin artifact collection | upstream recipe／必要薄橋接／notices／compatibility／各 OS 產物 |
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

下一個工程階段為 P0，需先確認提案與候選；不要因本文件存在就開始實作 ChatGPT adapter、
建立遠端 repo 或發布 Plugin。

*Last updated: 2026-09-28*

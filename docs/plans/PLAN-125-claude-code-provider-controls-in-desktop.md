# PLAN-125: Claude Code Provider Controls in Desktop

## Metadata

| Field | Value |
| --- | --- |
| Status | 實作完成；真實 Claude Code 驗收通過，Chrome 實際瀏覽器操作尚未驗證 |
| Owner | Platform shared interaction、Desktop integration |
| Assigned To | Claude |
| Reviewer | Product owner、Runtime maintainers |
| Related spec | [SPEC-132 § Claude Code](../specs/SPEC-132-provider-session-interactions-and-capability-visibility.md#claude-code-2026-10-28) |
| Runtime contract | Runtime SPEC-039 R8；PLAN-050 P1–P4（#196–#200） |

## Overview

Owner 於 2026-10-28 確認目前的 Desktop 無法使用 Claude in Chrome，並授權開 worktree 切 slice 實作。
Runtime 已在 #196–#199 接上 Claude Code 的原生批准、提問、MCP 表單、執行政策與工具清單，
#200 再加上 session 層級的 `browserIntegration`（Claude in Chrome 的 `--chrome`）。
本計畫讓 Desktop 消費這些契約，沿用 PLAN-124 的互動引擎、卡片與設定入口，不另建一套。

本授權不含版本 bump 或發布。Desktop 從 Runtime checkout 打包，`desktop-release.yml`
的 `runtime_ref` 預設為 main；下一次 Desktop 建置需包含 Runtime #200 的合併 commit。

## Non-Goals

- Windows 上的 Claude computer use：Claude Code 只開放給 macOS 互動 session，Runtime 回報 `unavailable`。
- 修改使用者自己的 Claude Code 設定（例如 `/chrome` 的 Enabled by default）或 `providers.yaml`。
- Codex helper 的可用性；那是 PLAN-124 記錄的上游環境限制。

## Implementation Phases

### P1 — 契約更新與 `tool_approval` 卡片

- [x] 共用契約對齊 Runtime `043155a1`：`INTERACTION_KINDS` 加入 `tool_approval`，
  inventory 的 `builtins` 擴充為 `not_exposed_by_provider | not_observed | observed` 並帶 `builtinTools`。
- [x] provider discovery 解析 `sessionCapabilities.admissibleCeilings`，無效項目被丟棄（fail closed）。
- [x] `PLATFORM_INTERACTION_HOST` 與 target 宣告取交集，Claude 對話因此協商 `tool_approval`；
  既有通用卡片顯示工具、MCP server、輸入摘要與「允許一次／本工作階段允許」。
- [x] 互動 binding 帶 lease 的 provider；工作階段詳情列出內建工具，設定連結依 provider 分開
  （Codex 插件文件／Claude in Chrome 文件，未知 provider 不顯示）。

**Exit:** Claude 對話的 MCP 與 Chrome 工具呼叫在 on-request 政策下變成同 turn 卡片，不再因未協商而被拒絕。

### P2 — 權限上限提示

- [x] runtime client 在送出前依 target 的 `admissibleCeilings` 拒絕上限外的政策（create 與 resume），
  錯誤沿用 `provider_policy_unsupported`，訊息列出 target 可強制的上限。
- [x] 政策編輯器在選擇較窄的上限時提示 Claude Code 只能以「完整存取＋網路」執行。草稿可同時包含
  不同 provider 的 Cat，編輯器不知道最終 target，因此以提示呈現，不替 Codex 隱藏可用選項。

### P3 — Claude in Chrome 偏好

- [x] Settings > Runtime 提供預設關閉的 Claude in Chrome 開關，存於 platform preferences 的
  `claudeInChromeEnabled`。讀寫走 `/api/provider-interactions/preferences`，與原生控制相同，
  只接受本機 owner/admin 的 browser session；一般 preferences 路由不能改它，資料重設會恢復關閉。
  舊版忽略此欄位只代表不載入 Chrome，不會擴權，因此不需要資料格式升級。
- [x] 組合層的 wrapper 位於 Work admission wrapper 之外：只有呼叫端自己帶互動 host 的 Chat／Code
  對話會要求 `browserIntegration: true`；client 只在 host 已協商且 target 宣告支援時送出。
  Work 監督／排程與 relay 執行不送，關閉時不送（保留使用者自己的 Claude Code 預設）。
- [x] 說明文字：變更只影響新 session 或下一次 worker 啟動；哪些瀏覽器動作需要核准由 Claude Code 與
  擴充決定（P4 實測讀取分頁的工具不詢問），完整存取（skip）會略過 Claude Code 的詢問。
  共用契約 pin 更新為 Runtime `b750d27e`（#200）。

### P4 — 驗收

- [x] Focused Node／renderer 測試、受影響 typecheck 與 build（各片 progress log）。
- [x] 以隔離 state 透過真實 `CatsRuntimeClient` 與 Claude Code 驗證 `tool_approval` 往返與
  `--chrome` 載入；Chrome 實際操作需 owner 開啟瀏覽器並同意後才進行，本次未進行。

## Testing Strategy and Risks

優先使用 scripted Runtime fixtures 與 DOM tests。風險：把 Chrome 帶進無人監看的 Work／排程執行；
在 Claude target 上提供它無法強制的權限上限；把 Codex 的設定連結顯示在 Claude session。
P2／P3 分別以 admission 測試與 session create payload 測試覆蓋。

## Progress Log

| Date | Update |
| --- | --- |
| 2026-10-28 | P1：契約對齊 Runtime `043155a1`、`tool_approval` 協商與卡片 DOM 測試、admissible ceilings 解析、內建工具清單與 provider 專屬設定連結。15 項 client／renderer、26 項 product／control／policy upgrade／raw-string audit 測試通過；server build 與 renderer typecheck 通過。 |
| 2026-10-28 | P2：client 端 ceiling 拒絕（不送出 `/sessions`）與編輯器提示。16 項 client／renderer 測試通過，含 explicit workspace-write、provider 離線上限被拒與 full-access＋網路通過。 |
| 2026-10-28 | P3：Claude in Chrome 偏好、本機 owner 路由、對話限定的 `browserIntegration` 與 Settings 開關。新增 3 項 Node（client 轉送、wrapper 範圍、路由權限與持久化）及 1 項 DOM 測試；更新 3 個 preferences 完整形狀 fixture。39 項 control／client／products／policy／ingress／raw-string 測試、60 項 preferences／setup／reset／preview 測試、8 項 renderer 測試通過；server／renderer／desktop／test typecheck 與 catalog check 通過。 |
| 2026-10-28 | P4：Claude Code 2.1.312（haiku）、Runtime 原始碼 `b750d27e`（#200）以私有暫存 `CATS_RUNTIME_DIR` 啟動，Claude Code 使用 owner 自己的登入；經 Platform `CatsRuntimeClient` 與對話 wrapper（偏好開啟），explicit full-access／網路／on-request。結果：discovery 宣告 `tool_approval`、`admissibleCeilings` 與 `browserIntegration`；workspace-write 政策在 client 端被拒且未送出 `/sessions`；WebFetch 產生 `tool_approval`，接受後同 turn 完成；工作階段 policy `verified`（回報 `default`、reviewer `user`）、`claude-in-chrome` 已連線（22 個工具）、34 個內建工具、browser `unknown`、computer use `unavailable`；偏好關閉的工作階段沒有 `claude-in-chrome`（browser `unavailable`）。`tabs_context_mcp` 沒有送出核准請求就執行，因擴充未連線而失敗；當時沒有 Chrome／Edge 程序，未觸及瀏覽器。尚未驗證：連線的瀏覽器中實際的 Chrome 動作與其網站核准呈現。 |

*Created / last updated: 2026-10-28*

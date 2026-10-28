# PLAN-125: Claude Code Provider Controls in Desktop

## Metadata

| Field | Value |
| --- | --- |
| Status | 進行中；P1 實作完成，P2–P4 待實作 |
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

- [ ] 政策編輯器依所選 target 的 `admissibleCeilings` 限制或標示選項；Claude 只能選「完整存取＋網路」。
- [ ] runtime client 在送出前拒絕上限外的政策，錯誤沿用 `provider_policy_unsupported`。

### P3 — Claude in Chrome 偏好

- [ ] Settings 提供預設關閉的 Claude in Chrome 開關，存於 platform preferences。
- [ ] 只有協商互動 host 的 Chat／Code 對話，在 target 宣告 `browserIntegration` 時送出 `true`；
  Work 監督／排程與 relay 執行不送，關閉時不送（保留使用者自己的 Claude Code 預設）。
- [ ] 說明：變更只影響新 session 或下一次 worker 啟動；`skip`（完整存取）對話的 Chrome 動作不會詢問。

### P4 — 驗收

- [ ] Focused Node／renderer 測試、受影響 typecheck 與 build。
- [ ] 以隔離 state 透過真實 `CatsRuntimeClient` 與 Claude Code 驗證 `tool_approval` 往返與
  `--chrome` 載入；Chrome 實際操作需 owner 開啟瀏覽器並同意後才進行。

## Testing Strategy and Risks

優先使用 scripted Runtime fixtures 與 DOM tests。風險：把 Chrome 帶進無人監看的 Work／排程執行；
在 Claude target 上提供它無法強制的權限上限；把 Codex 的設定連結顯示在 Claude session。
P2／P3 分別以 admission 測試與 session create payload 測試覆蓋。

## Progress Log

| Date | Update |
| --- | --- |
| 2026-10-28 | P1：契約對齊 Runtime `043155a1`、`tool_approval` 協商與卡片 DOM 測試、admissible ceilings 解析、內建工具清單與 provider 專屬設定連結。15 項 client／renderer、26 項 product／control／policy upgrade／raw-string audit 測試通過；server build 與 renderer typecheck 通過。 |

*Created / last updated: 2026-10-28*

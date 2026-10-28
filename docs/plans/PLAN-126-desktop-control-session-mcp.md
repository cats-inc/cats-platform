# PLAN-126: Desktop Control Session MCP

## Metadata

| Field | Value |
| --- | --- |
| Status | Planned；未授權實作 |
| Owner | Platform Desktop integration |
| Assigned To | Unassigned |
| Reviewer | Product owner、Runtime maintainers |
| Related spec | [SPEC-133](../specs/SPEC-133-desktop-control-session-mcp.md) |
| Decision | [ADR-141](../decisions/141-host-a-consented-desktop-control-mcp-for-provider-sessions.md) |

## Overview

依 ADR-141 與 SPEC-133，先交付階段 A（觀察），真機驗收通過並經 owner 確認後，
才開始階段 B（操作）。沿用既有的 session MCP 貢獻機制、`cat-image-tools` 的
endpoint 模式、`windows-stt` 的原生 helper 打包方式，以及 PLAN-124／PLAN-125 的
互動卡片與能力面板，不另建平行機制。本計畫不含版本 bump 或發布。

## Implementation Phases

### P0 — 契約凍結

- [ ] 凍結階段 A 工具的 input／output schema、錯誤代碼與給模型的說明文字。
- [ ] 凍結 helper protocol（DC-14）與 `hello` 的版本／protocol 欄位。
- [ ] 確認 Runtime SPEC-039 的 policy 回報中，判斷 DC-04 所需的欄位與值；記錄
  Claude Code 與 Codex 的實際回報。
- [ ] 定出 DC-10 排除清單的比對方式（可執行檔名稱加簽章發行者）與測試案例。
- [ ] 確認判斷 DC-05「本機 owner 回合」所需的資訊在 send 路徑上都拿得到。

**Exit:** schema、protocol、排除清單與注入判斷都有 fixture，owner 確認。

### P1 — Helper（觀察）

- [ ] 建立 `desktop/native/windows-desktop-control/`，實作 `hello`、`resolve_apps`、
  `list_windows`、`capture_window`（Windows Graphics Capture，`PrintWindow` 備援）、
  `read_ui`、`open_app`、`state`、`cancel`。
- [ ] 實作排除清單、UIPI 檢查、per-monitor DPI v2、鎖定偵測（DC-13）。
- [ ] 接入 `build-desktop-installer.mjs`、簽章與 `verify-desktop-licenses.mjs`。
- [ ] Helper 自身的測試：解析、排除、protocol 錯誤、遮擋視窗的擷取（A4）。

**Exit:** helper 單獨在 Windows 上通過 A4 與 A6 的 helper 部分。

### P2 — Platform server

- [ ] 全域設定與每對話開關（DC-02、DC-03）。
- [ ] Helper supervisor：延遲啟動、閒置結束、崩潰重啟上限（DC-16）。
- [ ] `/api/internal/desktop-control/mcp` endpoint 與 `isInternalPlatformRoute`（DC-07）。
- [ ] `cats-desktop` contributor 與 `sessionMcpServerName` 的 `desktop` 分支；注入與回合
  判斷（DC-04、DC-05）。
- [ ] 授權請求與記憶體授權表（DC-08、DC-09）。
- [ ] 記錄去敏感（DC-17）。
- [ ] 以 fake helper 測試 A1～A3、A8 的後端部分。

**Exit:** 後端測試通過；ingress 無法存取 endpoint 的測試通過。

### P3 — Renderer 與 Desktop host

- [ ] 設定頁開關與不可用原因。
- [ ] 對話內的啟用開關與授權卡；授權卡不與 provider 互動卡共用回覆路徑。
- [ ] 能力面板的「Cats 桌面控制」列（DC-18）。
- [ ] Desktop host 傳入 `CATS_DESKTOP_CONTROL_HELPER`；系統匣狀態與停止選項（DC-12）。

**Exit:** UI 測試與 isolated Desktop smoke 通過。

### P4 — 階段 A 真機驗收

- [ ] 在 Windows 真機上以真實 Claude Code 跑 A1～A6、A8；Codex 確認 image content（Open Questions）。
- [ ] 記錄 Defender 結果、實際截圖與 UIA 輸出的樣本（去敏感），以及未通過的項目。

**Exit:** owner 確認階段 A 的同意介面可用，並授權開始階段 B。

### P5 — 階段 B（操作）

- [ ] Helper 加入 `click`、`invoke`、`type`、`key`、`scroll`、`clipboard_read`、
  `clipboard_write`，移植 PR #336 的防護。
- [ ] Owner 正在操作時暫停、控制中狀態與置頂提示（DC-11）。
- [ ] 對應的 MCP 工具與防護 fixture；用一次性測試視窗的真機驗收（A7）。

**Exit:** A7 通過並記錄；未通過的項目照實寫明。

## Validation

依 [AGENTS.md: Local Validation Scope](../../AGENTS.md#local-validation-scope) 執行，
每個 slice 記錄實際跑過的檢查與結果；完整 CI 仍是合併前的閘門。真機驗收與
fixture 測試證明的東西不同，報告時分開寫。

*Created: 2026-10-29. Planned; implementation not authorized.*

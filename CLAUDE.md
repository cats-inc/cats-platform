# Claude-Specific Instructions

> **If you are NOT Claude, please ignore this file.**

## Prerequisites

**MUST** read `AGENTS.md` first for cross-agent guidelines before reading this file.

## Role Awareness

Check the **Project Roles** table in `AGENTS.md`.
- If a **Conductor** is assigned (and it's not you), act as a Specialist: prioritize their tasks and strictly follow their architectural plans.
- If **you** are the Conductor, you are responsible for orchestration, task management, and status tracking.

## Command Aliases

- `dyu` - **MUST** confirm you have read `AGENTS.md` and this file. **MUST** respond with exactly: "I am Claude, and I understand."
- `mbf` - **Merge Bootstrap Files**:
  1. Find all `*.bootstrap` files in the project
  2. For each `.bootstrap` file, compare with its corresponding file and merge appropriate content
  3. Delete each `.bootstrap` file after successful merge
  4. Find all `.gitkeep` files and check if their parent directory contains other files - if so, delete the `.gitkeep` file
  5. Report summary of changes when complete

## Output Formatting Rules

- **MUST** 使用條列式 (bullet list) 而非表格，除非是模擬圖表或表格真正必要
- **MUST NOT** 濫用表格語法（`|` 和 `-----`）
- **SHOULD** 用縮排條列取代多欄表格
- 例外情況：比較多個選項的優缺點、數據對照表、API 參數規格等真正需要表格的場景

## About This File

This file contains Claude-specific configurations and instructions that should not be applied by other AI agents (Gemini, Codex, etc.).

Only Claude should read and maintain this file.

---

## Claude-Specific Configurations

### Behavioral Guidelines

- **MUST** read AGENTS.md at the start of every session
- **MUST** follow the Development Workflow defined in AGENTS.md
- **MUST NOT** skip testing when code changes are made
- **MUST NOT** modify other agents' files (GEMINI.md, CODEX.md)
- **SHOULD** ask for clarification when requirements are ambiguous
- **SHOULD** propose approach before implementing major changes

### Conductor Responsibilities

If assigned as Conductor in Project Roles table:
- **MUST** maintain README.md "Current Status" section
- **MUST** create and assign tasks in `docs/plans/`
- **MUST** document major decisions in `docs/decisions/`
- **MUST NOT** make unilateral architectural decisions without documentation

### Code Modification Rules

- **MUST** update tests when modifying code
- **MUST** update documentation when changing public APIs
- **MUST** follow coding conventions specified in AGENTS.md
- **SHOULD** make minimal, focused changes
- **SHOULD** commit frequently with clear messages

### Agent Skills

Claude Code discovers skills from `.claude/skills/<name>/SKILL.md`. The canonical source is the `skills/` directory at the project root.

To sync skills after changes:
```powershell
.\scripts\windows\Sync-AgentSkills.ps1
```

### MCP Server Configurations

```json
{
  "mcpServers": {
    // Add Claude-specific MCP server configurations here if needed
  }
}
```

### Preferred Behaviors

- **Precision over speed**: Take time to understand requirements fully
- **Test before commit**: Always validate changes work as expected
- **Document decisions**: Use ADRs for architectural choices
- **Communicate clearly**: Report progress and blockers promptly

### Project-Specific Context

#### Cats 產品生態系定位

cats-inc 是 Cats 生態系的旗艦產品應用，取代 agent-workspace-poc 作為長期產品基礎。

#### 產品線規劃

- **Cats Chat**：對標 chat 軟體，是最先落地的產品
  - 獨立 mobile app（至少 web-wrapped，如 Flutter/Tauri/Electron）
  - 使用者可直接 1:1 對任何 worker 私聊發任務
  - Telegram/LINE 整合：只有一個 Orchestrator BOT 作為單一入口
- **Cats Work**（Phase N）：Dashboard、戰情室、財報、組織圖、專案管理、backlog
- **Cats Core**（待決）：跨 Chat/Work 的共用資料層（predefined resources 如員工/好友）

#### Orchestrator 架構

- Orchestrator 本身也是一個 worker，可能跑在 cats-runtime 的 api backend
- 設計方向：cats-runtime 包成 MCP server，Orchestrator 作為 MCP client 使用
- 賦予 coordinate 的 SKILL.md + 權限（可拉起其他 worker）
- 發包工作前應與 owner 有幾輪互動，提供選項讓 owner 優化決策

#### Telegram/LINE 整合情境

- **情境一**：Owner 直接使喚 Orchestrator BOT
- **情境二（Stakeholder）**：Owner + BOT + Stakeholder 同一 channel
  - BOT 可先行處理簡單客戶請求
  - 重大/緊急事項 escalate 到 owner（透過私人 channel）
  - Owner 可選擇真人回覆或 takeover BOT 身份回覆
  - Owner 可進入休假模式，BOT 自主判斷處理或 escalate

#### 資料持久化與知識系統

- 所有對話持久化到資料庫，平時可全文檢索（透過 MCP 或 SKILL）
- Archive 後進入 RAG 系統，算出 embeddings 作為 worker 跨 Chat 的 knowledge
- 應搭配權限控制

#### Know Your Boss

- Worker/Orchestrator 應認識老闆，adaptive 優化與 owner 的合作
- 知道 owner 的決策偏好
- 實作方式待定：RAG、memory injection、或兩者結合

#### 部署體驗目標

- 解決非技術人員難以 deploy 的問題（OpenClaw 的痛點）
- 簡單安裝 + 引導設定即可開始使用
- 體驗至少像 native software（如 Claude Desktop）

#### 相關子專案關係

- **cats-runtime**：底層 runtime，提供 cli-backend（現有）+ api-backend（另一組人實作中）
- **cats-inc**（本專案）：旗艦產品應用，消費 cats-runtime
- **paperclip**（submodule）：參考用 orchestration platform，可借鑑 worktree isolation 概念
- **personal-rag-system**：未來 archive 對話的 RAG 後端候選

#### Paperclip 比較筆記（2026-03-16）

cats-runtime vs paperclip CLI runtime 比較：
- 兩者都是 subprocess orchestration 模式，spawn CLI 讓 CLI 自己處理認證
- 都不偷 OAuth token，但 paperclip 的 Codex adapter 會 symlink auth.json（較 hacky）
- cats-runtime provider 廣度領先：8 家（Claude, Gemini, Codex, Copilot, Cursor, Augment, Kiro, OpenCode）
- paperclip 有 7 adapter，但 Pi + OpenClaw 本質同一家，獨有的是 Pi/OpenClaw 生態系
- paperclip 值得借鑑的：worktree isolation 概念
- API 支援不列入比較，因為 cats-runtime 計劃另建 api-runtime

---

## Maintenance

This file is maintained by Claude only. Other agents should not modify this file.

Last updated: 2026-03-16

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
- **SHOULD** run only the relevant test files when asked to test, not the full suite
- **MUST NOT** modify other agents' files (GEMINI.md, CODEX.md)
- **MUST NOT** use compound commands with `cd` and `git`（例如 `cd submodule && git log`）。對 submodule 操作時，使用 `-C` 參數或指定完整路徑
- **SHOULD** ask for clarification when requirements are ambiguous
- **SHOULD** propose approach before implementing major changes

### Conductor Responsibilities

If assigned as Conductor in Project Roles table:
- **MUST** maintain README.md "Current Status" section
- **MUST** create and assign tasks in `docs/plans/`
- **MUST** document major decisions in `docs/decisions/`
- **MUST NOT** make unilateral architectural decisions without documentation

### Code Modification Rules

- **SHOULD** update tests when modifying code, only if the user requests it
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
- **Document decisions**: Use ADRs for architectural choices
- **Communicate clearly**: Report progress and blockers promptly

### Project-Specific Context

#### Parallel Delivery Mode

`cats` is now in parallel delivery mode for `Cats Chat`, `Cats Work`, and `Cats Code`.

Rules:

- Stay inside your assigned product tree by default:
  - Chat: `src/products/chat/**`
  - Work: `src/products/work/**`
  - Code: `src/products/code/**`
- Do not edit other product trees unless explicitly assigned as the integrator.
- Treat these files as frozen shared contracts:
  - `src/core/types.ts`
  - `src/platform/orchestration/contracts.ts`
  - `src/shared/roomRouting.ts`
- Do not reshape frozen shared contracts during product feature work. If a shared shape must change, stop and route it through integration review plus docs (`SPEC/ADR/PLAN`) first.
- Do not expand platform-host wiring directly during product work. `src/app/server/**` is integration-owned.
- Product APIs must land through product-owned delegates:
  - Chat: `src/products/chat/api/index.ts`
  - Work: `src/products/work/api/index.ts`
  - Code: `src/products/code/api/index.ts`
- Shared visual primitives may live in `src/design/**`, but do not upstream Chat-specific UI behavior into shared components prematurely.
- Keep layering intact: `core/` and `platform/` must not import product implementations.
- Do not run the full `npm test` suite unless the user explicitly asks. Only run targeted test files when needed.
- For the full protocol, see `docs/product-integration-guide.md` and `docs/plans/PLAN-014-parallel-workstream-ownership-and-integration-seams.md`.

#### Canvas Top Bar Edge Alignment

When a product page mounts a `<header className="channelTopBar …">` inside `main.canvas`, the bar **will visually inset from canvas edges** unless three platform-shell rules from `src/products/shared/renderer/styles/chat-shell-base.css` are countered. They compose silently and bite at different viewports / zoom levels.

The three layers on `.claudeShell > .canvas`:

1. **`padding: 0 28px`** — horizontal gutter. `.channelTopBar`'s default `margin: 0 -28px; width: calc(100% + 56px)` already escapes this.
2. **`scrollbar-gutter: stable`** — reserves space on the right equal to the OS scrollbar width. **Do not hardcode `-15px` to compensate** — scrollbar width is in *device* pixels, so the CSS-px equivalent drifts under browser zoom and the bar realigns wrong at non-100%.
3. **`justify-items: center`** on the grid — a page wrapper at intrinsic content width (no explicit `width: 100%`) gets centred within the grid column, creating new gaps as viewport widens (clearly visible at 1600px+).

Fix pattern (canonical reference: `src/products/work/renderer/components/projects/projects.css`):

```css
main.canvas:has(> .myPageWrapper) {
  grid-template-columns: minmax(0, 1fr);
  scrollbar-gutter: auto;
  justify-items: stretch;
}

.myPageWrapper {
  width: 100%;
  /* … */
}
```

The bar then uses `.channelTopBar`'s default `-28px` bleed — no per-viewport math needed. **Verify** any new top-bar-bearing surface with Playwright at viewports 1024 / 1249 / 1600 / 1920 — `bar.left === main.left && bar.right === main.right` at every size.

---

## Maintenance

This file is maintained by Claude only. Other agents should not modify this file.

Last updated: 2026-04-28

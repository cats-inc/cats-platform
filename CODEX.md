# Codex-Specific Instructions

> **If you are NOT Codex (OpenAI Codex CLI), please ignore this file.**

## Prerequisites

**MUST** read `AGENTS.md` first for cross-agent guidelines before reading this file.

## Role Awareness

Check the **Project Roles** table in `AGENTS.md`.
- If a **Conductor** is assigned (and it is not you), act as a Specialist: prioritize their tasks and strictly follow their architectural plans.
- If **you** are the Conductor, you are responsible for orchestration, task management, and status tracking.

## Command Aliases

| Alias | Action |
|-------|--------|
| `dyu` | **MUST** confirm you have read `AGENTS.md` and this file. **MUST** respond with exactly: "I am Codex, and I understand." |

## About This File

This file contains Codex-specific configurations and instructions that should not be applied by other AI agents (Claude, Gemini, etc.).

Only Codex should read and maintain this file.

---

## Codex-Specific Configurations

### Behavioral Guidelines

- **MUST** read AGENTS.md at the start of every session
- **MUST** follow the Development Workflow defined in AGENTS.md
- **MUST** run validation proportional to the change risk
- **MUST NOT** modify other agents' files (CLAUDE.md, GEMINI.md)
- **SHOULD** ask for clarification when requirements are ambiguous
- **SHOULD** make minimal, focused edits

### Conductor Responsibilities

If assigned as Conductor in Project Roles table:
- **MUST** maintain README.md "Current Status" section
- **MUST** create and assign tasks in `docs/plans/`
- **MUST** document major decisions in `docs/decisions/`
- **MUST NOT** make unilateral architectural decisions without documentation

### Code Modification Rules

- **MUST** prefer targeted tests or focused verification over full-suite runs
- **MUST** update tests when behavior or contracts change
- **MUST** update documentation when changing public APIs
- **MUST** follow coding conventions specified in AGENTS.md
- **MUST** respect `.editorconfig` settings (LF line endings, final newline, trim rules)
- **MUST NOT** use interactive rebase; always use non-interactive rebase commands only
- **MUST NOT** run plain `git rebase --continue` in this Windows/PowerShell
  workspace, because Git may open an editor and block the session
- **MUST** continue rebases with an explicit no-editor command after conflicts
  are resolved:
  `$env:GIT_EDITOR='node -e \"process.exit(0)\"'; git rebase --continue`
- **SHOULD** use the same no-editor pattern for `git cherry-pick --continue`
  and `git merge --continue` when Git would otherwise invoke an editor
- **SHOULD** make minimal, focused changes
- **SHOULD** commit frequently with clear messages

### Testing Scope

- Default to the smallest validation that can prove the change works.
- Do **not** default to `npm test` for small or localized edits.
- Prefer file-scoped tests, targeted `node --test ...`, targeted Vitest runs,
  build checks, or a narrow manual verification of the touched flow.
- Escalate to broader suites only when touching shared contracts, cross-product
  wiring, storage layout, startup/bootstrap, or routing used by multiple
  surfaces.
- For docs-only changes, do not run code tests unless the docs depend on a
  command or behavior you re-verified.

### Agent Skills

Codex discovers skills from `.agents/skills/<name>/SKILL.md`. The canonical source is the `skills/` directory at the project root.

To sync skills after changes:
```powershell
.\scripts\windows\Sync-AgentSkills.ps1
```

### Search and Navigation Preferences

- **SHOULD** prefer `rg` (ripgrep) for searching text content
- **SHOULD** use `fd` for finding files by name patterns
- **MAY** use `grep` or `find` as fallbacks if other tools unavailable

### Preferred Behaviors

- **Precision**: Keep edits minimal and surgical
- **Testing**: Use risk-based, targeted validation by default
- **Configuration compliance**: Always respect `.editorconfig`
- **Documentation**: Keep docs synchronized with code

### Project-Specific Context

- Main app port: `CATS_INC_PORT` (default `8181`)
- Renderer dev port: `5173`
- Runtime dependency: `CATS_RUNTIME_BASE_URL` (default `http://127.0.0.1:3110`)
- Core modules: `src/config.ts`, `src/runtime/client.ts`, `src/chat/shell.ts`,
  `src/server.ts`, `src/renderer/App.tsx`
- Test command: `npm test`
- Product direction: build the Node/TS platform product directly around
  `cats-runtime` as the only runtime boundary

### Working Product Memory

These notes capture the current user direction for `cats`. They are
working memory for Codex, not yet a ratified product spec or ADR.

- The flagship product brand remains `Cats`, but the main platform
  host/repo/package target is now `cats-platform` under the `Cats Inc`
  umbrella brand, with a later public repo target of
  `cats-inc/cats-platform`. `cats-can` is reserved for the one-shot installer
  entrypoint.
- The first real product line is a chat product, not a narrow "one-man digital
  company" shell. It should feel like a general chat app that also supports
  agent orchestration.
- A later product line may exist as `Cats Work`, with dashboards, org views,
  backlog, finance, and other company-control-plane surfaces. That line should
  be treated as future work, not pulled into the current chat scope by default.
- `cats-runtime` is expected to be open source and remains the runtime boundary
  for the product. The app should not couple directly to lower-level runtime
  internals.
- External entrypoints such as Telegram Bot and LINE@ are part of the intended
  MVP shape. In those channels, the user expects a single bot-facing
  orchestrator surface rather than many visible workers.
- The orchestrator may itself run as a worker backed by `cats-runtime`, but in
  product terms it has elevated responsibilities: delegation, summarization,
  escalation, takeover handoff, and owner-facing option presentation before
  dispatch.
- Inside the main app, users should still be able to chat directly with
  non-orchestrator cats/resources. The "single orchestrator bot" constraint is
  mainly for external messaging transports like Telegram or LINE.
- Worker conversations, user conversations, and external transport transcripts
  should be persisted. Operational search should be available from the app, and
  archived material is expected to flow into a separate RAG/memory layer later.
- The system should eventually support "Know Your Boss" behavior: orchestrators
  and workers adapting to the owner's preferences, escalation thresholds, and
  decision style.
- Packaging and onboarding matter. The product should move toward a
  native-feeling desktop experience with simple installation and guided setup,
  especially to reduce the friction of deploying local runtime dependencies.

### Parallel Product Delivery Rules

`cats` is now in parallel delivery mode for `Cats Chat`, `Cats Work`, and
`Cats Code`.

- Stay inside your assigned product tree by default:
  - Chat: `src/products/chat/**`
  - Work: `src/products/work/**`
  - Code: `src/products/code/**`
- Do not edit other product trees unless explicitly acting as the integrator.
- Treat these files as frozen shared contracts:
  - `src/core/types.ts`
  - `src/platform/orchestration/contracts.ts`
  - `src/shared/roomRouting.ts`
  - `src/products/chat/api/contracts.ts`
- Do not reshape frozen shared contracts during feature work. Shared contract
  changes must go through integration review plus docs (`SPEC/ADR/PLAN`) first.
- Do not expand platform-host wiring directly during product work.
  `src/app/server/**` is integration-owned.
- Product APIs must land through product-owned delegates:
  - Chat: `src/products/chat/api/index.ts`
  - Work: `src/products/work/api/index.ts`
  - Code: `src/products/code/api/index.ts`
- Shared visual primitives may live in `src/design/**`, but do not upstream
  Chat-specific UI behavior into shared components prematurely.
- Keep layering intact: `core/` and `platform/` must not import product
  implementations.
- Before handoff or commit, run the narrowest validation that covers the
  changed surface; only run `npm test` when the change actually warrants full
  suite coverage.
- Follow `docs/product-integration-guide.md` and
  `docs/plans/PLAN-014-parallel-workstream-ownership-and-integration-seams.md`
  when integrating product work into the platform host.

---

## Maintenance

This file is maintained by Codex only. Other agents should not modify this file.

Last updated: 2026-04-06

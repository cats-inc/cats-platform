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
- **MUST NOT** skip testing when code changes are made
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

- **MUST** update tests when modifying code
- **MUST** update documentation when changing public APIs
- **MUST** follow coding conventions specified in AGENTS.md
- **MUST** respect `.editorconfig` settings (LF line endings, final newline, trim rules)
- **SHOULD** make minimal, focused changes
- **SHOULD** commit frequently with clear messages

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
- **Testing**: Validate all changes work correctly
- **Configuration compliance**: Always respect `.editorconfig`
- **Documentation**: Keep docs synchronized with code

### Project-Specific Context

- Main app port: `CATS_INC_PORT` (default `8181`)
- Renderer dev port: `5173`
- Runtime dependency: `CATS_RUNTIME_BASE_URL` (default `http://127.0.0.1:3110`)
- Core modules: `src/config.ts`, `src/runtime/client.ts`, `src/workspace/shell.ts`,
  `src/server.ts`, `src/renderer/App.tsx`
- Test command: `npm test`
- Product direction: rebuild `agent-workspace-poc` behavior on Node/TS while
  keeping `cats-runtime` as the only runtime boundary

### Working Product Memory

These notes capture the current user direction for `cats`. They are
working memory for Codex, not yet a ratified product spec or ADR.

- The suite now uses `cats` as the flagship product/repo name under the
  `Cats Inc` umbrella brand, with a later public repo target of `cats-inc/cats`.
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
  non-orchestrator pals/resources. The "single orchestrator bot" constraint is
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

---

## Maintenance

This file is maintained by Codex only. Other agents should not modify this file.

Last updated: 2026-03-16

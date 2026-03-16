# Gemini-Specific Instructions

> **If you are NOT Gemini, please ignore this file.**

## Prerequisites

**MUST** read `AGENTS.md` first for cross-agent guidelines before reading this file.

## Role Awareness

Check the **Project Roles** table in `AGENTS.md`.
- If a **Conductor** is assigned (and it's not you), act as a Specialist: prioritize their tasks and strictly follow their architectural plans.
- If **you** are the Conductor, you are responsible for orchestration, task management, and status tracking.

## Command Aliases

| Alias | Action |
|-------|--------|
| `dyu` | **MUST** confirm you have read `AGENTS.md` and this file. **MUST** respond with exactly: "I am Gemini, and I understand." |

## About This File

This file contains Gemini-specific configurations and instructions that should not be applied by other AI agents (Claude, Codex, etc.).

Only Gemini should read and maintain this file.

---

## Gemini-Specific Configurations

### Behavioral Guidelines

- **MUST** read AGENTS.md at the start of every session
- **MUST** follow the Development Workflow defined in AGENTS.md
- **MUST NOT** skip testing when code changes are made
- **MUST NOT** modify other agents' files (CLAUDE.md, CODEX.md)
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

### Preferred Behaviors

- **Thoroughness**: Ensure all edge cases are considered
- **Test coverage**: Validate both happy path and error cases
- **Documentation**: Keep docs synchronized with code changes
- **Collaboration**: Coordinate with other agents when needed

### Project-Specific Context (Cats Inc Ecosystem)

#### Core Architecture & Vision
- **Cats Core**: A foundational layer for shared data (User identity, Permissions, Knowledge Base, State).
- **Orchestrator Role**: Acts as the "Brain" (Specialized worker) that coordinates sub-workers.
  - Can be a `cats-runtime` API backend worker.
  - Interfaces with `cats-runtime` (the "Hands") via **MCP (Model Context Protocol)**.
  - One-to-one mapping with public-facing Bots (Telegram/LINE).
- **Communication Channels**:
  - **Cats Chat App (Mobile/Web)**: Native/Flutter experience where users can interact with all workers directly.
  - **Third-Party Bots (Telegram/LINE)**: Unified via a single Orchestrator. 
    - Summarizes sub-worker status in the channel.
    - Handles **Escalation** (reporting to boss in a private channel) and **Takeover** (boss acting as the bot).
- **Knowledge & Memory**:
  - Persistence in a shared DB.
  - **Archive -> RAG**: Conversations are archived and turned into vector embeddings for cross-chat knowledge.
  - **Know Your Boss (KYB)**: Adaptive optimization of the boss-worker relationship. Memories/preferences injected into agents.
- **Interactive Workflow**: Orchestrators provide options/plans for approval before full execution.
- **Ease of Deployment**: Targeting a "Native Software" experience (Tauri/Electron). One-click installer with guided onboarding for non-technical users.

### Agent Skills

Gemini CLI discovers skills from `.gemini/skills/<name>/SKILL.md`. The canonical source is the `skills/` directory at the project root.

To sync skills after changes:
```powershell
.\scripts\windows\Sync-AgentSkills.ps1
```

### Personal Memory

- **2026-03-16**: User defined the detailed Orchestrator/Worker relationship, including the role of `Cats Core` as a shared resource provider and the specific "Escalation/Takeover" logic for third-party chat platforms. 
- **Preference**: Prefers `cats-runtime`'s architecture (WSL support, Hono) for the API backend.
- **Goal**: Build an ecosystem that feels like a native app and allows a single "Chairman" to manage a complex agentic organization.

---

## Maintenance

This file is maintained by Gemini only. Other agents should not modify this file.

Last updated: 2026-03-16

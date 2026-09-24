# Agent Skills

> Repo-owned developer skills following the [Agent Skills](https://agentskills.io) open standard.

## Overview

Agent Skills provide progressive disclosure of complex instructions. Instead of embedding long procedures inline in `AGENTS.md` or agent-specific files, each skill is a standalone `SKILL.md` with YAML frontmatter that agents discover automatically.

In `cats`, these skills support developer workflows and repo collaboration. They are
not the same thing as product skill profiles or runtime-hosted execution skill
packages.

## How It Works

1. **Canonical source**: All skills live in `skills/` (version-controlled)
2. **Sync to agents**: Run `Sync-AgentSkills.ps1` to discover nested packages and copy them to each agent's discovery path
3. **Agent discovery**: Each agent finds skills in its own directory

Skill directories may include supporting files (for example `scripts/`, `references/`, or `assets/`). Sync copies the entire skill directory so agents can access all referenced files.

Discovery supports family directories such as `skills/orchestration/`. It stops
at each package root, excludes pending `*.bootstrap` directories and rejects
duplicate leaf names before writing either mirror. These developer skills are
not shipped as product content. Desktop bundles the separate library from
`cats-runtime/runtime-skills/`.

### Discovery Paths

| Agent | Discovery Path |
|-------|---------------|
| Claude Code | `.claude/skills/<name>/SKILL.md` |
| Codex | `.agents/skills/<name>/SKILL.md` |
Antigravity CLI is intentionally not listed here yet. Its repo/project skill
discovery path has not been verified, so the sync helpers do not create an
`.antigravity/skills` convention.

### Syncing Skills

```powershell
# Sync all skills to all agents
.\scripts\windows\Sync-AgentSkills.ps1

# Sync to a specific agent only
.\scripts\windows\Sync-AgentSkills.ps1 -Agent claude

# Clean target directories before syncing
.\scripts\windows\Sync-AgentSkills.ps1 -Clean
```

## SKILL.md Format

Each skill is a directory containing a `SKILL.md` file:

```
skills/
  └── skill-name/
      └── SKILL.md
```

The `SKILL.md` file uses YAML frontmatter:

```yaml
---
name: skill-name          # Required: 1-64 chars, lowercase, hyphens, no leading/trailing hyphen, no consecutive hyphens, must match directory
description: What and when # Required: 1-1024 chars
allowed-tools: Read Bash   # Optional (experimental; support varies by agent implementation)
---
Markdown instructions...
```

Note: `allowed-tools` is experimental and may be ignored by some agents.

## Available Skills

<!-- Add your project-specific skills here -->

| Skill | Description |
|-------|-------------|
| `a2a-handoff` | bounded handoff preparation across protocol, project-memory, and skill layers |
| [desktop-ui-automation](desktop-ui-automation/SKILL.md) | native UI inspection and operation on a ready Windows/macOS/Linux session, with environment checks and platform-specific recipes |
| `project-memory-sync` | durable markdown-state synchronization during collaboration |

`desktop-ui-automation` is optional guidance, not an installed desktop-control
service. Its Linux labwc path has real Desktop acceptance evidence; the Windows
11/RDP pilot verified window/tray interaction and Windows Terminal text/menu capture.
macOS and other sessions/applications must establish their own readiness and native
validation. It adds no product dependency or permission grant. The Windows helper
and capture limitations are in its platform reference.

### Parent workspace discovery

`cats-one` already recursively inventories this repository's `skills/` root and
copies each complete skill package, including references and agent metadata.
No per-skill manifest registration is needed. After pulling this repository,
run the workspace helper from the shared parent:

| OS | Synchronize Codex and Claude, then check |
| --- | --- |
| Windows | `.\cats-one\scripts\windows\Sync-WorkspaceSkills.ps1` |
| macOS | `./cats-one/scripts/macos/sync-workspace-skills.sh` |
| Linux | `./cats-one/scripts/linux/sync-workspace-skills.sh` |

Use `-WhatIf` or `--dry-run` to preview. These generate the parent `AGENTS.md`
inventory and `.agents/skills` / `.claude/skills` mirrors; edit the canonical
source here, not those generated files. Repository-local sessions retain their
separate discovery copies, refreshed by the repository helpers documented above
(or `bash ./scripts/linux/sync-agent-skills.sh` and its macOS counterpart). Open a new
parent-root agent session if the host does not reload its skill inventory.
See [cats-one workspace setup](../../cats-one/docs/setup-guide.md).

## Adding a New Skill

1. Create a directory under `skills/` with the skill name (lowercase, hyphens)
2. Add a `SKILL.md` file with proper frontmatter
3. Run the repository sync helper, plus the workspace helper when using the parent-root session
4. Update this README with the new skill

---

*This directory follows the [Agent Skills](https://agentskills.io) standard.*

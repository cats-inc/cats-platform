# Documentation Index

> This directory contains all project documentation.

## Root-Level Documents

These important documents live in the project root:

| Document | Status | Description |
|----------|--------|-------------|
| [PROGRESS.md](../PROGRESS.md) | Complete | Implementation status and work packages |
| [ROADMAP.md](../ROADMAP.md) | Complete | Project roadmap and milestones |

## Core Documents

| Document | Status | Description |
|----------|--------|-------------|
| [requirements.md](./requirements.md) | Complete | Requirements for the current Phase 2 shell plus open Phase 3 gaps |
| [architecture.md](./architecture.md) | Complete | System architecture for the Node server, renderer, and runtime boundary |
| [api.md](./api.md) | Complete | Current REST API surface for workspace state, runtime actions, and export |

## Development Guides

| Document | Status | Description |
|----------|--------|-------------|
| [setup-guide.md](./setup-guide.md) | Complete | Environment setup |
| [testing.md](./testing.md) | Complete | Current testing strategy and coverage boundaries |
| [deployment.md](./deployment.md) | Partial | Manual local deployment is current; container and desktop packaging remain follow-up work |
| [security-guidelines.md](./security-guidelines.md) | Template | Security policies placeholder inherited from bootstrap |
| [mcp-config.md](./mcp-config.md) | Template | MCP configuration placeholder; not active for this project today |
| [services.md](./services.md) | Complete | Service registry and port assignments |
| [SCRIPT-STANDARDS.md](./SCRIPT-STANDARDS.md) | Template | Shared script standards reference |

## Scripts

The `scripts/` directory contains platform-specific scripts for this project:

| Directory | Platform | Purpose |
|-----------|----------|---------|
| `scripts/windows/` | Windows | PowerShell scripts (.ps1) |
| `scripts/linux/` | Linux | Bash scripts (.sh) |
| `scripts/macos/` | macOS | Bash scripts (.sh) |

## AAIF Documents

| Document | Status | Description |
|----------|--------|-------------|
| [AGENT-GUIDE.md](./AGENT-GUIDE.md) | Complete | Agent collaboration guide |
| [terminology.md](./terminology.md) | Complete | Product and protocol terms, including pals, execution leases, and memory checkpoints |
| [a2a/](./a2a/) | Template | A2A agent card and task templates, not yet customized for `cats-inc` |
| [specs/](./specs/) | Complete | Feature specifications, including `SPEC-001` through `SPEC-005` |
| [plans/](./plans/) | Complete | Implementation plans, including `PLAN-001` through `PLAN-005` |
| [decisions/](./decisions/) | Complete | Architecture Decision Records, including `ADR-001` through `ADR-006` |

**Legend**: Complete | Partial | Template

## Research

| Document | Status | Description |
|----------|--------|-------------|
| [research/](./research/) | Partial | Research notes for Paperclip-informed control-plane evolution |

## Context-Driven Development

For complex features, use the spec-plan-implement workflow:

1. **Spec** (`specs/SPEC-NNN-title.md`): Define what to build and why
2. **Plan** (`plans/PLAN-NNN-title.md`): Define how to build it
3. **Implement**: Follow the plan and update progress documents

This ensures AI agents understand requirements before writing code.

## For AI Agents

When working on this project:

1. Check this index to understand what documentation exists
2. Create missing documents as needed
3. Update this index when adding new documents
4. Keep status labels honest when a document is still a bootstrap placeholder

## Current Documentation Gaps

The main product docs are current, but these areas still need dedicated passes:

- deployment assets and implementation details for container or desktop packaging
- project-specific security and MCP notes
- A2A and terminology references once cross-agent workflows stabilize

## Document Standards

- Use Markdown format
- Include a clear title and purpose at the top
- Keep documents focused and concise
- Update the "Last updated" date when modifying

---

*Last updated: 2026-03-16*

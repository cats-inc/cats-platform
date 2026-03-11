# Documentation Index

> This directory contains all project documentation.

## Root-Level Documents

These important documents live in the project root:

| Document | Status | Description |
|----------|--------|-------------|
| [PROGRESS.md](../PROGRESS.md) | ? | Implementation status and work packages |
| [ROADMAP.md](../ROADMAP.md) | ? | Project roadmap and milestones |

## Core Documents

| Document | Status | Description |
|----------|--------|-------------|
| [requirements.md](./requirements.md) | ? | Requirements specification |
| [architecture.md](./architecture.md) | ? | System architecture |
| [api.md](./api.md) | ? | API specification (REST/WebSocket) |

## Development Guides

| Document | Status | Description |
|----------|--------|-------------|
| [setup-guide.md](./setup-guide.md) | ? | Environment setup |
| [testing.md](./testing.md) | ? | Testing strategy |
| [deployment.md](./deployment.md) | ? | Deployment instructions |
| [security-guidelines.md](./security-guidelines.md) | ?? Template | Security policies |
| [mcp-config.md](./mcp-config.md) | ?? Template | MCP server configuration |
| [services.md](./services.md) | ? | Service registry and port assignments |
| [SCRIPT-STANDARDS.md](./SCRIPT-STANDARDS.md) | ?? Template | Script standards and naming |

## Scripts

The `scripts/` directory contains platform-specific scripts for your project:

| Directory | Platform | Purpose |
|-----------|----------|---------|
| `scripts/windows/` | Windows | PowerShell scripts (.ps1) |
| `scripts/linux/` | Linux | Bash scripts (.sh) |
| `scripts/macos/` | macOS | Bash scripts (.sh) |

Add your project-specific automation scripts here.

## AAIF Documents

| Document | Status | Description |
|----------|--------|-------------|
| [AGENT-GUIDE.md](./AGENT-GUIDE.md) | ? | Agent collaboration guide |
| [terminology.md](./terminology.md) | ?? Template | AAIF/A2A/MCP terminology |
| [a2a/](./a2a/) | ?? | A2A agent card and task templates |
| [specs/](./specs/) | ?? | Feature specifications, including `SPEC-001`, `SPEC-002`, and `SPEC-003` |
| [plans/](./plans/) | ?? | Implementation plans, including `PLAN-001`, `PLAN-002`, and `PLAN-003` |
| [decisions/](./decisions/) | ?? | Architecture Decision Records, including `ADR-001` and `ADR-002` |

**Legend**: ? Complete | ?? Template (needs content) | ?? Directory

## Research

| Document | Status | Description |
|----------|--------|-------------|
| [research/](./research/) | ?? | Research notes and external sources |

## Context-Driven Development

For complex features, use the spec-plan-implement workflow:

1. **Spec** (`specs/SPEC-NNN-title.md`): Define what to build and why
2. **Plan** (`plans/PLAN-NNN-title.md`): Define how to build it
3. **Implement**: Follow the plan, update progress

This ensures AI agents understand requirements before writing code.

## For AI Agents

When working on this project:

1. Check this index to understand what documentation exists
2. Create missing documents as needed
3. Update this index when adding new documents
4. Follow templates provided in each file

## Document Standards

- Use Markdown format
- Include a clear title and purpose at the top
- Keep documents focused and concise
- Update the "Last updated" date when modifying

---

*Last updated: 2026-03-11*

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
| [requirements.md](./requirements.md) | Complete | Requirements for the current shell plus the accepted `Cats Core v1`, Chat, and Work planning direction |
| [architecture.md](./architecture.md) | Complete | Current implementation architecture plus the planned shared-core suite topology and current chat navigation direction |
| [api.md](./api.md) | Complete | Current API surface plus the approved RESTful migration direction and shared-core/runtime-boundary notes |

## Development Guides

| Document | Status | Description |
|----------|--------|-------------|
| [setup-guide.md](./setup-guide.md) | Complete | Environment setup |
| [testing.md](./testing.md) | Complete | Current testing strategy and coverage boundaries |
| [deployment.md](./deployment.md) | Complete | Current local deployment plus planned desktop-first packaged topology and onboarding direction |
| [security-guidelines.md](./security-guidelines.md) | Template | Security policies placeholder inherited from bootstrap |
| [mcp-config.md](./mcp-config.md) | Partial | Planning notes for the future `cats-runtime` MCP facade used by orchestrators |
| [services.md](./services.md) | Complete | Service registry, port assignments, and shared service-boundary notes |
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
| [AGENT-GUIDE.md](./AGENT-GUIDE.md) | Complete | Agent collaboration guide with current suite-foundation context |
| [terminology.md](./terminology.md) | Complete | Product and protocol terms, including `Boss Cat`, `Boss Chat`, `Direct Cat Chat`, skill profiles, runtime skill manifests, MCP profiles, preview surfaces, sleep/wake lifecycle, transport inboxes, `Cats Core v1`, bot bindings, approvals, and owner profile |
| [a2a/](./a2a/) | Template | A2A agent card and task templates, not yet customized for `cats-inc` |
| [specs/](./specs/) | Complete | Feature specifications, including suite-foundation work, primary-orchestrator/setup-wizard behavior, packaged setup/provider-installation direction, workspace delivery-policy/governance levels, budget policy and war-room cost-control direction, provider and transport seams, the new chat sleep/wake lifecycle, Telegram inbox-to-room routing, direct-Cat routing behavior, dynamic explicit-mention plus room-workflow orchestration, skill profile/runtime skill-manifest ownership, embedded preview surfaces, and contextual MCP/lazy tool activation |
| [plans/](./plans/) | Complete | Implementation plans, including suite-foundation work, self-hosted npm app packaging, parallel-workstream seams, the chat sleep/wake lifecycle plan, and the first dynamic room-workflow orchestration plan |
| [decisions/](./decisions/) | Complete | Architecture Decision Records, including runtime-boundary refinements, the visible primary-orchestrator model, packaged host ownership of provider installation, product-owned workspace delivery policy, product-owned budget policy and cost control, frozen parallel-delivery ownership boundaries, the accepted chat sleep/wake lifecycle direction, the Telegram inbox transport model, the direct-Cat routing model, the new explicit-mentions-vs-room-workflow split, product-vs-runtime skill ownership, normalized preview-surface rendering, and MCP intent/runtime tool-delivery ownership |

**Legend**: Complete | Partial | Template

## Research

| Document | Status | Description |
|----------|--------|-------------|
| [research/](./research/) | Partial | Research notes for exploratory Paperclip-informed control-plane evolution, product-boundary positioning for `Cats Chat` / `Cats Work` / `Cats Code`, the current Chat/runtime killer-feature audits for Paperclip and OpenClaw, and the OpenClaw memory-layering benchmark |

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

The main suite-foundation docs are current, but these areas still need dedicated passes:

- implementation details for desktop packaging and later-stage transport delivery behavior
- project-specific security notes beyond the inherited template
- A2A and automation references once cross-agent workflows stabilize

## Document Standards

- Use Markdown format
- Include a clear title and purpose at the top
- Keep documents focused and concise
- Update the "Last updated" date when modifying

---

*Last updated: 2026-03-20*

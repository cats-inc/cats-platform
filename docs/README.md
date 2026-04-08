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
| [architecture.md](./architecture.md) | Complete | Current implementation architecture, the landed platform-host code layout, the shared-core platform topology, and the current compatibility seams |
| [api.md](./api.md) | Complete | Current API surface plus the approved RESTful migration direction and shared-core/runtime-boundary notes |

## Development Guides

| Document | Status | Description |
|----------|--------|-------------|
| [setup-guide.md](./setup-guide.md) | Complete | Environment setup |
| [testing.md](./testing.md) | Complete | Current testing strategy and coverage boundaries |
| [deployment.md](./deployment.md) | Complete | Current local deployment plus planned desktop-first packaged topology and onboarding direction |
| [product-integration-guide.md](./product-integration-guide.md) | Complete | Product registration, dependency-slice, and platform-host integration rules for parallel Chat/Work/Code delivery |
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
| [AGENT-GUIDE.md](./AGENT-GUIDE.md) | Complete | Agent collaboration guide with current platform-foundation context plus the same-environment CLI collaboration contract |
| [terminology.md](./terminology.md) | Complete | Product and protocol terms, including `Guide Cat`, `Boss Cat`, current-turn recipients, dispatch policy, generalized `entity` / `participant` language, direct private rooms, transport bindings, project memory, repo collaboration skills, runtime skill manifests, MCP profiles, preview surfaces, sleep/wake lifecycle, `Cats Core v1`, bot bindings, approvals, and owner profile |
| [a2a/](./a2a/) | Complete | Pilot-owned A2A v1.0 example set for future platform-host/orchestrator adapter work; standards-aligned docs, not a claim of a live A2A endpoint today |
| [specs/](./specs/) | Complete | Feature specifications, including platform-foundation work, chat-first information architecture with a default Boss Cat, the first-run setup wizard, Cat-private room entry, packaged setup/provider-installation direction, the packaged setup/runtime-bootstrap integration slice, the new cross-layer bootstrap/onboarding diagnostics contract, Guide Cat setup plus generalized participant entry direction, the new Guide Cat sidecar/day-0 assist surface direction, the new group-chat temporary-participant plus lightweight-preset model, the new current-turn-recipient plus dispatch-policy model, chat delivery-policy/governance levels, budget policy and war-room cost-control direction, provider and transport seams, the new chat sleep/wake lifecycle, the new runtime-session-deletion-on-product-delete policy slice, Telegram inbox-to-room routing, direct-Cat routing behavior, dynamic explicit-mention plus room-workflow orchestration, companion workspace/presence planning, the new `Cats Chat v1` priority stack, the new platform product-landing plus installed-apps model, skill profile/runtime skill-manifest ownership, embedded preview surfaces, contextual MCP/lazy tool activation, explicit room-workspace ownership/bootstrap semantics, the first `Cats Code` builder loop, the new `Cats Code` MVP multi-agent local-app workflow, and the new platform-renderer route-level chunking direction |
| [plans/](./plans/) | Complete | Implementation plans, including platform-foundation work, self-hosted npm app packaging, route-driven navigation, setup-wizard refinement, Guide Cat setup plus participant generalization, the new Guide Cat sidecar/day-0 assist rollout, packaged setup/provider-installation knowledge porting, the packaged setup/runtime-bootstrap integration plan, the new cross-layer bootstrap/onboarding diagnostics plan, parallel-workstream seams, the chat sleep/wake lifecycle plan, the new runtime-session-deletion-on-product-delete rollout, the first dynamic room-workflow orchestration plan, the `Cats Chat v1` priority stack, the first `Cats Work` team-template intake flow, the first `Cats Code` local builder loop, the first `Cats Code` MVP fan-out/relay/convergence slice, the new platform product-landing plus installed-apps rollout, and the new `cats` -> `cats-platform` host-rename migration |
| [decisions/](./decisions/) | Complete | Architecture Decision Records, including runtime-boundary refinements, the visible primary-orchestrator model, Guide Cat terminology and participant generalization, the proposed platform-level Guide sidecar/day-0 assist direction, chat-first information architecture with a default Boss Cat, packaged host ownership of provider installation, product-owned chat delivery policy, product-owned budget policy and cost control, frozen parallel-delivery ownership boundaries, the accepted chat sleep/wake lifecycle direction, the new default-cascade runtime-session deletion rule for destructive product deletes, the Telegram inbox transport model, the direct-Cat routing model, the new explicit-mentions-vs-room-workflow split, the new recipient-centric composer plus dispatch-policy model, product-vs-runtime skill ownership, normalized preview-surface rendering, MCP intent/runtime tool-delivery ownership, the new separation between room-owned workspaces and session-owned sandboxes, the new split between channel topology and routing mode, the new route-level lazy-loading policy for the platform renderer entry, the new Windows x64 plus npm-first initial distribution strategy, the new `cats-platform` host naming decision, the new platform distinction between first-party products and installable apps, and the new three-layer bootstrap diagnostics ownership plus host aggregation rule |

**Legend**: Complete | Partial | Template

## Research

| Document | Status | Description |
|----------|--------|-------------|
| [research/](./research/) | Partial | Research notes for exploratory Paperclip-informed control-plane evolution, product-boundary positioning for `Cats Chat` / `Cats Work` / `Cats Code`, the current Chat/runtime killer-feature audits for Paperclip and OpenClaw, OpenClaw memory-layering benchmarks, unified planning strategy notes, Cats Chat spatial layout guidance, companion capability baselines, external knowledge ingestion and connector strategy, packaged setup and packaged-startup operational investigations, the new self-hosted CLI-provider port matrix, the long-range AI-first app-store platform vision, the `Cats Coding` playground concept, and the sibling A2A pilot alignment with `cats-runtime` |

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

The main platform-foundation docs are current, but these areas still need dedicated passes:

- implementation details for desktop packaging and later-stage transport delivery behavior
- app-level API ownership cleanup after Chat route handlers move into `products/chat/api/*`
- removal of temporary compatibility shims once platform-host ownership boundaries stabilize
- project-specific security notes beyond the inherited template
- a live A2A server/Agent Card surface; the current A2A files are still
  pilot-owned examples rather than active endpoints

## Document Standards

- Use Markdown format
- Include a clear title and purpose at the top
- Keep documents focused and concise
- Update the "Last updated" date when modifying

---

*Last updated: 2026-04-08*

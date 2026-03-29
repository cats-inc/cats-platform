# Implementation Plans

> This directory contains implementation plans that define *how* to build features.

## Purpose

Implementation plans break down approved specifications into actionable tasks. They help:

- Coordinate work across multiple developers/agents
- Track progress through implementation phases
- Document technical decisions made during development

## When to Create a Plan

Create a plan when:

- A specification (SPEC) has been approved
- The feature requires multiple implementation phases
- Work needs to be coordinated across multiple contributors

## Workflow

```
1. Spec approved → Create plan
2. Break into phases → Define tasks
3. Implement → Update progress
4. Complete → Mark as done
```

## Naming Convention

```
PLAN-NNN-short-title.md

Examples:
PLAN-001-user-authentication.md
PLAN-002-api-rate-limiting.md
PLAN-003-database-migration.md
```

## Template

Use [000-template.md](./000-template.md) as the starting point for new plans.

## Index

| Plan | Title | Status | Related Spec |
|------|-------|--------|--------------|
| [PLAN-030](./PLAN-030-packaged-setup-wizard-and-provider-installation.md) | Packaged Setup Wizard and Provider Installation | In Progress | [SPEC-023](../specs/SPEC-023-packaged-setup-wizard-and-provider-installation.md), [ADR-021](../decisions/021-keep-packaged-setup-and-provider-installation-in-the-host.md) |
| [PLAN-029](./PLAN-029-cats-code-v1-local-builder-loop.md) | Cats Code v1 Local Builder Loop | Draft | [SPEC-041](../specs/SPEC-041-cats-code-v1-local-builder-loop.md) |
| [PLAN-028](./PLAN-028-cats-work-team-templates-and-work-intake.md) | Cats Work Team Templates and Work Intake | Draft | [SPEC-040](../specs/SPEC-040-cats-work-team-templates-and-work-intake.md) |
| [PLAN-027](./PLAN-027-cats-chat-v1-priority-items.md) | Cats Chat v1 Priority Items | Draft | [SPEC-039](../specs/SPEC-039-cats-chat-v1-priority-items.md) |
| [PLAN-026](./PLAN-026-transport-live-updates-and-private-lane-transition.md) | Transport Live Updates and Private-Lane Transition | Draft | [SPEC-037](../specs/SPEC-037-transport-driven-live-chat-updates-and-private-lane-transition.md), [ADR-041](../decisions/041-push-transport-and-chat-invalidations-over-sse.md) |
| [PLAN-025](./PLAN-025-companion-workspace-presence-and-settings.md) | Companion Workspace, Presence, and Settings | Draft | [SPEC-036](../specs/SPEC-036-companion-workspace-presence-and-settings.md), [ADR-040](../decisions/040-make-companion-a-first-class-chat-mode-with-workspace-and-presence.md) |
| [PLAN-021](./PLAN-021-cross-product-task-strategy-handoff-and-runtime-bridge.md) | Cross-Product Task Strategy Handoff and Runtime Bridge | Draft | [SPEC-035](../specs/SPEC-035-cross-product-task-strategy-handoff-and-runtime-bridge.md), [ADR-039](../decisions/039-use-core-task-metadata-as-cross-product-plan-exchange.md) |
| [PLAN-023](./PLAN-023-orchestrator-execution-loop-and-recovery.md) | Orchestrator Execution Loop and Recovery Contract | In Progress (First Slice Landed) | [SPEC-011](../specs/SPEC-011-primary-orchestrator-chat-entry-and-trace-separation.md), [SPEC-015](../specs/SPEC-015-cat-capability-registry-and-runtime-skill-mcp-mapping.md), [SPEC-021](../specs/SPEC-021-contextual-mcp-profiles-and-lazy-tool-activation.md), [SPEC-026](../specs/SPEC-026-explicit-mentions-and-dynamic-room-workflow-orchestration.md) |
| [PLAN-020](./PLAN-020-cats-memory-retrieval-and-flush-substrate.md) | Cats Memory Retrieval and Flush Substrate | In Progress (First Slice Landed) | [SPEC-022](../specs/SPEC-022-cats-memory-layering-and-ownership.md), [SPEC-029](../specs/SPEC-029-companion-boxes-ingestion-and-response-profiles.md) |
| [PLAN-019](./PLAN-019-companion-box-sidecar-and-session-hydration.md) | Companion Box Sidecar and Session Hydration | In Progress (First Slice Landed) | [SPEC-029](../specs/SPEC-029-companion-boxes-ingestion-and-response-profiles.md) |
| [PLAN-018](./PLAN-018-rename-the-main-suite-from-cats-inc-to-cats.md) | Rename the Main Suite from cats-inc to cats | Draft (Pending Review) | [ADR-026](../decisions/026-use-cats-as-the-flagship-suite-name-under-cats-inc-brand.md) |
| [PLAN-017](./PLAN-017-suite-host-refactor-for-chat-work-code-and-core.md) | Suite Host Refactor for Chat, Work, Code, and Core | Draft (Pending Review) | [ADR-025](../decisions/025-make-cats-inc-a-suite-host-with-core-owned-product-projections.md) |
| [PLAN-016](./PLAN-016-dynamic-room-workflow-orchestration.md) | Dynamic Room Workflow Orchestration | Draft (Pending Review) | [SPEC-026](../specs/SPEC-026-explicit-mentions-and-dynamic-room-workflow-orchestration.md) |
| [PLAN-015](./PLAN-015-chat-session-sleep-wake-lifecycle.md) | Chat Session Sleep/Wake Lifecycle | Approved | [SPEC-016](../specs/SPEC-016-chat-session-sleep-wake-lifecycle.md) |
| [PLAN-014](./PLAN-014-parallel-workstream-ownership-and-integration-seams.md) | Parallel Product Workstream Ownership and Integration Seams | In Progress (Execution Baseline Landed) | [ADR-007](../decisions/007-establish-cats-core-v1-for-chat-and-work.md), [ADR-025](../decisions/025-make-cats-inc-a-suite-host-with-core-owned-product-projections.md), [ADR-035](../decisions/035-invert-platform-dependency-and-extract-shared-design-layer.md), [ADR-036](../decisions/036-unify-api-contract-and-namespace-endpoints-by-product.md) |
| [PLAN-012](./PLAN-012-first-run-setup-wizard-and-boss-cat-bootstrap.md) | First-Run Setup Wizard and Boss Cat Bootstrap | In Progress (First Slice Landed) | [SPEC-012](../specs/SPEC-012-first-run-setup-wizard-and-boss-cat-bootstrap.md) |
| [PLAN-011](./PLAN-011-primary-orchestrator-chat-entry-and-trace-separation.md) | Primary Orchestrator Chat Entry and Trace Separation | Approved | [SPEC-011](../specs/SPEC-011-primary-orchestrator-chat-entry-and-trace-separation.md) |
| [PLAN-013](./PLAN-013-self-hosted-npm-app-packaging.md) | Self-Hosted npm App Packaging | Draft (Pending Review) | N/A |
| [PLAN-010](./PLAN-010-full-site-routing-and-url-driven-navigation.md) | Full-Site Routing and URL-Driven Navigation | Implemented | [SPEC-010](../specs/SPEC-010-full-site-routing-and-url-driven-navigation.md) |
| [PLAN-009](./PLAN-009-public-surface-naming-refresh.md) | Public-Surface Naming Refresh | Draft (Ready for Specialist Handoff) | [SPEC-009](../specs/SPEC-009-public-surface-naming-refresh.md) |
| [PLAN-008](./PLAN-008-restful-product-api-refactor.md) | RESTful Product API Refactor | Draft (Ready for Specialist Handoff) | [SPEC-008](../specs/SPEC-008-restful-product-api-refactor.md) |
| [PLAN-007](./PLAN-007-chat-contextual-cat-entry.md) | Chat-Contextual Cat Entry | Draft (Pending Review) | [SPEC-007](../specs/SPEC-007-chat-contextual-cat-entry.md) |
| [PLAN-006](./PLAN-006-cats-core-v1-and-suite-foundation.md) | Cats Core v1 and Suite Foundation | Approved | [SPEC-006](../specs/SPEC-006-cats-core-v1-and-suite-foundation.md) |
| [PLAN-005](./PLAN-005-company-control-plane-evolution.md) | Company Control Plane Evolution | Draft (Exploratory, Unreviewed) | [SPEC-005](../specs/SPEC-005-company-control-plane-evolution.md) |
| [PLAN-004](./PLAN-004-runtime-chat-core.md) | Runtime Chat Core | Completed | [SPEC-004](../specs/SPEC-004-runtime-chat-core.md) |
| [PLAN-003](./PLAN-003-local-channel-setup-flow.md) | Local Channel Setup Flow | Completed | [SPEC-003](../specs/SPEC-003-local-channel-setup-flow.md) |
| [PLAN-002](./PLAN-002-chat-renderer-shell.md) | Chat Renderer Shell | Completed | [SPEC-002](../specs/SPEC-002-chat-renderer-shell.md) |
| [PLAN-001](./PLAN-001-initial-chat-shell.md) | Initial Chat Shell | Completed | [SPEC-001](../specs/SPEC-001-initial-chat-shell.md) |
| [000-template](./000-template.md) | Template | - | - |
<!-- Add new plans above this line -->

## For AI Agents

1. **Link to spec**: Always reference the related SPEC document
2. **Update progress**: Mark tasks complete as you work
3. **Log updates**: Add entries to the Progress Log section

---

*Last updated: 2026-03-29*

*See also: [specs/](../specs/) for feature specifications*

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
| [PLAN-020](./PLAN-020-cats-memory-retrieval-and-flush-substrate.md) | Cats Memory Retrieval and Flush Substrate | In Progress (First Slice Landed) | [SPEC-022](../specs/SPEC-022-cats-memory-layering-and-ownership.md), [SPEC-029](../specs/SPEC-029-companion-boxes-ingestion-and-response-profiles.md) |
| [PLAN-019](./PLAN-019-companion-box-sidecar-and-session-hydration.md) | Companion Box Sidecar and Session Hydration | In Progress (First Slice Landed) | [SPEC-029](../specs/SPEC-029-companion-boxes-ingestion-and-response-profiles.md) |
| [PLAN-018](./PLAN-018-rename-the-main-suite-from-cats-inc-to-cats.md) | Rename the Main Suite from cats-inc to cats | Draft (Pending Review) | [ADR-026](../decisions/026-use-cats-as-the-flagship-suite-name-under-cats-inc-brand.md) |
| [PLAN-017](./PLAN-017-suite-host-refactor-for-chat-work-code-and-core.md) | Suite Host Refactor for Chat, Work, Code, and Core | Draft (Pending Review) | [ADR-025](../decisions/025-make-cats-inc-a-suite-host-with-core-owned-product-projections.md) |
| [PLAN-016](./PLAN-016-dynamic-room-workflow-orchestration.md) | Dynamic Room Workflow Orchestration | Draft (Pending Review) | [SPEC-026](../specs/SPEC-026-explicit-mentions-and-dynamic-room-workflow-orchestration.md) |
| [PLAN-015](./PLAN-015-chat-session-sleep-wake-lifecycle.md) | Chat Session Sleep/Wake Lifecycle | Approved | [SPEC-016](../specs/SPEC-016-chat-session-sleep-wake-lifecycle.md) |
| [PLAN-014](./PLAN-014-parallel-workstream-ownership-and-integration-seams.md) | Parallel Workstream Ownership and Integration Seams | Draft (Ready for Specialist Handoff) | [SPEC-013](../specs/SPEC-013-provider-catalog-consumption-and-ui-seam.md), [SPEC-014](../specs/SPEC-014-telegram-boss-cat-relay-mvp.md), [SPEC-015](../specs/SPEC-015-cat-capability-registry-and-runtime-skill-mcp-mapping.md) |
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

*Last updated: 2026-03-23*

*See also: [specs/](../specs/) for feature specifications*



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
| [PLAN-012](./PLAN-012-first-run-setup-wizard-and-boss-cat-bootstrap.md) | First-Run Setup Wizard and Boss Cat Bootstrap | Draft (Pending Review) | [SPEC-012](../specs/SPEC-012-first-run-setup-wizard-and-boss-cat-bootstrap.md) |
| [PLAN-011](./PLAN-011-primary-orchestrator-chat-entry-and-trace-separation.md) | Primary Orchestrator Chat Entry and Trace Separation | Approved | [SPEC-011](../specs/SPEC-011-primary-orchestrator-chat-entry-and-trace-separation.md) |
| [PLAN-010](./PLAN-010-full-site-routing-and-url-driven-navigation.md) | Full-Site Routing and URL-Driven Navigation | Draft (Ready for Specialist Handoff) | [SPEC-010](../specs/SPEC-010-full-site-routing-and-url-driven-navigation.md) |
| [PLAN-009](./PLAN-009-public-surface-naming-refresh.md) | Public-Surface Naming Refresh | Draft (Ready for Specialist Handoff) | [SPEC-009](../specs/SPEC-009-public-surface-naming-refresh.md) |
| [PLAN-008](./PLAN-008-restful-product-api-refactor.md) | RESTful Product API Refactor | Draft (Ready for Specialist Handoff) | [SPEC-008](../specs/SPEC-008-restful-product-api-refactor.md) |
| [PLAN-007](./PLAN-007-chat-contextual-pal-entry.md) | Chat-Contextual Pal Entry | Draft (Pending Review) | [SPEC-007](../specs/SPEC-007-chat-contextual-pal-entry.md) |
| [PLAN-006](./PLAN-006-cats-core-v1-and-suite-foundation.md) | Cats Core v1 and Suite Foundation | Approved | [SPEC-006](../specs/SPEC-006-cats-core-v1-and-suite-foundation.md) |
| [PLAN-005](./PLAN-005-company-control-plane-evolution.md) | Company Control Plane Evolution | Draft (Exploratory, Unreviewed) | [SPEC-005](../specs/SPEC-005-company-control-plane-evolution.md) |
| [PLAN-004](./PLAN-004-runtime-workspace-core.md) | Runtime Workspace Core | Completed | [SPEC-004](../specs/SPEC-004-runtime-workspace-core.md) |
| [PLAN-003](./PLAN-003-local-channel-setup-flow.md) | Local Channel Setup Flow | Completed | [SPEC-003](../specs/SPEC-003-local-channel-setup-flow.md) |
| [PLAN-002](./PLAN-002-workspace-renderer-shell.md) | Workspace Renderer Shell | Completed | [SPEC-002](../specs/SPEC-002-workspace-renderer-shell.md) |
| [PLAN-001](./PLAN-001-initial-workspace-shell.md) | Initial Workspace Shell | Completed | [SPEC-001](../specs/SPEC-001-initial-workspace-shell.md) |
| [000-template](./000-template.md) | Template | - | - |
<!-- Add new plans above this line -->

## For AI Agents

1. **Link to spec**: Always reference the related SPEC document
2. **Update progress**: Mark tasks complete as you work
3. **Log updates**: Add entries to the Progress Log section

---

*Last updated: 2026-03-19*

*See also: [specs/](../specs/) for feature specifications*

# Feature Specifications

> This directory contains feature specifications that define *what* to build and *why*.

## Purpose

Specifications define requirements before implementation begins. They help:

- Clarify what needs to be built
- Get stakeholder approval before coding
- Prevent scope creep during implementation
- Ensure AI agents understand requirements fully

## When to Create a Spec

Create a spec when:

- Adding a new feature with multiple components
- Making changes that affect multiple files or systems
- The feature requires user/stakeholder approval
- Requirements need to be documented for future reference

## Workflow

```
1. Identify need → Create spec
2. Define requirements → Get approval
3. Create plan → Implement
4. Mark as implemented
```

## Naming Convention

```
SPEC-NNN-short-title.md

Examples:
SPEC-001-user-registration.md
SPEC-002-payment-integration.md
SPEC-003-notification-system.md
```

## Template

Use [000-template.md](./000-template.md) as the starting point for new specs.

## Index

| Spec | Title | Status | Related Plan |
|------|-------|--------|--------------|
| [SPEC-008](./SPEC-008-restful-product-api-refactor.md) | RESTful Product API Refactor | Draft (Pending Review) | [PLAN-008](../plans/PLAN-008-restful-product-api-refactor.md) |
| [SPEC-007](./SPEC-007-chat-contextual-pal-entry.md) | Chat-Contextual Pal Entry | Draft (Pending Review) | [PLAN-007](../plans/PLAN-007-chat-contextual-pal-entry.md) |
| [SPEC-006](./SPEC-006-cats-core-v1-and-suite-foundation.md) | Cats Core v1 and Suite Foundation | Approved | [PLAN-006](../plans/PLAN-006-cats-core-v1-and-suite-foundation.md) |
| [SPEC-005](./SPEC-005-company-control-plane-evolution.md) | Company Control Plane Evolution | Draft (Exploratory, Unreviewed) | [PLAN-005](../plans/PLAN-005-company-control-plane-evolution.md) |
| [SPEC-004](./SPEC-004-runtime-workspace-core.md) | Runtime Workspace Core | Implemented | [PLAN-004](../plans/PLAN-004-runtime-workspace-core.md) |
| [SPEC-003](./SPEC-003-local-channel-setup-flow.md) | Local Channel Setup Flow | Implemented | [PLAN-003](../plans/PLAN-003-local-channel-setup-flow.md) |
| [SPEC-002](./SPEC-002-workspace-renderer-shell.md) | Workspace Renderer Shell | Implemented | [PLAN-002](../plans/PLAN-002-workspace-renderer-shell.md) |
| [SPEC-001](./SPEC-001-initial-workspace-shell.md) | Initial Workspace Shell | Implemented | [PLAN-001](../plans/PLAN-001-initial-workspace-shell.md) |
| [000-template](./000-template.md) | Template | - | - |
<!-- Add new specs above this line -->

## For AI Agents

1. **Before implementing**: Create spec for complex features
2. **Get approval**: Wait for review before proceeding to implementation
3. **Link to plan**: Reference the related PLAN document when created

---

*Last updated: 2026-03-18*

*See also: [plans/](../plans/) for implementation plans*

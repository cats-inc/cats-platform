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
| [SPEC-027](./SPEC-027-chat-first-information-architecture-and-default-boss-cat.md) | Chat-First Information Architecture and Default Boss Cat | Approved | - |
| [SPEC-026](./SPEC-026-explicit-mentions-and-dynamic-room-workflow-orchestration.md) | Explicit Mentions and Dynamic Room Workflow Orchestration | Draft (Pending Review) | [PLAN-016](../plans/PLAN-016-dynamic-room-workflow-orchestration.md) |
| [SPEC-025](./SPEC-025-budget-policy-override-flows-and-war-room-dashboard.md) | Budget Policy, Override Flows, and War-Room Dashboard | Draft (Pending Review) | - |
| [SPEC-024](./SPEC-024-chat-delivery-policy-and-governance-levels.md) | Chat Delivery Policy and Governance Levels | Draft (Pending Review) | - |
| [SPEC-023](./SPEC-023-packaged-setup-wizard-and-provider-installation.md) | Packaged Setup Wizard and Provider Installation | Draft (Pending Review) | - |
| [SPEC-022](./SPEC-022-cats-memory-layering-and-ownership.md) | Cats Memory Layering and Ownership | Draft (Pending Review) | - |
| [SPEC-021](./SPEC-021-contextual-mcp-profiles-and-lazy-tool-activation.md) | Contextual MCP Profiles and Lazy Tool Activation | Draft (Pending Review) | - |
| [SPEC-020](./SPEC-020-embedded-preview-surfaces-for-runtime-artifacts-and-services.md) | Embedded Preview Surfaces for Runtime Artifacts and Services | Draft (Pending Review) | - |
| [SPEC-019](./SPEC-019-product-skill-profiles-and-runtime-skill-manifests.md) | Product Skill Profiles and Runtime Skill Manifests | Draft (Pending Review) | - |
| [SPEC-018](./SPEC-018-direct-cat-chat-and-conversation-routing-layer.md) | Direct Cat Chat and Conversation Routing Layer | Draft (Pending Review) | - |
| [SPEC-017](./SPEC-017-telegram-inbox-and-room-routing.md) | Telegram Inbox and Room Routing | Draft (Pending Review) | - |
| [SPEC-016](./SPEC-016-chat-session-sleep-wake-lifecycle.md) | Chat Session Sleep/Wake Lifecycle | Approved | [PLAN-015](../plans/PLAN-015-chat-session-sleep-wake-lifecycle.md) |
| [SPEC-015](./SPEC-015-cat-capability-registry-and-runtime-skill-mcp-mapping.md) | Cat Capability Registry and Runtime Skill/MCP Mapping | Draft (Ready for Specialist Handoff) | [PLAN-014](../plans/PLAN-014-parallel-workstream-ownership-and-integration-seams.md) |
| [SPEC-014](./SPEC-014-telegram-boss-cat-relay-mvp.md) | Telegram Boss Cat Relay MVP | Draft (Ready for Specialist Handoff) | [PLAN-014](../plans/PLAN-014-parallel-workstream-ownership-and-integration-seams.md) |
| [SPEC-013](./SPEC-013-provider-catalog-consumption-and-ui-seam.md) | Provider Catalog Consumption and UI Seam | Draft (Ready for Specialist Handoff) | [PLAN-014](../plans/PLAN-014-parallel-workstream-ownership-and-integration-seams.md) |
| [SPEC-012](./SPEC-012-first-run-setup-wizard-and-boss-cat-bootstrap.md) | First-Run Setup Wizard and Boss Cat Bootstrap | Draft (Aligned with SPEC-027) | [PLAN-012](../plans/PLAN-012-first-run-setup-wizard-and-boss-cat-bootstrap.md) |
| [SPEC-011](./SPEC-011-primary-orchestrator-chat-entry-and-trace-separation.md) | Primary Orchestrator Chat Entry and Trace Separation | Approved | [PLAN-011](../plans/PLAN-011-primary-orchestrator-chat-entry-and-trace-separation.md) |
| [SPEC-010](./SPEC-010-full-site-routing-and-url-driven-navigation.md) | Full-Site Routing and URL-Driven Navigation | Draft (Pending Review) | [PLAN-010](../plans/PLAN-010-full-site-routing-and-url-driven-navigation.md) |
| [SPEC-009](./SPEC-009-public-surface-naming-refresh.md) | Public-Surface Naming Refresh | Draft (Pending Review) | [PLAN-009](../plans/PLAN-009-public-surface-naming-refresh.md) |
| [SPEC-008](./SPEC-008-restful-product-api-refactor.md) | RESTful Product API Refactor | Draft (Pending Review) | [PLAN-008](../plans/PLAN-008-restful-product-api-refactor.md) |
| [SPEC-007](./SPEC-007-chat-contextual-cat-entry.md) | Chat-Contextual Cat Entry | Draft (Narrowed by SPEC-027) | [PLAN-007](../plans/PLAN-007-chat-contextual-cat-entry.md) |
| [SPEC-006](./SPEC-006-cats-core-v1-and-suite-foundation.md) | Cats Core v1 and Suite Foundation | Approved | [PLAN-006](../plans/PLAN-006-cats-core-v1-and-suite-foundation.md) |
| [SPEC-005](./SPEC-005-company-control-plane-evolution.md) | Company Control Plane Evolution | Draft (Exploratory, Unreviewed) | [PLAN-005](../plans/PLAN-005-company-control-plane-evolution.md) |
| [SPEC-004](./SPEC-004-runtime-chat-core.md) | Runtime Chat Core | Implemented | [PLAN-004](../plans/PLAN-004-runtime-chat-core.md) |
| [SPEC-003](./SPEC-003-local-channel-setup-flow.md) | Local Channel Setup Flow | Implemented | [PLAN-003](../plans/PLAN-003-local-channel-setup-flow.md) |
| [SPEC-002](./SPEC-002-chat-renderer-shell.md) | Chat Renderer Shell | Implemented | [PLAN-002](../plans/PLAN-002-chat-renderer-shell.md) |
| [SPEC-001](./SPEC-001-initial-chat-shell.md) | Initial Chat Shell | Implemented | [PLAN-001](../plans/PLAN-001-initial-chat-shell.md) |
| [000-template](./000-template.md) | Template | - | - |
<!-- Add new specs above this line -->

## For AI Agents

1. **Before implementing**: Create spec for complex features
2. **Get approval**: Wait for review before proceeding to implementation
3. **Link to plan**: Reference the related PLAN document when created

---

*Last updated: 2026-03-22*

*See also: [plans/](../plans/) for implementation plans*






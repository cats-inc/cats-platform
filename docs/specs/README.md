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
| [SPEC-058](./SPEC-058-interaction-core-and-domain-materialization.md) | Interaction Core and Domain Materialization | Draft | TBD, [ADR-059](../decisions/059-adopt-a-unified-conversation-turn-lane-engine.md) |
| [SPEC-057](./SPEC-057-concurrent-group-lane-native-live-transcript.md) | Concurrent Group Lane-Native Live Transcript | Draft | [PLAN-048](../plans/PLAN-048-concurrent-group-lane-native-live-transcript.md), [ADR-058](../decisions/058-adopt-lane-native-concurrent-group-transcript-delivery.md) |
| [SPEC-056](./SPEC-056-segment-native-assistant-transcript-delivery.md) | Segment-Native Assistant Transcript Delivery | Draft | [PLAN-047](../plans/PLAN-047-segment-native-assistant-transcript-delivery.md), [ADR-057](../decisions/057-adopt-segment-native-assistant-transcript-delivery.md) |
| [SPEC-055](./SPEC-055-shared-audience-participant-builder.md) | Shared Audience-Participant Builder | Draft | [PLAN-046](../plans/PLAN-046-shared-audience-participant-builder.md), [ADR-056](../decisions/056-use-a-shared-audience-participant-builder-for-all-composer-surfaces.md) |
| [SPEC-054](./SPEC-054-bootstrap-recovery-summary-and-bounded-detail-actions.md) | Bootstrap Recovery Summary and Bounded Detail Actions | Draft | [PLAN-044](../plans/PLAN-044-bootstrap-recovery-summary-and-bounded-detail-actions.md) |
| [SPEC-053](./SPEC-053-post-setup-environment-status-and-recovery-entry.md) | Post-Setup Environment Status and Recovery Entry | Draft | [PLAN-043](../plans/PLAN-043-post-setup-environment-status-and-recovery-entry.md) |
| [SPEC-052](./SPEC-052-current-turn-recipients-dispatch-policy-and-parallel-chat-terminology.md) | Current-Turn Recipients, Dispatch Policy, and Parallel Chat Terminology | Approved | TBD |
| [SPEC-051](./SPEC-051-guide-cat-sidecar-and-day-0-assist-surfaces.md) | Guide Cat Sidecar and Day-0 Assist Surfaces | Draft | [PLAN-041](../plans/PLAN-041-guide-cat-sidecar-and-day-0-assist-rollout.md) |
| [SPEC-050](./SPEC-050-group-chat-temporary-participants-and-reusable-lightweight-presets.md) | Group Chat Temporary Participants and Reusable Lightweight Presets | Draft | TBD |
| [SPEC-049](./SPEC-049-guide-cat-setup-and-generalized-participant-entry.md) | Guide Cat Setup and Generalized Participant Entry | Draft | [PLAN-038](../plans/PLAN-038-guide-cat-setup-and-participant-generalization.md) |
| [SPEC-048](./SPEC-048-runtime-session-deletion-on-product-delete.md) | Runtime Session Deletion on Product Delete | Approved | [PLAN-037](../plans/PLAN-037-runtime-session-deletion-on-product-delete.md) |
| [SPEC-047](./SPEC-047-compare-chat-concurrent-groups-and-relay.md) | Parallel Chat, Parallel Chat Groups, and Relay Actions | Implemented (First Slice Landed) | [PLAN-036](../plans/PLAN-036-compare-chat-concurrent-groups-and-relay.md) |
| [SPEC-046](./SPEC-046-platform-product-landing-and-installed-apps.md) | Platform Product Landing and Installed Apps | Draft | [PLAN-035](../plans/PLAN-035-platform-product-landing-and-installed-apps.md) |
| [SPEC-045](./SPEC-045-cross-layer-bootstrap-and-onboarding-diagnostics.md) | Cross-Layer Bootstrap and Onboarding Diagnostics | Approved | [PLAN-034](../plans/PLAN-034-cross-layer-bootstrap-and-onboarding-diagnostics.md) |
| [SPEC-044](./SPEC-044-integrate-packaged-setup-with-runtime-bootstrap.md) | Integrate Packaged Setup with Runtime Bootstrap | Approved | [PLAN-033](../plans/PLAN-033-integrate-packaged-setup-with-runtime-bootstrap.md) |
| [SPEC-043](./SPEC-043-cats-code-mvp-multi-agent-local-app-workflow.md) | Cats Code MVP Multi-Agent Local-App Workflow | Draft | [PLAN-032](../plans/PLAN-032-cats-code-mvp-fan-out-relay-and-convergence.md) |
| [SPEC-042](./SPEC-042-platform-renderer-route-level-chunking-and-lazy-entry.md) | Platform Renderer Route-Level Chunking and Lazy Entry | Draft | TBD |
| [SPEC-041](./SPEC-041-cats-code-v1-local-builder-loop.md) | Cats Code v1 Local Builder Loop | Draft | [PLAN-029](../plans/PLAN-029-cats-code-v1-local-builder-loop.md) |
| [SPEC-040](./SPEC-040-cats-work-team-templates-and-work-intake.md) | Cats Work Team Templates and Work Intake | Draft | [PLAN-028](../plans/PLAN-028-cats-work-team-templates-and-work-intake.md) |
| [SPEC-039](./SPEC-039-cats-chat-v1-priority-items.md) | Cats Chat v1 Priority Items | Draft | [PLAN-027](../plans/PLAN-027-cats-chat-v1-priority-items.md) |
| [SPEC-038](./SPEC-038-telegram-bot-commands-and-transport-control-surface.md) | Telegram Bot Commands and Transport Control Surface | Draft | TBD |
| [SPEC-037](./SPEC-037-transport-driven-live-chat-updates-and-private-lane-transition.md) | Transport-Driven Live Chat Updates and Private-Lane Transition | Draft | [PLAN-026](../plans/PLAN-026-transport-live-updates-and-private-lane-transition.md) |
| [SPEC-036](./SPEC-036-companion-workspace-presence-and-settings.md) | Companion Workspace, Presence, and Settings | Draft | [PLAN-025](../plans/PLAN-025-companion-workspace-presence-and-settings.md) |
| [SPEC-035](./SPEC-035-cross-product-task-strategy-handoff-and-runtime-bridge.md) | Cross-Product Task Strategy Handoff and Runtime Bridge | Draft | TBD |
| [SPEC-034](./SPEC-034-room-owned-workspace-bootstrap-and-ownership.md) | Room-Owned Workspace Bootstrap and Ownership Semantics | Draft (Pending Review) | - |
| [SPEC-031](./SPEC-031-built-in-memory-extraction-durable-sync-and-retrieval-context.md) | Built-In Memory Extraction, Durable Sync, and Retrieval Context | Draft (Pending Review) | - |
| [SPEC-030](./SPEC-030-composer-scoped-lead-cat-and-boss-auto-helper-semantics.md) | Composer-Scoped Lead Cat and Boss Auto-Helper Semantics | Superseded by SPEC-052 | - |
| [SPEC-029](./SPEC-029-companion-boxes-ingestion-and-response-profiles.md) | Companion Boxes, Ingestion, and Response Profiles | In Progress (First Slice Landed) | [PLAN-019](../plans/PLAN-019-companion-box-sidecar-and-session-hydration.md) |
| [SPEC-028](./SPEC-028-automated-tunnel-and-telegram-webhook-lifecycle.md) | Telegram Polling-First Setup and Optional Webhook Ingress | In Progress (Polling-first slice landed) | - |
| [SPEC-027](./SPEC-027-chat-first-information-architecture-and-default-boss-cat.md) | Chat-First Information Architecture and Default Boss Cat | Approved | - |
| [SPEC-026](./SPEC-026-explicit-mentions-and-dynamic-room-workflow-orchestration.md) | Explicit Mentions and Dynamic Room Workflow Orchestration | Draft (Pending Review) | [PLAN-016](../plans/PLAN-016-dynamic-room-workflow-orchestration.md) |
| [SPEC-025](./SPEC-025-budget-policy-override-flows-and-war-room-dashboard.md) | Budget Policy, Override Flows, and War-Room Dashboard | Draft (Pending Review) | - |
| [SPEC-024](./SPEC-024-chat-delivery-policy-and-governance-levels.md) | Chat Delivery Policy and Governance Levels | Draft (Pending Review) | - |
| [SPEC-023](./SPEC-023-packaged-setup-wizard-and-provider-installation.md) | Packaged Setup Wizard and Provider Installation | In Progress (First Host Slice Landed) | [PLAN-030](../plans/PLAN-030-packaged-setup-wizard-and-provider-installation.md) |
| [SPEC-022](./SPEC-022-cats-memory-layering-and-ownership.md) | Cats Memory Layering and Ownership | Draft (Pending Review) | - |
| [SPEC-021](./SPEC-021-contextual-mcp-profiles-and-lazy-tool-activation.md) | Contextual MCP Profiles and Lazy Tool Activation | Draft (Pending Review) | - |
| [SPEC-020](./SPEC-020-embedded-preview-surfaces-for-runtime-artifacts-and-services.md) | Embedded Preview Surfaces for Runtime Artifacts and Services | Draft (Pending Review) | - |
| [SPEC-019](./SPEC-019-product-skill-profiles-and-runtime-skill-manifests.md) | Product Skill Profiles and Runtime Skill Manifests | Draft (Pending Review) | - |
| [SPEC-018](./SPEC-018-direct-cat-chat-and-conversation-routing-layer.md) | Direct Cat Chat and Conversation Routing Layer | In Progress (First Slice Landed) | - |
| [SPEC-017](./SPEC-017-telegram-inbox-and-room-routing.md) | Telegram Inbox and Room Routing | In Progress (Boss Cat inbox MVP landed) | - |
| [SPEC-016](./SPEC-016-chat-session-sleep-wake-lifecycle.md) | Chat Session Sleep/Wake Lifecycle | Approved | [PLAN-015](../plans/PLAN-015-chat-session-sleep-wake-lifecycle.md) |
| [SPEC-015](./SPEC-015-cat-capability-registry-and-runtime-skill-mcp-mapping.md) | Cat Capability Registry and Runtime Skill/MCP Mapping | Draft (Ready for Specialist Handoff) | [PLAN-014](../plans/PLAN-014-parallel-workstream-ownership-and-integration-seams.md) |
| [SPEC-014](./SPEC-014-telegram-boss-cat-relay-mvp.md) | Telegram Boss Cat Relay MVP | Draft (Ready for Specialist Handoff) | [PLAN-014](../plans/PLAN-014-parallel-workstream-ownership-and-integration-seams.md) |
| [SPEC-013](./SPEC-013-provider-catalog-consumption-and-ui-seam.md) | Provider Catalog Consumption and UI Seam | Draft (Ready for Specialist Handoff) | [PLAN-014](../plans/PLAN-014-parallel-workstream-ownership-and-integration-seams.md) |
| [SPEC-012](./SPEC-012-first-run-setup-wizard-and-boss-cat-bootstrap.md) | First-Run Setup Wizard and Boss Cat Bootstrap | In Progress (First Slice Landed) | [PLAN-012](../plans/PLAN-012-first-run-setup-wizard-and-boss-cat-bootstrap.md) |
| [SPEC-011](./SPEC-011-primary-orchestrator-chat-entry-and-trace-separation.md) | Primary Orchestrator Chat Entry and Trace Separation | Approved | [PLAN-011](../plans/PLAN-011-primary-orchestrator-chat-entry-and-trace-separation.md) |
| [SPEC-010](./SPEC-010-full-site-routing-and-url-driven-navigation.md) | Full-Site Routing and URL-Driven Navigation | Draft (Pending Review) | [PLAN-010](../plans/PLAN-010-full-site-routing-and-url-driven-navigation.md) |
| [SPEC-009](./SPEC-009-public-surface-naming-refresh.md) | Public-Surface Naming Refresh | Draft (Pending Review) | [PLAN-009](../plans/PLAN-009-public-surface-naming-refresh.md) |
| [SPEC-008](./SPEC-008-restful-product-api-refactor.md) | RESTful Product API Refactor | Draft (Pending Review) | [PLAN-008](../plans/PLAN-008-restful-product-api-refactor.md) |
| [SPEC-007](./SPEC-007-chat-contextual-cat-entry.md) | Chat-Contextual Cat Entry | Draft (Narrowed by SPEC-027) | [PLAN-007](../plans/PLAN-007-chat-contextual-cat-entry.md) |
| [SPEC-006](./SPEC-006-cats-core-v1-and-platform-foundation.md) | Cats Core v1 and Platform Foundation | Approved | [PLAN-006](../plans/PLAN-006-cats-core-v1-and-platform-foundation.md) |
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

*Last updated: 2026-04-14*

*See also: [plans/](../plans/) for implementation plans*

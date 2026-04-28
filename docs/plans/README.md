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
| [PLAN-080](./PLAN-080-provider-capability-bootstrap-config-rollout.md) | Provider Capability Bootstrap Config Rollout | Complete | [SPEC-082](../specs/SPEC-082-cats-work-agent-supervision-and-tool-boundary.md), [ADR-082](../decisions/082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md), [PLAN-075](./PLAN-075-real-provider-orchestrator-integration.md) |
| [PLAN-079](./PLAN-079-work-graph-link-relations-rollout.md) | Work Graph Link Relations Rollout | Draft | [SPEC-090](../specs/SPEC-090-work-graph-link-relations.md), [ADR-086](../decisions/086-adopt-n-to-m-work-graph-link-relations.md) |
| [PLAN-078](./PLAN-078-linux-composer-voice-input-whisper-cpp-rollout.md) | Linux Composer Voice Input whisper.cpp Rollout | Cancelled (not adopted) | [SPEC-087](../specs/SPEC-087-linux-composer-voice-input-via-bundled-whisper-cpp.md), [ADR-085](../decisions/085-bundle-whisper-cpp-on-linux-for-composer-voice-input.md) |
| [PLAN-077](./PLAN-077-companion-profile-and-share-preview-rollout.md) | Companion Profile and Share Preview Rollout | Implementation complete behind plain feature flag (no production guard) | [SPEC-085](../specs/SPEC-085-companion-profile-feed-and-library-ia.md), [SPEC-086](../specs/SPEC-086-shareable-companion-content-links-and-chat-previews.md), [ADR-084](../decisions/084-adopt-companion-profile-ia-and-shareable-content-references.md) |
| [PLAN-076](./PLAN-076-composer-voice-input-native-stt-rollout.md) | Composer Voice Input Native STT Rollout | Draft | [SPEC-084](../specs/SPEC-084-composer-voice-input-via-platform-native-stt.md), [ADR-079](../decisions/079-use-platform-native-stt-with-linux-toast-fallback.md) |
| [PLAN-075](./PLAN-075-real-provider-orchestrator-integration.md) | Real Provider Orchestrator Integration | Complete | [PLAN-074](./PLAN-074-cats-work-agent-supervision-rollout.md), [PLAN-080](./PLAN-080-provider-capability-bootstrap-config-rollout.md), [SPEC-082](../specs/SPEC-082-cats-work-agent-supervision-and-tool-boundary.md), [ADR-082](../decisions/082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md) |
| [PLAN-074](./PLAN-074-cats-work-agent-supervision-rollout.md) | Cats Work Agent Supervision Rollout | Ready for Review | [SPEC-082](../specs/SPEC-082-cats-work-agent-supervision-and-tool-boundary.md), [ADR-082](../decisions/082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md) |
| [PLAN-073](./PLAN-073-transport-fanout-rollout.md) | Transport Fanout Rollout | Draft | [SPEC-081](../specs/SPEC-081-transport-fanout-for-web-originated-messages.md), [ADR-080](../decisions/080-fan-out-web-originated-messages-to-bound-transports.md) |
| [PLAN-071](./PLAN-071-region-screenshot-composer-rollout.md) | Region Screenshot Composer Rollout | Draft | [SPEC-079](../specs/SPEC-079-region-screenshot-composer-attachments.md), [ADR-078](../decisions/078-use-electron-native-region-screenshot-with-web-fallback.md) |
| [PLAN-070](./PLAN-070-programmable-per-branch-draft-rollout.md) | Programmable Per-Branch Draft Rollout | In Progress (Phase 1 Schema Landed) | [SPEC-078](../specs/SPEC-078-per-branch-draft-state-schema.md), [ADR-077](../decisions/077-make-parallel-draft-state-per-branch-addressable-for-orchestrator-composition.md) |
| [PLAN-069](./PLAN-069-compare-draft-carousel-rollout.md) | Compare Draft Carousel Rollout | Phase 1 Complete (follow-on in PLAN-070) | [SPEC-077](../specs/SPEC-077-compare-draft-carousel-and-per-card-chrome.md), [ADR-076](../decisions/076-lay-parallel-draft-branches-in-a-3d-compare-carousel.md) |
| [PLAN-068](./PLAN-068-per-entity-state-subscription-rollout.md) | Per-Entity State Subscription Rollout | Draft | [SPEC-076](../specs/SPEC-076-per-entity-state-subscription-protocol.md), [ADR-075](../decisions/075-adopt-push-based-per-entity-state-subscription.md), [ADR-041](../decisions/041-push-transport-and-chat-invalidations-over-sse.md) |
| [PLAN-067](./PLAN-067-platform-browser-ingress-rollout.md) | Platform Browser Ingress Rollout | In Progress | [SPEC-075](../specs/SPEC-075-platform-browser-ingress-for-lan-and-tunneled-access.md), [ADR-074](../decisions/074-keep-browser-ingress-at-platform-host-and-phase-lan-before-tunnels.md) |
| [PLAN-066](./PLAN-066-cross-surface-draft-dispatch-and-warm-product-handoff-rollout.md) | Cross-Surface Draft Dispatch and Warm Product Handoff Rollout | Draft | [SPEC-074](../specs/SPEC-074-cross-surface-draft-dispatch-and-warm-product-handoff.md), [ADR-073](../decisions/073-use-target-surface-dispatch-and-warm-cross-surface-handoff.md) |
| [PLAN-065](./PLAN-065-settings-composition-layer-rollout.md) | Settings Composition Layer Rollout | Draft | [SPEC-073](../specs/SPEC-073-settings-composition-layer.md), [ADR-072](../decisions/072-settings-composition-layer-in-design.md) |
| [PLAN-064](./PLAN-064-new-code-mvp-task-run-artifact-materialization.md) | New Code MVP Task, Run, and Artifact Materialization | Draft (Build/Relay sidebar dependencies retired) | [SPEC-043](../specs/SPEC-043-cats-code-mvp-multi-agent-local-app-workflow.md), [SPEC-041](../specs/SPEC-041-cats-code-v1-local-builder-loop.md) (stopped), [SPEC-061](../specs/SPEC-061-concurrent-parallel-semantics-and-code-entry-presets.md), [PLAN-029](./PLAN-029-cats-code-v1-local-builder-loop.md) (stopped), [PLAN-032](./PLAN-032-cats-code-mvp-fan-out-relay-and-convergence.md) (stopped) |
| [PLAN-063](./PLAN-063-guide-cat-renderer-owned-ui-preferences-migration.md) | Guide Cat Renderer-Owned UI Preferences Migration | In Progress (Primary Migration Landed) | [SPEC-071](../specs/SPEC-071-guide-cat-placement-and-shared-chrome-docking.md), [ADR-070](../decisions/070-use-a-surface-safe-floating-and-shared-chrome-docked-guide-cat-placement-model.md), [PLAN-061](./PLAN-061-guide-cat-placement-and-shared-chrome-docking-rollout.md) |
| [PLAN-062](./PLAN-062-runtime-session-policy-boundary-hardening.md) | Runtime Session Policy Boundary Hardening | In Progress (First Slice Landed) | [SPEC-072](../specs/SPEC-072-runtime-session-policy-boundary-validation.md), [ADR-071](../decisions/071-reject-invalid-runtime-session-policy-combinations-at-create-boundary.md) |
| [PLAN-061](./PLAN-061-guide-cat-placement-and-shared-chrome-docking-rollout.md) | Guide Cat Placement and Shared-Chrome Docking Rollout | In Progress (MVP Landed) | [SPEC-071](../specs/SPEC-071-guide-cat-placement-and-shared-chrome-docking.md), [ADR-070](../decisions/070-use-a-surface-safe-floating-and-shared-chrome-docked-guide-cat-placement-model.md) |
| [PLAN-060](./PLAN-060-product-scoped-recents-and-origin-surface-rollout.md) | Product-Scoped Recents and Origin-Surface Rollout | In Progress | [SPEC-070](../specs/SPEC-070-product-scoped-recents-and-channel-origin-surfaces.md), [ADR-069](../decisions/069-scope-recents-to-channel-origin-surface-by-default.md) |
| [PLAN-059](./PLAN-059-guide-cat-assist-content-cache-and-offline-refresh.md) | Guide Cat Assist Content Cache and Offline Refresh | Draft | [SPEC-067](../specs/SPEC-067-guide-cat-assist-content-cache-and-offline-refresh.md), [ADR-066](../decisions/066-persist-guide-cat-assist-content-as-platform-owned-local-state.md) |
| [PLAN-058](./PLAN-058-concurrent-chatview-presentation-modes-and-policy-aware-cluster-projection.md) | Concurrent ChatView Presentation Modes and Policy-Aware Cluster Projection | Draft | [SPEC-066](../specs/SPEC-066-concurrent-chatview-presentation-modes-and-policy-aware-cluster-projection.md) |
| [PLAN-057](./PLAN-057-core-contract-freeze-and-first-migration-wave.md) | Core Contract Freeze and First Migration Wave | Draft | [SPEC-065](../specs/SPEC-065-core-contract-freeze-and-first-migration-wave.md) |
| [PLAN-056](./PLAN-056-my-cats-platform-home-and-lens-projections.md) | MY CATS Platform Home and Lens Projections | Draft | [SPEC-064](../specs/SPEC-064-my-cats-platform-home-and-lens-projections.md), [ADR-065](../decisions/065-keep-my-cats-as-one-platform-agent-home-with-lenses.md) |
| [PLAN-055](./PLAN-055-conversational-and-operational-agent-projections.md) | Conversational and Operational Agent Projections | Draft | [SPEC-063](../specs/SPEC-063-conversational-vs-operational-agents-and-surface-projections.md), [ADR-064](../decisions/064-project-conversational-agents-into-chat-and-operational-agents-into-work.md) |
| [PLAN-054](./PLAN-054-agent-missions-managed-work-and-transport-bindings.md) | Agent Missions, Managed Work, and Transport Bindings | Draft | [SPEC-062](../specs/SPEC-062-agent-missions-and-transport-bindings.md), [ADR-063](../decisions/063-agent-missions-and-transport-bindings.md) |
| [PLAN-053](./PLAN-053-concurrent-parallel-semantics-and-code-entry-presets.md) | Concurrent, Parallel, Code Entry Presets, and Chat Continuity Follow-Through | In Progress | [SPEC-061](../specs/SPEC-061-concurrent-parallel-semantics-and-code-entry-presets.md), [SPEC-069](../specs/SPEC-069-chat-continuity-semantics-and-context-transplant.md), [ADR-062](../decisions/062-separate-concurrent-turn-fan-out-from-parallel-container-composition.md), [ADR-068](../decisions/068-own-chat-continuity-semantics-above-runtime-session-boundaries.md) |
| [PLAN-052](./PLAN-052-guide-cat-optional-surface-assist-capability.md) | Guide Cat Optional Surface-Assist Capability | Draft | [SPEC-060](../specs/SPEC-060-guide-cat-optional-surface-assist-capability.md), [ADR-061](../decisions/061-treat-guide-cat-as-an-optional-surface-assist-capability.md) |
| [PLAN-051](./PLAN-051-heterogeneous-runtime-delivery-normalization.md) | Heterogeneous Runtime Delivery Normalization | Draft | [SPEC-059](../specs/SPEC-059-heterogeneous-runtime-delivery-normalization.md), [ADR-060](../decisions/060-normalize-heterogeneous-runtime-delivery-into-product-events.md) |
| [PLAN-050](./PLAN-050-interaction-core-and-domain-materialization.md) | Interaction Core and Domain Materialization | Draft | [SPEC-058](../specs/SPEC-058-interaction-core-and-domain-materialization.md), [ADR-059](../decisions/059-adopt-a-unified-conversation-turn-lane-engine.md) |
| [PLAN-049](./PLAN-049-unified-conversation-turn-lane-engine.md) | Unified Conversation-Turn-Lane Engine | Completed | [ADR-059](../decisions/059-adopt-a-unified-conversation-turn-lane-engine.md) |
| [PLAN-048](./PLAN-048-concurrent-group-lane-native-live-transcript.md) | Concurrent Group Lane-Native Live Transcript | Draft | [SPEC-057](../specs/SPEC-057-concurrent-group-lane-native-live-transcript.md), [ADR-058](../decisions/058-adopt-lane-native-concurrent-group-transcript-delivery.md) |
| [PLAN-047](./PLAN-047-segment-native-assistant-transcript-delivery.md) | Segment-Native Assistant Transcript Delivery | Draft | [SPEC-056](../specs/SPEC-056-segment-native-assistant-transcript-delivery.md), [ADR-057](../decisions/057-adopt-segment-native-assistant-transcript-delivery.md) |
| [PLAN-046](./PLAN-046-shared-audience-participant-builder.md) | Shared Audience-Participant Builder | Draft | [SPEC-055](../specs/SPEC-055-shared-audience-participant-builder.md), [ADR-056](../decisions/056-use-a-shared-audience-participant-builder-for-all-composer-surfaces.md) |
| [PLAN-045](./PLAN-045-acknowledged-user-turn-status-and-last-message-retry.md) | ACK-First User-Turn Status and Last-Message Retry | Draft | [ADR-050](../decisions/050-use-ack-first-chat-dispatch-lifecycle.md) |
| [PLAN-044](./PLAN-044-bootstrap-recovery-summary-and-bounded-detail-actions.md) | Bootstrap Recovery Summary and Bounded Detail Actions | Draft | [SPEC-054](../specs/SPEC-054-bootstrap-recovery-summary-and-bounded-detail-actions.md) |
| [PLAN-042](./PLAN-042-recipient-centric-composer-and-parallel-chat-terminology-rename.md) | Recipient-Centric Composer and Parallel Chat Terminology Rename | Draft | [SPEC-052](../specs/SPEC-052-current-turn-recipients-dispatch-policy-and-parallel-chat-terminology.md), [ADR-055](../decisions/055-retire-lead-and-separate-composer-recipients-from-dispatch-policy.md) |
| [PLAN-043](./PLAN-043-post-setup-environment-status-and-recovery-entry.md) | Post-Setup Environment Status and Recovery Entry | Draft | [SPEC-053](../specs/SPEC-053-post-setup-environment-status-and-recovery-entry.md) |
| [PLAN-041](./PLAN-041-guide-cat-sidecar-and-day-0-assist-rollout.md) | Guide Cat Sidecar and Day-0 Assist Rollout | Superseded by PLAN-061 | [SPEC-051](../specs/SPEC-051-guide-cat-sidecar-and-day-0-assist-surfaces.md), [ADR-054](../decisions/054-use-a-platform-level-guide-sidecar-for-day-0-assist.md) |
| [PLAN-039](./PLAN-039-normalize-desktop-source-and-build-output-layout.md) | Normalize Desktop Source and Build Output Layout Across `cats-platform` and `cats-runtime` | Draft | N/A |
| [PLAN-038](./PLAN-038-guide-cat-setup-and-participant-generalization.md) | Guide Cat Setup and Participant Generalization | Draft | [SPEC-049](../specs/SPEC-049-guide-cat-setup-and-generalized-participant-entry.md), [ADR-051](../decisions/051-generalize-participants-and-adopt-guide-cat-terminology.md) |
| [PLAN-037](./PLAN-037-runtime-session-deletion-on-product-delete.md) | Runtime Session Deletion on Product Delete | Draft | [SPEC-048](../specs/SPEC-048-runtime-session-deletion-on-product-delete.md), [ADR-049](../decisions/049-cascade-product-deletes-into-runtime-session-deletion.md) |
| [PLAN-036](./PLAN-036-compare-chat-concurrent-groups-and-relay.md) | Parallel Chat, Parallel Chat Groups, and Relay | Completed (First Slice Landed) | [SPEC-047](../specs/SPEC-047-compare-chat-concurrent-groups-and-relay.md) |
| [PLAN-035](./PLAN-035-platform-product-landing-and-installed-apps.md) | Platform Product Landing and Installed Apps | Draft | [SPEC-046](../specs/SPEC-046-platform-product-landing-and-installed-apps.md), [ADR-048](../decisions/048-separate-platform-products-from-installable-apps.md) |
| [PLAN-034](./PLAN-034-cross-layer-bootstrap-and-onboarding-diagnostics.md) | Cross-Layer Bootstrap and Onboarding Diagnostics | Draft (Implementation Ready) | [SPEC-045](../specs/SPEC-045-cross-layer-bootstrap-and-onboarding-diagnostics.md), [ADR-047](../decisions/047-separate-bootstrap-diagnostics-by-layer-and-aggregate-in-the-host.md) |
| [PLAN-033](./PLAN-033-integrate-packaged-setup-with-runtime-bootstrap.md) | Integrate Packaged Setup with Runtime Bootstrap | Draft | [SPEC-044](../specs/SPEC-044-integrate-packaged-setup-with-runtime-bootstrap.md), [ADR-046](../decisions/046-drive-packaged-setup-through-runtime-bootstrap-apis.md) |
| [PLAN-032](./PLAN-032-cats-code-mvp-fan-out-relay-and-convergence.md) | Cats Code MVP Fan-Out, Relay, and Convergence | Stopped (Relay sidebar surface retired) | [SPEC-043](../specs/SPEC-043-cats-code-mvp-multi-agent-local-app-workflow.md) |
| [PLAN-031](./PLAN-031-rename-the-main-platform-host-from-cats-to-cats-platform.md) | Rename the Main Platform Host from cats to cats-platform | Draft | N/A |
| [PLAN-030](./PLAN-030-packaged-setup-wizard-and-provider-installation.md) | Packaged Setup Wizard and Provider Installation | In Progress | [SPEC-023](../specs/SPEC-023-packaged-setup-wizard-and-provider-installation.md), [ADR-021](../decisions/021-keep-packaged-setup-and-provider-installation-in-the-host.md) |
| [PLAN-029](./PLAN-029-cats-code-v1-local-builder-loop.md) | Cats Code v1 Local Builder Loop | Stopped (Build sidebar surface retired) | [SPEC-041](../specs/SPEC-041-cats-code-v1-local-builder-loop.md) |
| [PLAN-028](./PLAN-028-cats-work-team-templates-and-work-intake.md) | Cats Work Team Templates and Work Intake | Superseded | [SPEC-040](../specs/SPEC-040-cats-work-team-templates-and-work-intake.md) |
| [PLAN-027](./PLAN-027-cats-chat-v1-priority-items.md) | Cats Chat v1 Priority Items | Draft | [SPEC-039](../specs/SPEC-039-cats-chat-v1-priority-items.md) |
| [PLAN-026](./PLAN-026-transport-live-updates-and-private-lane-transition.md) | Transport Live Updates and Private-Lane Transition | Draft | [SPEC-037](../specs/SPEC-037-transport-driven-live-chat-updates-and-private-lane-transition.md), [ADR-041](../decisions/041-push-transport-and-chat-invalidations-over-sse.md) |
| [PLAN-025](./PLAN-025-companion-workspace-presence-and-settings.md) | Companion Workspace, Presence, and Settings | Amended in part by PLAN-077 | [SPEC-036](../specs/SPEC-036-companion-workspace-presence-and-settings.md), [ADR-040](../decisions/040-make-companion-a-first-class-chat-mode-with-workspace-and-presence.md), [PLAN-077](./PLAN-077-companion-profile-and-share-preview-rollout.md) |
| [PLAN-021](./PLAN-021-cross-product-task-strategy-handoff-and-runtime-bridge.md) | Cross-Product Task Strategy Handoff and Runtime Bridge | Draft | [SPEC-035](../specs/SPEC-035-cross-product-task-strategy-handoff-and-runtime-bridge.md), [ADR-039](../decisions/039-use-core-task-metadata-as-cross-product-plan-exchange.md) |
| [PLAN-023](./PLAN-023-orchestrator-execution-loop-and-recovery.md) | Orchestrator Execution Loop and Recovery Contract | In Progress (First Slice Landed) | [SPEC-011](../specs/SPEC-011-primary-orchestrator-chat-entry-and-trace-separation.md), [SPEC-015](../specs/SPEC-015-cat-capability-registry-and-runtime-skill-mcp-mapping.md), [SPEC-021](../specs/SPEC-021-contextual-mcp-profiles-and-lazy-tool-activation.md), [SPEC-026](../specs/SPEC-026-explicit-mentions-and-dynamic-room-workflow-orchestration.md) |
| [PLAN-020](./PLAN-020-cats-memory-retrieval-and-flush-substrate.md) | Cats Memory Retrieval and Flush Substrate | In Progress (First Slice Landed) | [SPEC-022](../specs/SPEC-022-cats-memory-layering-and-ownership.md), [SPEC-029](../specs/SPEC-029-companion-boxes-ingestion-and-response-profiles.md) |
| [PLAN-019](./PLAN-019-companion-box-sidecar-and-session-hydration.md) | Companion Box Sidecar and Session Hydration | In Progress (First Slice Landed) | [SPEC-029](../specs/SPEC-029-companion-boxes-ingestion-and-response-profiles.md) |
| [PLAN-018](./PLAN-018-rename-the-main-platform-from-cats-inc-to-cats.md) | Rename the Main Platform from cats-inc to cats | Superseded by PLAN-031 | [ADR-026](../decisions/026-use-cats-as-the-flagship-platform-name-under-cats-inc-brand.md) |
| [PLAN-017](./PLAN-017-platform-host-refactor-for-chat-work-code-and-core.md) | Platform Host Refactor for Chat, Work, Code, and Core | Draft (Pending Review) | [ADR-025](../decisions/025-make-cats-inc-a-platform-host-with-core-owned-product-projections.md) |
| [PLAN-016](./PLAN-016-dynamic-room-workflow-orchestration.md) | Dynamic Room Workflow Orchestration | Draft (Pending Review) | [SPEC-026](../specs/SPEC-026-explicit-mentions-and-dynamic-room-workflow-orchestration.md) |
| [PLAN-015](./PLAN-015-chat-session-sleep-wake-lifecycle.md) | Chat Session Sleep/Wake Lifecycle | Approved | [SPEC-016](../specs/SPEC-016-chat-session-sleep-wake-lifecycle.md) |
| [PLAN-014](./PLAN-014-parallel-workstream-ownership-and-integration-seams.md) | Parallel Product Workstream Ownership and Integration Seams | In Progress (Execution Baseline Landed) | [ADR-007](../decisions/007-establish-cats-core-v1-for-chat-and-work.md), [ADR-025](../decisions/025-make-cats-inc-a-platform-host-with-core-owned-product-projections.md), [ADR-035](../decisions/035-invert-platform-dependency-and-extract-shared-design-layer.md), [ADR-036](../decisions/036-unify-api-contract-and-namespace-endpoints-by-product.md) |
| [PLAN-012](./PLAN-012-first-run-setup-wizard-and-boss-cat-bootstrap.md) | First-Run Setup Wizard and Boss Cat Bootstrap | In Progress (First Slice Landed) | [SPEC-012](../specs/SPEC-012-first-run-setup-wizard-and-boss-cat-bootstrap.md) |
| [PLAN-011](./PLAN-011-primary-orchestrator-chat-entry-and-trace-separation.md) | Primary Orchestrator Chat Entry and Trace Separation | Approved | [SPEC-011](../specs/SPEC-011-primary-orchestrator-chat-entry-and-trace-separation.md) |
| [PLAN-013](./PLAN-013-self-hosted-npm-app-packaging.md) | Self-Hosted npm App Packaging | Draft (Pending Review) | N/A |
| [PLAN-010](./PLAN-010-full-site-routing-and-url-driven-navigation.md) | Full-Site Routing and URL-Driven Navigation | Implemented | [SPEC-010](../specs/SPEC-010-full-site-routing-and-url-driven-navigation.md) |
| [PLAN-009](./PLAN-009-public-surface-naming-refresh.md) | Public-Surface Naming Refresh | Draft (Ready for Specialist Handoff) | [SPEC-009](../specs/SPEC-009-public-surface-naming-refresh.md) |
| [PLAN-008](./PLAN-008-restful-product-api-refactor.md) | RESTful Product API Refactor | Draft (Ready for Specialist Handoff) | [SPEC-008](../specs/SPEC-008-restful-product-api-refactor.md) |
| [PLAN-007](./PLAN-007-chat-contextual-cat-entry.md) | Chat-Contextual Cat Entry | Draft (Pending Review) | [SPEC-007](../specs/SPEC-007-chat-contextual-cat-entry.md) |
| [PLAN-006](./PLAN-006-cats-core-v1-and-platform-foundation.md) | Cats Core v1 and Platform Foundation | Approved | [SPEC-006](../specs/SPEC-006-cats-core-v1-and-platform-foundation.md) |
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

*Last updated: 2026-04-28 (Build/Relay sidebar plans marked stopped; PLAN-079 added for Work Graph link relations; PLAN-078 marked Cancelled alongside ADR-085 rejection.)*

*See also: [specs/](../specs/) for feature specifications*

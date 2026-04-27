# Architecture Decision Records (ADR)

> This directory contains Architecture Decision Records for documenting significant technical decisions.

## Purpose

ADRs capture the context, decision, and consequences of architectural choices. They help:

- Future developers understand *why* decisions were made
- Prevent re-discussing settled decisions
- Create institutional memory across sessions and teammates

## When to Create an ADR

Create an ADR when:

- Choosing a framework, library, or technology
- Making architectural decisions (patterns, structure)
- Deciding between multiple valid alternatives
- Making decisions that are difficult to reverse

## Naming Convention

```
ADR-NNN-short-title.md

Examples:
ADR-001-use-postgresql-database.md
ADR-002-adopt-hexagonal-architecture.md
ADR-003-jwt-authentication.md
```

## Template

Use [000-template.md](./000-template.md) as the starting point for new ADRs.

## Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [000-template](./000-template.md) | Template | - | - |
| [084-adopt-companion-profile-ia-and-shareable-content-references](./084-adopt-companion-profile-ia-and-shareable-content-references.md) | Adopt Companion Profile IA and Shareable Content References | Proposed | 2026-04-28 |
| [083-adopt-work-graph-projections-for-system-map-and-cockpit](./083-adopt-work-graph-projections-for-system-map-and-cockpit.md) | Adopt Work Graph projections for System Map and Cockpit | Proposed | 2026-04-25 |
| [082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision](./082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md) | Recast the orchestrator as a capability shell with policy-dial supervision | Proposed | 2026-04-25 |
| [081-canonicalize-three-tier-core-record-taxonomy](./081-canonicalize-three-tier-core-record-taxonomy.md) | Canonicalize the Core record taxonomy as Interaction / Planning / Execution | Proposed | 2026-04-22 |
| [080-fan-out-web-originated-messages-to-bound-transports](./080-fan-out-web-originated-messages-to-bound-transports.md) | Fan Out Web-Originated Messages to Bound Transports | Proposed | 2026-04-22 |
| [079-use-platform-native-stt-with-linux-toast-fallback](./079-use-platform-native-stt-with-linux-toast-fallback.md) | Use Platform-Native STT for Composer Voice Input with Linux Toast Fallback | Proposed | 2026-04-28 |
| [078-use-electron-native-region-screenshot-with-web-fallback](./078-use-electron-native-region-screenshot-with-web-fallback.md) | Use Electron-native region screenshot with web fallback | Proposed | 2026-04-21 |
| [077-make-parallel-draft-state-per-branch-addressable-for-orchestrator-composition](./077-make-parallel-draft-state-per-branch-addressable-for-orchestrator-composition.md) | Make parallel draft state per-branch-addressable so orchestrators can compose M×N team plans | Proposed | 2026-04-21 |
| [076-lay-parallel-draft-branches-in-a-3d-compare-carousel](./076-lay-parallel-draft-branches-in-a-3d-compare-carousel.md) | Lay parallel-draft branches out as a bounded 3D compare carousel with per-card chrome | Proposed | 2026-04-21 |
| [075-adopt-push-based-per-entity-state-subscription](./075-adopt-push-based-per-entity-state-subscription.md) | Adopt Push-Based Per-Entity State Subscription as the Renderer Sync Primitive | Proposed | 2026-04-21 |
| [074-keep-browser-ingress-at-platform-host-and-phase-lan-before-tunnels](./074-keep-browser-ingress-at-platform-host-and-phase-lan-before-tunnels.md) | Keep browser ingress at the platform host and phase LAN before tunnels | Accepted | 2026-04-20 |
| [073-use-target-surface-dispatch-and-warm-cross-surface-handoff](./073-use-target-surface-dispatch-and-warm-cross-surface-handoff.md) | Use target-surface dispatch and warm cross-surface handoff for draft submits | Accepted | 2026-04-20 |
| [072-settings-composition-layer-in-design](./072-settings-composition-layer-in-design.md) | Settings composition layer lives in `src/design/`, built on tokens + shared classes + minimal compound components | Proposed | 2026-04-18 |
| [071-reject-invalid-runtime-session-policy-combinations-at-create-boundary](./071-reject-invalid-runtime-session-policy-combinations-at-create-boundary.md) | Reject invalid runtime session policy combinations at the create boundary | Accepted | 2026-04-18 |
| [070-use-a-surface-safe-floating-and-shared-chrome-docked-guide-cat-placement-model](./070-use-a-surface-safe-floating-and-shared-chrome-docked-guide-cat-placement-model.md) | Use a surface-safe floating and shared-chrome-docked Guide Cat placement model | Proposed | 2026-04-17 |
| [069-scope-recents-to-channel-origin-surface-by-default](./069-scope-recents-to-channel-origin-surface-by-default.md) | Scope recents to channel origin surface by default | Accepted | 2026-04-17 |
| [068-own-chat-continuity-semantics-above-runtime-session-boundaries](./068-own-chat-continuity-semantics-above-runtime-session-boundaries.md) | Own chat continuity semantics above runtime-session boundaries | Accepted | 2026-04-17 |
| [066-persist-guide-cat-assist-content-as-platform-owned-local-state](./066-persist-guide-cat-assist-content-as-platform-owned-local-state.md) | Persist Guide Cat assist content as platform-owned local state | Proposed | 2026-04-17 |
| [065-keep-my-cats-as-one-platform-agent-home-with-lenses](./065-keep-my-cats-as-one-platform-agent-home-with-lenses.md) | Keep MY CATS as one platform agent home with lenses | Proposed | 2026-04-14 |
| [064-project-conversational-agents-into-chat-and-operational-agents-into-work](./064-project-conversational-agents-into-chat-and-operational-agents-into-work.md) | Project conversational agents into Chat and operational agents into Work | Proposed | 2026-04-14 |
| [063-agent-missions-and-transport-bindings](./063-agent-missions-and-transport-bindings.md) | Separate managed work, agent missions, execution runs, and transport bindings | Proposed | 2026-04-14 |
| [062-separate-concurrent-turn-fan-out-from-parallel-container-composition](./062-separate-concurrent-turn-fan-out-from-parallel-container-composition.md) | Separate concurrent turn fan-out from parallel container composition | Proposed | 2026-04-14 |
| [061-treat-guide-cat-as-an-optional-surface-assist-capability](./061-treat-guide-cat-as-an-optional-surface-assist-capability.md) | Treat Guide Cat as an optional surface-assist capability | Proposed | 2026-04-14 |
| [060-normalize-heterogeneous-runtime-delivery-into-product-events](./060-normalize-heterogeneous-runtime-delivery-into-product-events.md) | Normalize heterogeneous runtime delivery into product events | Proposed | 2026-04-14 |
| [059-adopt-a-unified-conversation-turn-lane-engine](./059-adopt-a-unified-conversation-turn-lane-engine.md) | Adopt a unified conversation-turn-lane engine | Proposed | 2026-04-14 |
| [058-adopt-lane-native-concurrent-group-transcript-delivery](./058-adopt-lane-native-concurrent-group-transcript-delivery.md) | Adopt lane-native concurrent group transcript delivery | Proposed | 2026-04-14 |
| [057-adopt-segment-native-assistant-transcript-delivery](./057-adopt-segment-native-assistant-transcript-delivery.md) | Adopt segment-native assistant transcript delivery | Accepted | 2026-04-12 |
| [056-use-a-shared-audience-participant-builder-for-all-composer-surfaces](./056-use-a-shared-audience-participant-builder-for-all-composer-surfaces.md) | Use a shared audience-participant builder for all composer surfaces | Proposed | 2026-04-11 |
| [055-retire-lead-and-separate-composer-recipients-from-dispatch-policy](./055-retire-lead-and-separate-composer-recipients-from-dispatch-policy.md) | Retire lead semantics and separate composer recipients from dispatch policy | Accepted | 2026-04-08 |
| [054-use-a-platform-level-guide-sidecar-for-day-0-assist](./054-use-a-platform-level-guide-sidecar-for-day-0-assist.md) | Use a platform-level Guide sidecar for day-0 assist | Superseded by ADR-070 | 2026-04-07 |
| [053-use-structured-cats-home-platform-storage](./053-use-structured-cats-home-platform-storage.md) | Use structured `~/.cats` platform storage | Accepted | 2026-04-05 |
| [052-use-canonical-platform-settings-routes-inside-product-shells](./052-use-canonical-platform-settings-routes-inside-product-shells.md) | Use canonical platform settings routes inside product shells | Accepted | 2026-04-04 |
| [051-generalize-participants-and-adopt-guide-cat-terminology](./051-generalize-participants-and-adopt-guide-cat-terminology.md) | Generalize participants and adopt Guide Cat terminology | Accepted | 2026-04-04 |
| [049-cascade-product-deletes-into-runtime-session-deletion](./049-cascade-product-deletes-into-runtime-session-deletion.md) | Cascade product deletes into runtime session deletion | Accepted | 2026-04-02 |
| [048-separate-platform-products-from-installable-apps](./048-separate-platform-products-from-installable-apps.md) | Separate platform products from installable apps | Accepted | 2026-03-31 |
| [047-separate-bootstrap-diagnostics-by-layer-and-aggregate-in-the-host](./047-separate-bootstrap-diagnostics-by-layer-and-aggregate-in-the-host.md) | Separate bootstrap diagnostics by layer and aggregate in the host | Accepted | 2026-03-30 |
| [046-drive-packaged-setup-through-runtime-bootstrap-apis](./046-drive-packaged-setup-through-runtime-bootstrap-apis.md) | Drive packaged setup through runtime bootstrap APIs | Accepted | 2026-03-30 |
| [045-use-cats-platform-as-the-main-platform-host-under-cats-brand](./045-use-cats-platform-as-the-main-platform-host-under-cats-brand.md) | Use cats-platform as the main platform host under Cats brand | Accepted | 2026-03-30 |
| [044-adopt-windows-x64-electron-plus-self-hosted-npm-as-initial-distribution-strategy](./044-adopt-windows-x64-electron-plus-self-hosted-npm-as-initial-distribution-strategy.md) | Adopt Windows x64 Electron plus self-hosted npm as the initial distribution strategy | Accepted | 2026-03-30 |
| [043-keep-platform-renderer-entry-bounded-with-route-level-lazy-loading](./043-keep-platform-renderer-entry-bounded-with-route-level-lazy-loading.md) | Keep platform renderer entry bounded with route-level lazy loading | Proposed | 2026-03-30 |
| [042-separate-channel-topology-from-routing-mode](./042-separate-channel-topology-from-routing-mode.md) | Separate channel topology from routing mode | Accepted | 2026-03-28 |
| [041-push-transport-and-chat-invalidations-over-sse](./041-push-transport-and-chat-invalidations-over-sse.md) | Push transport and chat invalidations over SSE | Proposed | 2026-03-27 |
| [040-make-companion-a-first-class-chat-mode-with-workspace-and-presence](./040-make-companion-a-first-class-chat-mode-with-workspace-and-presence.md) | Make companion a first-class Chat mode with workspace and presence | Proposed (Amended by ADR-084) | 2026-03-26 |
| [039-use-core-task-metadata-as-cross-product-plan-exchange](./039-use-core-task-metadata-as-cross-product-plan-exchange.md) | Use Core task metadata as the cross-product plan exchange surface | Proposed | 2026-03-26 |
| [038-separate-room-owned-workspaces-from-session-owned-sandboxes](./038-separate-room-owned-workspaces-from-session-owned-sandboxes.md) | Separate room-owned workspaces from session-owned sandboxes | Proposed | 2026-03-25 |
| [031-separate-composer-lead-control-from-boss-orchestration-authority](./031-separate-composer-lead-control-from-boss-orchestration-authority.md) | Separate composer lead control from Boss orchestration authority | Superseded by ADR-055 | 2026-03-23 |
| [030-own-per-cat-companion-boxes-in-product-and-hydrate-runtime-sessions](./030-own-per-cat-companion-boxes-in-product-and-hydrate-runtime-sessions.md) | Own per-Cat companion boxes in product and hydrate runtime sessions | Draft (Pending Review) | 2026-03-23 |
| [029-automate-tunnel-and-telegram-webhook-registration](./029-automate-tunnel-and-telegram-webhook-registration.md) | Adopt polling-first Telegram setup with optional public ingress helpers | Accepted | 2026-03-23 |
| [028-allow-multiple-public-bot-bindings-with-one-boss-cat](./028-allow-multiple-public-bot-bindings-with-one-boss-cat.md) | Allow multiple public bot bindings with one Boss Cat | Accepted | 2026-03-22 |
| [027-adopt-chat-first-information-architecture-with-default-boss-cat](./027-adopt-chat-first-information-architecture-with-default-boss-cat.md) | Adopt chat-first information architecture with a default Boss Cat | Accepted | 2026-03-22 |
| [026-use-cats-as-the-flagship-platform-name-under-cats-inc-brand](./026-use-cats-as-the-flagship-platform-name-under-cats-inc-brand.md) | Use cats as the flagship platform name under cats-inc brand | Superseded by ADR-045 | 2026-03-21 |
| [025-make-cats-inc-a-platform-host-with-core-owned-product-projections](./025-make-cats-inc-a-platform-host-with-core-owned-product-projections.md) | Make cats a platform host with core-owned product projections | Accepted | 2026-03-21 |
| [024-separate-explicit-mentions-from-dynamic-room-workflow](./024-separate-explicit-mentions-from-dynamic-room-workflow.md) | Separate explicit mentions from dynamic room workflow | Accepted | 2026-03-20 |
| [023-own-budget-policy-and-cost-control-in-product](./023-own-budget-policy-and-cost-control-in-product.md) | Own budget policy and cost control in product | Accepted | 2026-03-20 |
| [022-own-chat-delivery-policy-in-product](./022-own-chat-delivery-policy-in-product.md) | Own chat delivery policy in product | Accepted | 2026-03-20 |
| [021-keep-packaged-setup-and-provider-installation-in-the-host](./021-keep-packaged-setup-and-provider-installation-in-the-host.md) | Keep packaged setup and provider installation in the host | Accepted | 2026-03-20 |
| [020-own-mcp-intent-in-product-and-tool-delivery-in-runtime](./020-own-mcp-intent-in-product-and-tool-delivery-in-runtime.md) | Own MCP intent in product and tool delivery in runtime | Accepted | 2026-03-19 |
| [019-normalize-runtime-previews-as-surfaces-not-provider-iframes](./019-normalize-runtime-previews-as-surfaces-not-provider-iframes.md) | Normalize runtime previews as surfaces, not provider iframes | Accepted | 2026-03-19 |
| [018-separate-product-skill-intent-from-runtime-skill-hosting](./018-separate-product-skill-intent-from-runtime-skill-hosting.md) | Separate product skill intent from runtime skill hosting | Accepted | 2026-03-19 |
| [017-allow-direct-cat-chat-and-move-routing-into-system-layer](./017-allow-direct-cat-chat-and-move-routing-into-system-layer.md) | Allow direct Cat chat and move routing into the system layer | Accepted | 2026-03-19 |
| [016-treat-telegram-as-boss-cat-inbox-not-room-mirror](./016-treat-telegram-as-boss-cat-inbox-not-room-mirror.md) | Treat Telegram as a Boss Cat inbox, not a room mirror | Accepted | 2026-03-19 |
| [015-adopt-cat-sleep-wake-lifecycle-for-chat-sessions](./015-adopt-cat-sleep-wake-lifecycle-for-chat-sessions.md) | Adopt cat sleep/wake lifecycle for chat sessions | Accepted | 2026-03-19 |
| [014-freeze-parallel-delivery-boundaries-for-provider-telegram-and-chat-workstreams](./014-freeze-parallel-delivery-boundaries-for-provider-telegram-and-chat-workstreams.md) | Freeze parallel product delivery boundaries for Chat, Work, and Code | Accepted | 2026-03-25 |
| [012-keep-cat-naming-in-product-apis-and-neutral-terms-in-system-apis](./012-keep-cat-naming-in-product-apis-and-neutral-terms-in-system-apis.md) | Keep Cat naming in product APIs and neutral terms in system APIs | Accepted | 2026-03-19 |
| [011-model-primary-orchestrator-as-visible-cat](./011-model-primary-orchestrator-as-visible-cat.md) | Model the primary orchestrator as a visible Cat | Accepted | 2026-03-19 |
| [013-ship-cats-inc-as-an-executable-self-hosted-npm-app](./013-ship-cats-inc-as-an-executable-self-hosted-npm-app.md) | Ship `cats` as an executable self-hosted npm app | Proposed | 2026-03-19 |
| [010-separate-read-model-app-shell-from-restful-resource-apis](./010-separate-read-model-app-shell-from-restful-resource-apis.md) | Separate read-model app shell from RESTful resource APIs | Accepted | 2026-03-18 |
| [009-prefer-chat-contextual-cat-entry-and-settings-registry](./009-prefer-chat-contextual-cat-entry-and-settings-registry.md) | Prefer chat-contextual cat entry and a Settings-hosted registry | Accepted | 2026-03-17 |
| [008-expose-cats-runtime-via-direct-api-and-mcp-facade](./008-expose-cats-runtime-via-direct-api-and-mcp-facade.md) | Expose `cats-runtime` via direct API and MCP facade | Accepted | 2026-03-16 |
| [007-establish-cats-core-v1-for-chat-and-work](./007-establish-cats-core-v1-for-chat-and-work.md) | Establish `Cats Core v1` for Chat and Work | Accepted | 2026-03-16 |
| [006-absorb-paperclip-concepts-without-copying-runtime](./006-absorb-paperclip-concepts-without-copying-runtime.md) | Absorb Paperclip concepts without copying Paperclip runtime | Proposed (Exploratory) | 2026-03-16 |
| [001-use-cats-runtime-boundary](./001-use-cats-runtime-boundary.md) | Use `cats-runtime` as the only runtime boundary | Accepted | 2026-03-11 |
| [002-react-vite-renderer-before-electron](./002-react-vite-renderer-before-electron.md) | Use a React/Vite renderer before adding Electron | Accepted | 2026-03-11 |
| [003-electron-host-manages-local-services](./003-electron-host-manages-local-services.md) | Use Electron as a thin desktop host around local services | Accepted | 2026-03-11 |
| [004-separate-cat-identity-from-provider-execution](./004-separate-cat-identity-from-provider-execution.md) | Separate cat identity from provider execution | Accepted | 2026-03-13 |
| [005-use-chat-cat-registry-and-channel-assignments](./005-use-chat-cat-registry-and-channel-assignments.md) | Use a global cat registry with channel assignments | Accepted | 2026-03-13 |
| [050-use-ack-first-chat-dispatch-lifecycle](./050-use-ack-first-chat-dispatch-lifecycle.md) | Use an ACK-first chat dispatch lifecycle | Accepted | 2026-04-03 |
<!-- Add new ADRs above this line -->

## For AI Agents

1. **Before making a decision**: Check this directory for existing relevant records
2. **After making a decision**: Create a new ADR using the template
3. **Update the index**: Add the new ADR to the table above

---

*Last updated: 2026-04-28 (ADR-084 added)*

*See also: [AGENTS.md](../../../AGENTS.md) for decision-making protocols*

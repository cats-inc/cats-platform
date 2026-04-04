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
| [051-generalize-participants-and-adopt-guide-cat-terminology](./051-generalize-participants-and-adopt-guide-cat-terminology.md) | Generalize participants and adopt Guide Cat terminology | Accepted | 2026-04-04 |
| [049-cascade-product-deletes-into-runtime-session-deletion](./049-cascade-product-deletes-into-runtime-session-deletion.md) | Cascade product deletes into runtime session deletion | Accepted | 2026-04-02 |
| [048-separate-suite-products-from-installable-apps](./048-separate-suite-products-from-installable-apps.md) | Separate suite products from installable apps | Accepted | 2026-03-31 |
| [047-separate-bootstrap-diagnostics-by-layer-and-aggregate-in-the-host](./047-separate-bootstrap-diagnostics-by-layer-and-aggregate-in-the-host.md) | Separate bootstrap diagnostics by layer and aggregate in the host | Accepted | 2026-03-30 |
| [046-drive-packaged-setup-through-runtime-bootstrap-apis](./046-drive-packaged-setup-through-runtime-bootstrap-apis.md) | Drive packaged setup through runtime bootstrap APIs | Accepted | 2026-03-30 |
| [045-use-cats-platform-as-the-main-suite-host-under-cats-brand](./045-use-cats-platform-as-the-main-suite-host-under-cats-brand.md) | Use cats-platform as the main suite host under Cats brand | Accepted | 2026-03-30 |
| [044-adopt-windows-x64-electron-plus-self-hosted-npm-as-initial-distribution-strategy](./044-adopt-windows-x64-electron-plus-self-hosted-npm-as-initial-distribution-strategy.md) | Adopt Windows x64 Electron plus self-hosted npm as the initial distribution strategy | Accepted | 2026-03-30 |
| [043-keep-suite-renderer-entry-bounded-with-route-level-lazy-loading](./043-keep-suite-renderer-entry-bounded-with-route-level-lazy-loading.md) | Keep suite renderer entry bounded with route-level lazy loading | Proposed | 2026-03-30 |
| [042-separate-channel-topology-from-routing-mode](./042-separate-channel-topology-from-routing-mode.md) | Separate channel topology from routing mode | Accepted | 2026-03-28 |
| [041-push-transport-and-chat-invalidations-over-sse](./041-push-transport-and-chat-invalidations-over-sse.md) | Push transport and chat invalidations over SSE | Proposed | 2026-03-27 |
| [040-make-companion-a-first-class-chat-mode-with-workspace-and-presence](./040-make-companion-a-first-class-chat-mode-with-workspace-and-presence.md) | Make companion a first-class Chat mode with workspace and presence | Proposed | 2026-03-26 |
| [039-use-core-task-metadata-as-cross-product-plan-exchange](./039-use-core-task-metadata-as-cross-product-plan-exchange.md) | Use Core task metadata as the cross-product plan exchange surface | Proposed | 2026-03-26 |
| [038-separate-room-owned-workspaces-from-session-owned-sandboxes](./038-separate-room-owned-workspaces-from-session-owned-sandboxes.md) | Separate room-owned workspaces from session-owned sandboxes | Proposed | 2026-03-25 |
| [031-separate-composer-lead-control-from-boss-orchestration-authority](./031-separate-composer-lead-control-from-boss-orchestration-authority.md) | Separate composer lead control from Boss orchestration authority | Draft (Pending Review) | 2026-03-23 |
| [030-own-per-cat-companion-boxes-in-product-and-hydrate-runtime-sessions](./030-own-per-cat-companion-boxes-in-product-and-hydrate-runtime-sessions.md) | Own per-Cat companion boxes in product and hydrate runtime sessions | Draft (Pending Review) | 2026-03-23 |
| [029-automate-tunnel-and-telegram-webhook-registration](./029-automate-tunnel-and-telegram-webhook-registration.md) | Adopt polling-first Telegram setup with optional public ingress helpers | Accepted | 2026-03-23 |
| [028-allow-multiple-public-bot-bindings-with-one-boss-cat](./028-allow-multiple-public-bot-bindings-with-one-boss-cat.md) | Allow multiple public bot bindings with one Boss Cat | Accepted | 2026-03-22 |
| [027-adopt-chat-first-information-architecture-with-default-boss-cat](./027-adopt-chat-first-information-architecture-with-default-boss-cat.md) | Adopt chat-first information architecture with a default Boss Cat | Accepted | 2026-03-22 |
| [026-use-cats-as-the-flagship-suite-name-under-cats-inc-brand](./026-use-cats-as-the-flagship-suite-name-under-cats-inc-brand.md) | Use cats as the flagship suite name under cats-inc brand | Superseded by ADR-045 | 2026-03-21 |
| [025-make-cats-inc-a-suite-host-with-core-owned-product-projections](./025-make-cats-inc-a-suite-host-with-core-owned-product-projections.md) | Make cats a suite host with core-owned product projections | Accepted | 2026-03-21 |
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

*Last updated: 2026-04-04*

*See also: [AGENTS.md](../../../AGENTS.md) for decision-making protocols*

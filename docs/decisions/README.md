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
| [021-keep-packaged-setup-and-provider-installation-in-the-host](./021-keep-packaged-setup-and-provider-installation-in-the-host.md) | Keep packaged setup and provider installation in the host | Accepted | 2026-03-20 |
| [020-own-mcp-intent-in-product-and-tool-delivery-in-runtime](./020-own-mcp-intent-in-product-and-tool-delivery-in-runtime.md) | Own MCP intent in product and tool delivery in runtime | Accepted | 2026-03-19 |
| [019-normalize-runtime-previews-as-surfaces-not-provider-iframes](./019-normalize-runtime-previews-as-surfaces-not-provider-iframes.md) | Normalize runtime previews as surfaces, not provider iframes | Accepted | 2026-03-19 |
| [018-separate-product-skill-intent-from-runtime-skill-hosting](./018-separate-product-skill-intent-from-runtime-skill-hosting.md) | Separate product skill intent from runtime skill hosting | Accepted | 2026-03-19 |
| [017-allow-direct-cat-chat-and-move-routing-into-system-layer](./017-allow-direct-cat-chat-and-move-routing-into-system-layer.md) | Allow direct Cat chat and move routing into the system layer | Accepted | 2026-03-19 |
| [016-treat-telegram-as-boss-cat-inbox-not-room-mirror](./016-treat-telegram-as-boss-cat-inbox-not-room-mirror.md) | Treat Telegram as a Boss Cat inbox, not a room mirror | Accepted | 2026-03-19 |
| [015-adopt-cat-sleep-wake-lifecycle-for-chat-sessions](./015-adopt-cat-sleep-wake-lifecycle-for-chat-sessions.md) | Adopt cat sleep/wake lifecycle for chat sessions | Accepted | 2026-03-19 |
| [014-freeze-parallel-delivery-boundaries-for-provider-telegram-and-chat-workstreams](./014-freeze-parallel-delivery-boundaries-for-provider-telegram-and-chat-workstreams.md) | Freeze parallel delivery boundaries for provider, Telegram, and chat workstreams | Accepted | 2026-03-19 |
| [012-keep-cat-naming-in-product-apis-and-neutral-terms-in-system-apis](./012-keep-cat-naming-in-product-apis-and-neutral-terms-in-system-apis.md) | Keep Cat naming in product APIs and neutral terms in system APIs | Accepted | 2026-03-19 |
| [011-model-primary-orchestrator-as-visible-cat](./011-model-primary-orchestrator-as-visible-cat.md) | Model the primary orchestrator as a visible Cat | Accepted | 2026-03-19 |
| [013-ship-cats-inc-as-an-executable-self-hosted-npm-app](./013-ship-cats-inc-as-an-executable-self-hosted-npm-app.md) | Ship `cats-inc` as an executable self-hosted npm app | Proposed | 2026-03-19 |
| [010-separate-read-model-app-shell-from-restful-resource-apis](./010-separate-read-model-app-shell-from-restful-resource-apis.md) | Separate read-model app shell from RESTful resource APIs | Accepted | 2026-03-18 |
| [009-prefer-chat-contextual-pal-entry-and-settings-registry](./009-prefer-chat-contextual-pal-entry-and-settings-registry.md) | Prefer chat-contextual pal entry and a Settings-hosted registry | Accepted | 2026-03-17 |
| [008-expose-cats-runtime-via-direct-api-and-mcp-facade](./008-expose-cats-runtime-via-direct-api-and-mcp-facade.md) | Expose `cats-runtime` via direct API and MCP facade | Accepted | 2026-03-16 |
| [007-establish-cats-core-v1-for-chat-and-work](./007-establish-cats-core-v1-for-chat-and-work.md) | Establish `Cats Core v1` for Chat and Work | Accepted | 2026-03-16 |
| [006-absorb-paperclip-concepts-without-copying-runtime](./006-absorb-paperclip-concepts-without-copying-runtime.md) | Absorb Paperclip concepts without copying Paperclip runtime | Proposed (Exploratory) | 2026-03-16 |
| [001-use-cats-runtime-boundary](./001-use-cats-runtime-boundary.md) | Use `cats-runtime` as the only runtime boundary | Accepted | 2026-03-11 |
| [002-react-vite-renderer-before-electron](./002-react-vite-renderer-before-electron.md) | Use a React/Vite renderer before adding Electron | Accepted | 2026-03-11 |
| [003-electron-host-manages-local-services](./003-electron-host-manages-local-services.md) | Use Electron as a thin desktop host around local services | Accepted | 2026-03-11 |
| [004-separate-pal-identity-from-provider-execution](./004-separate-pal-identity-from-provider-execution.md) | Separate pal identity from provider execution | Accepted | 2026-03-13 |
| [005-use-workspace-pal-registry-and-channel-assignments](./005-use-workspace-pal-registry-and-channel-assignments.md) | Use a workspace pal registry with channel assignments | Accepted | 2026-03-13 |
<!-- Add new ADRs above this line -->

## For AI Agents

1. **Before making a decision**: Check this directory for existing relevant records
2. **After making a decision**: Create a new ADR using the template
3. **Update the index**: Add the new ADR to the table above

---

*Last updated: 2026-03-20*

*See also: [AGENTS.md](../../../AGENTS.md) for decision-making protocols*

# Documentation Index

> This directory contains all project documentation.

## Root-Level Documents

These important documents live in the project root:

| Document | Status | Description |
|----------|--------|-------------|
| [PROGRESS.md](../PROGRESS.md) | Complete | Implementation status and work packages |
| [ROADMAP.md](../ROADMAP.md) | Complete | Project roadmap and milestones |

## Core Documents

| Document | Status | Description |
|----------|--------|-------------|
| [requirements.md](./requirements.md) | Complete | Requirements for the current shell plus the accepted unified interaction engine, materialization layer, runtime-normalization, Guide/Boss capability direction, conversational-vs-operational agent projections, and the `MY CATS` platform-home model |
| [architecture.md](./architecture.md) | Complete | Current implementation architecture, the landed platform-host code layout, and the unified interaction-core/materialization/capability model including transport bindings, managed-work/mission/run separation, conversational-vs-operational agent projections, and the `MY CATS` platform-home model |
| [api.md](./api.md) | Complete | Current API surface plus the approved RESTful migration direction and shared-core/runtime-boundary notes |

## Development Guides

| Document | Status | Description |
|----------|--------|-------------|
| [setup-guide.md](./setup-guide.md) | Complete | Environment setup |
| [testing.md](./testing.md) | Complete | Current testing strategy and coverage boundaries |
| [deployment.md](./deployment.md) | Complete | Current local deployment plus planned desktop-first packaged topology and onboarding direction |
| [release-notes.md](./release-notes.md) | Complete | Operator-facing behavior changes and migration notes |
| [product-integration-guide.md](./product-integration-guide.md) | Complete | Product registration plus unified engine, materialization, agent/transport vocabulary, conversational-vs-operational projection rules, `MY CATS` platform-home/subset rules, and optional-capability integration rules for parallel Chat/Work/Code delivery |
| [agent-control-surfaces.md](./agent-control-surfaces.md) | Draft | Parent registry for mandatory structured agent/runtime control surfaces: decision envelopes, tool calls, finalization envelopes, lifecycle events, and evidence events |
| [tool-calls.md](./tool-calls.md) | Draft | Central registry for Cats-owned agent/runtime tool call contracts, including `declare_artifact`, `show_in_canvas`, and `clear_canvas` |
| [platform-viewer-policy.md](./platform-viewer-policy.md) | Active | Policy for when Core-tier entities get a platform-shared viewer with URL-addressable nested-route mount, and the entity viewer-ownership table |
| [security-guidelines.md](./security-guidelines.md) | Template | Security policies placeholder inherited from bootstrap |
| [mcp-config.md](./mcp-config.md) | Partial | Planning notes for the future `cats-runtime` MCP facade used by orchestrators |
| [services.md](./services.md) | Complete | Service registry, port assignments, and shared service-boundary notes |
| [SCRIPT-STANDARDS.md](./SCRIPT-STANDARDS.md) | Template | Shared script standards reference |

## Scripts

The `scripts/` directory contains platform-specific scripts for this project:

| Directory | Platform | Purpose |
|-----------|----------|---------|
| `scripts/windows/` | Windows | PowerShell scripts (.ps1) |
| `scripts/linux/` | Linux | Bash scripts (.sh) |
| `scripts/macos/` | macOS | Bash scripts (.sh) |

## AAIF Documents

| Document | Status | Description |
|----------|--------|-------------|
| [AGENT-GUIDE.md](./AGENT-GUIDE.md) | Complete | Agent collaboration guide with current platform-foundation context plus the same-environment CLI collaboration contract |
| [terminology.md](./terminology.md) | Complete | Product, engine, and protocol terms including `Container`, `Turn`, `Lane`, `Segment`, `Session`, `Mission`, `Run`, `Schedule`, `Transport Binding`, conversational/operational/hybrid agent projections, `MY CATS` lenses, Guide/Boss capability language, materialization, scheduler policy, runtime capability profiles, and provider capability bootstrap config |
| [a2a/](./a2a/) | Complete | Pilot-owned A2A v1.0 example set for future platform-host/orchestrator adapter work; standards-aligned docs, not a claim of a live A2A endpoint today |
| [specs/](./specs/) | Complete | Feature specifications covering the unified conversation-turn-lane engine, interaction/materialization split, heterogeneous runtime delivery normalization, runtime session policy boundary validation, chat continuity semantics/context transplant, product-scoped recents/origin-surface ownership, Guide Cat optional assist capability, Guide Cat placement/shared-chrome docking, concurrent transcript delivery, browser-ingress LAN/tunnel phasing, Cats Work agent supervision/tool-boundary contracts, and the linked Chat/Work/Code product slices |
| [plans/](./plans/) | Complete | Implementation plans covering the unified engine rollout, interaction/materialization seam, runtime normalization, runtime session policy boundary hardening, Cats Work agent supervision rollout, real provider orchestrator integration, product-scoped recents/origin-surface rollout, chat continuity follow-through, Guide Cat capability rollout, Guide Cat placement/shared-chrome docking, concurrent transcript delivery, browser-ingress LAN/tunnel rollout, and the linked Chat/Work/Code product slices |
| [decisions/](./decisions/) | Complete | Architecture Decision Records covering the unified conversation engine, runtime session policy create-boundary validation, chat continuity semantics above runtime sessions, product-scoped recents/origin-surface ownership, heterogeneous runtime delivery normalization, Guide Cat optional assist capability, Guide Cat placement/shared-chrome docking, concurrent transcript delivery, browser-ingress LAN/tunnel boundaries, and the earlier shared platform decisions |

Recent additions:

- [SPEC-105](./specs/SPEC-105-direct-chat-implicit-product-intent.md) — no-slash Work/Code candidate detection for ordinary direct chat, requiring explicit owner confirmation before entering slash-mode intake
- [PLAN-093](./plans/PLAN-093-direct-chat-implicit-product-intent-rollout.md) — rollout plan for implicit product-intent detection, Web/Telegram confirmation UX, and confirmed handoff into SPEC-104
- [ADR-101](./decisions/101-use-direct-audience-cat-for-slash-mode-work-intake.md) — direct-message `/work`/`/code` MVP uses the same direct audience Cat, existing provider capability profiles, and a human gate for weak/unknown Cats
- [SPEC-104](./specs/SPEC-104-direct-chat-slash-mode-work-intake.md) — Direct Chat Slash-Mode Work Intake contract for `/chat`, `/work`, `/code`, strong same-Cat clarification, and weak/unknown human gating
- [PLAN-092](./plans/PLAN-092-direct-chat-slash-mode-work-intake-rollout.md) — rollout plan for command parsing, direct audience capability bridge, durable Work/Code anchor creation, weak/unknown human gate, and projections
- [ADR-100](./decisions/100-cats-as-canonical-identity-with-clowder-and-cattery-as-associations.md) — cats are canonical identity, Clowder/Cattery are membership associations with formal/temp/external status as a first-class field
- [ADR-099](./decisions/099-promote-cats-clowders-catteries-to-platform-entities.md) — promote Cats/Clowders/Catteries to first-class platform entities with canonical top-level URLs (`/cats/:id`, `/clowders/:id`, `/catteries/:id`); clean-cut path migration per AGENTS.md
- [SPEC-103](./specs/SPEC-103-clowder-and-cattery-data-model.md) — Clowder/Cattery data model, entity-specific membership filters and transitions, aggregate Cats tab semantics
- [SPEC-102](./specs/SPEC-102-lobby-sidebar-ia-and-entity-routes.md) — Lobby sidebar IA, canonical entity routes, EntityDetailPane shared shell, mobile Lobby tab replaced wholesale, Chat sidebar's MY CATS renamed to Direct Messages
- [PLAN-091](./plans/PLAN-091-lobby-sidebar-and-entity-routes-rollout.md) — 6-phase Lobby sidebar and entity routes rollout (Phase 6 gated on ADR-100 + SPEC-103 approval)
- [ADR-098](./decisions/098-url-driven-canvas-and-platform-shared-viewer.md)
- [platform-viewer-policy](./platform-viewer-policy.md)
- [ADR-097](./decisions/097-store-code-canvas-focus-on-task-metadata.md) — superseded by ADR-098
- [PLAN-090](./plans/PLAN-090-cats-code-artifact-canvas-rollout.md)
- [SPEC-101](./specs/SPEC-101-cats-code-artifact-canvas.md)
- [PLAN-089](./plans/PLAN-089-platform-authentication-and-google-identity-rollout.md)
- [SPEC-100](./specs/SPEC-100-platform-authentication-admin-bootstrap-and-google-identity.md)
- [ADR-096](./decisions/096-adopt-platform-owned-auth-sessions-with-google-as-identity-provider.md)
- [PLAN-088](./plans/PLAN-088-mobile-pairing-manifest-server-rollout.md)
- [SPEC-099](./specs/SPEC-099-mobile-pairing-manifest-server.md)
- [ADR-095](./decisions/095-distribute-mobile-as-static-expo-go-bundle-served-by-desktop.md)
- [PLAN-087](./plans/PLAN-087-cats-app-package-interface-rollout.md)
- [SPEC-098](./specs/SPEC-098-cats-app-package-and-extension-interface.md)
- [ADR-094](./decisions/094-adopt-cats-app-packages-as-extension-boundary.md)
- [PLAN-086](./plans/PLAN-086-platform-language-settings-and-ui-localization-rollout.md)
- [PLAN-086 UI Localization Raw-String Audit](./plans/PLAN-086-ui-localization-raw-string-audit.md)
- [SPEC-097](./specs/SPEC-097-platform-language-settings-and-ui-localization.md)
- [ADR-093](./decisions/093-use-platform-language-preferences-for-assistant-and-ui-locales.md)
- [PLAN-085](./plans/PLAN-085-mission-cancel-and-run-stop-rollout.md)
- [SPEC-096](./specs/SPEC-096-mission-cancel-and-run-stop-contract.md)
- [Agent Control Surfaces](./agent-control-surfaces.md)
- [Tool Call Registry](./tool-calls.md)
- [PLAN-083](./plans/PLAN-083-schedule-rules-and-mission-trigger-rollout.md)
- [SPEC-094](./specs/SPEC-094-schedule-rules-and-mission-triggers.md)
- [ADR-090](./decisions/090-adopt-generic-schedule-rules-for-mission-triggers.md)
- [ADR-089](./decisions/089-split-runtime-request-and-stream-idle-timeouts.md)
- [PLAN-082](./plans/PLAN-082-settings-runtime-cli-provider-lifecycle-rollout.md)
- [SPEC-093](./specs/SPEC-093-settings-runtime-cli-provider-lifecycle.md)
- [PLAN-081](./plans/PLAN-081-code-artifact-declaration-rollout.md)
- [SPEC-092](./specs/SPEC-092-code-artifact-declaration-contract.md)
- [ADR-088](./decisions/088-use-structured-artifact-declarations-for-code-materialization.md)
- [SPEC-091](./specs/SPEC-091-cats-code-workspace-and-artifact-sidebar.md)
- [PLAN-080](./plans/PLAN-080-provider-capability-bootstrap-config-rollout.md)
- [SPEC-089](./specs/SPEC-089-companion-all-content-library-placeholder.md)
- [SPEC-088](./specs/SPEC-088-companion-memory-bridge-contract-placeholder.md)
- [PLAN-077](./plans/PLAN-077-companion-profile-and-share-preview-rollout.md)
- [SPEC-086](./specs/SPEC-086-shareable-companion-content-links-and-chat-previews.md)
- [SPEC-085](./specs/SPEC-085-companion-profile-feed-and-library-ia.md)
- [ADR-084](./decisions/084-adopt-companion-profile-ia-and-shareable-content-references.md)
- [PLAN-075](./plans/PLAN-075-real-provider-orchestrator-integration.md)
- [SPEC-083](./specs/SPEC-083-work-system-map-and-cockpit-projections.md)
- [ADR-083](./decisions/083-adopt-work-graph-projections-for-system-map-and-cockpit.md)
- [PLAN-074](./plans/PLAN-074-cats-work-agent-supervision-rollout.md)
- [SPEC-082](./specs/SPEC-082-cats-work-agent-supervision-and-tool-boundary.md)
- [ADR-082](./decisions/082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md)
- [PLAN-073](./plans/PLAN-073-transport-fanout-rollout.md)
- [SPEC-081](./specs/SPEC-081-transport-fanout-for-web-originated-messages.md)
- [ADR-080](./decisions/080-fan-out-web-originated-messages-to-bound-transports.md)
- [2026-04-23 Claude Orchestrator as Capability Shell](./research/2026-04-23-claude-orchestrator-as-capability-shell.md)
- [2026-04-23 Codex Cats Work Agent Supervision Model](./research/2026-04-23-codex-cats-work-agent-supervision-model.md)
- [2026-04-22 Web to Telegram Outbound Fanout](./research/2026-04-22-web-to-telegram-outbound-fanout.md)
- [PLAN-071](./plans/PLAN-071-region-screenshot-composer-rollout.md)
- [SPEC-079](./specs/SPEC-079-region-screenshot-composer-attachments.md)
- [ADR-078](./decisions/078-use-electron-native-region-screenshot-with-web-fallback.md)
- [2026-04-21 Region Screenshot Composer Feasibility](./research/2026-04-21-region-screenshot-composer-feasibility.md)
- [PLAN-068](./plans/PLAN-068-per-entity-state-subscription-rollout.md)
- [SPEC-076](./specs/SPEC-076-per-entity-state-subscription-protocol.md)
- [ADR-075](./decisions/075-adopt-push-based-per-entity-state-subscription.md)
- [2026-04-21 Per-Entity State Subscription Architecture](./research/2026-04-21-per-entity-state-subscription-architecture.md)
- [PLAN-067](./plans/PLAN-067-platform-browser-ingress-rollout.md)
- [SPEC-075](./specs/SPEC-075-platform-browser-ingress-for-lan-and-tunneled-access.md)
- [ADR-074](./decisions/074-keep-browser-ingress-at-platform-host-and-phase-lan-before-tunnels.md)
- [PLAN-066](./plans/PLAN-066-cross-surface-draft-dispatch-and-warm-product-handoff-rollout.md)
- [SPEC-074](./specs/SPEC-074-cross-surface-draft-dispatch-and-warm-product-handoff.md)
- [ADR-073](./decisions/073-use-target-surface-dispatch-and-warm-cross-surface-handoff.md)
- [SPEC-073](./specs/SPEC-073-settings-composition-layer.md)
- [PLAN-065](./plans/PLAN-065-settings-composition-layer-rollout.md)
- [ADR-072](./decisions/072-settings-composition-layer-in-design.md)
- [2026-04-20 Platform Browser Ingress Local Probe](./research/2026-04-20-platform-browser-ingress-local-probe.md)
- [2026-04-20 Draft Canvas and Composer Layout Guidance](./research/2026-04-20-draft-canvas-and-composer-layout-guidance.md)
- [PLAN-064](./plans/PLAN-064-new-code-mvp-task-run-artifact-materialization.md)
- [PLAN-063](./plans/PLAN-063-guide-cat-renderer-owned-ui-preferences-migration.md)
- [SPEC-072](./specs/SPEC-072-runtime-session-policy-boundary-validation.md)
- [ADR-071](./decisions/071-reject-invalid-runtime-session-policy-combinations-at-create-boundary.md)
- [PLAN-062](./plans/PLAN-062-runtime-session-policy-boundary-hardening.md)
- [SPEC-071](./specs/SPEC-071-guide-cat-placement-and-shared-chrome-docking.md)
- [ADR-070](./decisions/070-use-a-surface-safe-floating-and-shared-chrome-docked-guide-cat-placement-model.md)
- [PLAN-061](./plans/PLAN-061-guide-cat-placement-and-shared-chrome-docking-rollout.md)
- [SPEC-070](./specs/SPEC-070-product-scoped-recents-and-channel-origin-surfaces.md)
- [ADR-069](./decisions/069-scope-recents-to-channel-origin-surface-by-default.md)
- [PLAN-060](./plans/PLAN-060-product-scoped-recents-and-origin-surface-rollout.md)
- [SPEC-069](./specs/SPEC-069-chat-continuity-semantics-and-context-transplant.md)
- [ADR-068](./decisions/068-own-chat-continuity-semantics-above-runtime-session-boundaries.md)
- [SPEC-067](./specs/SPEC-067-guide-cat-assist-content-cache-and-offline-refresh.md)
- [PLAN-059](./plans/PLAN-059-guide-cat-assist-content-cache-and-offline-refresh.md)
- [ADR-066](./decisions/066-persist-guide-cat-assist-content-as-platform-owned-local-state.md)
- [SPEC-066](./specs/SPEC-066-concurrent-chatview-presentation-modes-and-policy-aware-cluster-projection.md)
- [PLAN-058](./plans/PLAN-058-concurrent-chatview-presentation-modes-and-policy-aware-cluster-projection.md)
- [SPEC-065](./specs/SPEC-065-core-contract-freeze-and-first-migration-wave.md)
- [PLAN-057](./plans/PLAN-057-core-contract-freeze-and-first-migration-wave.md)
- [SPEC-064](./specs/SPEC-064-my-cats-platform-home-and-lens-projections.md)
- [ADR-065](./decisions/065-keep-my-cats-as-one-platform-agent-home-with-lenses.md)
- [PLAN-056](./plans/PLAN-056-my-cats-platform-home-and-lens-projections.md)
- [SPEC-063](./specs/SPEC-063-conversational-vs-operational-agents-and-surface-projections.md)
- [ADR-064](./decisions/064-project-conversational-agents-into-chat-and-operational-agents-into-work.md)
- [PLAN-055](./plans/PLAN-055-conversational-and-operational-agent-projections.md)
- [SPEC-062](./specs/SPEC-062-agent-missions-and-transport-bindings.md)
- [ADR-063](./decisions/063-agent-missions-and-transport-bindings.md)
- [PLAN-054](./plans/PLAN-054-agent-missions-managed-work-and-transport-bindings.md)
- [SPEC-061](./specs/SPEC-061-concurrent-parallel-semantics-and-code-entry-presets.md)
- [ADR-062](./decisions/062-separate-concurrent-turn-fan-out-from-parallel-container-composition.md)
- [PLAN-053](./plans/PLAN-053-concurrent-parallel-semantics-and-code-entry-presets.md) now also carries chat continuity follow-through
- [SPEC-060](./specs/SPEC-060-guide-cat-optional-surface-assist-capability.md)
- [ADR-061](./decisions/061-treat-guide-cat-as-an-optional-surface-assist-capability.md)
- [PLAN-052](./plans/PLAN-052-guide-cat-optional-surface-assist-capability.md)
- [SPEC-059](./specs/SPEC-059-heterogeneous-runtime-delivery-normalization.md)
- [ADR-060](./decisions/060-normalize-heterogeneous-runtime-delivery-into-product-events.md)
- [PLAN-051](./plans/PLAN-051-heterogeneous-runtime-delivery-normalization.md)
- [PLAN-050](./plans/PLAN-050-interaction-core-and-domain-materialization.md)
- [PLAN-049](./plans/PLAN-049-unified-conversation-turn-lane-engine.md)
- [SPEC-058](./specs/SPEC-058-interaction-core-and-domain-materialization.md)
- [ADR-059](./decisions/059-adopt-a-unified-conversation-turn-lane-engine.md)
- [ADR-058](./decisions/058-adopt-lane-native-concurrent-group-transcript-delivery.md)
- [SPEC-057](./specs/SPEC-057-concurrent-group-lane-native-live-transcript.md)
- [PLAN-048](./plans/PLAN-048-concurrent-group-lane-native-live-transcript.md)
- [ADR-057](./decisions/057-adopt-segment-native-assistant-transcript-delivery.md)
- [SPEC-056](./specs/SPEC-056-segment-native-assistant-transcript-delivery.md)
- [PLAN-047](./plans/PLAN-047-segment-native-assistant-transcript-delivery.md)
- [PLAN-046](./plans/PLAN-046-shared-audience-participant-builder.md)
- [SPEC-055](./specs/SPEC-055-shared-audience-participant-builder.md)
- [ADR-056](./decisions/056-use-a-shared-audience-participant-builder-for-all-composer-surfaces.md)
- [PLAN-045](./plans/PLAN-045-acknowledged-user-turn-status-and-last-message-retry.md)
- [SPEC-054](./specs/SPEC-054-bootstrap-recovery-summary-and-bounded-detail-actions.md)
- [PLAN-044](./plans/PLAN-044-bootstrap-recovery-summary-and-bounded-detail-actions.md)
- [SPEC-053](./specs/SPEC-053-post-setup-environment-status-and-recovery-entry.md)
- [PLAN-043](./plans/PLAN-043-post-setup-environment-status-and-recovery-entry.md)

**Legend**: Complete | Partial | Template

## Research

| Document | Status | Description |
|----------|--------|-------------|
| [research/](./research/) | Partial | Research notes for exploratory Paperclip-informed control-plane evolution, product-boundary positioning for `Cats Chat` / `Cats Work` / `Cats Code`, the Claude orchestrator-as-capability-shell synthesis and the sibling Codex-authored Cats Work agent-supervision model, browser-ingress local probe validation evidence, temporary draft-canvas/composer guidance, the current Chat/runtime killer-feature audits for Paperclip and OpenClaw, OpenClaw memory-layering benchmarks, unified planning strategy notes, Cats Chat spatial layout guidance, companion capability baselines, external knowledge ingestion and connector strategy, packaged setup and packaged-startup operational investigations including the new packaged cold-start trace evidence, the self-hosted CLI-provider port matrix, the long-range AI-first app-store platform vision, the `Cats Coding` playground concept, and the sibling A2A pilot alignment with `cats-runtime` |

## Context-Driven Development

For complex features, use the spec-plan-implement workflow:

1. **Spec** (`specs/SPEC-NNN-title.md`): Define what to build and why
2. **Plan** (`plans/PLAN-NNN-title.md`): Define how to build it
3. **Implement**: Follow the plan and update progress documents

This ensures AI agents understand requirements before writing code.

## For AI Agents

When working on this project:

1. Check this index to understand what documentation exists
2. Create missing documents as needed
3. Update this index when adding new documents
4. Keep status labels honest when a document is still a bootstrap placeholder

## Current Documentation Gaps

The main platform-foundation docs are current, but these areas still need dedicated passes:

- implementation details for desktop packaging and later-stage transport delivery behavior
- app-level API ownership cleanup after Chat route handlers move into `products/chat/api/*`
- removal of temporary compatibility shims once platform-host ownership boundaries stabilize
- project-specific security notes beyond the inherited template
- a live A2A server/Agent Card surface; the current A2A files are still
  pilot-owned examples rather than active endpoints

## Document Standards

- Use Markdown format
- Include a clear title and purpose at the top
- Keep documents focused and concise
- Update the "Last updated" date when modifying

---

*Last updated: 2026-05-06*

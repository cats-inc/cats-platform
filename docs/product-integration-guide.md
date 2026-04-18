# Product Integration Guide

> How `Cats Chat`, `Cats Work`, and `Cats Code` plug into the platform host
> without colliding in shared wiring or contracts.

## Purpose

This guide defines the minimum integration protocol for product teams working in
parallel inside `cats`.

It exists to keep three things stable:

1. shared `Cats Core v1` contracts
2. platform-host wiring ownership
3. product-local implementation boundaries

The current re-architecture adds three more stability rules:

4. one shared interaction engine for Chat/Work/Code
5. one shared materialization seam for durable artifacts and mutations
6. optional capability layers such as Boss Cat and Guide Cat staying above the
   core engine rather than redefining it

Use this guide together with:

- [PLAN-014](./plans/PLAN-014-parallel-workstream-ownership-and-integration-seams.md)
- [ADR-014](./decisions/014-freeze-parallel-delivery-boundaries-for-provider-telegram-and-chat-workstreams.md)
- [ADR-059](./decisions/059-adopt-a-unified-conversation-turn-lane-engine.md)
- [SPEC-058](./specs/SPEC-058-interaction-core-and-domain-materialization.md)
- [ADR-060](./decisions/060-normalize-heterogeneous-runtime-delivery-into-product-events.md)
- [ADR-061](./decisions/061-treat-guide-cat-as-an-optional-surface-assist-capability.md)
- [ADR-063](./decisions/063-agent-missions-and-transport-bindings.md)
- [SPEC-062](./specs/SPEC-062-agent-missions-and-transport-bindings.md)
- [ADR-064](./decisions/064-project-conversational-agents-into-chat-and-operational-agents-into-work.md)
- [SPEC-063](./specs/SPEC-063-conversational-vs-operational-agents-and-surface-projections.md)
- [ADR-065](./decisions/065-keep-my-cats-as-one-platform-agent-home-with-lenses.md)
- [SPEC-064](./specs/SPEC-064-my-cats-platform-home-and-lens-projections.md)
- [ADR-069](./decisions/069-scope-recents-to-channel-origin-surface-by-default.md)
- [SPEC-070](./specs/SPEC-070-product-scoped-recents-and-channel-origin-surfaces.md)

## Foundational Integration Rules

All product teams must treat these as frozen architectural rules:

1. Chat, Work, and Code share one interaction engine.
2. Product presets must not invent custom turn/lane/session semantics.
3. Durable product state must materialize through shared provenance-bearing
   contracts rather than transcript scraping or product-local side channels.
4. Mixed runtime delivery capabilities must be normalized before product
   projections consume them.
5. Boss Cat and Guide Cat are optional capability layers, not alternate engine
   topologies.
6. `Concurrent` and `parallel` must stay separate abstraction layers.
7. Product entry presets such as `+New code`, `+Team code`, and `+Peer code`
   must map to shared engine policies rather than inventing local workflow
   engines.
8. Managed Work, missions, runs, and schedules must stay distinct.
9. External transports must use transport bindings that stay separate from bot
   binding, conversation identity, and runtime session identity.
10. Conversational and operational agent projections must stay distinct even
    when one shared agent identity supports both surfaces.
11. `MY CATS` must remain one platform-level agent home; product-local agent
    panels are contextual subsets, not alternate registries.
12. `RECENTS` defaults must stay product-scoped through explicit
    `originSurface` metadata, not renderer heuristics.

## Frozen Shared Contracts

These files are the shared contract freeze set for parallel product delivery:

- `src/core/types.ts`
- `src/platform/orchestration/contracts.ts`
- `src/shared/roomRouting.ts`
- `src/products/chat/api/contracts.ts`

Rules:

- Product teams must not reshape these files opportunistically while building
  local features.
- Shared contract changes must go through explicit integration review.
- Product-local types stay inside the owning product tree unless a real
  cross-product use case exists.

At the doc/architecture level, the current freeze set also includes:

- [ADR-059](./decisions/059-adopt-a-unified-conversation-turn-lane-engine.md)
- [ADR-062](./decisions/062-separate-concurrent-turn-fan-out-from-parallel-container-composition.md)
- [SPEC-061](./specs/SPEC-061-concurrent-parallel-semantics-and-code-entry-presets.md)
- [SPEC-058](./specs/SPEC-058-interaction-core-and-domain-materialization.md)
- [ADR-060](./decisions/060-normalize-heterogeneous-runtime-delivery-into-product-events.md)
- [SPEC-060](./specs/SPEC-060-guide-cat-optional-surface-assist-capability.md)
- [ADR-063](./decisions/063-agent-missions-and-transport-bindings.md)
- [SPEC-062](./specs/SPEC-062-agent-missions-and-transport-bindings.md)
- [ADR-064](./decisions/064-project-conversational-agents-into-chat-and-operational-agents-into-work.md)
- [SPEC-063](./specs/SPEC-063-conversational-vs-operational-agents-and-surface-projections.md)

Products must not work around these invariants by inventing local room modes,
local replay logic, or local materialization semantics.

## Conversation Origin and Product-Scoped Recents

All product teams must preserve this rule:

- every new channel carries the creating product's `originSurface`
- every new parallel/compare group carries the creating product's
  `originSurface`
- sidebar `RECENTS` defaults to entries whose `originSurface` matches the
  current product surface

Rules:

- `originSurface` is product-ownership metadata, not routing metadata.
- Product teams must stamp `originSurface` at create time instead of inferring
  it later from `repoPath`, `entryKind`, `composerMode`, `roomMode`, or other
  indirect fields.
- Typed create payload contracts must require `originSurface`; do not keep it
  optional in renderer or product-owned builders once a surface owns that
  create path.
- Raw legacy HTTP callers may still normalize missing `originSurface` to
  `chat` during rollout compatibility. Invalid non-surface values must still be
  rejected rather than silently coerced.
- New product-owned create paths must not rely on that compatibility seam.
- If a product temporarily hides recents, it must still write
  `originSurface` on new conversations so later recents behavior stays
  correct.
- Missing legacy `originSurface` values normalize to `chat` for compatibility.
- Any future cross-product `All recents` lens must stay explicit and
  secondary, not the default.

## MY CATS Platform Home and Product Subsets

All product teams must preserve this split:

- `MY CATS`
  - one platform-level agent home
  - may expose many lenses such as `Overview`, `Chat`, `Work`, and `Code`
- product-local agent panels
  - contextual subsets that show only the state relevant to the current
    product surface

Rules:

- Product teams must not invent alternate top-level homes such as `Chat Cats`,
  `Work Cats`, or `Code Cats`.
- `Cats Chat` may show quick-access conversational subsets, but those remain a
  projection of `MY CATS`.
- `Cats Work` may show assignment/workload subsets, but those remain a
  projection of `MY CATS`.
- `Cats Code` may show repo/worktree/review subsets, but those remain a
  projection of `MY CATS`.
- Product-local subsets should deep-link back into the canonical `MY CATS`
  home with a selected lens and agent where appropriate.

## Conversational and Operational Agent Projections

All product teams must preserve this split:

- `Conversational Agent`
  - chat-first
  - appears primarily in `Cats Chat`, `My Cats`, direct lanes, companion, and
    transport-facing persona surfaces
- `Operational Agent`
  - work-first
  - appears primarily in `Cats Work` as a managed worker with assignments,
    missions, runs, schedules, approvals, and outcomes
- `Hybrid Agent`
  - one shared identity that can appear in both contexts when the current
    surface makes the posture explicit

Rules:

- `My Cats` is a chat projection, not the universal registry or control plane
  for every operational worker.
- `Cats Work` is the primary control plane for OpenClaw-style operational
  agents.
- `Cats Code` may consume either projection when code execution or review work
  is involved, but it must not fork the underlying identity.
- Cross-links between Chat, Work, and Code should remain explicit so users can
  tell whether they are conversing with an agent, managing its work, or
  inspecting its execution.

## Managed Work, Missions, Runs, and Schedules

All product teams must preserve this split:

- `Managed Work`
  - durable, operator-visible planning objects
  - canonically owned by `Cats Work`
- `Mission`
  - delegated agent work bridging intent into execution
- `Run`
  - one execution attempt for a task, mission, or runtime action
- `Schedule / Trigger`
  - the condition that launches a mission or run

Rules:

- Not every mission or run becomes managed Work.
- `Chat` may originate missions and create or update managed Work through the
  shared materialization seam.
- `Code` may originate many missions and runs for one task without replacing
  the canonical Work record.
- Companion and other background agent capabilities should default to missions
  and runs, promoting into Work only when operator-visible tracking or approval
  is needed.

## Transport Bindings and External Entry

All product teams must preserve this split:

- `bot binding`
  - which Cat/Agent identity owns a public transport endpoint
- `transport binding`
  - the product-owned relation between one external thread/account and one
    canonical Cats entry path
- `conversation`
  - the internal interaction unit used by the shared engine
- `session`
  - one runtime attachment for execution

Rules:

- A transport binding may move between direct-lane continuation and linked-room
  routing without changing the external thread identity.
- Reconnects and new runtime sessions must not redefine transport-binding
  identity.
- Product teams must not rely on renderer-local heuristics to recover transport
  identity after reconnect.

## Concurrent, Parallel, and Code-Preset Mapping

All product teams must preserve this mapping:

- `concurrent`
  - one conversation turn
  - many lanes
- `parallel`
  - one container
  - many child conversations

Current product presets should therefore map as:

- `+New chat`
  - one conversation preset
- `+Group chat`
  - one shared conversation preset
- `+Parallel chat`
  - one parallel container preset
- `+New code`
  - one primary coding conversation preset
- `+Team code`
  - one shared multi-participant coding conversation preset
- `+Peer code`
  - one parallel branch/review container preset

Products may layer scheduler, sharing, coordinator, convergence, and automation
policies on top of those presets, but must not redefine the underlying
container/conversation/turn/lane/session model.

## Product Route Registration

Each product owns its own API delegate.

Current delegates:

- `src/products/chat/api/index.ts` -> `routeChatApi(context)`
- `src/products/work/api/index.ts` -> `routeWorkApi(context)`
- `src/products/code/api/index.ts` -> `routeCodeApi(context)`

The platform host only dispatches into product delegates from:

- `src/app/server/requestRouter.ts`

Rules:

- Product teams implement routes inside their own product API tree.
- Product teams should not expand `requestRouter.ts` directly for feature work.
- New product routes should be exposed by the product delegate first, then wired
  into the platform host by the integration owner.

## Server Dependency Slices

`createServer(...)` now accepts product-aware slices instead of one flat
dependency bag:

```ts
createServer({
  shared: {
    config,
    runtimeClient,
    startup,
  },
  chat: {
    chatStore,
  },
  work: {
    coreStore,
  },
  code: {
    coreStore,
  },
});
```

Slice ownership:

- `shared`
  - platform-owned cross-product dependencies such as config, runtime client,
    startup state, and shared core store access
- `chat`
  - chat-only stores, transport seams, companion/memory surfaces, and
    orchestrator adapters
- `work`
  - work product dependencies only
- `code`
  - code product dependencies only

Rules:

- New product-specific dependencies must land in the owning slice.
- Do not keep extending Chat-centric fields on the shared server contract.
- The platform host composes slices; products consume their own slice only.

## Renderer and Navigation Ownership

Product renderer code belongs under:

- `src/products/chat/**`
- `src/products/work/**`
- `src/products/code/**`

Platform-level renderer composition belongs under:

- `src/app/**`
- `src/design/**`

Rules:

- Shared design primitives may live in `src/design/`.
- Do not upstream Chat-specific behavior into shared UI just because another
  product might need something similar later.
- New navigation or platform-shell registration should converge through the
  integration owner.

Optional capability rules:

- Boss Cat and Guide Cat behaviors should enter products through explicit
  capability hooks or policy objects.
- Product surfaces must not hard-code Guide Cat or Boss Cat in ways that
  redefine transcript identity or routing correctness.

## Product Onboarding Checklist

Before a product team adds a new platform capability, confirm:

1. The change can stay inside `src/products/<product>/`.
2. The route is owned by that product's API delegate.
3. Any new dependencies are declared in that product's server slice.
4. Shared contract changes are reviewed explicitly instead of piggybacking on
   feature work.
5. The feature consumes the shared interaction engine instead of inventing
   product-local turn/lane semantics.
6. Structured outputs or artifacts preserve shared provenance and
   materialization rules instead of creating product-local side channels.
7. Tests cover both behavior and boundary expectations when the new seam
   matters architecturally.
8. If the feature uses many workers/agents, it makes explicit whether that
   means concurrent lanes inside one conversation or parallel child
   conversations inside one container.
9. If the feature introduces automation or agent background work, it makes
   explicit whether it is creating managed Work, missions, runs, or only a
   schedule/trigger.
10. If the feature touches Telegram or other transports, it preserves explicit
    transport-binding identity instead of collapsing that identity into session
    or room state.
11. If the feature introduces or reuses an agent, it makes explicit whether the
    surface is conversational, operational, or hybrid.
12. If the feature surfaces agents in product-local UI, it makes explicit
    whether that UI is a contextual subset or the canonical `MY CATS` home.
13. If the feature creates conversations or parallel groups, it stamps
    `originSurface` and keeps product recents filtering aligned with that
    ownership contract.

## Integration Owner Checklist

When converging product work into the platform host:

1. Wire product delegates in `src/app/server/requestRouter.ts`.
2. Keep `src/app/server/index.ts` as a thin composition root.
3. Extend only the correct dependency slice in
   `src/app/server/contracts.ts`.
4. Update `PLAN-014` or related docs when the registration protocol changes.
5. Verify new product behavior still respects the shared interaction engine,
   materialization seam, and optional capability boundaries.
6. Keep `npm test` green so dependency graph and boundary rules continue to
   protect the layering.
7. Verify new work/automation flows do not blur managed Work, missions, runs,
   and schedules.
8. Verify transport-facing changes preserve explicit transport-binding identity
   across reconnect and reroute behavior.
9. Verify new conversation entry points preserve product-scoped recents by
   stamping `originSurface` and avoiding renderer-side ownership heuristics.

---

*Last updated: 2026-04-17*

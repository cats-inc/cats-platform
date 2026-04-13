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
- [SPEC-058](./specs/SPEC-058-interaction-core-and-domain-materialization.md)
- [ADR-060](./decisions/060-normalize-heterogeneous-runtime-delivery-into-product-events.md)
- [SPEC-060](./specs/SPEC-060-guide-cat-optional-surface-assist-capability.md)

Products must not work around these invariants by inventing local room modes,
local replay logic, or local materialization semantics.

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

---

*Last updated: 2026-04-14*

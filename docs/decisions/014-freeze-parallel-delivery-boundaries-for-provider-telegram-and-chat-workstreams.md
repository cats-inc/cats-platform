# ADR-014: Freeze Parallel Delivery Boundaries for Provider, Telegram, and Chat Workstreams

## Status

Accepted

## Date

2026-03-19

## Context

`cats-inc` is about to advance through three parallel workstreams:

1. provider/model catalog consumption and related UI updates
2. Telegram bridging for the `Boss Cat`
3. ongoing chat behavior, multi-cat flow, and capability integration work

Today the product still has two major merge hotspots:

- `src/server.ts`
- `src/renderer/App.tsx`

At the same time, `cats-runtime` now owns provider-model discovery through the
new runtime catalog direction:

- `cats-runtime` ADR-008
- `cats-runtime` SPEC-004
- `cats-runtime` PLAN-005

`cats-inc` also already has the first shared-core shapes for bot bindings,
`skillProfile`, and `mcpProfile`, but it does not yet have clean seams for a
Telegram relay, provider catalog consumption, or a capability registry that can
evolve independently from chat rendering.

Without explicit ownership boundaries, the three workstreams would repeatedly
collide in the same files and recreate the same integration decisions.

## Decision

`cats-inc` will freeze parallel-delivery boundaries before expanding the three
workstreams.

This decision includes:

1. Provider/model discovery remains runtime-owned.
   `cats-inc` may expose product APIs for provider selection, but it must
   consume runtime catalog data server-side rather than re-own discovery in the
   renderer.
2. `cats-inc` will keep product-facing `Cat` terminology in product APIs and
   routes, while provider catalog and Telegram relay internals may use more
   neutral system terms where needed.
3. Telegram integration will land behind a dedicated transport seam under
   `src/transports/telegram/` and dedicated server routes, instead of being
   embedded directly into chat message handlers.
4. Cat capability work will evolve through explicit registry/mapping seams
   instead of embedding provider, skill, and MCP decisions directly into chat
   view logic.
5. New work in these three streams should prefer new files and extracted route
   modules over further inlining into `src/server.ts` and `src/renderer/App.tsx`.
6. `src/server.ts` and `src/renderer/App.tsx` become route-composition and
   screen-composition hotspots only. They are not the preferred location for
   new provider, Telegram, or capability logic.

## Ownership Map

### Workstream A: Provider Catalog Consumption

- Owns:
  - `src/shared/providerCatalog.ts`
  - `src/server/routes/providers.ts`
  - `src/runtime/client.ts` provider-catalog client methods
  - `src/renderer/components/ProviderModelFields.tsx`
  - renderer API helpers for provider catalog reads
- Avoids:
  - chat transcript behavior
  - Telegram transport internals

### Workstream B: Telegram Boss Cat Bridge

- Owns:
  - `src/transports/telegram/**`
  - `src/server/routes/telegram.ts`
  - bot-binding and transport mapping seams in shared/core contracts where
    needed
- Avoids:
  - provider catalog UI flow
  - direct edits to chat transcript rendering except additive transport notes

### Workstream C: Chat Flow and Capability Integration

- Owns:
  - chat routing and conversation behavior
  - multi-cat orchestration flow validation
  - capability registry and runtime skill/MCP mapping
- Avoids:
  - provider catalog discovery ownership
  - Telegram ingress plumbing except via declared seams

## Consequences

### Positive

- parallel teams can work in mostly disjoint write scopes
- provider catalog ownership stays aligned with `cats-runtime`
- Telegram can evolve as a transport layer instead of a special-case chat hack
- capability planning can proceed without binding it to renderer forms

### Negative

- `cats-inc` temporarily carries extra seam files before full feature rollout
- some work will feel indirect because product APIs and transport routes are
  added before full end-user functionality lands

### Neutral

- `src/server.ts` and `src/renderer/App.tsx` still exist as central composition
  files, but new domain logic should move outward from them over time

## Alternatives Considered

### Alternative 1: Let Each Team Edit the Existing Hotspots Directly

- **Pros**: fastest short-term coding path
- **Cons**: high merge-conflict risk and repeated architectural drift
- **Why rejected**: it scales poorly once provider, transport, and chat work
  all advance in parallel

### Alternative 2: Wait Until Every Spec Is Final Before Cutting Seams

- **Pros**: fewer intermediate abstractions
- **Cons**: blocks parallel delivery and forces teams to queue behind each
  other
- **Why rejected**: the current need is coordination and safe parallelism, not
  design perfection

## References

- [ADR-008](./008-expose-cats-runtime-via-direct-api-and-mcp-facade.md)
- [ADR-011](./011-model-primary-orchestrator-as-visible-cat.md)
- [ADR-012](./012-keep-cat-naming-in-product-apis-and-neutral-terms-in-system-apis.md)
- [SPEC-013](../specs/SPEC-013-provider-catalog-consumption-and-ui-seam.md)
- [SPEC-014](../specs/SPEC-014-telegram-boss-cat-relay-mvp.md)
- [SPEC-015](../specs/SPEC-015-cat-capability-registry-and-runtime-skill-mcp-mapping.md)
- [PLAN-014](../plans/PLAN-014-parallel-workstream-ownership-and-integration-seams.md)
- [cats-runtime ADR-008](../../../cats-runtime/docs/decisions/008-runtime-owned-provider-model-catalog.md)
- [cats-runtime SPEC-004](../../../cats-runtime/docs/specs/SPEC-004-provider-model-catalog-and-discovery.md)
- [cats-runtime PLAN-005](../../../cats-runtime/docs/plans/PLAN-005-provider-model-catalog-and-discovery.md)

---

*Decision made: 2026-03-19*
*Decision makers: Codex + user direction*

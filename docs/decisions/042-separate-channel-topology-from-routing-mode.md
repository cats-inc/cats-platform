# ADR-042: Separate Channel Topology from Routing Mode

> Treat participant topology as its own first-class contract instead of
> inferring "does this room have Boss Cat semantics?" from `roomRouting.mode`.

## Status

Accepted

## Context

`cats` historically overloaded `roomRouting.mode` with multiple concerns:

- default turn-routing policy
- whether a room was a hidden direct lane
- whether `Boss Cat` / orchestrator infrastructure should exist
- which participant should be resumed or streamed
- which chrome the renderer should show

That coupling worked while every channel implicitly assumed a `Boss Cat`
backbone. It broke down once `My Cats` direct lanes became real product-owned
surfaces:

1. direct-lane resume could accidentally wake `Boss Cat`
2. stream routing could fall back from a lead Cat to orchestrator
3. renderer checks tied to `roomRouting.mode` could misclassify contaminated or
   migrated direct lanes
4. future companion/agent switching UI had no stable surface to target because
   the topology and routing concepts were fused together

## Decision

`cats` now separates room topology from routing mode.

### 1. `channelKind` is the topology contract

Channels now expose a topology-oriented `channelKind`:

- `boss_thread`
- `direct_lane`
- `multi_cat_room`

This field answers "what kind of room is this?" independently from
`roomRouting.mode`.

### 2. `roomRouting.mode` remains a routing-policy compatibility seam

`roomRouting.mode` is still persisted and transported for compatibility with
existing routing contracts, transport bindings, and older snapshots, but it is
no longer the authoritative source for:

- direct-lane identity
- activation topology
- stream target selection
- renderer direct-lane chrome

### 3. Direct-lane behavior is topology-driven

When `channelKind === 'direct_lane'`:

- only the lead Cat is eligible for activation and stream selection
- orchestrator/Boss Cat wake fallbacks are blocked
- legacy snapshots are normalized back to lead-only participant topology
- renderer direct-lane navigation and chrome follow topology first

### 4. Renderer conversation semantics are derived from topology plus composer mode

The renderer now derives an explicit conversation-mode layer above raw
contracts:

- `direct_lane`
- `solo_thread`
- `cat_led_thread`
- `multi_cat_room`

This becomes the seam for future companion/agent switching UI without teaching
that UI about wake/stream internals.

## Consequences

### Positive

- direct lanes stop behaving like disguised boss threads
- migrated or partially stale state can be normalized deterministically
- runtime/session flows can reason about topology without consulting UI-only
  routing hints
- future mode-switch UI has a stable abstraction to build on

### Negative

- read models and renderer normalization now have to preserve one more explicit
  field
- compatibility logic remains necessary until all callers stop depending on
  legacy `roomRouting.mode`

### Neutral

- transport-facing room contracts may still speak in `roomMode` where external
  integration payloads need that shape
- this ADR does not itself ship companion/agent switching UI; it creates the
  boundary that UI will consume

## Alternatives Considered

### Alternative 1: Keep patching direct-lane exceptions on top of `roomRouting.mode`

- **Pros**: lower immediate code churn
- **Cons**: keeps topology and routing policy entangled; regressions recur in
  new call sites
- **Why rejected**: this is the failure mode that caused direct-lane resume to
  wake `Boss Cat`

### Alternative 2: Remove `roomRouting.mode` immediately

- **Pros**: cleaner model
- **Cons**: too disruptive while transport, routing, and snapshot compatibility
  still depend on it
- **Why rejected**: the safer path is to demote `roomRouting.mode` first, then
  shrink its surface later

## References

- `cats/docs/specs/SPEC-018-direct-cat-chat-and-conversation-routing-layer.md`
- `cats/docs/decisions/017-allow-direct-cat-chat-and-move-routing-into-system-layer.md`
- `cats/docs/decisions/031-separate-composer-lead-control-from-boss-orchestration-authority.md`

---

*Drafted: 2026-03-28*
*Drafted by: Codex*

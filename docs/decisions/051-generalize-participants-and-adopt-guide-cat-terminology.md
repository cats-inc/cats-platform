# ADR-051: Generalize Participants and Adopt Guide Cat Terminology

> Stop overloading Cat-specific terms for every conversation role and freeze
> `Guide Cat` as the canonical term for the optional first helper created in
> setup.

## Status

Accepted

## Context

`cats-platform` currently mixes several concerns:

- the optional first intelligent helper created during setup
- the visible `Boss Cat` identity used by Chat in some entry paths
- the invisible orchestration system layer
- Cat-specific room membership data used as if every future participant must be
  a Cat

This has created two different kinds of confusion:

1. naming drift
   - `assistant`
   - `Boss Cat`
   - `orchestrator`
   - first helper
2. model drift
   - participant topology
   - routing defaults
   - composer ownership
   - Cat identity

At the same time, the suite now wants an optional first helper that can support
`Chat`, `Work`, and `Code`, and the user explicitly wants that helper to be
visible as a Cat while avoiding more internal use of the generic word
`assistant`.

## Decision

### 1. `Guide Cat` is the canonical term for the optional first helper

The suite will use `Guide Cat` as the primary product and developer term for
the optional helper offered during setup.

Implementation and docs should prefer `Guide Cat` over `assistant` when naming
this role.

### 2. `Guide Cat` is not automatically equal to `Boss Cat`

The suite must not assume that a setup-created Guide Cat is inherently:

- the Chat `Boss Cat`
- the only visible public Cat
- the invisible orchestration system layer

Future product mapping may choose to align those roles, but they are distinct
concepts by default.

In the first migration slice, `Guide Cat` replaces only the setup-time
bootstrap framing. It does not, by itself, remove `Boss Cat` as a distinct
Chat role.

### 3. `Guide Cat` is not the orchestration system layer

The orchestration system layer remains a non-personified coordination layer for
routing, workflow, activity, approvals, recovery, and execution control.

`Guide Cat` is a product-facing helper identity that may be used by or through
the orchestration layer, but it is not the same domain object.

### 4. The long-term model is `entity` plus `participant`

The architecture will move toward these concepts:

- `entity`: reusable identity, memory, and capability envelope
- `participant`: entity membership inside one conversation context
- `conversation topology`: direct, thread, or group shape
- `turn strategy`: default routing, mention override, compare, fan-out, and
  similar per-turn execution strategy

Cats remain a first-class product-facing entity type, but they are no longer
the only participant shape the architecture should be able to express.

### 5. Guide Cat uses event-driven leased sessions

Guide Cat runtime sessions should be:

- created on demand
- briefly reusable across nearby work
- closed when idle
- supported by cached outputs such as starter ideas

The suite should not require an always-on Guide Cat daemon just to render entry
surfaces.

## Consequences

### Positive

- setup and future implementation can talk about one stable role name
- the suite can add a first helper without hard-binding it to existing Boss Cat
  assumptions
- future non-Cat participants become possible without inventing a second room
  model
- product-facing Cat language can remain intact while the underlying system
  model becomes more truthful
- entry suggestions can be intelligent without requiring a permanent live
  session

### Negative

- existing setup, routing, and chat docs now need explicit compatibility notes
- some current fields and modes will remain awkward until the participant model
  migration lands
- developers must resist reintroducing `assistant` as a shortcut term in code
  comments, docs, and APIs

### Neutral

- this ADR does not by itself decide whether Guide Cat appears immediately in
  the Chat registry or which product consumes Guide Cat suggestions first
- this ADR does not remove current `Boss Cat` or Cat-registry behavior today;
  it sets the direction for future migration

## Alternatives Considered

### Alternative 1: Keep using `assistant` as the generic setup-helper term

- **Pros**: familiar generic AI wording
- **Cons**: collides with orchestrator, hidden helper, and future specialist
  concepts; drifts away from the suite's Cat language
- **Why rejected**: the user explicitly wants one stable Cat-facing term and
  less internal use of `assistant`

### Alternative 2: Rename the first helper to `Boss Cat`

- **Pros**: reuses an existing visible Chat term
- **Cons**: wrongly implies that setup always creates the Chat default public
  lead identity and collapses distinct roles back together
- **Why rejected**: setup helper, Boss Cat, and orchestration authority are not
  guaranteed to align

### Alternative 3: Keep the chat model Cat-only and add more special cases

- **Pros**: less short-term migration work
- **Cons**: keeps topology, routing, and participant class entangled; blocks
  future non-Cat specialists behind more one-off modes
- **Why rejected**: the current model is already too overloaded and hard to
  explain

## References

- [SPEC-049](../specs/SPEC-049-guide-cat-setup-and-generalized-participant-entry.md)
- [SPEC-012](../specs/SPEC-012-first-run-setup-wizard-and-boss-cat-bootstrap.md)
- [SPEC-018](../specs/SPEC-018-direct-cat-chat-and-conversation-routing-layer.md)
- [SPEC-030](../specs/SPEC-030-composer-scoped-lead-cat-and-boss-auto-helper-semantics.md)
- [ADR-011](./011-model-primary-orchestrator-as-visible-cat.md)
- [ADR-042](./042-separate-channel-topology-from-routing-mode.md)

---

*Decision made: 2026-04-04*
*Decision makers: User, Codex*

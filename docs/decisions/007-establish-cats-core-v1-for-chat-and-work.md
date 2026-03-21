# ADR-007: Establish Cats Core v1 for Chat and Work

> Introduce a minimal shared product contract layer so `Cats Chat` and
> `Cats Work` can launch on the same foundation.

## Status

Accepted

## Context

`cats` began as a chat-first Node.js/TypeScript shell above
`cats-runtime`. That remains the current implementation, but the product
direction has tightened:

- `Cats Chat` is the first launch surface
- `Cats Work` is expected to follow immediately after `Cats Chat`
- separate teams may work on Chat and Work in parallel
- the two products share the same owner, actors/resources, conversations,
  approvals, and archive concepts

Without a shared contract layer, Chat and Work would likely fork their data
models, permissions, and orchestration semantics before either product is
stable.

At the same time, the team does not want to overbuild a large "core platform"
before the first suite release.

## Decision

The suite will define a minimal shared `Cats Core v1` layer now.

`Cats Core v1` is the shared product contract for:

1. identity
2. actor or resource records
3. permissions and policy
4. conversation and channel records
5. bot bindings for external transports
6. task, run, approval, escalation, and takeover records
7. owner profile and preference memory
8. artifact and archive metadata

Additional rules:

1. `Cats Chat` and `Cats Work` must both build on `Cats Core v1` rather than
   creating separate schemas for shared entities.
2. `Cats Core v1` may start as shared modules and product APIs inside
   `cats`; it does not require a standalone service on day one.
3. `Cats Core v1` must stay product-facing and minimal. It is not the home for
   provider adapters, CLI orchestration, or a full archive/RAG engine.
4. Existing chat-shell terms such as cat, assignment, lease, and memory
   checkpoint should evolve through compatibility mapping rather than a flag-day
   rewrite.
5. Exploratory Paperclip-informed control-plane documents remain separate from
   this accepted near-term execution path.

## Consequences

### Positive

- Chat and Work teams can align on shared contracts before implementation
  diverges.
- Owner profile, approvals, bot bindings, and archive metadata get a single
  product-owned home.
- The suite can launch incrementally without committing to a heavyweight core
  service too early.

### Negative

- The team now needs to maintain contract discipline across two product
  surfaces.
- Existing chat-shell language may need compatibility shims as the broader
  shared model takes shape.
- There is still architectural pressure to extract a stronger service boundary
  later if co-hosting becomes too coupled.

### Neutral

- `cats` remains the current repo and app shell even if the public product
  naming later changes.
- The current file-backed chat state can still exist during migration as
  long as it maps cleanly to the shared contracts.

## Alternatives Considered

### Alternative 1: Delay shared core until after Cats Chat ships

- **Pros**: Least upfront planning work.
- **Cons**: Chat and Work likely diverge immediately under parallel delivery.
- **Why rejected**: The suite timing is too tight for schema drift.

### Alternative 2: Build a large standalone Cats Core service immediately

- **Pros**: Strong boundary from the beginning.
- **Cons**: High implementation cost and premature infrastructure complexity.
- **Why rejected**: The team needs a minimal hard contract, not a full platform
  first.

### Alternative 3: Let Chat and Work own their own private schemas

- **Pros**: Maximum local speed for each team.
- **Cons**: Guarantees duplication and painful reconciliation later.
- **Why rejected**: Shared actors, approvals, owner memory, and transport
  bindings are core suite concepts.

## References

- [Architecture](../architecture.md)
- [Requirements](../requirements.md)
- [ROADMAP](../../ROADMAP.md)
- [SPEC-006](../specs/SPEC-006-cats-core-v1-and-suite-foundation.md)
- [PLAN-006](../plans/PLAN-006-cats-core-v1-and-suite-foundation.md)

---

*Accepted: 2026-03-16*
*Accepted by: user direction captured through Codex*



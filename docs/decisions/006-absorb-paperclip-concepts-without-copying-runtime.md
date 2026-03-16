# ADR-006: Absorb Paperclip Concepts Without Copying Paperclip Runtime

> Use Paperclip as a product reference for `cats-inc`, not as the runtime or
> direct implementation base.

## Status

Proposed (Exploratory / Not Current Execution Path)

## Note

This ADR remains in-tree as exploratory Paperclip research. The currently
adopted near-term execution path is defined by ADR-007 and ADR-008. Revisit
this document only if the suite explicitly chooses to resume a larger
control-plane expansion.

## Context

`cats-inc` currently ships a chat-first workspace shell above `cats-runtime`.
That phase-2 shell is useful, but it is still too low-level to become the full
Cats product.

The local `paperclip/` submodule shows a stronger product framing:

- company-scoped work instead of channel-scoped work
- org structure instead of only participant lists
- goals, projects, issues, approvals, activity, costs, and outputs as
  first-class control-plane objects
- chat and transcripts attached to work rather than replacing work

At the same time, Paperclip also brings implementation choices that do not fit
the current `cats-inc` direction:

- its own server, routes, data model, and operator CLI
- direct adapter orchestration and heartbeat execution inside the product layer
- its own plugin runtime and deployment assumptions

`cats-inc` already has an explicit architectural constraint from
[ADR-001](./001-use-cats-runtime-boundary.md): upper-layer product apps depend
on `cats-runtime`, not on embedded runtime logic or direct adapter control.

## Decision

`cats-inc` will absorb Paperclip's strongest product concepts incrementally, but
it will not adopt Paperclip itself as the runtime or implementation base.

From this point on:

1. `cats-inc` will evolve from a chat-first shell into a broader company
   control plane.
2. Chat remains a first-class module, but it is no longer the root product
   abstraction.
3. `cats-runtime` remains the only runtime boundary for execution, session
   lifecycle, and provider-specific work.
4. `cats-inc` will not source-import Paperclip packages, schemas, runtime
   services, or adapter logic.
5. Migration will begin from the current `pals`, channels, leases, and
   transcripts model, using additive compatibility layers rather than a
   flag-day rewrite.
6. Paperclip's plugin/runtime architecture is treated as later reference
   material, not as an immediate milestone.

## Consequences

### Positive

- `cats-inc` can adopt a stronger operator-facing product model without losing
  its existing runtime architecture.
- The team gets a clear stance on what to borrow from Paperclip and what to
  leave behind.
- Current phase-2 chat behavior can remain operational while richer control
  plane surfaces are added.
- The future product can support goals, work items, activity, approvals, costs,
  and outputs without coupling those concerns to runtime adapters.

### Negative

- The rewrite is slower than forking or skinning Paperclip directly.
- `cats-inc` now needs its own control-plane domain model instead of relying on
  Paperclip's existing one.
- Some Paperclip concepts need translation because current Cats terms such as
  pal, workspace, and channel do not align one-to-one with Paperclip's agent,
  company, and issue language.

### Neutral

- Paperclip remains valuable as a continuing local reference submodule.
- Some Paperclip features, especially plugin runtime and multi-company
  packaging, may still be adopted later if they match Cats priorities.

## Alternatives Considered

### Alternative 1: Fork or skin Paperclip as the product base

- **Pros**: Immediate access to a larger control-plane surface.
- **Cons**: Pulls `cats-inc` toward Paperclip's server, data model, and runtime
  choices; weakens the `cats-runtime` boundary.
- **Why rejected**: It solves breadth by collapsing the current architecture.

### Alternative 2: Keep `cats-inc` as only a chat-first workspace shell

- **Pros**: Smallest product surface and least rewrite pressure.
- **Cons**: Leaves goals, work, approvals, outputs, and operator visibility
  under-modeled.
- **Why rejected**: It does not match the product direction implied by the
  Paperclip study or the Cats initiative.

### Alternative 3: Copy Paperclip concepts and implementation details together

- **Pros**: Faster than redesigning the product model from scratch.
- **Cons**: Imports unnecessary runtime, schema, and plugin complexity into the
  app layer.
- **Why rejected**: The product concepts are useful; the implementation base is
  not the right architectural fit.

## References

- [Paperclip Control Plane Analysis](../research/paperclip-control-plane-analysis.md)
- [ADR-001](./001-use-cats-runtime-boundary.md)
- [Architecture](../architecture.md)
- [ROADMAP](../../ROADMAP.md)

---

*Proposed: 2026-03-16*
*Proposed by: Codex from user-requested Paperclip study*

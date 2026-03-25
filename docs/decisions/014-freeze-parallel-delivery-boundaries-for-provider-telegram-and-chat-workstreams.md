# ADR-014: Freeze Parallel Product Delivery Boundaries for Chat, Work, and Code

## Status

Accepted

## Date

2026-03-25

## Context

`cats` is about to move into parallel product delivery across three workstreams:

1. `Cats Chat`
2. `Cats Work`
3. `Cats Code`

The earlier version of this ADR focused on provider, Telegram, and capability
seams. That was correct for the 2026-03-19 codebase, but the structural
baseline has since changed:

- `core/` and `platform/` no longer source-import product implementations
- `src/app/server/index.ts` is now a thin composition root
- `src/app/server/requestRouter.ts` owns suite-host route assembly
- graph-based dependency enforcement now runs in the main test suite
- extracted module families have been normalized into stable directories

That means the next failure mode is not "where do provider and Telegram files
go?" The next failure mode is:

- shared contract drift between Chat, Work, and Code teams
- repeated merge conflicts in suite-host wiring
- product teams pushing local types into shared scope without review

`cats` needs one explicit ownership map before the three product tracks begin
committing in parallel.

## Decision

`cats` will freeze parallel product delivery boundaries before `Chat`, `Work`,
and `Code` scale independently.

This decision includes:

1. The canonical shared-contract freeze set for parallel delivery is:
   - `src/core/types.ts`
   - `src/platform/orchestration/contracts.ts`
   - `src/shared/roomRouting.ts`
   - `src/products/chat/api/contracts.ts`
2. These files are shared contract surfaces and must not be reshaped by
   individual product teams without explicit integration review.
3. Product teams should land feature work under their own product slices first:
   - `src/products/chat/**`
   - `src/products/work/**`
   - `src/products/code/**`
4. Suite-host wiring remains centrally integrated through `src/app/server/**`
   rather than becoming a shared edit surface for all teams.
5. `src/app/server/requestRouter.ts` is treated as a controlled host
   composition seam. Product teams should provide product-owned routes; the
   integration owner composes them into the suite host.
6. New shared types should only be added when they are genuinely cross-product.
   Product-local types should stay in the owning product tree.

## Ownership Map

### Shared Integration Ownership

- Owns:
  - `src/core/**`
  - `src/platform/**`
  - `src/shared/**`
  - `src/app/server/**`
  - shared-contract freeze review and convergence
- Avoids:
  - product-specific UX and renderer behavior inside composition modules

### Chat Workstream

- Owns:
  - `src/products/chat/**`
  - chat transcript UX
  - chat routing and operator surfaces
  - chat-specific APIs and renderer behavior
- Avoids:
  - direct edits to Work or Code product modules
  - reshaping frozen shared contracts without integration review

### Work Workstream

- Owns:
  - `src/products/work/**`
  - work dashboard, inbox, approval, and activity surfaces
  - work-specific projections above `Cats Core v1`
- Avoids:
  - direct edits to Chat renderer/state modules
  - inventing Work-only copies of shared task/approval/activity contracts

### Code Workstream

- Owns:
  - `src/products/code/**`
  - code-specific project/build surfaces
  - code-specific projections above `Cats Core v1`
- Avoids:
  - direct edits to Chat renderer/state modules
  - inventing Code-only copies of shared task/run/artifact contracts

## Consequences

### Positive

- parallel product teams can work in mostly disjoint write scopes
- shared contract drift is less likely because the freeze set is explicit
- suite-host composition remains controlled instead of becoming a new merge hotspot
- `Cats Work` and `Cats Code` can grow without inheriting Chat as their schema owner

### Negative

- some teams will need to queue behind integration review for shared-contract changes
- suite-host route convergence is intentionally centralized, which adds a small
  coordination cost

### Neutral

- this ADR does not claim that `src/design/` or shared renderer primitives are
  the next immediate blocker
- this ADR does not require splitting `cats` into multiple packages

## Alternatives Considered

### Alternative 1: Let Each Product Team Edit Shared Contracts Freely

- **Pros**: fastest local feature velocity
- **Cons**: guarantees shape drift and reconciliation pain
- **Why rejected**: shared actors, conversations, tasks, approvals, and room
  routing are suite-wide concepts

### Alternative 2: Let Every Team Edit `requestRouter.ts` Directly

- **Pros**: less short-term coordination
- **Cons**: high merge-conflict risk and host-composition regressions
- **Why rejected**: the host seam is now intentionally thin and should stay that way

### Alternative 3: Freeze Nothing Until Work and Code Are More Mature

- **Pros**: postpones contract review work
- **Cons**: pushes the teams back toward schema divergence right when parallel
  development starts
- **Why rejected**: the right time to freeze the ownership map is before the
  branches diverge, not after

## References

- [ADR-007](./007-establish-cats-core-v1-for-chat-and-work.md)
- [ADR-025](./025-make-cats-inc-a-suite-host-with-core-owned-product-projections.md)
- [ADR-035](./035-invert-platform-dependency-and-extract-shared-design-layer.md)
- [ADR-036](./036-unify-api-contract-and-namespace-endpoints-by-product.md)
- [PLAN-014](../plans/PLAN-014-parallel-workstream-ownership-and-integration-seams.md)
- [PLAN-017](../plans/PLAN-017-suite-host-refactor-for-chat-work-code-and-core.md)
- [PLAN-024](../plans/PLAN-024-platform-dependency-inversion-and-design-extraction.md)
- [ROADMAP](../../ROADMAP.md)

---

*Decision made: 2026-03-25*
*Decision makers: user direction captured through Codex*

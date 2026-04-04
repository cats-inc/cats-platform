# PLAN-014: Parallel Product Workstream Ownership and Integration Seams

## Metadata

| Field | Value |
|-------|-------|
| **Status** | In Progress (Execution Baseline Landed) |
| **Owner** | Codex |
| **Assigned To** | Chat / Work / Code parallel workstreams |
| **Reviewer** | User |

## Related Decisions

- [ADR-007](../decisions/007-establish-cats-core-v1-for-chat-and-work.md)
- [ADR-025](../decisions/025-make-cats-inc-a-platform-host-with-core-owned-product-projections.md)
- [ADR-035](../decisions/035-invert-platform-dependency-and-extract-shared-design-layer.md)
- [ADR-036](../decisions/036-unify-api-contract-and-namespace-endpoints-by-product.md)

## Related Plans

- [PLAN-017](./PLAN-017-platform-host-refactor-for-chat-work-code-and-core.md)
- [PLAN-024](./PLAN-024-platform-dependency-inversion-and-design-extraction.md)

## Overview

`cats` is now structurally ready for three parallel product teams:

1. `Cats Chat`
2. `Cats Work`
3. `Cats Code`

The main refactor work has already landed:

- `core/` and `platform/` no longer source-import product implementations
- `src/app/server/index.ts` is now a thin composition root
- `src/app/server/requestRouter.ts` owns platform-host route assembly
- `Cats Work` and `Cats Code` now register through product-owned API delegates
  instead of expanding platform-host placeholder routes inline
- `ServerDependencies` is now split into `shared`, `chat`, `work`, and `code`
  slices so product teams can declare needs without extending Chat-centric
  wiring
- graph-based dependency enforcement now runs in `npm test`
- product and module directory normalization has landed

That means the remaining risk is no longer architectural ambiguity. The
remaining risk is coordination failure:

- multiple teams editing the same shared contracts
- multiple teams editing platform-host wiring directly
- product teams drifting back into cross-product imports

This plan freezes the ownership map needed to start parallel delivery safely.

## Canonical Shared Contract Freeze

The following files are the canonical shared-contract freeze set for the start
of parallel product delivery:

- `src/core/types.ts`
- `src/platform/orchestration/contracts.ts`
- `src/shared/roomRouting.ts`
- `src/products/chat/api/contracts.ts`

Rules:

1. These files are now treated as shared contract surfaces, not local product
   convenience modules.
2. Chat, Work, and Code teams must not independently reshape these files while
   implementing product features.
3. Any shape change to these files must be routed through explicit design
   review:
   - update the relevant ADR/SPEC/PLAN when the change is structural
   - or land through a single integration owner when the change is a narrow,
     agreed compatibility extension
4. New cross-product types should not be added elsewhere if they belong in one
   of the frozen files above.
5. New product-local types must stay inside the owning product tree instead of
   being promoted to shared scope prematurely.

## Workstream Ownership

| Workstream | Primary Scope | Owns | Avoids |
|------------|---------------|------|--------|
| Chat | `src/products/chat/**` | chat transcript UX, routing behavior, setup, chat renderer, chat-specific APIs, companion and operator surfaces | changing shared-core contracts without integration review; editing Work or Code product modules |
| Work | `src/products/work/**` | work dashboard, inbox, approval and activity views, work-specific projection surfaces above core | editing Chat renderer/state; introducing Work-only types into shared contracts |
| Code | `src/products/code/**` | code-specific product views, project/build surfaces, code-specific projections above core | editing Chat renderer/state; introducing Code-only types into shared contracts |
| Integrator | `src/app/server/**`, platform entrypoints, shared-contract freeze set | platform-host wiring, route registration, shared contract review, cross-product convergence | implementing product-specific UX inside host composition modules |

## Platform Host Integration Rule

Parallel product teams must treat the platform host as a controlled integration
surface, not as open shared workspace.

Primary host-owned integration files:

- `src/app/server/index.ts`
- `src/app/server/requestRouter.ts`
- `src/app/server/dependencies.ts`
- `src/app/server/contracts.ts`

Rules:

1. Product teams should land functionality in their own product modules first.
2. Product teams should not directly expand platform-host route assembly as part
   of feature work unless acting as the designated integrator for that change.
3. Host wiring should converge through one integration owner to prevent
   repeated merge conflicts in `requestRouter.ts`.
4. Product routes should remain callable through product-owned modules; the
   platform host should only register and compose them.

## Product Registration Protocol

Parallel product work must integrate through the following protocol:

1. each product owns a route delegate under `src/products/<product>/api/`
2. each product consumes a dedicated dependency slice from
   `src/app/server/contracts.ts`
3. platform-host dispatch stays in `src/app/server/requestRouter.ts`
4. renderer and navigation convergence is documented in
   [product-integration-guide.md](../product-integration-guide.md)

## Directory Ownership Map

| Area | Owner | Notes |
|------|-------|-------|
| `src/core/**` | shared integration owner | platform-owned shared truth and persistence |
| `src/platform/**` | shared integration owner | runtime, transport, memory, and orchestration infrastructure |
| `src/shared/**` | shared integration owner | product-neutral contracts and utilities only |
| `src/products/chat/**` | Chat team | Chat-specific behavior and renderer surfaces |
| `src/products/work/**` | Work team | Work-specific product slice |
| `src/products/code/**` | Code team | Code-specific product slice |
| `src/app/server/**` | integration owner | platform-host composition only |
| `src/app/renderer/**` | integration owner | top-level platform composition only |

## Start-Now Execution Rules

### Chat team

- default write scope: `src/products/chat/**`
- may request shared-contract additions only through integration review
- should not edit `src/products/work/**` or `src/products/code/**`

### Work team

- default write scope: `src/products/work/**`
- should consume `Cats Core v1` contracts rather than inventing parallel work
  schemas
- should not edit Chat state or renderer modules

### Code team

- default write scope: `src/products/code/**`
- should consume `Cats Core v1` contracts rather than inventing parallel code
  workflow schemas
- should not edit Chat state or renderer modules

### Integration owner

- owns convergence in shared contracts and platform-host route registration
- decides when a product-local type graduates into shared scope
- keeps `requestRouter.ts` and `app/server` from becoming the next merge hotspot

## Baseline Readiness

The baseline needed for parallel delivery is now in place:

- `src/app/server/index.ts` has been reduced to a thin composition root
- `src/app/server/requestRouter.ts` owns platform-host route assembly
- product-owned route delegates now exist for Chat, Work, and Code
- `ServerDependencies` now exposes `shared/chat/work/code` slices
- graph-based dependency enforcement runs under `npm test`
- architecture boundary tests cover the refactored seams
- folder/file normalization is complete enough for product ownership to be
  visible from the directory tree

This means the blocker is no longer structural refactor. The blocker is team
discipline around the ownership map above.

## Verification

- `npm test` must stay green
- `tests/dependency-graph.test.js` must continue to reject cross-layer
  regressions
- shared-contract freeze files should only change with explicit integration
  review
- new feature work should land under `src/products/<product>/` by default

## Progress Log

| Date | Update |
|------|--------|
| 2026-03-19 | Original provider/Telegram/capability parallel-workstream plan created |
| 2026-03-25 | Rewritten for the current Chat/Work/Code execution baseline after platform-host refactor, server composition slimming, graph dependency enforcement, and module directory normalization landed |

---

*Created: 2026-03-19*
*Last updated: 2026-03-25*
*Author: Codex*

# ADR-043: Keep Suite Renderer Entry Bounded with Route-Level Lazy Loading

> Reduce the suite renderer's initial JavaScript cost by loading product
> surfaces at route boundaries instead of eagerly bundling Chat, Work, Code,
> and setup flows into one entry chunk.

## Status

Proposed

## Context

`cats` currently builds the suite renderer as one eager bundle:

- the Vite build emits a warning that a minified chunk is larger than `500 kB`
- the observed renderer bundle is about `771 kB` minified / `208 kB` gzip
- the suite app eagerly imports `ChatApp`, `WorkApp`, and `CodeApp` from the
  top-level renderer shell
- the Vite config does not currently define route-aware code splitting or
  explicit chunking policy

That is tolerable for a local Electron path where network transfer is not the
main constraint, but it is still a real cost:

1. self-hosted npm/browser entry pays avoidable parse and execute work before
   the user even reaches the selected product surface
2. setup entry currently carries product code that is irrelevant before setup
   is complete
3. future suite growth will make the warning recur unless the bundle boundary
   is addressed structurally

At the same time, `cats` has explicit product route boundaries already:

- Chat at `/settings/*` and the chat route prefix
- Work at the work route prefix
- Code at the code route prefix
- setup at `/setup`

Those boundaries are the natural seam for bundle splitting.

## Decision

`cats` should treat route-level lazy loading as the default first response to
renderer chunk growth.

### 1. Product surfaces should load at route boundaries

The suite shell should lazy-load product renderers and setup surfaces instead
of importing them eagerly into the initial renderer entry.

This means the first implementation direction is:

- lazy-load `ChatApp`
- lazy-load `WorkApp`
- lazy-load `CodeApp`
- lazy-load setup-specific renderer surfaces where practical

### 2. Do not treat the warning as something to silence first

The project should not respond to the Vite warning primarily by raising
`chunkSizeWarningLimit`.

Changing the warning threshold is acceptable only after the bundle boundary has
been reviewed and the remaining size is intentional.

### 3. Prefer route boundaries before manual vendor chunk tuning

The first optimization step should be route-level splitting, not early
`manualChunks` micro-management.

`manualChunks` may still be useful later, but only after the product and setup
surfaces are no longer fused into the entry chunk.

### 4. Keep suite-host ownership boundaries intact

Chunking changes must preserve the current suite architecture:

- product-owned UI stays in product trees
- suite-host routing stays in the shared app shell
- runtime boundaries do not move
- chunking policy must not create new cross-product coupling

## Consequences

### Positive

- self-hosted browser entry stops paying for Work and Code up front when the
  user only needs Chat or setup
- setup entry can stay lighter and more focused
- bundle growth has a stable containment strategy as more suite surfaces land
- the project keeps a performance policy that matches its product boundaries

### Negative

- route-level lazy loading adds `Suspense`/fallback handling to the suite shell
- some route transitions may show short loading states when a surface is first
  opened
- test coverage must account for lazy-loaded route behavior

### Neutral

- this ADR does not require perfect micro-optimization of every vendor chunk
- this ADR does not promise that every emitted chunk will stay under the Vite
  default forever; it fixes the first structural problem first
- Electron may still feel acceptable before this change lands, but the warning
  is still useful design feedback

## Alternatives Considered

### Alternative 1: Ignore the warning because the desktop path is local

- **Pros**: no immediate code churn
- **Cons**: the self-hosted path regresses, and future suite growth compounds
  the same issue
- **Why rejected**: the warning points to a real architectural seam that the
  current route structure can solve cleanly

### Alternative 2: Raise `chunkSizeWarningLimit` and do nothing else

- **Pros**: fastest way to remove noisy output
- **Cons**: hides a meaningful entry-bundle problem without improving user
  experience
- **Why rejected**: silencing the warning is not the same as fixing the
  bundle boundary

### Alternative 3: Start with `manualChunks` tuning only

- **Pros**: can reduce reported chunk size quickly
- **Cons**: risks brittle bundler-specific grouping while the larger issue is
  still that product routes are imported eagerly
- **Why rejected**: route boundaries are the cleaner and more durable seam

## References

- [ADR-013](./013-ship-cats-inc-as-an-executable-self-hosted-npm-app.md)
- [ADR-025](./025-make-cats-inc-a-suite-host-with-core-owned-product-projections.md)
- [ADR-035](./035-invert-platform-dependency-and-extract-shared-design-layer.md)
- [SPEC-042](../specs/SPEC-042-suite-renderer-route-level-chunking-and-lazy-entry.md)
- [vite.config.ts](/home/sammykenny2/Source/SK2/one-man-digital-company/cats/vite.config.ts)
- [src/app/renderer/App.tsx](/home/sammykenny2/Source/SK2/one-man-digital-company/cats/src/app/renderer/App.tsx)

---

*Drafted: 2026-03-30*
*Drafted by: Codex*

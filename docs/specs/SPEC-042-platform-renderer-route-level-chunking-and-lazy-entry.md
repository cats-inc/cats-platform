# SPEC-042: Platform Renderer Route-Level Chunking and Lazy Entry

> Keep the platform renderer's initial entry lighter by splitting setup, Chat,
> Work, and Code at route boundaries instead of eagerly bundling all product
> surfaces together.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Summary

The current platform renderer entry is structurally too eager for the shape of the
product.

Today the top-level app shell imports:

- `ChatApp`
- `WorkApp`
- `CodeApp`
- setup-adjacent shell code

into one renderer entry, and Vite warns that the emitted chunk is larger than
the default `500 kB` threshold. The observed build output is roughly:

- `771.48 kB` minified JavaScript
- `208.16 kB` gzip

That is not an emergency for local desktop packaging, but it is poor alignment
with the product's actual route structure and it weakens the self-hosted
browser path.

This spec defines the first bundle-boundary cleanup for the platform renderer:

- treat route boundaries as chunk boundaries
- lazy-load product surfaces and setup flows where practical
- preserve current platform-host ownership and route semantics
- avoid treating `chunkSizeWarningLimit` as the primary fix

## Goals

- reduce avoidable initial renderer work for setup and Chat entry
- ensure Work and Code product code is not eagerly loaded on first paint when
  those routes are not being entered
- align chunking policy with the platform's existing route and ownership
  boundaries
- keep self-hosted and Electron entry behavior consistent
- establish a clear performance policy before more platform surfaces are added

## Non-Goals

- perfect bundle-size optimization across every dependency in this slice
- broad `manualChunks` tuning as the first step
- changing product route prefixes or platform-host navigation semantics
- moving product code out of its current ownership trees
- introducing SSR, module federation, or a second renderer architecture

## User Stories

- As a user opening `cats` for setup, I want the setup path to load without
  paying for Work and Code screens I cannot use yet.
- As a user entering Chat, I want the initial renderer to avoid loading other
  product surfaces until I navigate to them.
- As a maintainer, I want renderer performance work to follow product
  boundaries instead of ad hoc bundler tweaks.

## Requirements

### Functional Requirements

1. The platform renderer shall lazy-load product entry surfaces at route
   boundaries instead of eagerly importing all product renderers into the
   initial shell.
2. The first lazy-loaded set shall include:
   - Chat product surface
   - Work product surface
   - Code product surface
3. The setup flow should be lazy-loaded from the platform shell as well, unless a
   specific setup dependency must remain in the entry chunk for correctness.
4. Route redirects and stored-surface restoration shall continue to behave the
   same after lazy loading is introduced.
5. A route-level loading fallback shall be shown while a lazy-loaded surface is
   resolving.
6. Deep links such as `/settings/*`, the Chat route prefix, the Work route
   prefix, the Code route prefix, and `/setup` shall continue to resolve
   correctly.
7. The renderer shall not rely on the Electron host to pre-resolve product
   chunks; the browser/self-hosted path must remain first-class.
8. The platform shell shall continue to own routing and setup gating logic.
9. Product code shall remain in product-owned trees; chunking work shall not be
   used as a reason to collapse product ownership boundaries.

### Performance and Build Requirements

10. The initial entry chunk shall no longer eagerly include all three product
    surfaces together.
11. The preferred first success condition is that the main renderer entry no
    longer triggers the current Vite large-chunk warning.
12. If the warning still remains after route-level splitting, the follow-up
    work shall inspect the remaining sources before changing
    `chunkSizeWarningLimit`.
13. `build.rollupOptions.output.manualChunks` may be added later, but it shall
    be treated as a second-phase refinement after route-level splitting.
14. The build output should make it obvious that separate chunks exist for the
    major product surfaces.

### Testing and Validation Requirements

15. Renderer tests shall continue to cover route entry for setup, Chat, Work,
    and Code after lazy loading lands.
16. The build flow shall continue to succeed for:
    - `npm run build`
    - packaged desktop staging flows that depend on `dist/`
17. Validation should capture the before/after bundle shape or warning state so
    the change is grounded in build evidence.

## Design Overview

```text
platform shell
  -> load light entry shell
  -> fetch platform envelope / setup state
  -> choose route
  -> lazy-load target surface:
       setup
       chat
       work
       code
  -> render fallback while the target chunk resolves
```

## Proposed Implementation Direction

### Phase 1: Route-Level Lazy Loading

- replace eager imports of `ChatApp`, `WorkApp`, and `CodeApp` in the platform
  shell with `lazy(() => import(...))`
- introduce route-level fallback UI around lazy surfaces
- keep setup gating and redirect behavior unchanged

### Phase 2: Re-measure Build Output

- rebuild with Vite
- inspect emitted chunks and warning output
- confirm that non-target product surfaces are no longer fused into the entry
  chunk

### Phase 3: Optional Bundler Refinement

- only if needed, inspect remaining large chunks
- consider `manualChunks` or targeted dependency splits
- avoid arbitrary threshold inflation without documenting the reason

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Lazy loading breaks deep-link or redirect behavior | High | Keep route coverage focused on setup plus each product entry |
| Loading fallbacks feel visually noisy | Medium | Use minimal route-level fallback patterns consistent with the existing shell |
| One large shared dependency still keeps the main warning alive | Medium | Measure after route splitting, then decide whether targeted chunk tuning is justified |
| Product boundaries get muddied while "sharing" chunk code | Medium | Keep ownership rules explicit and avoid moving product behavior into shared shell code just for bundling |

## Validation

- `npm run build` succeeds
- emitted build output shows separate route-level chunks for major product
  surfaces
- setup, Chat, Work, and Code routes still render correctly
- the current large-chunk warning is removed or narrowed enough that any
  remaining warning has a specific documented cause

## References

- [ADR-043](../decisions/043-keep-platform-renderer-entry-bounded-with-route-level-lazy-loading.md)
- [ADR-013](../decisions/013-ship-cats-inc-as-an-executable-self-hosted-npm-app.md)
- [ADR-025](../decisions/025-make-cats-inc-a-platform-host-with-core-owned-product-projections.md)
- [ADR-035](../decisions/035-invert-platform-dependency-and-extract-shared-design-layer.md)

---

*Last updated: 2026-03-30*

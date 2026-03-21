# PLAN-017: Suite Host Refactor for Chat, Work, Code, and Core

Status: Draft (Pending Review)

## Scope

Implement the first structural refactor slice required by
[ADR-025](../decisions/025-make-cats-inc-a-suite-host-with-core-owned-product-projections.md).

This plan covers:

- establishing a suite-host code skeleton inside `cats`
- reversing the current `workspace -> core` dependency direction
- demoting current workspace modules into a Chat-specific product slice
- splitting top-level app composition from product-slice logic
- creating placeholder `Work` and `Code` entry surfaces so parallel development
  can begin safely

This plan does not cover:

- shipping full `Cats Work` product functionality
- shipping full `Cats Code` product functionality
- introducing new `cats-runtime` architecture
- splitting `cats` into multiple npm packages
- multiple renderer bundles or multiple Vite apps

## Hard Constraints

- Keep `cats-runtime` as the only runtime boundary.
- Do not let Chat-specific DTOs remain the shared suite contract.
- Do not let `Work` or `Code` depend directly on current Chat/workspace schema.
- Keep the first slice focused on structure and ownership boundaries.
- Preserve existing Chat behavior as much as possible while moving code.

## Target First-Slice Shape

```text
src/
  app/
    server/
    renderer/
  core/
    types.ts
    model.ts
    store.ts
  products/
    chat/
      api/
      workspace/
      renderer/
    work/
      api/
      renderer/
    code/
      api/
      renderer/
  platform/
    runtime/
    persistence/
    transports/
  shared/
```

The target above is a first-slice skeleton, not the final detailed directory
taxonomy for every feature.

## Phases

### Phase 1: Freeze Ownership Boundaries

- [x] Freeze the suite-host ownership split:
      - `core` owns shared suite truth
      - `products/chat` owns Chat-specific read models and workflow state
      - `products/work` owns Work-specific surfaces
      - `products/code` owns Code-specific surfaces
      - `platform` owns runtime, persistence, and transport infrastructure
- [x] Freeze the first-slice rule that `shared/` should only contain
      product-neutral utilities.
- [x] Document any current modules that are still transitional rather than fully
      relocated.

**Deliverables**: a stable refactor map before files move.

### Phase 2: Establish the Skeleton Without Changing Behavior

- [x] Add the new top-level directories:
      - `src/app`
      - `src/core`
      - `src/products/chat`
      - `src/products/work`
      - `src/products/code`
      - `src/platform`
- [x] Introduce thin re-export modules where useful to keep the refactor
      incremental rather than all-at-once.
- [x] Keep current entry points working during the migration.

**Deliverables**: code can start relocating without one giant disruptive move.

### Phase 3: Extract Shared Core Contracts and Persistence

- [x] Move current shared core contracts out of `src/shared/core.ts` into
      `src/core/types.ts`.
- [x] Introduce `src/core/store.ts` as the shared core persistence boundary.
- [x] Define the first neutral core read/write API that does not require Chat
      workspace types as input.
- [x] Keep compatibility adapters temporarily where existing code still expects
      older imports.

**Deliverables**: `Cats Core` becomes an explicit module with its own
contracts and store boundary.

Current transitional modules after phases 1-3:

- `src/server.ts` is still the top-level Chat-first assembler, but now imports
  Chat/runtime/transport code through the new compatibility slices where
  practical.
- `src/workspace/*` remains the implementation home for Chat behavior and is
  surfaced through `src/products/chat/workspace/*` re-export modules until
  Phase 5 relocation.
- `src/runtime/*` and `src/transports/*` remain the implementation home for
  infrastructure code and are surfaced through `src/platform/*` re-export
  modules until deeper relocation.
- `src/shared/core.ts` remains as an explicit compatibility adapter that
  re-exports `src/core/types.ts`.
- `src/shared/app-shell.ts` is still transitional and remains Chat-biased until
  the later split described in ADR-025.

### Phase 4: Reverse the Current Dependency Direction

- [x] Stop treating `workspace` state as the suite-wide source of truth.
- [x] Replace current `syncCoreStateWithWorkspace(...)`-style ownership with:
      - core-owned persisted state
      - Chat projection builders derived from core plus Chat-local state
- [x] Decide what remains shared core state versus what becomes Chat-local
      workflow state.
- [x] Keep a temporary compatibility layer so existing workspace-oriented tests
      continue passing while assertions are migrated incrementally toward
      core-owned state and projection-based behavior.
- [x] Keep migration compatibility logic explicit and temporary.

**Deliverables**: the suite now follows:

```text
Cats Core -> Chat projection
          -> Work projection
          -> Code projection
```

instead of the reverse.
Existing tests should continue passing against compatibility adapters until
they are individually migrated to core-based assertions.

Current transitional modules after Phase 4:

- `src/products/chat/workspace/coreProjection.ts` owns the Chat-specific
  `workspace -> core` projection logic that previously lived under
  `src/core/model.ts`.
- `src/workspace/store.ts` now persists a temporary `{ ...core, workspace }`
  compatibility envelope so existing Chat flows and tests can continue to read
  and write workspace state while `readCore()` remains Chat-independent.
- `src/shared/app-shell.ts` still re-exports a small set of core types for
  compatibility with older Chat modules, but `src/core/*` no longer imports
  Chat/workspace types.

### Phase 5: Demote Workspace Modules into the Chat Slice

- [x] Move current `src/workspace/*` under `src/products/chat/workspace/*`.
- [ ] Move Chat-specific API handlers out of the top-level server area into
      `src/products/chat/api/*`.
- [x] Move Chat renderer concerns under `src/products/chat/renderer/*`.
- [ ] Rename transitional types and modules where needed so Chat-specific code
      is no longer presented as suite-wide code.

**Deliverables**: current Chat functionality now clearly lives in the Chat
product slice.

Current transitional modules during Phase 5:

- `src/workspace/*` now acts as an explicit compatibility shim that re-exports
  the real Chat implementation from `src/products/chat/workspace/*`.
- `src/renderer/*` now acts as an explicit compatibility shim that re-exports
  the real Chat renderer implementation from `src/products/chat/renderer/*`.
- `src/server.ts` still owns most Chat-specific route handlers until the
  `products/chat/api/*` extraction is complete.

### Phase 6: Turn Top-Level Server and Renderer into Assemblers

- [x] Replace the current top-level `server.ts` role with an app-level assembly
      module that wires product-slice routes together.
- [ ] Split Chat routes from top-level server composition.
- [x] Replace the current single-surface renderer shape with an app-level
      router that can host Chat, Work, and Code roots.
- [x] Keep one renderer bundle and one top-level entry in the first slice.

**Deliverables**: top-level app modules compose product slices instead of
owning Chat behavior directly.

Current transitional modules during Phase 6:

- `src/server.ts` is now an explicit compatibility shim that re-exports the
  app-level assembler from `src/app/server/index.ts`.
- `src/renderer/main.tsx` and `src/renderer/App.tsx` are now explicit
  compatibility shims that re-export the suite-level renderer entry from
  `src/app/renderer/*`.
- `src/app/server/index.ts` now owns the suite-level server assembly, but still
  contains most Chat-specific route handling until the `products/chat/api/*`
  extraction is complete.
- `src/app/renderer/App.tsx` now reserves suite slots for `Cats Work` and
  `Cats Code`, while still routing all existing non-Work/non-Code paths into
  the Chat product slice.

### Phase 7: Add Work and Code Placeholders

- [x] Add empty or minimal `products/work/api` and `products/work/renderer`
      entry modules.
- [x] Add empty or minimal `products/code/api` and `products/code/renderer`
      entry modules.
- [x] Add placeholder routes and surfaces so new work can land in dedicated
      locations without touching Chat modules.
- [x] Reserve extension points for later Work and Code projections from core.

**Deliverables**: parallel Work/Code development can begin without immediately
colliding with Chat code.

Current placeholder modules after Phase 7:

- `src/products/work/api/*` now exposes a dedicated Work placeholder payload
  derived from Cats Core, plus reserved future routes for team/workflow
  surfaces.
- `src/products/code/api/*` now exposes a dedicated Code placeholder payload
  derived from Cats Core, plus reserved future routes for project/preview/build
  surfaces.
- `src/products/work/renderer/*` and `src/products/code/renderer/*` now mount
  dedicated placeholder roots through the suite router instead of relying on
  inline placeholder JSX in `src/app/renderer/App.tsx`.
- `src/app/server/index.ts` still wires the placeholder routes directly until a
  later route-module extraction completes the Phase 6 split.

### Phase 8: Validation and Cleanup

- [ ] Update imports to remove transitional re-exports where practical.
- [ ] Add or update tests covering:
      - core-store behavior
      - Chat projection behavior
      - top-level route composition
      - renderer route composition
- [ ] Update architecture and API docs to reflect the new suite-host layout
      once code lands.
- [ ] Mark any remaining temporary compatibility seams clearly in code and plan
      notes.

**Deliverables**: stable structure, preserved Chat behavior, and documented next
steps for Work and Code teams.

Current validation state after Phase 8A:

- `core-store` coverage is already in place through `tests/core-store.test.js`.
- top-level route composition now has direct coverage through
  `/api/work` and `/api/code` server tests.
- renderer route composition now has direct coverage through
  `tests/suite-routing.test.js`, which validates the suite route map and
  current Work/Code placeholder ownership.
- architecture, progress, and docs index files have been updated to reflect the
  current suite-host layout and the still-temporary compatibility seams.

Remaining work after Phase 8A:

- extract Chat-specific route handlers from `src/app/server/index.ts` into
  `src/products/chat/api/*` to finish the Phase 6 split
- rename or split more Chat-biased contracts such as `src/shared/app-shell.ts`
  so they no longer read as suite-wide contracts
- remove transitional re-export shims in `src/workspace/*`,
  `src/renderer/*`, and `src/server.ts` only after the app/server and
  Chat-route ownership boundaries are stable
- add a fuller renderer-level test harness later if route-level behavior needs
  richer assertions than the current route-map coverage
- update API docs again once Chat route-module extraction changes ownership and
  import paths

## Candidate Code Areas

| Area | Action | Why |
|------|--------|-----|
| `src/shared/core.ts` | Move/split | Shared core contracts should live under `core/*` |
| `src/core/model.ts` | Preserve and adapt | Existing core derivation logic is the starting point for core-owned state operations |
| `src/workspace/store.ts` | Refactor heavily | This file currently preserves the reversed dependency direction |
| `src/workspace/*` | Relocate | These modules are Chat-specific, not suite-level |
| `src/shared/app-shell.ts` | Split | Current app-shell contracts are Chat view-models rather than suite-neutral contracts |
| `src/server.ts` | Break apart | It is currently a monolithic server and a collision point for future surfaces |
| `src/renderer/App.tsx` | Break apart | It is currently a monolithic Chat app and a collision point for future surfaces |
| `src/runtime/client.ts` | Relocate under platform | Runtime client is infrastructure, not product-slice code |
| `src/transports/telegram/*` | Relocate under platform | Transport code is infrastructure shared across surfaces |
| `src/index.ts` | Keep thin | Entry point should remain assembly-only |

## Validation

- Current Chat routes still work after relocation.
- Top-level app routing can mount Chat, Work, and Code roots without requiring
  three separate apps.
- `Cats Core` can be read and written without going through Chat workspace DTOs.
- Chat-specific read models are derived from shared core plus Chat-local state,
  not the other way around.
- Work and Code contributors can add code to dedicated directories without
  editing Chat-owned files by default.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| The refactor becomes a pure folder shuffle with no dependency correction | High | Make core-store split and projection reversal explicit early in the plan |
| Behavior regressions land while moving Chat modules | High | Keep the first slice incremental and add regression coverage around existing Chat flows |
| Core state boundaries are made too abstract too early | Medium | Start with `core/types.ts`, `core/model.ts`, and `core/store.ts` only |
| Work and Code placeholders stay empty long enough to rot | Medium | Land placeholder routes and ownership boundaries close to the next implementation wave |
| Top-level assembler refactor stalls under existing file size | Medium | Split server and renderer by route/surface, not by theoretical final taxonomy all at once |

## Suggested Handoff Instruction

Use this when delegating implementation:

> Implement the first slice of ADR-025. Convert `cats` from a chat-shell-
> first structure into a suite host with core-owned product projections. Reverse
> the current `workspace -> core` dependency direction, move current workspace
> modules into the Chat slice, and add placeholder Work/Code surfaces without
> changing the `cats-runtime` boundary.

---

*Last updated: 2026-03-21*

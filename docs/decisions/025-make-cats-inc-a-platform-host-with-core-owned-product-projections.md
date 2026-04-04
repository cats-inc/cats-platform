# ADR-025: Make cats a Platform Host with Core-Owned Product Projections

> Keep `Cats Chat`, `Cats Work`, `Cats Code`, and `Cats Core` inside
> `cats`, but reverse the current dependency direction so shared core state
> becomes the source of truth and product surfaces consume projections instead
> of defining platform-wide schema.

## Status

Accepted

## Date

2026-03-21

## Context

Recent product-direction documents now treat `Cats Chat`, `Cats Work`, and
`Cats Code` as three different top-level product promises that share one host,
one runtime boundary, and one shared domain model rather than three separate
apps or repos.

That direction is already visible in the planning and research docs:

- `Cats Core v1` is the accepted shared contract layer for Chat and Work
- `Cats Chat`, `Cats Work`, and `Cats Code` are now treated as distinct product
  lines with different primary units and UX emphasis
- `cats-runtime` remains the only runtime boundary and should not absorb
  product-surface concerns

However, the current implementation shape inside `cats` still reflects the
older chat-shell-first architecture.

Today, the dependency direction is effectively:

```text
chat state -> syncCoreStateWithChatState(...) -> Cats Core state
```

This causes three structural problems.

1. Shared platform state is still defined by the current Chat-state model.
   `Cats Core` is currently derived from chat state rather than acting
   as the source of truth.

2. `Chat`-specific DTOs still look like platform-level contracts.
   Files such as `src/shared/app-shell.ts` describe selected-channel, cats,
   boss-cat, and global-orchestrator state. Those are valid Chat read-model
   concepts, but they are not neutral platform-level contracts for Work or Code.

3. The current app shell is still monolithic.
   `src/server.ts` and `src/renderer/App.tsx` still centralize product logic for
   one chat-first shell, which makes parallel `Work` and `Code` development
   likely to collide in the same files.

If `Cats Work` and `Cats Code` begin implementation without first correcting
this structure, they will either:

- depend on Chat-state schema directly, or
- invent parallel state models that drift away from the shared core

Neither outcome is acceptable.

## Decision

`cats` will remain the single platform host for `Cats Chat`, `Cats Work`,
`Cats Code`, and `Cats Core`, but the internal code structure will shift from
`chat-shell-first` to `platform-host + shared-core + product-slice projections`.

### 1. `Cats Core` becomes the source of truth

The dependency direction will become:

```text
Cats Core state -> Chat projection
                -> Work projection
                -> Code projection
```

`Chat` may still keep product-local workflow state, but it must no longer act
as the platform-wide state owner from which `Cats Core` is derived.

### 2. `chat/*` is demoted to a Chat product slice

The current `chat` modules are a valid first implementation of Chat state,
but they are no longer platform-level modules.

They will be treated as `Chat` product logic and moved under a Chat-specific
surface in the first major refactor slice.

### 3. `shared/app-shell.ts` is split

The current `app-shell` contracts will no longer be treated as a generic shared
product contract.

Instead:

- shared core contracts remain under `core/*`
- Chat read-model contracts become Chat-specific
- cross-product utilities stay under `shared/*` only if they are genuinely
  product-neutral

### 4. `cats` adopts a platform-host skeleton

The target first-slice code shape is:

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
      state/
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

This is an implementation boundary and ownership boundary, not a commitment to
multiple npm packages or multiple standalone apps.

### 5. `server.ts` and `App.tsx` become assemblers

The top-level server and renderer entry points should remain, but their job
changes:

- top-level server code assembles product-slice routes
- top-level renderer code assembles product-slice surfaces and routing

They should stop being the primary place where Chat-specific behavior grows.

### 6. `cats-runtime` does not need the same refactor

The runtime already has the correct broad boundary:

- shared runtime core
- backend adapters
- HTTP surface

This ADR does not move product-line concerns into `cats-runtime`.

## Consequences

### Positive

- `Cats Work` and `Cats Code` can begin development without inheriting Chat as
  their schema owner.
- Shared platform concepts stay in one place instead of being repeatedly copied
  into surface-specific models.
- The main app becomes easier to split into product slices without splitting
  repos or runtime boundaries.
- `server.ts` and `App.tsx` can shrink into composition layers instead of
  continuing to grow as product monoliths.

### Negative

- The first refactor slice is structural and may feel like slower feature
  progress.
- Some current modules will move and imports will churn before new visible
  features land.
- Projection builders and core persistence boundaries need to be introduced
  before Work and Code benefit from them.

### Neutral

- This ADR does not require multiple Vite entry points.
- This ADR does not require turning `cats` into a monorepo-within-a-repo.
- This ADR does not require `Cats Work` and `Cats Code` to ship immediately.
- This ADR does not remove the current Chat-first product priority.

## Alternatives Considered

### Alternative 1: Keep the current Chat-state-first structure and let Work/Code adapt later

- **Pros**: no immediate refactor cost
- **Cons**: Work and Code would either depend on Chat DTOs or fork parallel
  state models; large shared files would become immediate collision zones
- **Why rejected**: this defers the structural problem until the most expensive
  moment, when multiple product lines are already being implemented

### Alternative 2: Split Chat, Work, Code, and Core into separate repos or packages now

- **Pros**: strong isolation; clear ownership
- **Cons**: premature packaging and toolchain complexity; likely overkill at the
  current maturity of shared contracts
- **Why rejected**: the platform still benefits from one host repo and one shared
  local app/runtime composition path

### Alternative 3: Only move directories without reversing dependency direction

- **Pros**: visually cleaner tree with less conceptual work up front
- **Cons**: preserves the core problem by merely renaming Chat-owned truth as a
  different folder layout
- **Why rejected**: the dependency direction, not just the folder layout, is the
  real issue

### Alternative 4: Move more shared responsibility into `cats-runtime`

- **Pros**: thinner app surface
- **Cons**: pulls product-line concerns into the runtime boundary and conflicts
  with the already accepted split between product intent and runtime execution
- **Why rejected**: `cats-runtime` should stay the execution boundary, not
  become the platform host

## References

- [ADR-007](./007-establish-cats-core-v1-for-chat-and-work.md)
- [ADR-018](./018-separate-product-skill-intent-from-runtime-skill-hosting.md)
- [ADR-020](./020-own-mcp-intent-in-product-and-tool-delivery-in-runtime.md)
- [architecture](../architecture.md)
- [Codex product-boundaries note](../research/2026-03-20-codex-cats-chat-work-code-product-boundaries.md)
- [PLAN-016](../plans/PLAN-016-dynamic-room-workflow-orchestration.md)
- [cats-runtime ADR-009](../../../cats-runtime/docs/decisions/009-keep-cats-runtime-separately-packageable-with-app-managed-local-startup.md)

---

*Accepted: 2026-03-21*  
*Decision makers: user + Codex*



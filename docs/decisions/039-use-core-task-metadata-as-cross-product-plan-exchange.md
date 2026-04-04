# ADR-039: Use Core Task Metadata as the Cross-Product Plan Exchange Surface

> `CoreTaskRecord` remains product-owned, and its metadata becomes the platform's
> normalized handoff surface for strategy-aware task exchange across Chat,
> Work, and Code.

## Status

Proposed

## Context

`cats` already owns the shared task substrate in `Cats Core v1`.
[ADR-032](./032-own-task-substrate-in-core-not-runtime.md) established that task
CRUD, assignment, approval, and lifecycle stay in Core while `cats-runtime`
only executes sessions and wakeups.

At the same time, current research and product direction now require a richer
handoff model across `Cats Chat`, `Cats Work`, and `Cats Code`:

- a task created in Work may need to run in Code
- a Chat conversation may escalate a user request into structured sub-tasks
- different tasks may prefer different execution rhythms such as ReAct, PDCA,
  Reflexion, or Tree-of-Thoughts

The platform therefore needs a shared plan-exchange surface, but it must not:

- create a reverse dependency from `cats-runtime` back into `cats`
- introduce product-specific task schemas per surface
- casually reshape the frozen shared contract in `src/core/types.ts`

`CoreTaskRecord.metadata` is already an open dictionary, so it can carry
cross-product planning conventions without a first-slice schema migration.

## Decision

`CoreTaskRecord.metadata` will act as the platform-owned Unified Planning Language
(UPL) handoff surface through a single namespaced block:

```ts
task.metadata.planning
```

The initial planning block is a metadata convention, not a first-slice schema
change. The canonical keys are:

- `strategyHint?: string`
- `acceptanceCriteria?: string`
- `strategyContext?: Record<string, unknown>`
- `dependsOnTaskIds?: string[]`
- `productHint?: 'chat' | 'work' | 'code'`
- `transfer?: { suggestedProduct?: 'chat' | 'work' | 'code'; rationale?: string }`

This decision includes:

1. `CoreTaskRecord` remains the product-owned task and handoff record.
2. Chat, Work, and Code may all write/read the same `metadata.planning` block.
3. `metadata.planning` is the platform-normalized exchange format between product
   task orchestration and runtime strategy selection.
4. `parentTaskId` remains the primary structural hierarchy field for task
   trees. `dependsOnTaskIds` is additive dependency metadata for converge,
   sequencing, and fan-out coordination.
5. Product defaults such as Chat=`react`, Work=`pdca`, and Code=`reflexion`
   stay product-owned conventions and are not runtime-owned policy.
6. `cats-runtime` must not import or directly persist `CoreTaskRecord`.
   Products translate `metadata.planning` into runtime-neutral execution
   requests when they create or wake sessions.
7. If stronger typing is needed later, the platform should add product-owned
   read/write helpers for `metadata.planning` before considering any contract
   expansion of `CoreTaskRecord`.

## Consequences

### Positive

- preserves [ADR-032](./032-own-task-substrate-in-core-not-runtime.md) by
  keeping task semantics inside `cats`
- gives Chat, Work, and Code one shared handoff vocabulary without inventing
  parallel task schemas
- avoids a premature schema migration because `metadata` is already extensible
- allows cross-strategy and cross-product handoff while keeping runtime
  strategy selection generic

### Negative

- `metadata` conventions are weaker than a typed schema and require discipline
- tooling must read/write the namespaced planning block consistently
- some plan semantics remain convention-based until typed helpers or a later
  contract revision lands

### Neutral

- this decision does not by itself add new UI, new runtime APIs, or new
  strategy implementations
- task metadata can still carry other governance or workflow annotations
  outside the planning block

## Alternatives Considered

### Alternative 1: Let cats-runtime own the task handoff schema

- **Pros**: one place to combine task and execution semantics
- **Cons**: violates the accepted runtime boundary and would force
  `cats-runtime` to understand product task contracts
- **Why rejected**: `cats` owns tasks; runtime only owns execution

### Alternative 2: Add new top-level typed fields to `CoreTaskRecord` now

- **Pros**: stronger typing immediately
- **Cons**: reshapes the frozen shared contract during an exploratory slice
- **Why rejected**: the first slice only needs normalized conventions, not a
  contract migration

### Alternative 3: Give each product its own handoff schema

- **Pros**: each product could optimize for its own UI
- **Cons**: breaks cross-product interoperability and recreates translation
  complexity at every boundary
- **Why rejected**: the platform needs one shared handoff language

## References

- [ADR-001](./001-use-cats-runtime-boundary.md)
- [ADR-014](./014-freeze-parallel-delivery-boundaries-for-provider-telegram-and-chat-workstreams.md)
- [ADR-025](./025-make-cats-inc-a-platform-host-with-core-owned-product-projections.md)
- [ADR-032](./032-own-task-substrate-in-core-not-runtime.md)
- [SPEC-032](../specs/SPEC-032-core-task-lifecycle-and-wakeup-integration.md)
- [Research: Unified Planning Language and Cross-Product Strategy](../research/2026-03-26-unified-planning-language-and-cross-product-strategy.md)
- [Companion runtime research: Pluggable Execution Strategy Architecture](../../../cats-runtime/docs/research/2026-03-26-pluggable-execution-strategy-architecture.md)

---

*Decision made: 2026-03-26*
*Decision makers: Codex + user direction*

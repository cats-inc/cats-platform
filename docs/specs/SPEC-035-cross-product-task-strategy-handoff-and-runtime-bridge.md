# SPEC-035: Cross-Product Task Strategy Handoff and Runtime Bridge

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Summary

Extend the existing Core task substrate so Chat, Work, and Code can hand off
tasks through one shared planning convention, then bridge those tasks into
`cats-runtime` through a runtime-neutral execution request. The suite keeps
`CoreTaskRecord` as the cross-product plan exchange surface while runtime stays
session-local and strategy-execution-focused.

## Goals

- define the suite-owned planning metadata convention for cross-product task
  handoff
- let each product resolve or override an execution strategy per task
- bridge task planning metadata into runtime session creation/wakeup without
  leaking `CoreTaskRecord` into `cats-runtime`
- support Chat, Work, and Code using one shared task exchange model

## Non-Goals

- moving task graphs, approvals, or task persistence into `cats-runtime`
- requiring a new top-level typed `CoreTaskRecord` schema in the first slice
- implementing every future execution strategy in the first delivery
- designing the full Work or Code dashboards in this spec

## User Stories

- As a user in `Cats Work`, I want a planned task to hand off to `Cats Code`
  without losing acceptance criteria or execution intent.
- As a user in `Cats Chat`, I want a Boss Cat or lead Cat to escalate a
  message into structured sub-tasks that still run through the shared task
  substrate.
- As a product integrator, I want one normalized bridge from task planning to
  runtime strategy execution.

## Requirements

### Functional Requirements

1. `CoreTaskRecord.metadata` shall reserve a namespaced `planning` block for
   cross-product task handoff conventions.
2. The initial `planning` block shall support at least:
   - `strategyHint?: string`
   - `acceptanceCriteria?: string`
   - `strategyContext?: Record<string, unknown>`
   - `dependsOnTaskIds?: string[]`
   - `productHint?: 'chat' | 'work' | 'code'`
   - `transfer?: { suggestedProduct?: 'chat' | 'work' | 'code'; rationale?: string }`
3. Chat, Work, and Code shall treat `CoreTaskRecord` plus `metadata.planning`
   as the canonical handoff payload when a task moves between products.
4. Product-level strategy defaults shall be:
   - Chat: `react`
   - Work: `pdca`
   - Code: `reflexion`
5. Product defaults shall remain conventions. A task-level `strategyHint`
   shall override the product default.
6. When a task is checked out or woken for execution, the product layer shall
   translate the planning block into a runtime-neutral execution request rather
   than passing `CoreTaskRecord` directly into `cats-runtime`.
7. The runtime bridge request from `cats` to `cats-runtime` shall support at
   least:
   - `requestedStrategy?: string`
   - `acceptanceCriteria?: string`
   - `strategyContext?: Record<string, unknown>`
   - `correlation?: { taskId?: string; conversationId?: string; workItemId?: string; product?: 'chat' | 'work' | 'code' }`
8. `assignedActorIds`, `approval`, `parentTaskId`, and task status transitions
   shall remain product-owned Core concerns as already defined by
   [SPEC-032](./SPEC-032-core-task-lifecycle-and-wakeup-integration.md).
9. `dependsOnTaskIds` shall be interpreted by product orchestration logic and
   shall not require runtime awareness of the task graph.
10. Product UIs may surface transfer/product hints, but the handoff source of
    truth remains the shared task record.

### Non-Functional Requirements

- **Boundary integrity**: `cats-runtime` must not import `CoreTaskRecord`
- **Compatibility**: first slice uses metadata conventions, not a breaking core
  schema change
- **Interoperability**: Chat, Work, and Code must all read/write the same
  planning block
- **Incrementality**: the bridge must support rollout before full Work/Code UI
  completion

## Design Overview

```text
Cats product layer
  CoreTaskRecord
    metadata.planning
      strategyHint / acceptanceCriteria / dependsOnTaskIds / productHint
           |
           v
  product execution bridge
    resolve product default if needed
    build runtime-neutral execution request
           |
           v
cats-runtime
  session-local strategy registry
  execute with effective strategy
  stream progress + observe snapshot
```

### First-Slice Translation Rules

- If `metadata.planning.strategyHint` exists, send it as `requestedStrategy`.
- If it does not exist, resolve the current product's default and send that
  explicit default to runtime.
- Pass `acceptanceCriteria` and `strategyContext` through untouched.
- Pass `taskId`, `conversationId`, and `product` as opaque correlation
  metadata.
- Do not pass `assignedActorIds`, approvals, or dependency graphs to runtime as
  strategy-selection inputs.

### Cross-Product Example

- Work creates task `Implement OAuth2`
- Work writes:
  - `metadata.planning.productHint = 'code'`
  - `metadata.planning.strategyHint = 'tree_of_thoughts'`
  - `metadata.planning.acceptanceCriteria = 'Tests pass and spec is satisfied'`
- Code reads the same task record
- Code resolves runtime session target and sends:
  - `requestedStrategy = 'tree_of_thoughts'`
  - `acceptanceCriteria = ...`
  - `correlation.taskId = ...`
- Runtime executes without needing to understand Work or Code task models

## Dependencies

- [ADR-001](../decisions/001-use-cats-runtime-boundary.md)
- [ADR-014](../decisions/014-freeze-parallel-delivery-boundaries-for-provider-telegram-and-chat-workstreams.md)
- [ADR-032](../decisions/032-own-task-substrate-in-core-not-runtime.md)
- [ADR-039](../decisions/039-use-core-task-metadata-as-cross-product-plan-exchange.md)
- [SPEC-032](./SPEC-032-core-task-lifecycle-and-wakeup-integration.md)
- companion runtime spec:
  [SPEC-020](../../../cats-runtime/docs/specs/SPEC-020-pluggable-execution-strategy-substrate.md)

## Open Questions

- [ ] Should `productHint` remain only a hint, or become a stronger routing
      field once Work/Code task dashboards land?
- [ ] Do we want typed product-owned helper functions for `metadata.planning`
      in the same implementation slice?
- [ ] Should strategy defaults be configurable per Cat skill profile in product
      before dispatch, or only via task-level override for the first slice?

## References

- [Research: Unified Planning Language and Cross-Product Strategy](../research/2026-03-26-unified-planning-language-and-cross-product-strategy.md)
- [Research: Gemini Unified Planning Language Handoff Semantics](../research/2026-03-26-gemini-upl-handoff-semantics.md)
- [Research: OpenManus Reference Analysis](../research/2026-03-24-openmanus-reference-analysis.md)
- [Research: Cats Code Peer Review Workflow](../research/2026-03-24-cats-code-peer-review-workflow.md)

---

*Created: 2026-03-26*
*Author: Codex*
*Related Plan: TBD*

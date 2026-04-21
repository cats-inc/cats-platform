# PLAN-021: Cross-Product Task Strategy Handoff and Runtime Bridge

> Implementation plan for turning `CoreTaskRecord.metadata.planning` into the
> platform's normalized handoff surface and bridging that planning intent into
> `cats-runtime` without breaking the accepted runtime boundary.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Assigned To** | TBD |
| **Reviewer** | User |

## Related Spec / Decisions

- [SPEC-035: Cross-Product Task Strategy Handoff and Runtime Bridge](../specs/SPEC-035-cross-product-task-strategy-handoff-and-runtime-bridge.md)
- [ADR-039: Use Core task metadata as the cross-product plan exchange surface](../decisions/039-use-core-task-metadata-as-cross-product-plan-exchange.md)
- Supporting baseline:
  [ADR-032: Own task substrate in core, not runtime](../decisions/032-own-task-substrate-in-core-not-runtime.md)
- Supporting baseline:
  [SPEC-032: Core Task Lifecycle and Wakeup Integration](../specs/SPEC-032-core-task-lifecycle-and-wakeup-integration.md)
- Companion runtime work:
  [cats-runtime SPEC-020](../../../cats-runtime/docs/specs/SPEC-020-pluggable-execution-strategy-substrate.md)

## Overview

This plan extends the existing task substrate rather than creating a second
planning system. The implementation must keep three layers separate:

- `cats` Core owns task records, approvals, assignment, dependencies, and
  cross-product handoff
- product surfaces (Chat / Work / Code) own defaults, affordances, and routing
- `cats-runtime` owns only session-local execution strategy behavior

The first rollout should avoid reshaping the frozen shared contract in
`src/core/types.ts`. Instead, it should:

1. standardize `task.metadata.planning`
2. add typed product-owned helpers around that metadata block
3. bridge planning intent into runtime-neutral execution requests
4. thread the bridge through task checkout / wakeup / execution observation

## Scope

### In Scope

- typed helpers for `metadata.planning`
- task-to-runtime execution bridge fields
- product default strategy resolution for Chat / Work / Code
- task checkout / wakeup integration using strategy-aware bridge metadata
- additive task read-model support for transfer / strategy hints
- regression coverage for metadata helpers and bridge behavior

### Explicitly Deferred

- changing `CoreTaskRecord` top-level schema in the first slice
- moving task semantics into `cats-runtime`
- full Work / Code dashboard implementation
- complete UX for every transfer / strategy hint surface
- automatic cross-product switching or navigation policy

## Implementation Phases

### Phase 1: Planning Metadata Helpers and Normalization

- [ ] Add product-owned helper types and read/write utilities for
      `task.metadata.planning`
- [ ] Normalize the first-slice planning block keys:
      `strategyHint`, `acceptanceCriteria`, `strategyContext`,
      `dependsOnTaskIds`, `productHint`, `transfer`
- [ ] Add guard helpers so malformed planning metadata does not break Core
      task reads
- [ ] Keep metadata namespaced under `planning` rather than adding new top-level
      `CoreTaskRecord` fields
- [ ] Add fixtures / snapshot coverage for normalized planning metadata

**Deliverables**: one canonical product-owned helper layer for reading and
writing `metadata.planning` safely.

### Phase 2: Runtime Bridge Contract from Tasks to Session Execution

- [ ] Add or extend product-owned execution bridge request types so `cats`
      can send:
      `requestedStrategy`, `acceptanceCriteria`, `strategyContext`,
      and `correlation`
- [ ] Extend the runtime client seam in `cats` to carry those additive fields
      to `cats-runtime`
- [ ] Keep task ids, work item ids, and conversation ids opaque correlation
      metadata rather than runtime-owned task contracts
- [ ] Ensure no `CoreTaskRecord` shape leaks into runtime request payloads
- [ ] Add compatibility behavior when planning metadata is absent

**Deliverables**: a runtime-neutral bridge contract from task planning into
session execution requests.

### Phase 3: Strategy-Aware Checkout, Wakeup, and Execution Observation

- [ ] Integrate planning metadata resolution into task checkout/wakeup flow
- [ ] Ensure assigned task wakeups carry the effective requested strategy into
      the runtime bridge
- [x] Thread additive strategy metadata through execution watcher / observe
      reconciliation paths
- [ ] Preserve existing task lifecycle ownership in Core:
      checkout, `in_progress`, completion, blocked/cancelled handling
- [ ] Keep `dependsOnTaskIds` product-owned and do not require runtime changes
      for dependency graph logic

**Deliverables**: strategy-aware task execution that still follows the existing
Core-owned lifecycle and wakeup integration model.

### Phase 4: Product Defaults and Cross-Product Handoff Affinity

- [ ] Add product-owned default strategy resolution:
      Chat=`react`, Work=`pdca`, Code=`reflexion`
- [ ] Apply task-level `strategyHint` as the highest-precedence override
- [ ] Add support for `productHint` / `transfer.suggestedProduct` in task read
      models or product-side selectors where needed
- [ ] Keep product defaults and transfer hints in product code, not runtime
- [ ] Add fallback behavior when Work/Code surfaces are not fully active yet

**Deliverables**: one deterministic platform rule for resolving effective
execution strategy without making runtime infer product policy.

### Phase 5: Product Surfaces, APIs, and Diagnostics

- [ ] Expose planning metadata through the appropriate task/core API seams
- [ ] Add additive surface indicators for strategy and transfer hints where
      they materially help operator understanding
- [ ] Avoid inventing a second task or transfer resource; reuse the existing
      task substrate
- [ ] Document bridge behavior in product-facing API docs if the public task
      API shape changes additively

**Deliverables**: product surfaces can inspect and hand off tasks using the
same shared planning metadata without creating new schema families.

### Phase 6: Verification and Hardening

- [ ] Add unit tests for planning metadata helpers and normalization
- [ ] Add task lifecycle tests covering strategy-aware wakeup/checkout flow
- [ ] Add integration coverage for runtime bridge payload formation
- [ ] Add regression tests for absent/malformed planning metadata
- [ ] Verify unchanged behavior for tasks that carry no planning metadata

**Deliverables**: first-slice task strategy handoff works without breaking
existing task lifecycle behavior.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/core/model/*` | Modify | Add helper functions or normalization paths for `metadata.planning` |
| `src/core/taskLifecycle.ts` | Modify | Thread planning metadata into task checkout / wakeup flow |
| `src/core/taskLifecycleShared.ts` | Modify | Clone / merge planning metadata safely across lifecycle transitions |
| `src/core/api/taskRoutes.ts` | Modify | Surface additive planning metadata through task APIs where needed |
| `src/runtime/client.ts` | Modify | Carry additive strategy request fields to runtime |
| `src/platform/orchestration/*` | Modify | Reuse bridge semantics where orchestrator or workflow paths create task-backed execution |
| `src/products/chat/**` | Modify | Consume strategy defaults / transfer hints in the mature product surface first |
| `tests/**/*.test.*` | Modify/Create | Add metadata helper, lifecycle, and bridge regression coverage |
| `docs/api.md` | Modify (follow-on) | Document additive task / bridge fields if public APIs change |

## Technical Decisions

- Keep the plan-exchange surface inside `metadata.planning` for the first slice
  rather than changing top-level `CoreTaskRecord`.
- Use typed helper functions as the first hardening layer instead of direct
  ad hoc `metadata` reads throughout the codebase.
- Resolve product defaults inside `cats`, not in `cats-runtime`.
- Send runtime-neutral bridge fields instead of task-shaped payloads.
- Keep dependency semantics (`dependsOnTaskIds`) product-owned; runtime only
  sees execution hints and opaque correlation ids.

## Testing Strategy

- **Unit Tests**:
  planning metadata normalization, merge/clone behavior, default-strategy
  resolution, malformed metadata fallback
- **Integration Tests**:
  task assignment -> wakeup -> runtime bridge payload, checkout/reconcile flow,
  additive task API serialization
- **Manual Testing**:
  create tasks with and without `metadata.planning`, confirm Chat/Work/Code
  defaults resolve correctly, and verify runtime requests carry strategy hints
  without exposing task-internal schema

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Planning metadata grows into another untyped blob | High | Centralize all read/write logic in typed helpers and keep one namespaced block |
| Runtime boundary drifts and starts consuming task contracts directly | High | Restrict bridge payloads to runtime-neutral fields and audit imports around the runtime client seam |
| Product defaults become inconsistent across Chat / Work / Code | Medium | Implement one shared product-side resolution helper and test it directly |
| `dependsOnTaskIds` gets treated as runtime-owned orchestration state | Medium | Keep dependency logic entirely in Core lifecycle and exclude it from runtime request payloads |

## Progress Log

| Date | Update |
|------|--------|
| 2026-03-26 | Plan created to implement `metadata.planning` conventions and the task-to-runtime execution bridge |
| 2026-03-26 | Shared execution-request normalization/serialization now runs through one reusable bridge helper path for lifecycle metadata and runtime-client outbound payloads |
| 2026-03-26 | Task lifecycle watchers now reconcile initial observe snapshots early so additive strategy metadata lands before stream teardown and terminal observe payloads can short-circuit redundant stream attachment |
| 2026-03-27 | `GET /api/core/tasks/{taskId}` now projects normalized `planning` plus `runtimeBridge` derived views so later product/control-plane consumers can inspect cross-product handoff and runtime-bridge intent without reopening raw task metadata |
| 2026-03-27 | `GET /api/core/control-plane/tasks`, `GET /api/core/tasks/{taskId}/control-plane`, and `GET /api/core/operator-inbox` now lift the same normalized `planning` plus `runtimeBridge` views and support additive `executionProduct` / `requestedStrategy` queue filters plus summary counts |
| 2026-04-21 | Product runtime request adapters now wrap the shared task execution bridge for Chat, Work, and Code. Chat runtime checkout uses a fallback product so planning handoff metadata remains authoritative, Code runtime execution consumes its product-owned adapter, and Work has the same adapter seam ready for its first owned runtime entry. |

---

*Created: 2026-03-26*
*Author: Codex*

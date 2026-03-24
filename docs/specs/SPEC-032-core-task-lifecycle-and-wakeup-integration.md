# SPEC-032: Core Task Lifecycle and Wakeup Integration

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Claude |
| **Reviewer** | User |

## Summary

Connect the existing `CoreTaskRecord` lifecycle in the Cats Core layer to the
existing `RuntimeWakeupService` in cats-runtime, so that task assignment
automatically triggers a session wakeup, task execution is tracked through
atomic checkout, and task completion is recorded by observing the runtime
session through its live stream with observe-based reconciliation. This enables
Chat to use tasks behind the scenes and Work to display them on a dashboard —
from the same data source.

## Goals

- Wire task assignment to runtime wakeup without modifying cats-runtime
- Provide atomic checkout semantics to prevent double-work
- Track task completion via runtime session stream observation with snapshot
  reconciliation after disconnects or restarts
- Support fan-out sub-tasks for multi-Cat workflows (e.g., peer review)
- Enable budget pre-check before task dispatch

## Non-Goals

- Full scheduler / cron engine (deferred to Phase 3)
- Cats Work dashboard UI (separate future SPEC)
- cats-runtime code changes (existing wakeup API is sufficient)
- Database migration (initially builds on existing Core state persistence)

## Requirements

### Functional Requirements

1. When a task is assigned to a Cat (`assignedActorIds` updated), the product
   layer shall create a wakeup request via cats-runtime's `POST /wakeups` with:
   - `target.sessionId` = the assigned Cat's runtime session
   - `coalesceKey` = `task:{taskId}`
   - `metadata` = `{ taskId, assignedActorId }`
   - `scheduleAt` = now (immediate) or a specified future time

2. Task checkout shall be an atomic status transition from `approved` to
   `in_progress`. If the task is already `in_progress`, the checkout shall
   fail with a conflict error.

3. When a Cat's runtime session completes work on a task, the product layer
   shall observe execution through `GET /sessions/:id/stream` while the
   session is active and shall reconcile final session/run state through
   `GET /sessions/:id/observe` when the stream ends, is unavailable, or the
   product restarts. The reconciled outcome shall update the task status to
   `completed`, `failed`, `blocked`, or `cancelled` as appropriate.

4. The product layer shall support fan-out sub-tasks:
   - `CoreTaskRecord` shall gain an optional `parentTaskId` field
   - A parent task may have N child tasks via `parentTaskId`
   - Each child task triggers its own wakeup independently
   - The parent task converges when all child tasks reach a terminal status
   - `CoreWorkItemRecord.parentWorkItemId` remains a work/backlog hierarchy
     field and shall not be overloaded for execution fan-out tracking

5. Before dispatching a task, the product layer shall query runtime metering
   (`GET /metering`) to check whether the assigned Cat's budget allows
   execution. If budget is exceeded, the task shall be blocked with a clear
   reason.

6. Each task execution shall be recorded as a `CoreRunRecord` linked to the
   task, capturing: start time, end time, status, token usage summary.

### Non-Functional Requirements

- Task assignment to wakeup trigger latency shall be negligible (single HTTP
  call to runtime)
- Fan-out convergence check shall be a simple query on child task statuses
  keyed by `parentTaskId`, not a background polling loop
- All task state transitions shall be persisted immediately
- Steady-state completion tracking shall not rely on periodic polling; polling
  is only acceptable as a bootstrap/recovery fallback when stream observation
  is temporarily unavailable

## Design Overview

```
┌─ Cats Core (Product Layer) ──────────────────────────┐
│                                                       │
│  Boss Cat decides to assign task                      │
│    ↓                                                  │
│  upsertCoreTask({ assignedActorIds: [coderCatId] })  │
│    ↓                                                  │
│  [Assignment Hook]                                    │
│    → POST cats-runtime/wakeups                        │
│    { target: { sessionId }, coalesceKey: "task:xxx" } │
│                                                       │
│  [Execution Watcher]                                  │
│    → subscribe GET /sessions/:id/stream               │
│    → reconcile GET /sessions/:id/observe on close     │
│                                                       │
│  ← Runtime session completes                          │
│    ↓                                                  │
│  [Completion Callback]                                │
│    → upsertCoreTask({ status: 'completed' })          │
│    → record CoreRunRecord                             │
│    → check if parent task can converge                │
│                                                       │
└───────────────────────────────────────────────────────┘

┌─ cats-runtime (Execution Layer) ─────────────────────┐
│                                                       │
│  Wakeup timer fires → wake session                    │
│  Session runs with task context (via skill/hydration) │
│  Session completes → metering facts recorded          │
│                                                       │
│  *** No changes required ***                          │
│                                                       │
└───────────────────────────────────────────────────────┘
```

### Implementation Phases

**Phase 1 — Minimal Viable (assignment + checkout + callback)**

- Assignment hook: on `assignedActorIds` change → `POST /wakeups`
- Atomic checkout: `approved` → `in_progress` with conflict guard
- Completion tracking: product layer subscribes to `/stream` and reconciles via
  `/observe` when the session exits or observation is interrupted

**Phase 2 — Budget Gate + Run History**

- Pre-dispatch budget query via `GET /metering`
- `CoreRunRecord` creation on task execution start/end
- Activity log entries for task lifecycle events

**Phase 3 — Recurring Schedule**

- Optional `schedule` field on task (cron expression or intervalSec)
- Product-layer scheduler service creates wakeup requests periodically
- Still uses `POST /wakeups` — runtime does not need cron support

## Dependencies

- [ADR-032](../decisions/032-own-task-substrate-in-core-not-runtime.md) —
  architectural decision that task lifecycle belongs in Core
- `cats/src/core/types.ts` — `CoreTaskRecord`, `CoreWorkItemRecord`,
  `CoreRunRecord` (existing types)
- `cats/src/core/model.ts` — `upsertCoreTask()`, `upsertCoreWorkItem()`
  (existing functions)
- `cats-runtime` wakeup API — `POST /wakeups`, `GET /wakeups` (existing,
  no changes needed)
- `cats-runtime` session stream API — `GET /sessions/:id/stream` (existing)
- `cats-runtime` session observe API — `GET /sessions/:id/observe` (existing)
- `cats-runtime` metering API — `GET /metering` (existing)

## Resolved Direction

- Use `GET /sessions/:id/stream` as the primary live completion signal and
  `GET /sessions/:id/observe` as the recovery/reconciliation path. Do not build
  a product-owned polling loop as the steady-state design.
- Add `parentTaskId` to `CoreTaskRecord` for execution fan-out/converge. Do not
  overload `CoreWorkItemRecord.parentWorkItemId` for runtime execution graphs.
- Check fan-out convergence synchronously when each child task reaches a
  terminal state; a broader scan may exist only as repair tooling after missed
  events.

## References

- [Research: Task Substrate as Heartbeat Foundation](../research/2026-03-24-task-substrate-as-heartbeat-foundation.md)
- [Research: Cats Code Peer Review Workflow](../research/2026-03-24-cats-code-peer-review-workflow.md)
  (fan-out/converge use case)
- [Research: OpenManus Reference Analysis](../research/2026-03-24-openmanus-reference-analysis.md)
  (PlanningFlow step decomposition)
- `paperclip/server/src/services/heartbeat.ts` — reference implementation
  (3,466 lines, combined approach we deliberately avoid)

---

*Created: 2026-03-24*
*Author: Claude*

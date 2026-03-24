# ADR-032: Own Task Substrate and Work Lifecycle in Core, Not Runtime

> Task CRUD, assignment, approval gates, and status transitions belong in the
> Cats Core product layer. cats-runtime only receives wakeup requests via its
> existing HTTP API.

## Status

Proposed

## Context

cats-runtime has a wakeup substrate (`RuntimeWakeupService`, 622 lines) that
can schedule and trigger session wakeups. However, it has no concept of **why**
a session should wake up — no work item to checkout, track, or report against.

Paperclip solves this by combining task management and execution into a single
3,466-line `heartbeat.ts` service. This creates a god service that mixes
product policy (budget checks, approval gates, workspace resolution) with
execution concerns (process spawning, log streaming, session compaction).

Meanwhile, cats Core already defines `CoreTaskRecord` and `CoreWorkItemRecord`
types in `src/core/types.ts`, and `upsertCoreTask()` / `upsertCoreWorkItem()`
functions in `src/core/model.ts`. The types include status machines, approval
records, and assignee tracking — but no lifecycle hooks that connect task
assignment to runtime wakeup.

The question is: where should the task lifecycle (assignment → execution →
completion) live?

## Decision

**Task lifecycle belongs in the Cats Core product layer, not in cats-runtime.**

Specifically:

- **Core owns**: task CRUD, assignment, status transitions, approval gates,
  budget pre-checks, completion callbacks, fan-out sub-task tracking
- **Runtime owns**: session wakeup, session execution, metering facts,
  workspace isolation
- **Integration contract**: Core calls runtime's existing `POST /wakeups` when
  a task is assigned; runtime calls back (or Core polls session observe) when
  execution completes

This follows the established separation pattern:

- ADR-018: product owns skill intent, runtime owns skill hosting
- ADR-022: product owns delivery policy
- ADR-023: product owns budget policy and cost control

## Consequences

### Positive

- Runtime stays lightweight — no task graph, no approval logic, no budget policy
- Task data naturally serves both Chat (behind the scenes) and Work (dashboard)
  since it lives in the shared Core layer
- New task-related features (recurring schedules, fan-out/converge, priority
  queues) can be added in Core without touching runtime
- Testing is cleaner: Core tests task logic, runtime tests wakeup + session

### Negative

- Requires a well-defined callback or polling mechanism for Core to learn when
  a runtime session completes a task
- Two-hop communication (Core → runtime wakeup → runtime session → Core
  callback) adds latency compared to Paperclip's single-service model

### Neutral

- `CoreTaskRecord` and `CoreWorkItemRecord` types already exist and do not
  need redesign
- Runtime's wakeup HTTP API already exists and does not need changes

## Alternatives Considered

### Alternative 1: Task Management in cats-runtime (Paperclip Pattern)

- **Pros**: single service, lower latency, simpler deployment
- **Cons**: runtime becomes a god service mixing execution with business logic;
  task data is locked inside runtime and inaccessible to Work dashboard;
  violates ADR-018/022/023 separation principles
- **Why rejected**: creates the exact architectural problem Paperclip has —
  3,466 lines of mixed concerns that are hard to test and evolve independently

### Alternative 2: Task Management as Standalone Third Service

- **Pros**: clean separation, could be shared across multiple products
- **Cons**: adds operational complexity (three services instead of two);
  over-engineering for the current stage; task data still needs to integrate
  with Core's actor/conversation/approval models
- **Why rejected**: Core already has the types and models; extracting to a
  third service gains nothing and adds deployment burden

## References

- [Research: Task Substrate as Heartbeat Foundation](../research/2026-03-24-task-substrate-as-heartbeat-foundation.md)
- [Research: OpenManus Reference Analysis](../research/2026-03-24-openmanus-reference-analysis.md) (PlanningFlow)
- [ADR-018](./018-separate-product-skill-intent-from-runtime-skill-hosting.md)
- [ADR-022](./022-own-chat-delivery-policy-in-product.md)
- [ADR-023](./023-own-budget-policy-and-cost-control-in-product.md)
- [SPEC-032](../specs/SPEC-032-core-task-lifecycle-and-wakeup-integration.md) (implementation spec)
- `cats/src/core/types.ts` — `CoreTaskRecord`, `CoreWorkItemRecord`
- `cats/src/core/model.ts` — `upsertCoreTask()`, `upsertCoreWorkItem()`
- `cats-runtime/src/core/wakeup/RuntimeWakeupService.ts`

---

*Drafted: 2026-03-24*
*Drafted by: Claude*

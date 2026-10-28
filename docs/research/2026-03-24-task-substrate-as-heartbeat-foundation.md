# Task Substrate as Heartbeat Foundation

## Metadata

- **Date**: 2026-03-24
- **Author**: Claude
- **Status**: Draft — pending review
- **Scope**: `cats` Core-layer task substrate + `cats-runtime` wakeup integration
- **Related**:
  - `cats-platform/src/core/types.ts` — `CoreTaskRecord`, `CoreWorkItemRecord`
  - `cats-platform/src/core/model.ts` — `upsertCoreTask`, `upsertCoreWorkItem`
  - `cats-runtime/src/core/wakeup/RuntimeWakeupService.ts`
  - `cats-runtime/docs/specs/SPEC-012-scheduled-wakeup-substrate.md`
  - `paperclip/server/src/services/heartbeat.ts` (3,466-line reference implementation)

---

## Problem

cats-runtime already has a wakeup substrate (`RuntimeWakeupService`, 622 lines) that can wake
a session on a schedule. But it **does not know what to do when it wakes** — there is no work
item to check out, track or report on.

Paperclip's heartbeat (3,466 lines) works because its wakeup is tightly coupled to its issue
system:

```
cron fires → heartbeat wakes → check DB for assigned issues
→ atomic checkout → work inside the issue workspace
→ write result back to issue → update agent state → record cost
```

What we lack is not a timer (we have one), but the **work item lifecycle** behind the timer.

---

## Proposal

Build a **task substrate** in the Cats Core layer as the work-tracking mechanism shared by
Chat and Work, and connect the cats-runtime wakeup to it as an automatic trigger source.

### Core claim

> The task substrate is the responsibility of the **product layer (cats Core)**, not the runtime layer.

Reasons:

- **The runtime owns execution facts**: session lifecycle, provider calls, token metering,
  workspace isolation, skill resolution
- **The product owns business intent**: "what work needs doing", "who is responsible",
  "is approval needed", "is the budget exceeded"
- Task CRUD, status transitions, assignment and approval are business decisions, not execution details
- This matches the existing division of responsibility:
  - ADR-018: Separate Product Skill Intent from Runtime Skill Hosting
  - ADR-022: Own Chat Delivery Policy in Product
  - ADR-023: Own Budget Policy and Cost Control in Product

The only thing the runtime needs to know is "a session should be woken" — the wakeup
substrate already provides that. The product layer decides **when and why** to create a wakeup request.

---

## Inventory of Existing Assets

### Already present (cats Core types + model)

`cats-platform/src/core/types.ts` already defines:

- **`CoreTaskRecord`**
  - id, title, status, conversationId, ownerActorId, orchestratorActorId,
    assignedActorIds, summary, approval (nested), metadata
  - Status state machine: `draft → pending_approval → approved → in_progress →
    blocked / completed / cancelled / archived`

- **`CoreWorkItemRecord`**
  - id, title, status, projectId, conversationId, taskId, parentWorkItemId,
    ownerActorId, assignedActorIds, summary, metadata
  - Status state machine: `draft → planned → ready → in_progress →
    blocked / completed / cancelled / archived`

- **`CoreApprovalRecord`** — embedded in the task
  - status, requestedAt, decidedAt, decidedByActorId, decisionAction, notes

- **`CoreApprovalQueueItem`** — used by the UI to present the pending-approval list

`cats-platform/src/core/model.ts` already implements:

- `upsertCoreTask()` — task create/update (including merging of approval fields)
- `upsertCoreWorkItem()` — work item create/update

### Already present (cats-runtime wakeup)

`cats-runtime/src/core/wakeup/RuntimeWakeupService.ts` already implements:

- create / list / cancel / trigger wakeup requests
- JSON file persistence (restart-safe)
- bounded timer loop (scans for due requests once per second)
- coalesce key de-duplication
- session wakeup state queries
- HTTP routes: `POST /wakeups`, `GET /wakeups`, `DELETE /wakeups/:id`,
  `POST /wakeups/:id/trigger`

### Not yet present (gaps)

- Wiring from task assignment to wakeup trigger
- Task checkout (atomic, so two Cats cannot work on the same task at once)
- Budget pre-check before task execution
- Callback on task completion / failure (the Cat writes back the task status when done)
- Recurring / cron schedule (today only the one-shot `scheduleAt`)
- Run history (per-task execution records)

---

## Two-Layer Collaboration Model

```
┌──────────────────────────────────────────────────┐
│  cats (Product / Core)                           │
│                                                  │
│  Owner says "build a landing page"               │
│    ↓                                             │
│  Boss Cat (Orchestrator) creates CoreTaskRecord  │
│    ↓                                             │
│  assign task → Coder Cat                         │
│    ↓                                             │
│  [Hook] assignment triggers →                    │
│    calls cats-runtime POST /wakeups              │
│    { target: { sessionId: coderCat.sessionId },  │
│      scheduleAt: now,                            │
│      coalesceKey: "task:{taskId}",               │
│      metadata: { taskId, assignedActorId } }     │
│                                                  │
├──────────────────────────────────────────────────┤
│  cats-runtime (Execution)                        │
│                                                  │
│  wakeup timer fires → wake session               │
│    ↓                                             │
│  session resumes with task context               │
│    (via existing skill/hydration mechanism)      │
│    ↓                                             │
│  Cat works → produces artifact                   │
│    ↓                                             │
│  session ends → runtime reports metering facts   │
│                                                  │
├──────────────────────────────────────────────────┤
│  cats (Product / Core) — callback                │
│                                                  │
│  receives runtime completion notice              │
│    ↓                                             │
│  updates CoreTaskRecord status → completed       │
│    ↓                                             │
│  Boss Cat replies to owner in chat / Telegram    │
│    ↓                                             │
│  same task shown in Work dashboard (future)      │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Key boundaries

- **cats decides**: which task to create, who to assign it to, when to trigger a wakeup,
  whether approval gates it, whether the budget is exceeded
- **cats-runtime decides**: how to wake the session, which provider the session uses, how
  the workspace is isolated, how many tokens were spent
- **Contract between the two**: the wakeup HTTP API (exists) + the session observe/history API (exists)

---

## Work to Add

### Phase 1: Task → Wakeup wiring (minimum viable)

- **Placement in cats**:
  - Add a wakeup trigger hook to the task assign logic
  - Define task checkout semantics (status `approved` → `in_progress` is an atomic transition)
  - Task completion callback route (cats updates the task status when the runtime session ends)

- **Placement in cats-runtime**:
  - **No change needed.** The existing wakeup HTTP API is sufficient.
    The product layer just calls `POST /wakeups`.

### Phase 2: Budget Gate + Run History

- **Placement in cats**:
  - Before dispatching a task, query runtime metering (`GET /metering` already exists);
    block the task assignment if over budget
  - Record one `CoreRunRecord` per task execution (type definition already exists)
  - The activity log records task lifecycle events

### Phase 3: Recurring Schedule

- **Placement in cats**:
  - Add a `schedule` field to the task (cron expression or intervalSec)
  - A product-layer scheduler service periodically creates wakeup requests for recurring tasks
  - Still talks to the runtime through `POST /wakeups` — the runtime does not need to know about cron

### Phase 4: Work Dashboard Consumption

- **Placement in cats (Work product surface)**:
  - Read Core task / workItem / activity data directly
  - Present the dashboard, inbox and timeline
  - No extra data source needed

---

## Why Not Put It in cats-runtime

If task management lived in the runtime:

- The runtime would need to know "who is the Boss Cat" and "who may assign" — that is product logic
- The runtime would need to do the approval gate — but ADR-022/023 explicitly say policy lives in the product layer
- The runtime would need to track task state across sessions — but runtime sessions are
  independent and should not carry the product layer's task graph
- The runtime's wakeup substrate spec (SPEC-012) explicitly says it is **not** a scheduler,
  not a heartbeat system, and not a product workflow engine
- The result is a runtime that bloats into Paperclip's heartbeat.ts (3,466 lines mixing
  execution + policy + workspace + budget + session + logging)

Benefits of keeping them separate:

- The runtime stays lightweight and only does "wake + execute + report facts"
- The product layer can swap trigger strategies (manual / event / cron) without changing the runtime
- Task data naturally spans Chat and Work — placing it in the Core layer solves both at once
- Easier testing: the product tests task logic, the runtime tests wakeup + session, each independently

---

## Impact on Each Team

- **Team 1 (Chat UI)**: The Chat interface needs to show task status (in progress / done),
  but the data comes from Core — it only needs to read, not manage it
- **Team 2 (Runtime Engine)**: **No change to the wakeup substrate.**
  The existing API is sufficient. Focus on the compaction engine and skill execution
- **Team 3 (Memory)**: No direct impact
- **Team 4 (Core + DB)**: **Primary owner.** Task CRUD already has a type + model;
  needs the assignment hook → wakeup trigger, checkout semantics and the completion callback
- **Team 5 (Orchestrator)**: The Boss Cat's dispatch logic changes to "create a Core task + assign"
  instead of operating runtime sessions directly
- **Team 6 (Work)**: Consumes Core task data directly, no need to build its own data source

---

## Differences from Paperclip

| Aspect | Paperclip | Cats (this proposal) |
|------|-----------|----------------|
| Task + execution engine | Combined in heartbeat.ts (3,466 lines) | Separated: Core task + Runtime wakeup |
| Task storage | PostgreSQL (heartbeatRuns + agentTaskSessions) | Core state (file-backed today, DB later) |
| Trigger mechanism | Built-in cron + event | Product-layer scheduler → runtime wakeup API |
| Budget check | Done inside heartbeat.ts | Product layer queries runtime metering before dispatch |
| Session management | Done inside heartbeat.ts | Runtime manages it itself (already exists) |
| Workspace | Resolved by heartbeat.ts | Runtime worktree isolation (already exists) |

**The core difference is an architectural choice**: Paperclip uses one 3,466-line god service
to do everything; we choose layering so each layer has its own role. This means each
component is smaller, easier to test and easier to replace, but the contracts between
layers must be defined explicitly.

---

## Conclusion

- The task substrate **belongs in the cats Core layer**
- The cats-runtime wakeup substrate **needs no change**; it already provides a sufficient trigger API
- The product layer owns task CRUD + the assignment → wakeup hook + the budget gate + the completion callback
- The same task data serves Chat (behind the scenes) and Work (on the surface)
- This approach follows the existing ADR division of responsibility and keeps the runtime from bloating into Paperclip's god service

---

*This document is for review discussion and is not yet a formal ADR or SPEC.
If the review passes, it is recommended to split it into one ADR (architectural decision) and one SPEC (implementation spec).*

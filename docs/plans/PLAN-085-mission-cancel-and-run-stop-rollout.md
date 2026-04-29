# PLAN-085: Mission Cancel and Run Stop Rollout

> Phased implementation plan for SPEC-096. The rollout creates canonical
> Mission cancel and Run stop commands, exposes public Work REST endpoints, and
> moves schedule/task cancellation onto the same boundary.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Assigned To** | Unassigned |
| **Reviewer** | User |
| **Related ADR** | [ADR-082](../decisions/082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md) |
| **Related Spec** | [SPEC-096](../specs/SPEC-096-mission-cancel-and-run-stop-contract.md) |

## Related Spec

[SPEC-096: Mission Cancel and Run Stop Contract](../specs/SPEC-096-mission-cancel-and-run-stop-contract.md)

## Overview

The implementation should land as an independent slice after the schedule-rule
rollout. The core design is one shared Run stop service and one Mission cancel
aggregate command:

```text
Run stop
  -> validate whether the run is stoppable
  -> request runtime cancellation when a supervised session exists
  -> atomically mark the run cancelled and append audit metadata

Mission cancel
  -> stop active mission runs through Run stop
  -> mark the mission cancelled only if every active run is stoppable
```

Do not start by adding buttons. The correct order is contract, service, REST,
then UI.

## Implementation Phases

### Phase 1: Contract Confirmation and Shared Types

- [ ] Review SPEC-096 and confirm the v1 choices:
      - running supervised runs must request runtime cancellation before Core
        terminal write
      - running non-supervised runs are `not_stoppable`
      - metadata is preserved and appended, not cleared
      - Mission cancel blocks if any active run cannot be stopped
- [ ] Add shared Work API response/request contracts for:
      - `WorkCancellationRequest`
      - `WorkRunStopResponse`
      - `WorkMissionCancelResponse`
- [ ] Add Work API path constants and route patterns for:
      - `/api/work/runs/:runId/stop`
      - `/api/work/missions/:missionId/cancel`
- [ ] Decide whether the task-scoped supervised-run cancel route can be removed
      in the same slice or must temporarily delegate during UI migration.

**Deliverables**: public request/response shapes and path constants exist, with
no UI behavior changed yet.

### Phase 2: Generic Run Stop and Mission Cancel Services

- [ ] Create a platform/domain cancellation service that can stop any
      `CoreRunRecord` without importing Work route or renderer modules.
- [ ] Implement Run stop classification:
      - terminal -> `already_terminal`
      - queued/blocked without runtime -> `stopped`
      - running with supervised session -> call `RuntimeClient.cancelSession`
        before Core cancellation write
      - running without supervised session -> `not_stoppable`
- [ ] Use the Core atomic update seam for final run writes and trace writes.
- [ ] Append cancellation metadata and preserve existing schedule/supervision
      metadata.
- [ ] Implement Mission cancel as an aggregate over active runs associated by
      `metadata.missionId`.
- [ ] Mark the Mission cancelled only when every active run is stopped or
      already terminal.
- [ ] Refactor scheduled replacement cancellation to call the generic Run stop
      service with `source: 'schedule_replace'`.
- [ ] Keep schedule-specific admission checks in scheduler code; do not let the
      generic Run stop service know schedule policy.

**Deliverables**: cancellation logic is reusable, truthful, and independent of
the old task-scoped route.

### Phase 3: REST Endpoints and Route Migration

- [ ] Add `POST /api/work/runs/:runId/stop`.
- [ ] Add `POST /api/work/missions/:missionId/cancel`.
- [ ] Return:
      - `200` for stopped/cancelled/already terminal
      - `404` for missing records
      - `409` for not-stoppable runs or blocked mission cancellation
- [ ] Migrate `/api/work/tasks/:taskId/supervised-run/cancel`:
      - preferred: remove it after UI uses the canonical Run stop endpoint
      - temporary fallback: delegate to Run stop with
        `source: 'task_supervised_run_cancel'`
- [ ] Update `docs/api.md` only after endpoints are implemented.
- [ ] Ensure route handlers never call `runtimeClient.cancelSession` directly;
      they should call the cancellation service.

**Deliverables**: external callers have canonical Mission and Run endpoints.

### Phase 4: Cats Work UI

- [ ] Add a Stop control to Run detail for active/stoppable runs.
- [ ] Add a Cancel control to Mission detail for non-terminal missions.
- [ ] Render blocked/not-stoppable results clearly:
      - running without supervised bridge
      - runtime client unavailable
      - runtime cancellation failed
- [ ] Remove any UI dependency on the task-scoped supervised-run cancel route.
- [ ] If Task detail still needs a control, make it resolve the active run and
      call Run stop rather than cancelling "the task" by route shape.
- [ ] Keep copy generic. Do not introduce product-specific schedule examples or
      shortcuts in the Work cancellation UI.

**Deliverables**: Mission and Run drill-downs expose truthful controls without
making Task the only cancellation entrypoint.

### Phase 5: Tests, Documentation, and Cleanup

- [ ] Add unit tests for Run stop classification and metadata preservation.
- [ ] Add integration tests for the two REST endpoints.
- [ ] Add regression coverage proving scheduled `replace` uses the same Run
      stop boundary.
- [ ] Add route/static coverage proving Work UI calls canonical endpoints.
- [ ] Add tests for Mission cancel blocked by a non-supervised running run.
- [ ] Add tests for runtime cancellation failure not marking the run cancelled.
- [ ] Remove the old task-scoped cancel route if no remaining caller needs it.
- [ ] Run targeted validation:
      - cancellation service tests
      - Work route tests
      - scheduler replacement regression tests
      - TypeScript typecheck

**Deliverables**: cancellation behavior is tested and stale narrow entrypoints
are removed or explicitly delegated only for the migration window.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `docs/specs/SPEC-096-mission-cancel-and-run-stop-contract.md` | Create | Public cancellation contract |
| `docs/plans/PLAN-085-mission-cancel-and-run-stop-rollout.md` | Create | Implementation rollout |
| `src/platform/supervision/runCancellation.ts` | Create | Generic Run stop and Mission cancel service |
| `src/platform/supervision/scheduledRunExecution.ts` | Modify | Delegate schedule replacement cancellation to generic Run stop |
| `src/products/work/shared/apiPaths.ts` | Modify | Add canonical Run stop and Mission cancel route constants |
| `src/products/work/api/index.ts` | Modify | Add REST route handlers and migrate task-scoped cancel |
| `src/products/work/renderer/components/runs/RunDetailPage.tsx` | Modify | Add Run Stop control |
| `src/products/work/renderer/components/missions/*` | Modify | Add Mission Cancel control |
| `src/products/work/renderer/components/tasks/*` | Modify | Remove task-scoped cancel dependency if present |
| `tests/work-run-cancellation.test.tsx` | Create | Run stop endpoint/service coverage |
| `tests/work-mission-cancellation.test.tsx` | Create | Mission cancel endpoint/service coverage |
| `tests/scheduler.test.tsx` | Modify | Scheduled replace regression coverage |

## Technical Decisions

- Run stop is the canonical primitive; Mission cancel composes it.
- Runtime-backed running runs require a successful runtime cancellation request
  before Core is marked `cancelled`.
- Running runs without a supervised runtime bridge are not stoppable through the
  public API in v1.
- Cancellation metadata is append-only audit data. Existing metadata is not
  cleared.
- No new Core status is added in v1. The system uses the existing terminal
  `cancelled` state after the runtime cancel request is accepted.
- Task-scoped supervised-run cancel is not a long-term public endpoint. It
  should be removed once the canonical Run stop endpoint is in use.

## Testing Strategy

- **Unit Tests**: Run stop classification, Mission cancel aggregate behavior,
  metadata merge behavior, runtime abort failure behavior.
- **Integration Tests**: REST status mapping, response bodies, idempotent
  repeated calls, not-found and conflict cases.
- **Regression Tests**: Scheduler `replace` cancellation delegates to generic
  Run stop and does not mark Core cancelled if runtime cancellation fails.
- **Renderer Tests**: Run/Mission controls call canonical endpoints and render
  blocked/not-stoppable states.
- **Manual Testing**: Use existing persisted data only; do not create demo
  Mission/Run records in the user's dev state.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| API marks a running non-supervised run cancelled while runtime continues | High | Classify as `not_stoppable` unless a supervised runtime bridge exists |
| Runtime cancel succeeds but Core write conflicts | High | Use atomic update seam and make retry idempotent |
| Metadata merge erases schedule or supervision diagnostics | Medium | Add metadata preservation tests |
| Mission cancel hides per-run blockers | Medium | Response must include blockers and per-run results |
| Old task route remains as a second public contract | Medium | Remove it after UI migration under pre-release policy |
| UI presents cancellation as rollback | Medium | Use Stop/Cancel copy tied to "runtime cancellation requested"; preserve audit |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-29 | Plan created with contract-first rollout order: shared Run stop, Mission cancel aggregate, REST endpoints, then UI. |

---

*Created: 2026-04-29*
*Author: Codex*

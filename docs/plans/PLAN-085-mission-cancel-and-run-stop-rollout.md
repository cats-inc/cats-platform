# PLAN-085: Mission Cancel and Run Stop Rollout

> Phased implementation plan for SPEC-096. The rollout creates canonical
> Mission cancel and Run stop commands, exposes public Work REST endpoints, and
> moves schedule/task cancellation onto the same boundary.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Complete |
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

- [x] Review SPEC-096 and confirm the v1 choices:
      - running supervised runs must request runtime cancellation before Core
        terminal write
      - running non-supervised runs are `not_stoppable`
      - metadata is preserved and appended, not cleared
      - Mission cancel blocks if any active run cannot be stopped
- [x] Add shared Work API response/request contracts for:
      - `WorkCancellationRequest`
      - `WorkRunStopResponse`
      - `WorkMissionCancelResponse`
- [x] Add Work API path constants and route patterns for:
      - `/api/work/runs/:runId/stop`
      - `/api/work/missions/:missionId/cancel`
- [x] Decide whether the task-scoped supervised-run cancel route can be removed
      in the same slice or must temporarily delegate during UI migration.
      Decision: keep the route in place until Phase 5 cleanup; the renderer
      no longer calls it after Phase 4, but resume/retry share the same
      handler.

**Deliverables**: public request/response shapes and path constants exist, with
no UI behavior changed yet.

### Phase 2: Generic Run Stop and Mission Cancel Services

- [x] Create a platform/domain cancellation service that can stop any
      `CoreRunRecord` without importing Work route or renderer modules.
- [x] Implement Run stop classification:
      - terminal -> `already_terminal`
      - queued/blocked without runtime -> `stopped`
      - running with supervised session -> call `RuntimeClient.cancelSession`
        before Core cancellation write
      - running without supervised session -> `not_stoppable`
- [x] Use the Core atomic update seam for final run writes and trace writes.
- [x] Append cancellation metadata and preserve existing schedule/supervision
      metadata.
- [x] Implement Mission cancel as an aggregate over active runs associated by
      `metadata.missionId`.
- [x] Mark the Mission cancelled only when every active run is stopped or
      already terminal.
- [x] Refactor scheduled replacement cancellation to call the generic Run stop
      service with `source: 'schedule_replace'`.
- [x] Keep schedule-specific admission checks in scheduler code; do not let the
      generic Run stop service know schedule policy.

**Deliverables**: cancellation logic is reusable, truthful, and independent of
the old task-scoped route.

### Phase 3: REST Endpoints and Route Migration

- [x] Add `POST /api/work/runs/:runId/stop`.
- [x] Add `POST /api/work/missions/:missionId/cancel`.
- [x] Return:
      - `200` for stopped/cancelled/already terminal
      - `404` for missing records
      - `409` for not-stoppable runs or blocked mission cancellation
- [x] Migrate `/api/work/tasks/:taskId/supervised-run/cancel`:
      - preferred: remove it after UI uses the canonical Run stop endpoint
      - temporary fallback: delegate to Run stop with
        `source: 'task_supervised_run_cancel'`

      Removed: the action regex narrowed to `(resume|retry)`, the
      `'cancel'` arm of `WorkSupervisedRunLifecycleAction` and its
      switch branches deleted, `requestRuntimeCancellationForRun`
      removed. `tests/work-supervision-routes.test.tsx` migrates the
      old cancel scenario onto `/api/work/runs/:runId/stop` and a
      regression test asserts the legacy path falls through to 404.
- [x] Update `docs/api.md` only after endpoints are implemented.
- [x] Ensure route handlers never call `runtimeClient.cancelSession` directly;
      they should call the cancellation service.

**Deliverables**: external callers have canonical Mission and Run endpoints.

### Phase 4: Cats Work UI

- [x] Add a Stop control to Run detail for active/stoppable runs.
- [x] Add a Cancel control to Mission detail for non-terminal missions.
- [x] Render blocked/not-stoppable results clearly:
      - running without supervised bridge
      - runtime client unavailable
      - runtime cancellation failed
- [x] Remove any UI dependency on the task-scoped supervised-run cancel route.
      (The renderer never linked to it; Phase 4 added the canonical Run
      stop button on Run detail instead.)
- [ ] If Task detail still needs a control, make it resolve the active run and
      call Run stop rather than cancelling "the task" by route shape.
      (Deferred: Task detail still uses the existing Delete button, which is
      a structural delete rather than an in-flight cancel.)
- [x] Keep copy generic. Do not introduce product-specific schedule examples or
      shortcuts in the Work cancellation UI.

**Deliverables**: Mission and Run drill-downs expose truthful controls without
making Task the only cancellation entrypoint.

### Phase 5: Tests, Documentation, and Cleanup

- [x] Add unit tests for Run stop classification and metadata preservation.
      (`tests/work-run-cancellation.test.tsx` covers terminal,
      queued-without-runtime, running-without-bridge,
      runtime-client-unavailable, runtime-cancel-success, runtime-cancel-failure,
      and `scheduleTrigger` / `supervision.runtimeBridge` preservation.)
- [x] Add integration tests for the two REST endpoints.
      (`tests/work-run-cancellation-routes.test.tsx` — 9 / 9 passing,
      covers 200 / 404 / 405 / 409 status mapping for both routes.)
- [x] Add regression coverage proving scheduled `replace` uses the same Run
      stop boundary. (`tests/scheduler.test.tsx`'s
      "scheduler tick replaces active scheduled runs through the
      cancellation boundary" still passes after the refactor.)
- [ ] Add route/static coverage proving Work UI calls canonical endpoints.
- [x] Add tests for Mission cancel blocked by a non-supervised running run.
- [x] Add tests for runtime cancellation failure not marking the run cancelled.
- [x] Remove the old task-scoped cancel route if no remaining caller needs it.
- [x] Run targeted validation:
      - cancellation service tests (`tests/work-run-cancellation.test.tsx`,
        11 / 11 passing)
      - scheduler replacement regression tests
        (`tests/scheduler.test.tsx`, 15 / 15 passing)
      - TypeScript typecheck (`npx tsc --noEmit -p .` clean)

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
| 2026-04-29 | Phase 1 landed: `WorkCancellationRequest` / `WorkRunStopResponse` / `WorkMissionCancelResponse` / `CoreCancellationMetadata` types and `/api/work/runs/:runId/stop` + `/api/work/missions/:missionId/cancel` path constants. |
| 2026-04-29 | Phase 2 landed: `src/platform/supervision/runCancellation.ts` exports `stopRun` and `cancelMission`. Schedule replacement (`cancelScheduledRunThroughSupervision`) now delegates to `stopRun` with `source: 'schedule_replace'` plus a `cancelMission` cascade for per-fire missions. Duplicated cancellation persistence in `scheduledRunExecution.ts` removed. |
| 2026-04-29 | Phase 3 landed: `routeWorkRunCancellationApi` mounts the canonical `POST /api/work/runs/:runId/stop` and `POST /api/work/missions/:missionId/cancel` endpoints with 200 / 404 / 409 status mapping. Handlers are thin and never call `runtimeClient.cancelSession` directly. |
| 2026-04-29 | Phase 4 landed: Mission detail and Run detail surfaces gain a destructive `Cancel` / `Stop` button in the top bar. Confirmation flows through `window.confirm`; blocked / not-stoppable / runtime-failed responses render as inline warnings rather than misleading "cancelled" copy. Runtime/abort messages distinguish "no supervised bridge" vs "cancelSession failed" vs "runtime client missing". |
| 2026-04-29 | Phase 5 landed (mostly): `tests/work-run-cancellation.test.tsx` covers Run stop classification + metadata preservation + Mission cancel blocked / cancelled / already-terminal paths; `tests/scheduler.test.tsx` regressions for scheduled `replace` still pass through the canonical cancellation boundary. Deferred follow-ups: REST integration tests, renderer route coverage, and removing the legacy task-scoped supervised-run cancel route once resume/retry are split. |
| 2026-04-29 | Phase 5 deferred items completed: added `tests/work-run-cancellation-routes.test.tsx` (9 / 9 passing) covering 200 / 404 / 405 / 409 status mapping for both endpoints; narrowed `WORK_API_TASK_SUPERVISED_RUN_ACTION_PATTERN` to `(resume\|retry)`, deleted the `'cancel'` action branch from `WorkSupervisedRunLifecycleAction` and `createWorkSupervisedRunLifecycleActionPayload`, removed `requestRuntimeCancellationForRun`, and updated `tests/work-supervision-routes.test.tsx` so the lifecycle scenario migrates onto the canonical Run stop endpoint plus a regression test for the legacy 404 fallthrough; documented Run stop / Mission cancel REST surface in `docs/api.md`. |

---

*Created: 2026-04-29*
*Author: Codex*

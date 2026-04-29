# SPEC-096: Mission Cancel and Run Stop Contract

> Define the public cancellation contract for Mission and Run records before
> adding REST endpoints or Work UI controls.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |
| **Related ADR** | [ADR-082](../decisions/082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md) |
| **Related Specs** | [SPEC-082](./SPEC-082-cats-work-agent-supervision-and-tool-boundary.md), [SPEC-094](./SPEC-094-schedule-rules-and-mission-triggers.md) |
| **Related Plan** | [PLAN-085](../plans/PLAN-085-mission-cancel-and-run-stop-rollout.md) |

## Summary

Cats currently has cancellation behavior, but not a coherent public contract for
stopping operational work. Task-scoped supervised-run cancellation only covers a
task that already has an active supervised run. Scheduled replacement uses an
internal helper. Direct Core-written runs can be marked terminal, but a running
non-supervised runtime has no honest abort path. This spec defines two public
commands:

- `Run stop`: stop one execution attempt.
- `Mission cancel`: cancel one mission and stop every active run that can
  truthfully be stopped.

The v1 rule is conservative: if a running run has a supervised runtime session,
Cats must request runtime cancellation before marking the run cancelled. If a
running run has no supervision/runtime bridge, Cats must return a not-stoppable
result instead of writing cancellation metadata that implies execution was
aborted.

## Goals

- Provide canonical public commands for stopping runs and cancelling missions.
- Ensure cancellation never lies about runtime abort status.
- Preserve cancellation audit metadata instead of deleting or overwriting
  schedule, supervision, runtime, or trigger metadata.
- Make scheduled `replace`, task supervised-run cancel, and future UI controls
  delegate to the same run-stop boundary.
- Keep the contract compatible with the current Core status enums without
  adding a hidden `cancelling` state in v1.
- Let Work render accurate controls on Mission, Run, and Task drill-down
  surfaces.

## Non-Goals

- Rolling back already-applied tool, transport, file, or external mutations.
- Cancelling arbitrary Chat room turns or parallel chat groups; Chat has its
  own transcript/session cancellation contract.
- Force-killing a runtime process when `cats-runtime` can only provide
  cooperative cancellation.
- Adding cloud/offline cancellation semantics while the desktop app is closed.
- Introducing a new Core record family for cancellation commands.
- Automatically cancelling linked Work Items or Tasks when a Mission is
  cancelled. Linked planning records may surface the cancellation, but their
  state transitions remain separate policy.
- Supporting metadata-only force-cancel for running non-supervised runs in v1.

## Current Boundary Problems

1. Mission cancellation has a Core terminal state, but no public state machine
   that coordinates active run cancellation through supervision.
2. Non-supervised running runs can be written directly into Core, but there is
   no runtime session reference or cancellation bridge to abort their work.
3. `cancelScheduledRunThroughSupervision` is currently an internal scheduled
   replacement helper rather than a general public command.
4. `/api/work/tasks/:taskId/supervised-run/cancel` only applies when the task
   has a task-scoped supervised run. It does not cover mission-only work,
   scheduled runs, or runs that are not task materialized.
5. UI controls cannot reliably know whether "Cancel" means "state changed" or
   "runtime abort requested."

## Requirements

### Functional Requirements

#### Vocabulary

1. A **Run stop** command shall target exactly one `CoreRunRecord`.
2. A **Mission cancel** command shall target exactly one `MissionRecord`.
3. A Run stop shall not implicitly cancel the parent Mission unless the caller
   is executing a Mission cancel aggregate command.
4. A Mission cancel shall not automatically cancel linked Tasks or Work Items.
5. Both commands shall be idempotent for terminal records.

#### Run stop state model

6. Terminal runs (`completed`, `failed`, `cancelled`) shall return
   `already_terminal` and shall not rewrite runtime metadata.
7. `queued` and `blocked` runs with no active runtime bridge may be marked
   `cancelled` because no runtime abort is required.
8. `running` runs with a supervised runtime bridge and a runtime session id
   shall request runtime cancellation before persisting `cancelled`.
9. If runtime cancellation fails or the runtime client is unavailable for a run
   that requires runtime cancellation, the command shall fail with
   `not_stoppable` / conflict and shall not mark the run `cancelled`.
10. `running` runs without a supervised runtime bridge or runtime session id
    shall return `not_stoppable` in v1. Cats shall not write metadata-only
    cancellation that suggests the runtime stopped.
11. A successful Run stop shall set:
    - `CoreRunRecord.status = 'cancelled'`
    - `completedAt` to the command timestamp
    - supervision primary state to `cancelled` when supervision metadata is
      present or derivable
    - a cancellation trace row
12. A successful Run stop shall preserve existing metadata and append
    cancellation metadata. It shall not delete:
    - `scheduleTrigger`
    - `missionTemplate`
    - `supervision.providerAgentRunLoop`
    - `supervision.runtimeBridge`
    - existing evidence, trace, or trigger references

#### Mission cancel state model

13. Terminal missions (`completed`, `failed`, `cancelled`) shall return
    `already_terminal`.
14. A Mission cancel shall find active runs associated with the mission. The v1
    association is `CoreRunRecord.metadata.missionId === mission.id`.
15. The command shall attempt Run stop for each active associated run.
16. If every active run is stopped or already terminal, the Mission cancel shall
    mark the mission `cancelled`.
17. If any active run returns `not_stoppable`, the Mission cancel shall return a
    conflict result and shall not mark the mission `cancelled`.
18. A Mission cancel with no active associated runs may mark the mission
    `cancelled` immediately.
19. Mission cancellation metadata shall summarize the command and the per-run
    results without clearing the mission's existing metadata.

#### Runtime abort semantics

20. "Abort runtime" means Cats has successfully sent a runtime cancellation
    request through the runtime boundary for the session associated with the
    run. It does not imply external side effects are rolled back.
21. The runtime cancellation attempt shall happen before the Core terminal write
    for runs that require runtime cancellation.
22. If a supervised tool finishes after cancellation, evidence handling remains
    governed by SPEC-082 cancellation context rules.
23. Schedule replacement shall use the same Run stop contract. It may add
    `source: 'schedule_replace'` metadata, but it must not use a separate
    cancellation state model.
24. Task supervised-run cancellation shall delegate to Run stop or be removed
    once the Work renderer no longer depends on it. Because Cats is pre-release,
    this route is not a compatibility target.

#### Public API

25. Work shall expose a canonical Run stop endpoint:

    ```http
    POST /api/work/runs/:runId/stop
    ```

26. Work shall expose a canonical Mission cancel endpoint:

    ```http
    POST /api/work/missions/:missionId/cancel
    ```

27. Request bodies shall be optional and shall accept:

    ```ts
    interface WorkCancellationRequest {
      requestedByActorId?: string;
      reason?: string;
      idempotencyKey?: string;
    }
    ```

28. `requestedByActorId` shall default to the owner/operator actor until
    product auth provides a stronger caller identity.
29. The Run stop response shall include:

    ```ts
    interface WorkRunStopResponse {
      status: 'stopped' | 'already_terminal' | 'not_stoppable';
      run: CoreRunRecord;
      mission: MissionRecord | null;
      runtimeAbort: {
        attempted: boolean;
        sessionId: string | null;
        status: 'not_applicable' | 'requested' | 'failed';
        error?: string;
      };
      message: string | null;
    }
    ```

30. The Mission cancel response shall include:

    ```ts
    interface WorkMissionCancelResponse {
      status: 'cancelled' | 'already_terminal' | 'blocked';
      mission: MissionRecord;
      runResults: WorkRunStopResponse[];
      blockers: Array<{
        runId: string;
        reason: string;
      }>;
      message: string | null;
    }
    ```

31. HTTP status mapping shall be:
    - `200`: stopped, cancelled, or already terminal
    - `404`: mission or run not found
    - `409`: not stoppable or mission cancellation blocked
    - `500`: unexpected persistence/runtime failure after command validation

#### Metadata convention

32. A successful or blocked command shall append cancellation metadata under a
    stable convention:

    ```ts
    interface CoreCancellationMetadata {
      source:
        | 'run_stop'
        | 'mission_cancel'
        | 'schedule_replace'
        | 'task_supervised_run_cancel';
      commandId: string;
      requestedAt: string;
      requestedByActorId: string;
      reason: string | null;
      status: 'requested' | 'succeeded' | 'blocked';
      runtimeAbort: {
        attempted: boolean;
        sessionId: string | null;
        status: 'not_applicable' | 'requested' | 'failed';
        error?: string;
      };
    }
    ```

33. The metadata shall be additive. It shall not remove previous cancellation
    entries when retries or repeated requests happen.
34. If a run already has `metadata.supervision.runtimeBridge`, successful
    runtime-backed stop shall update that bridge to `status:
    'cancel_requested'` and preserve its existing session/provider/model
    fields.
35. Cancellation traces shall use structured metadata with the same `commandId`
    and `source` values so audit views can correlate command, run state, and
    runtime abort request.

### Non-Functional Requirements

- **Truthfulness**: The API must distinguish "cancelled in Core" from "runtime
  cancellation requested" and from "not stoppable."
- **Atomicity**: Core state changes must use the existing atomic update seam;
  no naked read-modify-write replacement shall be introduced.
- **Idempotency**: Repeating the same cancellation command shall be safe.
- **Auditability**: Existing metadata and evidence must remain available for
  inspection after cancellation.
- **Product layering**: Core/platform code shall not import Work renderer or
  route modules. Product routes shall call platform/domain services.

## Design Overview

```text
POST /api/work/runs/:runId/stop
  -> resolve run and runtime bridge
  -> if running + supervised session: runtimeClient.cancelSession(sessionId)
  -> atomic Core update: run.status = cancelled, append metadata, append trace
  -> response with runtimeAbort details

POST /api/work/missions/:missionId/cancel
  -> resolve mission
  -> resolve active runs where metadata.missionId matches
  -> stop each run through the same Run stop command
  -> if all stoppable: atomic Core update mission.status = cancelled
  -> else: return blocked with per-run blockers
```

The existing schedule-replacement helper should become a thin scheduled-source
caller of the same run-stop service. The task-scoped supervised-run cancel path
should stop being the canonical route.

## Dependencies

- Cats Core `MissionRecordStatus` and `CoreRunStatus` terminal values.
- SPEC-082 supervised run lifecycle and cancellation evidence semantics.
- SPEC-094 schedule replacement behavior.
- `cats-runtime` session cancellation API exposed through `RuntimeClient`.
- Work product API registration and renderer drill-down surfaces.

## Open Questions

- [ ] Should a later v2 add an explicit `cancelling` state, or is the current
      immediate terminal `cancelled` model sufficient once runtime cancel is
      requested?
- [ ] Should `requestedByActorId` become mandatory when product auth lands?
- [ ] Should force metadata-only cancellation exist as an admin recovery tool,
      or remain a direct state-repair operation outside the public API?

## References

- [SPEC-082: Cats Work Agent Supervision and Tool Boundary](./SPEC-082-cats-work-agent-supervision-and-tool-boundary.md)
- [SPEC-094: Schedule Rules and Mission Triggers](./SPEC-094-schedule-rules-and-mission-triggers.md)
- [PLAN-085: Mission Cancel and Run Stop Rollout](../plans/PLAN-085-mission-cancel-and-run-stop-rollout.md)
- [ADR-082: Recast Orchestrator as Capability Shell with Policy-Dial Supervision](../decisions/082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md)

---

*Created: 2026-04-29*
*Author: Codex*

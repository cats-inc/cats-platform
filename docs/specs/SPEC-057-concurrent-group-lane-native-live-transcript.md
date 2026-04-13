# SPEC-057: Concurrent Group Lane-Native Live Transcript

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |
| **Related ADR** | [ADR-058](../decisions/058-adopt-lane-native-concurrent-group-transcript-delivery.md) |

## Summary

Concurrent group chat should present one user turn as one fixed-order response
cluster, not as a chronological race where whoever starts a session or emits a
token first wins the next bubble slot.

This spec defines a lane-native model for concurrent group delivery:

- the user turn first shows one shared processing state
- once concurrent targets are resolved, all target lanes appear together in a
  fixed order
- lane text remains gated until the cluster is ready to reveal content as one
  coordinated compare surface
- each lane owns its own live segment timeline and grows in place
- session/reconnect events only update a lane; they do not create a new lane
- durable transcript preserves the same per-turn lane grouping

## Goals

- make concurrent group turns look concurrent, not sequential
- keep lane order stable and predictable for the whole turn
- hide backend startup skew even if sessions attach sequentially underneath
- let each audience grow content in place without ghost or duplicate bubbles
- separate dispatch-lane identity from runtime session identity
- preserve segment-native assistant behavior inside each concurrent lane
- keep live and durable transcript semantics aligned

## Non-Goals

- redesigning `Parallel chat`, which remains a separate private-thread feature
- solving direct-lane reconnect behavior in this spec
- final visual polish for cards, avatars, spacing, or animation style
- defining every backend runtime optimization for how jobs are started

## User Stories

- As a user, I want a concurrent group turn to immediately show which audiences
  are participating so I do not need to infer that from timing.
- As a user, I want each audience to keep a stable position while replying so I
  can compare outputs without the transcript reshuffling.
- As a maintainer, I want lane identity to be explicit so reconnect and
  `session_started` events stop creating ghost rows.

## Requirements

### Functional Requirements

1. A group-chat user turn dispatched with `workflowShape = concurrent` shall
   create one concurrent response cluster for that turn.
2. The response cluster shall materialize once the concurrent target set is
   known, even if runtime jobs are opened sequentially underneath.
3. Cluster lane order shall equal the dispatch-time audience order captured
   when the turn is sent.
4. A concurrent response lane shall have a stable lane identity that is not
   derived from `sessionId`.
5. The default lane identity shall be `targetStateId` or an equivalent
   dispatch-lane identifier that survives reconnect.
6. All lanes in the cluster shall become visible together as soon as the target
   set is known.
7. The cluster shall not release lane-local text or tool/status content to the
   transcript until every non-terminal lane is session-ready or terminally
   unavailable.
8. The cluster-ready barrier shall be satisfied by a lane receiving
   `session_started` or an equivalent valid session attachment for the active
   turn, and shall also open when a lane becomes terminally unavailable.
9. The cluster-ready barrier shall have bounded failure/timeout handling so one
   dead lane cannot block the entire cluster indefinitely.
10. A lane shall support at least these states:
   - `pending`
   - `connecting`
   - `streaming`
   - `sealed`
   - `failed`
   - `cancelled`
11. Before the cluster is materialized, the transcript shall show only the
   user-turn processing state.
12. After cluster materialization but before the ready barrier opens, the
    transcript may show only cluster/lane preparation states such as
    `pending` and `connecting`.
13. After cluster materialization, per-lane session start and reconnect events
   shall only transition lane state; they shall not create, delete, or reorder
   lanes.
14. Within each lane, assistant delivery shall remain segment-native as defined
    by ADR-057.
15. A lane that emits multiple text or tool/status segments shall keep them in
    that lane's local timeline instead of turning them into unrelated global
    assistant rows.
16. When the cluster-ready barrier opens, any already-buffered lane content
    shall flush into the existing lane in that lane's local order without
    creating a new lane or changing lane order.
17. A sealed lane shall remain visible in place while slower lanes continue
    streaming.
18. A lane reconnect shall preserve the same lane identity and visible slot.
19. The transcript shall not create a second lane for the same logical target
    merely because a new `sessionId` appears.
20. The transcript shall not reorder concurrent lanes by first token, first
    completion, or reconnect timing.
21. System/session notices may be shown, but they shall be secondary to lane
    ownership and shall not decide whether the lane exists.
22. The server-side stream path shall multiplex per-lane session and content
    updates instead of assuming one serial active speaker for the whole turn.
23. The durable transcript/read model shall preserve the concurrent response
    cluster as one user-turn-owned structure whose lane order matches the live
    cluster order.
24. When the transcript is reopened or refreshed, the product shall restore the
    same lane grouping and lane order from durable state.
25. Interrupting a turn shall preserve completed/sealed lanes and mark affected
    unfinished lanes as interrupted or cancelled instead of dropping them.
26. Trace/debug surfaces shall expose both lane identity and current `sessionId`
    so concurrent regressions can be diagnosed without inferring hidden state.

### Non-Functional Requirements

- **Predictability**: concurrent lanes must not jump positions during a turn
- **Correctness**: session lifecycle must be subordinate to lane identity
- **Comparability**: the concurrent UI should support side-by-side or stacked
  comparison without re-reading a time-interleaved transcript
- **Recoverability**: read-model rebuilds and reconnect must reconstruct the
  same cluster structure

## Design Overview

### Conceptual Model

```
user turn
  -> routing / audience resolution
  -> concurrent response cluster
       -> lane A (targetStateId A)
       -> lane B (targetStateId B)
       -> lane C (targetStateId C)
  -> each lane owns its own session lifecycle and segment timeline
```

### Presentation Flow

For a three-audience concurrent turn ordered as `CL -> CO -> GE`:

1. Show the user-turn processing state while routing prepares the fan-out.
2. When the target set is known, materialize three lanes in this fixed order:
   - `CL`
   - `CO`
   - `GE`
3. Each lane starts in `pending` or `connecting`.
4. The cluster holds text behind a ready barrier until every surviving lane has
   either attached a session or failed/cancelled.
5. When the ready barrier opens, buffered lane text may flush and new text may
   stream directly into each lane.
6. When a lane receives text or tool/status phases, those phases render inside
   that lane's local segment timeline.
7. When a lane completes, it seals in place while the other lanes continue.

### State Ownership

There are two separate state layers:

1. **Cluster state**
   - user turn id
   - routing/dispatch status
   - fixed lane order

2. **Lane state**
   - `targetStateId`
   - participant identity and display name
   - current `sessionId` and connection generation
   - local segment timeline
   - current terminal or non-terminal status

3. **Barrier state**
   - cluster-ready pending vs open
   - readiness evidence per lane
   - bounded timeout/failure release policy

### Identity Rules

- `targetStateId` owns the visible lane
- `sessionId` only owns the current runtime attachment inside that lane
- local segment ordinals order content inside one lane
- participant label alone is insufficient for matching

### Stream Delivery Implication

The server-side stream handler cannot keep a serial "one active speaker"
assumption for concurrent group turns.

It must instead:

- multiplex lane-scoped updates
- keep lane identity attached to every update
- hold early lane text behind the cluster-ready barrier
- release buffered content into the correct lane once the barrier opens

## Dependencies

- [ADR-057](../decisions/057-adopt-segment-native-assistant-transcript-delivery.md)
- current-turn recipient and dispatch-policy contracts from
  [SPEC-052](./SPEC-052-current-turn-recipients-dispatch-policy-and-parallel-chat-terminology.md)
- chat read-model, runtime dispatch, and live transcript renderer behavior

## Open Questions

- [ ] Whether the concurrent cluster should render as stacked transcript lanes,
      compact compare cards, or a responsive hybrid that changes with viewport
      width while preserving the same lane semantics.
- [ ] Whether connection/system messages should remain separate transcript rows
      in default mode or collapse into lane-local status chrome outside debug
      mode.
- [ ] What the bounded barrier timeout should be before the product releases
      ready lanes without a missing/failed lane attaching successfully.

## References

- [ADR-058](../decisions/058-adopt-lane-native-concurrent-group-transcript-delivery.md)
- [ADR-057](../decisions/057-adopt-segment-native-assistant-transcript-delivery.md)
- [SPEC-047](./SPEC-047-compare-chat-concurrent-groups-and-relay.md)
- [SPEC-052](./SPEC-052-current-turn-recipients-dispatch-policy-and-parallel-chat-terminology.md)
- [PLAN-048](../plans/PLAN-048-concurrent-group-lane-native-live-transcript.md)

---

*Created: 2026-04-14*
*Author: Codex*
*Related Plan: [PLAN-048](../plans/PLAN-048-concurrent-group-lane-native-live-transcript.md)*

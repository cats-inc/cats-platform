# PLAN-048: Concurrent Group Lane-Native Live Transcript

> Implement a fixed-order concurrent response cluster for group chat so every
> target owns one stable lane whose content grows in place regardless of
> session start or reconnect timing.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Spec

- [SPEC-057: Concurrent Group Lane-Native Live Transcript](../specs/SPEC-057-concurrent-group-lane-native-live-transcript.md)
- [ADR-058: Adopt Lane-Native Concurrent Group Transcript Delivery](../decisions/058-adopt-lane-native-concurrent-group-transcript-delivery.md)
- [ADR-057: Adopt Segment-Native Assistant Transcript Delivery](../decisions/057-adopt-segment-native-assistant-transcript-delivery.md)

## Overview

This plan turns concurrent group delivery into an explicit two-level model:

- a user-turn-owned concurrent response cluster
- one stable lane per concurrent target

The goal is to stop using session timing to decide transcript structure. The
cluster should appear once the fan-out target set is known. Each lane should
then progress independently from `pending` to `sealed`, with reconnect and
segment continuation staying inside that lane.

## Implementation Phases

### Phase 1: Define the Concurrent Lane Contract

- [ ] Task 1.1: Define the cluster data shape in shared chat contracts,
      including:
      - dispatch-time lane order
      - lane identity
      - participant display data
      - current session attachment
      - local segment timeline
- [ ] Task 1.2: Standardize lane identity on `targetStateId` or an equivalent
      dispatch-lane id rather than `sessionId`.
- [ ] Task 1.3: Define lane lifecycle states and transition rules for
      `pending`, `connecting`, `streaming`, `sealed`, `failed`, and
      `cancelled`.
- [ ] Task 1.4: Define how cluster state and lane state should serialize into
      app-shell/read-model payloads.

**Deliverables**: one shared concurrent-cluster contract that separates lane
identity from runtime-session identity

### Phase 2: Materialize Concurrent Targets Upstream

- [ ] Task 2.1: Ensure concurrent target sets are fully materialized once the
      routing decision is known, even if runtime jobs start sequentially.
- [ ] Task 2.2: Capture dispatch-time audience order and preserve it in
      read-model state.
- [ ] Task 2.3: Extend server stream payloads so lane identity, `sessionId`,
      and local segment updates can be projected onto the same lane.
- [ ] Task 2.4: Ensure reconnect updates target the existing lane rather than
      creating a new lane-generation row.

**Deliverables**: stable upstream lane materialization for concurrent group
turns

### Phase 3: Rebuild Live Rendering Around Cluster + Lane State

- [ ] Task 3.1: Teach the live-indicator projector to output one concurrent
      response cluster instead of one global chronological bubble list for
      concurrent group turns.
- [ ] Task 3.2: Reserve all concurrent lanes together once the cluster target
      set is known.
- [ ] Task 3.3: Keep lane order fixed to dispatch-time audience order even when
      runtime events arrive out of order.
- [ ] Task 3.4: Render per-lane state transitions in place:
      - `pending` / `connecting`
      - `streaming`
      - `sealed`
      - `failed` / `cancelled`
- [ ] Task 3.5: Keep segment-native same-speaker continuation inside the lane's
      local timeline instead of leaking back into global transcript order.
- [ ] Task 3.6: Make reconnect/session-start transitions mutate the existing
      lane instead of producing ghost or duplicate audience bubbles.

**Deliverables**: a live concurrent renderer that behaves like a stable compare
cluster rather than a timing-driven transcript race

### Phase 4: Preserve Cluster Semantics in Durable Transcript State

- [ ] Task 4.1: Persist or derive enough metadata to reconstruct concurrent
      cluster order after refresh, reload, or repair.
- [ ] Task 4.2: Ensure durable read-models keep completed concurrent responses
      grouped under the originating user turn.
- [ ] Task 4.3: Ensure sealed lanes remain visible in place while unfinished
      lanes continue during live updates and after read-model merges.
- [ ] Task 4.4: Align repair/recovery logic with the new cluster/lane model so
      a read repair cannot flatten or duplicate concurrent lanes.

**Deliverables**: durable concurrent transcript reconstruction with stable lane
order

### Phase 5: Verification

- [ ] Task 5.1: Add projector tests for:
      - all lanes materialized together
      - fixed dispatch-time order
      - sequential job startup under concurrent routing
- [ ] Task 5.2: Add live-render tests for:
      - one fast lane and two slow lanes
      - reconnect inside one lane
      - same-speaker multi-segment continuation inside one lane
      - no duplicate lanes when `sessionId` changes
- [ ] Task 5.3: Add server/read-model tests for:
      - preserved lane order after refresh
      - repair not flattening concurrent lanes
      - cluster surviving interruption and retry
- [ ] Task 5.4: Manual smoke-check:
      - three-target concurrent turn
      - one interrupted lane
      - one reconnecting lane
      - reordered audience chip at send time

**Deliverables**: regression coverage for the full concurrent cluster model

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/shared/liveIndicator.ts` | Modify | Add concurrent-cluster and lane-native live state |
| `src/products/shared/renderer/hooks/useLiveIndicator.ts` | Modify | Project concurrent turns into cluster + lane state |
| `src/products/shared/renderer/components/chat-view/ChatTranscriptSurface.tsx` | Modify | Render concurrent response clusters in fixed lane order |
| `src/products/chat/renderer/components/chat-view/LiveTranscriptIndicator.tsx` | Modify | Support per-lane waiting/streaming/sealed projection |
| `src/products/chat/renderer/components/ChatView.tsx` | Modify | Expose cluster/lane diagnostics in `[CV]` tracing |
| `src/products/chat/renderer/components/chat-view/chatViewSupport.ts` | Modify | Distinguish chronological transcript rows from concurrent lane clusters |
| `src/products/chat/api/resources/channelRuntimeRoutes.ts` | Modify | Stream lane identity plus session attachment updates |
| `src/products/chat/api/resources/channelStreamSupport.ts` | Modify | Preserve concurrent target materialization and dispatch-time lane order |
| `src/products/chat/state/runtime-dispatch/execution.ts` | Modify | Persist concurrent lane metadata from dispatch state |
| `src/products/chat/state/runtime-dispatch/results.ts` | Modify | Finalize per-lane results without flattening cluster state |
| `src/products/chat/state/runtime-dispatch/repair.ts` | Modify | Reconstruct clusters and lanes during repair/startup |
| `tests/live-indicator.test.tsx` | Modify | Add concurrent cluster projector coverage |
| `tests/chat-view-participants.test.tsx` | Modify | Cover fixed lane order and durable cluster rendering |
| `tests/chat-view-support.test.tsx` | Modify | Cover user-turn processing vs concurrent cluster transitions |
| `tests/server.test.js` | Modify | Cover concurrent fan-out materialization and reload behavior |

## Technical Decisions

- Decision 1: Concurrent group delivery needs a distinct cluster abstraction
  above the existing segment-native assistant lane model.
- Decision 2: Lane order is owned by dispatch-time audience order, not by
  runtime timing.
- Decision 3: `sessionId` is a lane-local attachment detail and must never be
  the primary UI identity for concurrent lanes.
- Decision 4: Repair and read-model paths must preserve cluster semantics, or
  the renderer will keep fighting server-side flattening.

## Testing Strategy

- **Unit Tests**: cluster projector, lane identity matching, local segment
  ordering, reconnect updates, and lane-order preservation
- **Integration Tests**: server stream handoff, read-model rebuild, repair, and
  transcript invalidation with concurrent clusters
- **Manual Testing**:
  - send a three-audience concurrent turn and confirm all lanes appear
    together in chip order
  - verify faster lanes seal in place while slower lanes continue
  - reconnect one lane and confirm no second bubble/lane appears
  - reload the room and confirm the same lane order persists

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| The current renderer assumes one global chronological assistant list | High | Introduce an explicit concurrent-cluster projection instead of layering more timing heuristics on the old list |
| Upstream contracts still expose only session timing, not stable lane identity | High | Materialize and transport `targetStateId`-based lane identity through server and read-model layers |
| Durable transcript reconstruction flattens clusters after refresh | High | Persist lane order metadata and cover repair/read-model rebuild in tests |
| Concurrent UX diverges from segment-native assistant rules | Medium | Reuse ADR-057 segment rules inside each lane and test lane-local continuation explicitly |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-14 | Plan created for lane-native concurrent group transcript delivery |

---

*Created: 2026-04-14*
*Author: Codex*

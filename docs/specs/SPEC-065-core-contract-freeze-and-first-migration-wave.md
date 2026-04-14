# SPEC-065: Core Contract Freeze and First Migration Wave

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |
| **Related ADR** | [ADR-059](../decisions/059-adopt-a-unified-conversation-turn-lane-engine.md) |

## Summary

The re-architecture now has enough product-shape docs.

The next step is not more concept design. It is to freeze the minimum shared
contracts that code is allowed to depend on while the first migration wave
lands.

This spec freezes:

- the minimum canonical identity set
- the minimum canonical record families
- the minimum cross-product read-model seams
- the first migration-wave scope

This is intentionally short. It exists to stop types, APIs, replay, and
renderer logic from drifting again while Chat, Work, Code, transport, and
runtime normalization are migrated.

## Goals

- freeze the shared IDs and record families that future code must target
- prevent lane/session/transport/mission identity from collapsing into each
  other again
- give the first migration wave a hard, bounded scope
- let Chat move first without blocking Work/Code on full schema completion

## Non-Goals

- defining every final database column
- fully designing every product UI surface
- replacing all existing compatibility fields in one change
- shipping the entire re-architecture in one wave

## Requirements

### Functional Requirements

1. The platform shall freeze this minimum canonical identity set:
   - `agentId`
   - `participantId`
   - `containerId`
   - `conversationId`
   - `turnId`
   - `laneId`
   - `sessionId`
   - `transportBindingId`
   - `managedWorkId`
   - `missionId`
   - `runId`
2. `laneId` shall be the durable target/lane identity used by transcript,
   replay, and read models.
3. `sessionId` shall be an execution attachment only and shall never be used as
   the durable bubble or lane identity.
4. `participantId` shall represent membership in one conversation context and
   shall remain distinct from `agentId`.
5. `transportBindingId` shall remain distinct from `conversationId` and
   `sessionId`.
6. The platform shall freeze these minimum canonical record families:
   - `AgentRecord`
   - `ParticipantRecord`
   - `ContainerRecord`
   - `ConversationRecord`
   - `TurnRecord`
   - `LaneRecord`
   - `SegmentRecord`
   - `SessionRecord`
   - `TransportBindingRecord`
   - `ManagedWorkRecord`
   - `MissionRecord`
   - `RunRecord`
7. `TurnRecord` shall own the dispatch boundary for one user/system cycle.
8. `LaneRecord` shall own one target-specific response track inside one turn.
9. `SegmentRecord` shall be product-normalized delivery, not provider-native
   chunk identity.
10. `MissionRecord` shall bridge interaction intent or managed work into
    execution.
11. `RunRecord` shall represent one concrete execution attempt for one mission.
12. The first migration wave shall freeze these minimum shared read-model
    outputs:
    - `ChatTranscriptProjection`
    - `MyCatsProjection`
    - `ManagedWorkProjection`
    - `MissionRunProjection`
13. `MyCatsProjection` shall support at least these lenses:
    - `overview`
    - `chat`
    - `work`
    - `code`
14. Runtime-native events shall be normalized into product delivery events
    before `SegmentRecord` creation.
15. Direct-lane and transport ingress flows shall resolve through
    `TransportBindingRecord` plus canonical conversation identity, not through
    runtime session identity.
16. The first migration wave shall prioritize implementation in this order:
    - runtime delivery normalization envelope
    - canonical turn/lane writes for Chat
    - transport binding seam
    - `MY CATS` lens read model
    - mission/run read-model baseline
17. The first migration wave may keep compatibility adapters, but new code
    shall target the frozen canonical record families above.

### Non-Functional Requirements

- **Bounded scope**: the first migration wave must stay small enough to land
  without redesigning every product surface at once.
- **Identity integrity**: canonical IDs must not be reused as shortcuts for
  other layers.
- **Replay safety**: transcript and read-model rebuild paths must target frozen
  canonical records rather than renderer heuristics.
- **Incremental adoption**: compatibility shims are allowed temporarily, but
  they must terminate into the frozen canonical contracts.

## Design Overview

```text
Shared Identity Layer
  agentId
  participantId
  containerId
  conversationId
  turnId
  laneId
  sessionId
  transportBindingId
  managedWorkId
  missionId
  runId

Canonical Records
  Agent / Participant
  Container / Conversation / Turn / Lane / Segment / Session
  TransportBinding
  ManagedWork / Mission / Run

Read Models
  ChatTranscriptProjection
  MyCatsProjection
  ManagedWorkProjection
  MissionRunProjection
```

## First Migration Wave

### Wave 1A: Runtime Normalization Envelope

Freeze a product-owned normalized delivery envelope that always carries:

- `conversationId`
- `turnId`
- `laneId`
- `sessionId`
- segment-local ordering metadata

### Wave 1B: Canonical Chat Writes

Make Chat persist canonical:

- `TurnRecord`
- `LaneRecord`
- `SegmentRecord`
- `SessionRecord`

even when compatibility chat-store fields still exist.

### Wave 1C: Transport Binding

Make direct-lane and Telegram-style ingress terminate into:

- `TransportBindingRecord`
- canonical `ConversationRecord`
- canonical turn creation

### Wave 1D: `MY CATS` Lens Read Model

Build one shared `MyCatsProjection` with:

- `overview`
- `chat`
- `work`
- `code`

while allowing each product to render contextual subsets over it.

### Wave 1E: Mission/Run Baseline

Create the first shared mission/run projection so Work- and Code-adjacent
surfaces stop inventing incompatible execution summaries.

## Boundaries

### Freeze Set

The following are in freeze scope now:

- identity names
- record-family names
- read-model names
- migration-wave order

### Not Yet Frozen

The following may still evolve inside later specs/plans:

- exact storage backend details
- every record field beyond the minimum shape
- final UI layout for `MY CATS`, Work, or Code
- final analytics/telemetry schema

## Dependencies

- [ADR-059](../decisions/059-adopt-a-unified-conversation-turn-lane-engine.md)
- [ADR-060](../decisions/060-normalize-heterogeneous-runtime-delivery-into-product-events.md)
- [ADR-063](../decisions/063-agent-missions-and-transport-bindings.md)
- [ADR-064](../decisions/064-project-conversational-agents-into-chat-and-operational-agents-into-work.md)
- [ADR-065](../decisions/065-keep-my-cats-as-one-platform-agent-home-with-lenses.md)
- [SPEC-058](./SPEC-058-interaction-core-and-domain-materialization.md)
- [SPEC-062](./SPEC-062-agent-missions-and-transport-bindings.md)
- [SPEC-063](./SPEC-063-conversational-vs-operational-agents-and-surface-projections.md)
- [SPEC-064](./SPEC-064-my-cats-platform-home-and-lens-projections.md)

## Open Questions

- [ ] Which minimum fields should be mandatory on each frozen record family in
      the first code slice?
- [ ] Should `MyCatsProjection` be served from one shared route first or remain
      product-composed for the initial rollout?
- [ ] Which compatibility adapters must be explicitly marked for later removal
      in the first implementation PRs?

## References

- [Architecture](../architecture.md)
- [requirements.md](../requirements.md)
- [product-integration-guide.md](../product-integration-guide.md)
- [terminology.md](../terminology.md)

---

*Created: 2026-04-14*
*Author: Codex*
*Related Plan: [PLAN-057](../plans/PLAN-057-core-contract-freeze-and-first-migration-wave.md)*

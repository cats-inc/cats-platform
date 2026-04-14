# PLAN-057: Core Contract Freeze and First Migration Wave

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Spec

[SPEC-065: Core Contract Freeze and First Migration Wave](../specs/SPEC-065-core-contract-freeze-and-first-migration-wave.md)

## Overview

This plan turns the frozen contract names into the first implementation wave.

It is intentionally narrow. The goal is to establish the shared write/read
spine that later product work can attach to, not to finish every Chat/Work/Code
surface in one pass.

## Implementation Phases

### Phase 1: Freeze Shared Types and IDs

- [ ] Introduce or consolidate shared type definitions for:
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
- [ ] Add canonical record-family types or interfaces for:
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
- [ ] Add comments or docstrings only where needed to mark durable-vs-ephemeral
      identity rules

**Deliverables**: one shared type vocabulary that later code can import without
guessing identity boundaries.

### Phase 2: Runtime Normalization and Canonical Chat Writes

- [ ] Freeze the normalized runtime-delivery envelope used before transcript
      projection
- [ ] Route Chat streaming/persisted updates into canonical:
  - `TurnRecord`
  - `LaneRecord`
  - `SegmentRecord`
  - `SessionRecord`
- [ ] Keep compatibility shims where needed, but terminate them into canonical
      records
- [ ] Add focused tests proving `laneId` is durable and `sessionId` is not used
      as transcript identity

**Deliverables**: Chat writes into canonical turn/lane/segment/session records
behind compatibility adapters.

### Phase 3: Transport Binding and Direct-Lane Integrity

- [ ] Introduce or consolidate `TransportBindingRecord`
- [ ] Make transport ingress terminate into canonical conversation/turn flow
- [ ] Ensure direct-lane reconnects and transport reroutes do not redefine lane
      or conversation identity
- [ ] Add regression coverage for transport-binding vs session identity

**Deliverables**: transport/direct-lane flows grounded on canonical binding and
conversation records.

### Phase 4: `MY CATS` Lens Read Model

- [ ] Define `MyCatsProjection` shape
- [ ] Provide at least:
  - `overview`
  - `chat`
  - `work`
  - `code`
- [ ] Define how product-local subsets derive from the projection
- [ ] Add baseline tests for one shared identity across many lenses

**Deliverables**: one canonical `MY CATS` read model plus product-subset derivation rules.

### Phase 5: Mission/Run Projection Baseline

- [ ] Define the minimum `MissionRunProjection`
- [ ] Link mission/run state to managed work and code execution contexts
- [ ] Make Work- and Code-facing summaries consume the same projection family
- [ ] Add provenance coverage for conversation -> mission -> run links

**Deliverables**: first cross-product execution summary seam shared by Work and Code.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/core/**` | Modify | Shared canonical type and record families |
| `src/platform/**` | Modify | Runtime normalization and transport-binding seams |
| `src/products/chat/**` | Modify | Canonical turn/lane/segment/session writes |
| `src/products/work/**` | Modify | Managed-work and mission/run projection consumption |
| `src/products/code/**` | Modify | Code-facing mission/run and `MY CATS` lens consumption |
| `src/app/**` | Modify | Platform routing or `MY CATS` lens wiring if needed |
| `tests/**` | Modify/Create | Canonical identity and projection regression coverage |

## Technical Decisions

- Decision 1: Migrate through compatibility adapters rather than a one-shot
  schema rewrite.
- Decision 2: Freeze names and identity boundaries before freezing every final
  field shape.
- Decision 3: Let Chat land first, but require all new work to target the same
  canonical contracts.

## Testing Strategy

- **Unit Tests**:
  - ID and record-family helpers
  - runtime normalization envelope
  - `MY CATS` lens projection builders
- **Integration Tests**:
  - Chat write path into canonical turn/lane/segment/session records
  - transport ingress via transport binding
  - mission/run projection linkage
- **Manual Testing**:
  - direct lane reconnect sanity
  - concurrent/sequential transcript sanity after canonical lane adoption
  - `MY CATS` lens navigation sanity once UI starts landing

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Compatibility layers linger too long | High | Terminate all new code into canonical records and tag adapter cleanup explicitly |
| Chat migration monopolizes the wave | High | Keep Work/Code scope limited to shared projections, not full feature delivery |
| `MY CATS` lens shape drifts product by product | Medium | Build one shared `MyCatsProjection` before product-local panels expand |
| Mission/run semantics stay vague in code | Medium | Force Work/Code summaries to consume the same projection family |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-14 | Plan created |

---

*Created: 2026-04-14*
*Author: Codex*

# PLAN-049: Unified Conversation-Turn-Lane Engine

> Replace mode-driven chat implementation with one canonical
> `Container -> Conversation -> Turn -> Lane -> Segment -> Session` engine,
> then specialize behavior only through topology, scheduler, sharing, and
> coordinator policies.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Spec / Dependencies

- [ADR-059: Adopt a Unified Conversation-Turn-Lane Engine](../decisions/059-adopt-a-unified-conversation-turn-lane-engine.md)
- [SPEC-057: Concurrent Group Lane-Native Live Transcript](../specs/SPEC-057-concurrent-group-lane-native-live-transcript.md)
- [SPEC-058: Interaction Core and Domain Materialization](../specs/SPEC-058-interaction-core-and-domain-materialization.md)
- [ADR-057: Adopt Segment-Native Assistant Transcript Delivery](../decisions/057-adopt-segment-native-assistant-transcript-delivery.md)
- [ADR-058: Adopt Lane-Native Concurrent Group Transcript Delivery](../decisions/058-adopt-lane-native-concurrent-group-transcript-delivery.md)

## Overview

This plan turns the current Chat runtime and renderer into one engine with one
canonical write model.

The target end state is:

- one execution model for direct, solo, sequential group, concurrent group,
  and parallel container flows
- stable lane identity that survives reconnect, replay, and repair
- transcript projection derived from canonical state instead of session timing
- sequential frontier propagation as a first-class engine rule
- optional coordinator capabilities such as Boss Cat layered above the same
  engine rather than encoded as separate chat modes

The plan is intentionally bigger than a renderer refactor. It includes server
normalization, durable state, live projection, repair, replay, and observability.

## Implementation Phases

### Phase 1: Freeze the Canonical Write Model

- [ ] Task 1.1: Define the canonical record boundaries for:
      - `Container`
      - `Conversation`
      - `Turn`
      - `Lane`
      - `Segment`
      - `Session`
- [ ] Task 1.2: Standardize stable ids and correlation rules:
      - `containerId`
      - `conversationId`
      - `turnId`
      - `laneId`
      - `segment ordinal`
      - `sessionId`
- [ ] Task 1.3: Separate canonical lane identity from runtime attachment
      identity in all shared contracts.
- [ ] Task 1.4: Define lane lifecycle and turn lifecycle states that can cover
      direct, sequential, and concurrent flows without mode-specific branches.
- [ ] Task 1.5: Publish one shared state vocabulary for replay, repair, and
      renderer projection.

**Deliverables**: a frozen core write model and id contract shared by server,
renderer, repair, and tests

### Phase 2: Separate Policy From Core Identity

- [ ] Task 2.1: Represent topology, scheduler, sharing, and coordinator as
      explicit policy fields rather than implicit mode branches.
- [ ] Task 2.2: Normalize current entry presets such as `+New chat`,
      `+Group chat`, `+Parallel chat`, and direct lanes into policy bundles
      above the same engine.
- [ ] Task 2.3: Define serial and concurrent scheduler behavior against the
      same lane model.
- [ ] Task 2.4: Define container composition for parallel flows so child
      conversations no longer overload room transcript semantics.
- [ ] Task 2.5: Define Boss Cat as an optional coordinator capability that can
      be visible or hidden without changing lane identity rules.

**Deliverables**: one policy model that replaces the old chat-mode decision
tree

### Phase 3: Unify Live Projection, Repair, and Replay

- [ ] Task 3.1: Rebuild live projection so transcript structure derives from
      canonical turn/lane state instead of `session_started` timing.
- [ ] Task 3.2: Rework read repair and replay to rebuild projections from
      canonical state rather than infer missing business semantics heuristically.
- [ ] Task 3.3: Ensure reconnect mutates existing lanes and sessions instead of
      creating ghost bubbles or same-speaker duplicates.
- [ ] Task 3.4: Make system messages and lifecycle notices annotations only,
      not the source of bubble existence or ordering.
- [ ] Task 3.5: Align app-shell/read-model payloads with the same projection
      rules used during live rendering.

**Deliverables**: live, reload, and repaired transcript behavior converge on
the same model

### Phase 4: Promote Sequential Frontier Propagation

- [ ] Task 4.1: Define the sequential frontier contract that later lanes must
      receive from earlier completed lanes in the same turn.
- [ ] Task 4.2: Rework initial sequential audience dispatch so later lanes no
      longer receive only the original user message as explicit source context.
- [ ] Task 4.3: Ensure frontier propagation can carry both transcript and
      structured materialization context where needed.
- [ ] Task 4.4: Align prompt-building and runtime bridge code with the new
      frontier semantics.
- [ ] Task 4.5: Add regression coverage for initial sequential audience order,
      continuation handoff, and interrupted/replayed serial turns.

**Deliverables**: sequential turns become true relay flows rather than ordered
copies of the same original input

### Phase 5: Migrate Surfaces to the Shared Engine

- [ ] Task 5.1: Migrate direct lane and solo-thread projections onto the new
      engine without preserving legacy direct-only special cases.
- [ ] Task 5.2: Migrate sequential group rendering and room repair onto the
      shared engine contract.
- [ ] Task 5.3: Migrate concurrent group rendering and lane clusters onto the
      same shared engine contract.
- [ ] Task 5.4: Migrate parallel containers to compose child conversations
      instead of inventing separate transcript semantics.
- [ ] Task 5.5: Remove obsolete mode-driven compatibility helpers once all
      production flows read from the new model.

**Deliverables**: direct, sequential, concurrent, and parallel flows all run
through one engine

### Phase 6: Observability and Hardening

- [ ] Task 6.1: Standardize trace payloads and debug logs around the canonical
      id tuple.
- [ ] Task 6.2: Add engine-level tests for:
      - direct reconnect
      - initial sequential frontier propagation
      - concurrent lane order stability
      - parallel container composition
      - repair/replay equivalence
- [ ] Task 6.3: Add migration tests proving old room/topology presets still
      resolve to the expected policy bundle.
- [ ] Task 6.4: Add manual smoke checks that compare live behavior against
      refresh/reconnect/reload behavior.

**Deliverables**: one diagnosable and regression-tested engine

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/core/**` | Modify | Canonical turn/lane/session contracts and projections |
| `src/shared/liveIndicator.ts` | Modify | Consume canonical lane identity and projection rules |
| `src/products/shared/renderer/hooks/useLiveIndicator.ts` | Modify | Drive renderer state from the canonical engine |
| `src/products/chat/state/runtime-dispatch/**` | Modify | Replace mode-driven dispatch assumptions with engine policies |
| `src/products/chat/state/runtimeTargeting.ts` | Modify | Apply sequential frontier propagation and policy-aware targeting |
| `src/products/chat/state/prompts.ts` | Modify | Consume propagated turn frontier instead of legacy source-message shortcuts |
| `src/products/chat/api/resources/channelRuntimeRoutes.ts` | Modify | Stream engine-native live state and ids |
| `src/products/chat/api/resources/channelStreamSupport.ts` | Modify | Align stream support with engine-native lanes and policies |
| `src/products/chat/renderer/components/**` | Modify | Render transcript projections from engine-native state |
| `tests/**` | Modify/Create | Add engine-level regression coverage |

## Technical Decisions

- Decision 1: the engine rewrite must land server, renderer, and repair changes
  together; a renderer-only abstraction is not enough.
- Decision 2: sequential frontier propagation is part of the engine contract,
  not a prompt-layer convenience.
- Decision 3: parallel composition belongs above conversations as a container,
  not inside a special transcript path.
- Decision 4: mode names may survive in UX, but mode-driven core logic should
  be retired progressively.

## Testing Strategy

- **Unit Tests**: id normalization, lane/session separation, sequential
  frontier propagation, policy resolution
- **Integration Tests**: dispatch, stream, repair, replay, and app-shell
  projection under direct/sequential/concurrent/parallel presets
- **Manual Testing**:
  - direct reconnect ordering
  - sequential multi-audience relay
  - concurrent lane order stability
  - parallel container child-thread continuity

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Legacy helpers continue to encode mode-driven behavior | High | Make policy bundles explicit and delete compatibility helpers once migrated |
| Sequential frontier work is delayed until "later" | High | Treat frontier propagation as a dedicated phase with its own regression set |
| Repair and replay keep inventing semantics after the rewrite | High | Freeze the canonical state vocabulary first and require replay-based rebuilds only |
| Parallel composition leaks room semantics into child conversations | Medium | Model parallel as a container from the start and test child conversation isolation explicitly |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-14 | Plan created for the unified conversation-turn-lane engine rollout |
| 2026-04-15 | Canonical chat writes now persist `transportBindingId`, `containerId`, and `conversationId` through runtime dispatch, lifecycle notices, repair, and core projection, and core task/read-model seams now expose/filter `containerId` as part of the shared engine tuple |
| 2026-04-15 | Live trace/debug payloads plus SSE speaker envelopes now carry canonical `conversationId`, `turnId`, `laneId`, `sourceMessageId`, and `targetStateId`, so lane-native stream/debug inspection no longer has to reconstruct the active engine tuple from `sessionId`-only traces |

---

*Created: 2026-04-14*
*Author: Codex*

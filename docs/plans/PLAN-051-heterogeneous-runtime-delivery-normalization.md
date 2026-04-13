# PLAN-051: Heterogeneous Runtime Delivery Normalization

> Introduce one normalized runtime-delivery contract so product projections can
> consume rich-streaming, text-streaming, and terminal-only backends through
> the same turn/lane engine.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Spec / Dependencies

- [SPEC-059: Heterogeneous Runtime Delivery Normalization](../specs/SPEC-059-heterogeneous-runtime-delivery-normalization.md)
- [ADR-060: Normalize Heterogeneous Runtime Delivery Into Product Events](../decisions/060-normalize-heterogeneous-runtime-delivery-into-product-events.md)
- [ADR-059: Adopt a Unified Conversation-Turn-Lane Engine](../decisions/059-adopt-a-unified-conversation-turn-lane-engine.md)

## Overview

This rollout creates a normalization seam between `cats-runtime` adapters and
product projections.

The end state is:

- runtime adapters publish a capability profile
- runtime-native events are translated into normalized product delivery events
- transcript, artifact, repair, and replay code consume only normalized events
- coarse runtimes remain correct even when they cannot stream rich blocks

## Implementation Phases

### Phase 1: Define Capability Profiles and Normalized Events

- [ ] Task 1.1: Define the runtime capability profile vocabulary.
- [ ] Task 1.2: Define the normalized delivery-event families and payload
      fields.
- [ ] Task 1.3: Define correlation requirements to `conversationId`, `turnId`,
      `laneId`, `sessionId`, and segment-local ordinals.
- [ ] Task 1.4: Define how terminal-only results synthesize normalized
      segments or artifacts.

**Deliverables**: one shared normalization contract

### Phase 2: Add Adapter-Side Normalization

- [ ] Task 2.1: Add normalization helpers between runtime adapter/native events
      and product delivery events.
- [ ] Task 2.2: Add explicit mapping for rich block-streaming backends.
- [ ] Task 2.3: Add explicit mapping for plain-text streaming backends.
- [ ] Task 2.4: Add explicit mapping for terminal-only result backends.
- [ ] Task 2.5: Preserve provider-specific diagnostics separately from the
      normalized event path where useful.

**Deliverables**: adapters can emit one product delivery contract regardless of
backend richness

### Phase 3: Repoint Product Projections to the Normalized Contract

- [ ] Task 3.1: Rework live transcript projection to consume normalized events.
- [ ] Task 3.2: Rework preview/artifact and materialization flows to consume
      normalized results instead of raw provider payloads.
- [ ] Task 3.3: Keep session-start gating, ready barriers, and reconnect logic
      layered above normalized events rather than provider-native behavior.
- [ ] Task 3.4: Remove renderer assumptions that rich block streaming always
      exists.

**Deliverables**: renderers and projectors stop branching on runtime family

### Phase 4: Align Repair, Replay, and Durability

- [ ] Task 4.1: Persist or rebuild normalized delivery state for replay and
      repair.
- [ ] Task 4.2: Ensure coarse-runtime lanes replay correctly even without
      token-level history.
- [ ] Task 4.3: Ensure repaired rooms use normalized event/state rebuild rather
      than provider-payload heuristics.

**Deliverables**: replay and repair depend on product-native contracts only

### Phase 5: Verification

- [ ] Task 5.1: Add unit tests for capability classification and event
      normalization.
- [ ] Task 5.2: Add integration tests covering rich-streaming, text-streaming,
      and terminal-only adapters.
- [ ] Task 5.3: Add projection tests that prove the same turn/lane engine works
      across those capability profiles.
- [ ] Task 5.4: Add manual smoke checks for at least one coarse CLI and one
      rich CLI.

**Deliverables**: regression coverage for mixed-capability runtime delivery

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/platform/runtime/**` | Modify/Create | Capability profiles and normalization helpers |
| `src/shared/liveIndicator.ts` | Modify | Consume normalized product events rather than adapter-native payload assumptions |
| `src/products/chat/api/resources/channelRuntimeRoutes.ts` | Modify | Serve normalized delivery events |
| `src/products/chat/api/resources/channelStreamSupport.ts` | Modify | Align stream support with normalized event families |
| `src/products/chat/state/runtime-dispatch/**` | Modify | Translate runtime results into normalized lane/segment state |
| `src/products/code/**` | Modify | Consume normalized preview/build/result events |
| `src/products/work/**` | Modify | Consume normalized execution/result events where relevant |
| `tests/**` | Modify/Create | Mixed-capability runtime normalization coverage |

## Technical Decisions

- Decision 1: normalization belongs at the product/runtime seam, not inside
  every renderer or feature projector.
- Decision 2: coarse runtimes are supported through synthesis, not second-class
  feature downgrades.
- Decision 3: provider-specific diagnostics may survive separately, but product
  correctness must depend on normalized events only.

## Testing Strategy

- **Unit Tests**: capability profiles, normalized event mapping, terminal
  synthesis behavior
- **Integration Tests**: mixed runtime adapter scenarios
- **Manual Testing**:
  - one rich-streaming provider
  - one text-only provider
  - one terminal-only provider

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Product code keeps reading raw provider payloads in hidden corners | High | Introduce one explicit normalized contract and migrate consumers systematically |
| Terminal-only synthesis hides too much useful information | Medium | Preserve diagnostics separately and keep artifact/result payloads linkable |
| Rich adapters lose fidelity after normalization | Medium | Keep normalized contract extensible and additive instead of lowest-common-denominator only |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-14 | Plan created for heterogeneous runtime delivery normalization |

---

*Created: 2026-04-14*
*Author: Codex*

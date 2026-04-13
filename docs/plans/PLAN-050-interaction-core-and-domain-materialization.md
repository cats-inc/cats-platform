# PLAN-050: Interaction Core and Domain Materialization

> Connect the unified interaction engine to a structured materialization layer
> so Chat turns can create, refine, and govern durable Code/Work artifacts
> without turning transcript text into the only source of truth.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Spec / Dependencies

- [SPEC-058: Interaction Core and Domain Materialization](../specs/SPEC-058-interaction-core-and-domain-materialization.md)
- [ADR-059: Adopt a Unified Conversation-Turn-Lane Engine](../decisions/059-adopt-a-unified-conversation-turn-lane-engine.md)
- [ADR-039: Use Core task metadata as the cross-product plan exchange surface](../decisions/039-use-core-task-metadata-as-cross-product-plan-exchange.md)
- [SPEC-035: Cross-Product Task Strategy Handoff and Runtime Bridge](../specs/SPEC-035-cross-product-task-strategy-handoff-and-runtime-bridge.md)

## Overview

`Cats` is AI-first, but the long-term product value is not "everything stays a
chat bubble forever." The interaction core must feed a structured
materialization layer that can create and update durable Code/Work records with
full provenance.

This plan introduces that seam in a way that preserves:

- Chat as the canonical interaction engine
- Code and Work as structured domain projections
- shared provenance and approval semantics
- replay-safe, idempotent materialization behavior

## Implementation Phases

### Phase 1: Define the Structured Output Envelope

- [ ] Task 1.1: Define the normalized structured output types emitted by turns
      and lanes:
      - `mutation`
      - `artifact`
      - `reference`
      - `execution_result`
      - `governance_event`
- [ ] Task 1.2: Define output lifecycle state such as:
      - `proposed`
      - `applied`
      - `superseded`
      - `rejected`
      - `informational`
- [ ] Task 1.3: Define the minimum provenance tuple required on every
      structured output.
- [ ] Task 1.4: Define idempotency keys or deduplication rules so replay and
      reconnect do not create duplicate durable records.

**Deliverables**: one normalized structured-output contract shared by Chat,
Code, and Work

### Phase 2: Add Materialization Persistence and Provenance

- [ ] Task 2.1: Add storage contracts for materialized outputs and their
      provenance.
- [ ] Task 2.2: Link materialized outputs to shared-core domain records such as
      tasks, work items, artifacts, approvals, and previews.
- [ ] Task 2.3: Preserve originating `conversationId`, `turnId`, `laneId`, and
      participant/session provenance on applied records.
- [ ] Task 2.4: Define how previously materialized state becomes input context
      for future turns without requiring transcript scraping.

**Deliverables**: durable materialization records with traceable interaction
lineage

### Phase 3: Introduce Governance and Application Rules

- [ ] Task 3.1: Define when a structured output is informational only versus
      proposed durable state.
- [ ] Task 3.2: Define approval/application rules for materialized mutations
      that need human or privileged review.
- [ ] Task 3.3: Align the approval path with existing Core approval/task
      records so Code/Work do not invent separate governance models.
- [ ] Task 3.4: Define replay-safe application behavior for approved mutations.

**Deliverables**: one governance path for materialized state transitions

### Phase 4: Project Materialized State Into Chat, Code, and Work

- [ ] Task 4.1: Define Chat projections for inline artifact chips, approval
      notices, and structured-output summaries.
- [ ] Task 4.2: Define Code projections for code tasks, file-change artifacts,
      test/build results, and review surfaces.
- [ ] Task 4.3: Define Work projections for project/work-item/task flows,
      approvals, and downstream handoff state.
- [ ] Task 4.4: Define resource binding rules for workspace, repo, file, and
      preview references.
- [ ] Task 4.5: Ensure product projections remain views over shared materialized
      state rather than product-local copies.

**Deliverables**: cross-product projections driven by one materialization seam

### Phase 5: Connect Materialization to Turn Frontier and Replay

- [ ] Task 5.1: Propagate structured materialization frontier alongside
      transcript frontier where sequential turns require it.
- [ ] Task 5.2: Rebuild transcript and materialized projections together during
      replay and repair.
- [ ] Task 5.3: Ensure lane-local outputs remain attributable even when
      multiple lanes materialize related artifacts in one turn.
- [ ] Task 5.4: Add rebuild logic that can reconcile durable domain state with
      conversation provenance without heuristic transcript parsing.

**Deliverables**: replay-safe structured context and projection rebuilds

### Phase 6: Verification and Product Adoption

- [ ] Task 6.1: Add unit tests for structured-output normalization,
      provenance, deduplication, and application rules.
- [ ] Task 6.2: Add integration tests covering Chat-originated materialization
      into Code/Work records.
- [ ] Task 6.3: Add product smoke coverage for:
      - chat-created task/spec artifact
      - code-generated build/test artifact
      - work-generated approval/handoff record
- [ ] Task 6.4: Update follow-on product docs and implementation plans to
      consume the shared materialization seam explicitly.

**Deliverables**: validated shared materialization behavior across products

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/core/**` | Modify | Add materialization contracts, provenance, and persistence seams |
| `src/platform/orchestration/**` | Modify | Carry structured outputs through orchestration flows |
| `src/products/chat/**` | Modify | Emit and project structured outputs in transcript surfaces |
| `src/products/work/**` | Modify | Consume materialized work/project/task outputs |
| `src/products/code/**` | Modify | Consume materialized code/test/review outputs |
| `src/shared/**` | Modify | Shared ids, resource references, and projection helpers |
| `tests/**` | Modify/Create | Add materialization and provenance coverage |

## Technical Decisions

- Decision 1: transcript rendering must stop being the implicit owner of every
  future artifact.
- Decision 2: materialization must preserve the same provenance tuple across
  all products.
- Decision 3: replay must rebuild both transcript and structured state views
  from canonical records rather than scraping prose.
- Decision 4: structured outputs should stay normalized and product-agnostic at
  the seam, with richer product-specific projection happening later.

## Testing Strategy

- **Unit Tests**: envelope normalization, provenance, lifecycle state, and
  deduplication behavior
- **Integration Tests**: turn-to-materialization persistence, approval
  application, and cross-product projection
- **Manual Testing**:
  - create a work-style task from chat
  - generate code/test outputs from a code flow
  - verify replay preserves both transcript and durable records

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Code/Work teams keep inventing product-local side channels | High | Freeze the structured-output seam first and reference it from follow-on specs/plans |
| Transcript prose remains the only durable record of artifacts | High | Make structured outputs explicit and test projection rebuild without transcript scraping |
| Materialization becomes too product-specific too early | Medium | Keep the shared envelope narrow and normalize product-specific views above it |
| Replay creates duplicate durable records | High | Define idempotency keys and replay-safe application rules before adoption |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-14 | Plan created for the interaction-core to domain-materialization rollout |

---

*Created: 2026-04-14*
*Author: Codex*

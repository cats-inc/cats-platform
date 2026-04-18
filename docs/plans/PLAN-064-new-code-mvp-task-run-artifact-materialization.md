# PLAN-064: New Code MVP Task, Run, and Artifact Materialization

> Deliver the first narrow `+New code` slice by making the entry preset
> materialize one primary coding conversation, one primary code task, task-bound
> execution runs, and linked artifacts with clear Code-vs-Work ownership rules.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Spec / Dependencies

- [SPEC-043: Cats Code MVP Multi-Agent Local-App Workflow](../specs/SPEC-043-cats-code-mvp-multi-agent-local-app-workflow.md)
- [SPEC-041: Cats Code v1 Local Builder Loop](../specs/SPEC-041-cats-code-v1-local-builder-loop.md)
- [SPEC-061: Concurrent vs Parallel Semantics and Code Entry Presets](../specs/SPEC-061-concurrent-parallel-semantics-and-code-entry-presets.md)
- [SPEC-058: Interaction Core and Domain Materialization](../specs/SPEC-058-interaction-core-and-domain-materialization.md)
- [ADR-063: Separate Managed Work, Agent Missions, Execution Runs, and Transport Bindings](../decisions/063-agent-missions-and-transport-bindings.md)
- [PLAN-029: Cats Code v1 Local Builder Loop](./PLAN-029-cats-code-v1-local-builder-loop.md)
- [PLAN-032: Cats Code MVP Fan-Out, Relay, and Convergence](./PLAN-032-cats-code-mvp-fan-out-relay-and-convergence.md)

## Overview

The recent spec pass locked the `+New code` MVP vocabulary:

- one primary `Conversation` with `kind = 'code_thread'`
- one primary code `Task` as the durable objective
- zero or more `Run`s as concrete execution attempts
- zero or more `Artifact`s as durable outputs

What is still missing is an implementation plan that turns those terms into one
coherent product slice.

This plan deliberately stays narrower than the full `Cats Code` MVP. It does
not attempt to land multi-agent peer review, full Work-board integration, or a
top-level run-management product. It focuses only on the minimum end-to-end
contract that should become true when the user chooses `+New code`.

The implementation thesis is:

1. `+New code` should immediately create a durable Code anchor, not just a
   transient draft conversation
2. the durable anchor should be `Conversation + primary code Task`
3. `Run` should appear only when a concrete execution attempt starts
4. `Artifact` should remain traceable to the task and, when available, the
   producing run
5. Code-origin work should remain Code-owned unless it is explicitly promoted
   into operator-visible Work

## Slice Boundary

### In scope for PLAN-064

- `+New code` entry materialization contract
- primary `code_thread` conversation creation
- primary code-task seeding
- first run creation and repeat-run semantics
- task/run/artifact linkage and projection rules
- Code recents, task detail, artifact, and run-history presentation for this
  slice
- explicit Work-promotion seam without full Work-product takeover

### Explicitly deferred after PLAN-064

- `+Team code` and `+Peer code` topology-specific materialization
- multi-agent roster, relay, and convergence work beyond existing `PLAN-032`
- full Boss Cat continuation rules across hidden Code-owned tasks
- top-level run dashboard or standalone run product surface
- rich Work-board lifecycle for every Code-origin task

## Implementation Phases

### Phase 1: Freeze the `+New code` Materialization Contract

- [ ] Define the create-time product contract for `+New code` so one entry
      action always yields:
      - one `Conversation(kind = 'code_thread')`
      - one primary code `Task`
      - no `Run` until execution actually starts
- [ ] Define the minimum metadata written at creation time, including at least:
      - product hint / origin surface
      - linked conversation id
      - workspace hint when already known
      - initial ownership state of Code vs Work
- [ ] Make the no-`job` rule explicit in create-boundary helpers and contracts
      so internal APIs do not reintroduce mixed terminology
- [ ] Reuse shared Core records and existing Code task helpers instead of
      creating a Code-only persistence shape for this slice
- [ ] Define idempotency or resume rules for repeated `+New code` create
      attempts so the product does not accidentally seed duplicate primary
      tasks during entry retries

**Deliverables**: one frozen `+New code` create contract with stable task and
conversation anchors.

### Phase 2: Land Task-Bound Run Semantics

- [ ] Define exactly when the first `Run` is created:
      - first explicit execute/build/continue attempt
      - not at thread creation time
- [ ] Define run-boundary rules for this slice:
      - retry creates a new run
      - explicit restart creates a new run
      - takeover or handoff creates a new run when recorded as a new attempt
      - reconnect/resume inside the same active attempt reuses the same run
- [ ] Ensure run records remain linked to the durable task and, where relevant,
      any delegated mission/runtime session identifiers
- [ ] Expose run history as task-adjacent observability rather than a
      replacement for task identity
- [ ] Align builder-loop execution helpers so run creation, resume, and history
      follow the same semantics across `+New code` and `/code/build`

**Deliverables**: one coherent meaning of `Run` as a task-bound execution
attempt.

### Phase 3: Project Artifacts and Evidence Projection

- [ ] Define the first artifact-linking rule set for `+New code`:
      - artifacts belong to the task
      - artifacts may also reference the producing run
      - artifact lists must stay readable even when many runs exist
- [ ] Ensure builder outputs such as preview/build/test/report artifacts can be
      projected back into the same task detail flow
- [ ] Keep artifact provenance visible enough that the operator can tell which
      run produced the output without opening raw records
- [ ] Reuse existing preview/artifact selection helpers rather than inventing a
      second Code-only evidence contract
- [ ] Define how structured outputs such as summaries, checkpoints, or review
      notes should attach to the same task/run lineage

**Deliverables**: one evidence path where Code outputs remain attached to the
same durable task and execution history.

### Phase 4: Code UI Entry and Projection

- [ ] Make `+New code` create flow visible in the Code UI with a stable landing
      path into the created `code_thread`
- [ ] Update Code recents so they are conversation-led while still surfacing
      enough task state to resume work confidently
- [ ] Update Code task detail so it becomes the primary place to inspect:
      - primary task state
      - latest run
      - run history
      - linked artifacts
      - workspace summary when known
- [ ] Keep run history inside task detail for MVP instead of blocking on a
      top-level run page
- [ ] Ensure artifact views and builder surfaces deep-link back to the same task
      and conversation context

**Deliverables**: a usable `+New code` UI path where entry, resume, execution,
and evidence all point back to one task/conversation anchor.

### Phase 5: Work Promotion and Operator-Visible Boundaries

- [ ] Define the first promotion seam from Code-owned task into Work-owned
      tracking, including at least:
      - explicit user promotion
      - link to `WorkItem`
      - blocked or approval-required operator-visible states
- [ ] Keep non-promoted Code-origin tasks out of default Work projections so
      Work is not polluted by every scratch coding thread
- [ ] Make the promotion boundary additive so future Boss Cat / operator flows
      can observe the same task without changing task identity
- [ ] Reuse existing managed-work and WorkItem projections where possible
      instead of creating a second promotion table for Code
- [ ] Document the follow-on seam for cross-product visibility invariants that
      are intentionally deferred from this MVP slice

**Deliverables**: clear Code-owned-by-default behavior with a stable path into
Work when operator tracking is actually needed.

### Phase 6: Hardening and Acceptance Coverage

- [ ] Add regression coverage for:
      - `+New code` create flow
      - primary task seeding
      - first-run creation timing
      - retry/restart/takeover run boundaries
      - artifact lineage and resume projections
- [ ] Add manual verification steps for the narrow MVP path:
      - create `+New code`
      - confirm conversation + primary task exist
      - execute once and confirm first run appears
      - retry and confirm same task / new run
      - inspect artifacts from task detail
      - promote into Work only when explicitly requested or operator-visible
- [ ] Log deferred follow-ons needed for:
      - `+Team code`
      - `+Peer code`
      - Boss Cat continuation visibility
      - standalone run analytics or dashboards

**Deliverables**: a testable MVP slice with explicit deferred seams.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/products/code/shared/channelEntry.ts` | Modify | Lock `+New code` create semantics and entry metadata |
| `src/products/code/shared/channelTopology.ts` | Modify | Keep preset topology aligned with the new create-time materialization rules |
| `src/products/code/api/contracts.ts` | Modify | Encode primary task, run, artifact, and promotion payload shapes |
| `src/products/code/api/taskRoutes.ts` | Modify | Add or tighten create/resume routes for primary code task and run history |
| `src/products/code/api/runtimeBridgeRoutes.ts` | Modify | Ensure first-run creation timing and execution-boundary semantics stay consistent |
| `src/products/code/api/projection.ts` | Modify | Add Code recents/task-detail projections for task/run/artifact lineage |
| `src/products/code/state/taskExecution.ts` | Modify | Align run creation, retry, restart, and takeover semantics with the new contract |
| `src/products/code/shared/taskDetailSummary.ts` | Modify | Surface primary-task, latest-run, and artifact linkage for renderer use |
| `src/products/code/renderer/components/NewChatDraft.tsx` | Modify | Route `+New code` entry into the new create flow |
| `src/products/code/renderer/components/ChatView.tsx` | Modify | Keep conversation-led recents and thread resume behavior aligned |
| `src/products/code/renderer/components/CodeBuilderView.tsx` | Modify | Reuse the same primary task and run semantics from the entry slice |
| `src/products/code/renderer/components/RunInspector.tsx` | Modify | Render task-adjacent run history without elevating runs above tasks |
| `src/products/code/renderer/components/ArtifactDetailView.tsx` | Modify | Show artifact provenance back to task and producing run |
| `src/products/code/renderer/api/codeTask.ts` | Modify | Normalize primary task, run history, and promotion data for the UI |
| `src/core/model/executionRecords.ts` | Modify | Keep shared run-record usage aligned with the frozen terminology |
| `src/core/taskRecords.ts` | Modify | Support task linkage and seed-time metadata needed by `+New code` |
| `src/core/executionRecordLists.ts` | Modify | Provide additive run-history queries needed by Code detail |
| `src/core/managedWorkProjection.ts` | Modify | Add the Work-promotion seam for promoted/operator-visible Code tasks |
| `src/products/work/api/projection.ts` | Modify (additive) | Accept promoted Code-origin tasks without defaulting all Code tasks into Work |
| `tests/**` | Modify/Create | Cover create flow, run boundaries, artifact lineage, and promotion behavior |

## Technical Decisions

- Treat `Conversation + primary code Task` as the durable `+New code` anchor.
- Create `Run` lazily at execution time, not at entry time.
- Keep one task identity across retries, restarts, takeovers, and repair loops
  unless the product is explicitly creating a different durable objective.
- Keep Code recents conversation-led while making task and latest-run state easy
  to resume from the same surface.
- Keep Work projection opt-in or operator-driven rather than automatic for every
  Code-origin task.
- Preserve `job` only as an external-system boundary term; do not reintroduce
  it as a Core-owned noun.

## Testing Strategy

- **Unit Tests**:
  `+New code` create helpers, task-seeding metadata, run-boundary helpers,
  artifact-lineage selectors, Work-promotion eligibility rules
- **Integration Tests**:
  create conversation -> seed primary task -> execute -> create first run ->
  retry -> attach artifacts -> inspect task detail -> promote into Work
- **Renderer/Behavior Tests**:
  `+New code` entry flow, conversation-led recents, task-detail run history,
  artifact provenance display, Work-promotion affordance visibility
- **Manual Testing**:
  create a fresh `+New code` thread, confirm the primary task exists before
  execution, start one build/continue attempt, verify the first run appears,
  retry once, inspect artifacts from Code detail, then confirm Work remains
  unchanged until promotion or operator-visible blocking occurs

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `+New code` still behaves like a transient draft and reseeds duplicate tasks on retry | High | Freeze create-time idempotency/resume rules before renderer wiring |
| `Run` semantics drift again between Code builder, runtime bridge, and docs | High | Centralize run-boundary rules in shared task-execution helpers and keep terminology tests/docs aligned |
| Artifact UI loses provenance when several runs exist for one task | Medium | Keep task-first artifact lists with explicit producing-run hints in detail views |
| Work becomes noisy if every Code task is projected by default | High | Gate Work projection behind explicit promotion or operator-visible states only |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-19 | Plan created to implement the first narrow `+New code` materialization slice around `Conversation + primary code Task + Run* + Artifact*` with Code-owned-by-default behavior |

---

*Created: 2026-04-19*
*Author: Codex*

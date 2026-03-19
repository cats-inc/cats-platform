# PLAN-016: Dynamic Room Workflow Orchestration

Status: Draft (Pending Review)

## Scope

Implement the first product slice for
[SPEC-026](../specs/SPEC-026-explicit-mentions-and-dynamic-room-workflow-orchestration.md)
and
[ADR-024](../decisions/024-separate-explicit-mentions-from-dynamic-room-workflow.md).

This plan covers:

- deterministic explicit single-target and multi-target mention dispatch
- first-finished-first-reply behavior for explicit multi-target fan-out
- room workflow state distinct from explicit mention routing
- event-driven checkpoint, handoff, and branch orchestration
- runtime integration for native fork where supported
- fallback context-transplant orchestration when native fork is unavailable or
  not appropriate
- converge tracking and operator-visible branch status

This plan does not cover:

- a full heartbeat or timer scheduler
- an operator-authored DAG editor
- a full task-board or Work-style control-plane UI
- complete autonomous background workflows after app restart

## Hard Constraints

- Keep explicit mention routing deterministic and product-owned.
- Do not move workflow policy into prompt wording.
- Preserve the `cats-inc -> cats-runtime` boundary.
- Do not require the operator to see or edit every room workflow detail in the
  first slice.
- Do not interleave multiple Cats' raw token streams directly into one
  transcript bubble in the first slice.

## Phases

### Phase 1: Freeze Mention Modes and Workflow Vocabulary

- [ ] Freeze explicit mention modes:
      - direct single
      - direct multi
      - group claim
- [ ] Freeze first-slice workflow terms:
      - stage
      - checkpoint
      - branch
      - converge
- [ ] Freeze first-slice branch strategies:
      - fork_if_possible
      - transplant_context
      - fresh_no_parent
- [ ] Decide which branch and workflow state must be visible in the read model.

**Deliverables**: stable vocabulary and state model before implementation
spreads across routing, runtime integration, and renderer code.

### Phase 2: Extract Routing Outcomes from Prompt Guidance

- [ ] Refactor routing code so explicit single-target and multi-target decisions
      are represented as structured system-layer outcomes.
- [ ] Keep prompts as consumers of routing outcomes rather than owners of
      routing truth.
- [ ] Preserve unresolved-mention reporting.
- [ ] Keep current direct-chat and Boss-chat semantics compatible with
      [SPEC-018](../specs/SPEC-018-direct-cat-chat-and-conversation-routing-layer.md).

**Deliverables**: explicit mention routing model that is ready for fan-out.

### Phase 3: Parallel Explicit Multi-Target Fan-Out

- [ ] Replace serial multi-target dispatch with parallel target execution where
      policy allows.
- [ ] Add per-target status tracking for one user turn:
      - pending
      - running
      - completed
      - failed
- [ ] Persist partial branch or target status before all targets finish.
- [ ] Return or surface completed replies in finish order instead of mention
      order.
- [ ] Keep first-slice transcript insertion as one stable reply per target.

**Deliverables**: `@Cat_A @Cat_B` now behaves like real parallel fan-out.

### Phase 4: Room Workflow State and Event-Driven Replanning

- [ ] Introduce room workflow state separate from mention-routing output.
- [ ] Allow `Boss Cat` or the system layer to set or update workflow state when:
      - the room starts
      - membership changes
      - a checkpoint completes
      - an explicit replan is requested
- [ ] Add completion events that can trigger:
      - sequential handoff
      - new parallel branch requests
      - converge waits
      - route-to-Boss review
- [ ] Keep the first slice event-driven; do not add heartbeat or timer scanning.

**Deliverables**: room collaboration can continue without constant manual
pointing from `Boss Cat`.

### Phase 5: Runtime Branching Integration

- [ ] Extend `cats-inc` runtime client with branch primitives needed from
      `cats-runtime`, including native session fork.
- [ ] Add branch-strategy selection logic:
      - prefer native fork when the provider/session supports it and the child
        should inherit the same provider context
      - fall back to context transplant when provider-native fork is unavailable
        or when the child should move to a different provider/Cat profile
- [ ] Attach branch lineage metadata to room-level orchestration state.
- [ ] Keep runtime capability checks explicit so unsupported providers degrade
      honestly.

**Deliverables**: room workflow can branch from real parent context instead of
starting every child from scratch.

### Phase 6: Converge and Review Behavior

- [ ] Add converge tracking for rooms waiting on multiple child branches.
- [ ] Support first-slice converge policies such as:
      - wait for all required branches
      - allow partial completion with warning
- [ ] Surface when a room is waiting for branch completion versus ready for the
      next stage.
- [ ] Route converge results back to `Boss Cat` or the chosen reviewer role when
      the room policy requires it.

**Deliverables**: branch results can rejoin one room coherently.

### Phase 7: UI and API Surfaces

- [ ] Add room-visible status chips or activity state for parallel targets and
      branches.
- [ ] Decide how much branch state appears inline in chat versus a secondary
      panel.
- [ ] Keep the main chat readable even when multiple branches are in flight.
- [ ] Extend HTTP/API responses so the renderer can observe per-target and
      per-branch progress without waiting for every branch to finish.

**Deliverables**: the operator can tell who is working, who finished, and what
the room is waiting on.

### Phase 8: Validation and Documentation Sync

- [ ] Add tests for explicit multi-target fan-out and completion-order reply
      handling.
- [ ] Add tests for workflow checkpoint completion triggering next-step routing.
- [ ] Add tests for native fork selection when supported.
- [ ] Add tests for context-transplant fallback when native fork is not
      available or not appropriate.
- [ ] Update architecture, API docs, and progress docs once implementation
      begins landing.

**Deliverables**: verified orchestration behavior plus synchronized docs.

## Candidate Code Areas

| Area | Action | Why |
|------|--------|-----|
| `src/shared/app-shell.ts` | Extend | Carry room workflow, branch status, and per-turn orchestration state into the read model |
| `src/workspace/model.ts` | Extend | Persist workflow policy, checkpoints, branch lineage, and target status |
| `src/workspace/runtimeActions.ts` | Refactor heavily | Replace serial dispatch with fan-out, workflow events, and branch strategy selection |
| `src/workspace/prompts.ts` | Demote routing guidance | Keep prompts as presentation/context consumers instead of routing owners |
| `src/runtime/client.ts` | Extend | Add fork and any future context-transplant request support |
| `src/server.ts` | Extend | Surface partial orchestration state and incremental completion outcomes |
| `src/renderer/App.tsx` | Extend carefully | Show per-target status and converge state without turning chat into noise |
| `src/renderer/api.ts` | Extend | Support richer orchestration responses or follow-up polling/streaming |
| `tests/` | Expand | Cover routing, branching, convergence, and fallback behavior |
| `docs/` | Update | Keep specs, plans, architecture, and API notes aligned |

## Validation

- `@Cat_A` continues to deterministically route only to `Cat_A`.
- `@Cat_A @Cat_B` dispatches both in parallel rather than serially.
- The earlier finished Cat reply lands first as a stable room message.
- A workflow stage can create a checkpoint and trigger a new sequential or
  parallel stage without requiring `Boss Cat` to manually `@` the next Cat.
- Native fork is used when supported and requested.
- Context transplant is used as the fallback branch strategy when native fork is
  unavailable or unsuitable.
- The room can wait for convergence and then continue naturally.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Parallel fan-out introduces transcript or state races | High | Persist per-target state explicitly and avoid raw token interleaving in the first slice |
| Workflow policy grows into an overbuilt hidden DAG engine | Medium | Keep the first slice focused on stage, checkpoint, branch, and converge only |
| Runtime fork assumptions leak provider-specific behavior into product logic | High | Keep branch strategy selection product-owned but capability truth runtime-owned |
| Context transplant becomes too ad hoc across providers | High | Land a shared runtime contract for transplant inputs before product depends on provider-specific hacks |
| Group mention semantics remain fuzzy during first implementation | Medium | Freeze single and multi semantics first; keep group claim conservative in v1 |

## Suggested Handoff Instruction

Use this when delegating implementation:

> Implement SPEC-026 / PLAN-016. Keep explicit `@mentions` deterministic, but
> stop treating all collaboration as explicit mentions. Add parallel fan-out for
> explicit multi-target turns, introduce room workflow state with checkpoints
> and converge behavior, and integrate runtime-native fork when available with a
> context-transplant fallback when it is not.

---

*Last updated: 2026-03-20*

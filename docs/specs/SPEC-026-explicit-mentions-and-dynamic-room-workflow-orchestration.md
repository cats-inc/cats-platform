# SPEC-026: Explicit Mentions and Dynamic Room Workflow Orchestration

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft (Pending Review) |
| **Owner** | Codex |
| **Reviewer** | User / chat-orchestration workstream |

## Summary

Cats Chat needs a clearer collaboration model than "everything is just prompt
guidance."

This spec separates two different kinds of intent:

- explicit addressing through `@mentions`
- implicit room workflow controlled by `Boss Cat` and the product/system layer

That split enables three important behaviors:

- deterministic `@Cat_A` and `@Cat_A @Cat_B` routing
- future `@group` claim-style routing
- dynamic sequential-to-parallel orchestration that can branch only after a
  prior Cat finishes and reveals how the work should be split

The orchestration model should remain product-owned and event-driven.
`cats-runtime` provides branching primitives such as session fork and
context transplant, but it does not own room policy.

## Goals

- define explicit semantics for single-target, multi-target, and group mentions
- keep room workflow and handoff policy separate from explicit mention routing
- support dynamic re-planning after checkpoints rather than requiring a fixed
  DAG at room start
- support fork-based or transplant-based parallelization when a prior Cat's
  output makes branching possible
- support converge behavior so parallel branches can return to one room

## Non-Goals

- introducing a full heartbeat or scheduler subsystem in the first slice
- turning Cats Chat into a visible task-board or issue tracker
- requiring the operator to manually configure every room workflow detail
- making prompts the primary source of routing or orchestration truth
- replacing `cats-runtime` with product-owned provider session logic

## User Stories

- As an operator, I want `@Cat_A` to mean that Cat is directly addressed, not
  merely suggested by prompt wording.
- As an operator, I want `@Cat_A @Cat_B` to make both Cats act in parallel and
  let the earlier finished answer arrive first.
- As an operator, I want `@frontend-team` or a similar group mention to let the
  right Cats step in without every member being forced to reply.
- As a Boss Cat, I want room workflow to continue naturally after a specialist
  completes without manually naming every next specialist.
- As a specialist Cat, I want the current stage, checkpoint, and handoff reason
  to be clear when I am invoked from a room workflow.

## Requirements

### Functional Requirements

1. `cats-inc` shall distinguish explicit mention routing from room workflow
   orchestration.
2. Explicit individual mentions shall be deterministic product-owned routing
   decisions.
3. `@Cat_A` shall route work to `Cat_A` even if a prompt would have chosen a
   different participant.
4. Explicit multi-target mentions shall be deterministic product-owned routing
   decisions.
5. `@Cat_A @Cat_B` shall route work to both Cats rather than forcing the model
   to decide whether one or both should answer.
6. Explicit multi-target dispatch should run in parallel when the mentioned
   Cats are independently eligible to work.
7. The first reply shown in the room for an explicit multi-target turn should be
   the first stable completed reply, not the first name in mention order.
8. The first slice should avoid raw interleaved token streams from multiple Cats
   in the main transcript. Each routed Cat should produce its own stable reply
   unit, even when the status UI is live.
9. Explicit unresolved mentions shall be surfaced as routing outcomes rather
   than silently ignored.
10. The product should support group-style mentions as a distinct routing mode.
11. Group mentions should resolve through capability and room-policy rules
    rather than meaning "every member must reply."
12. Group resolution should be able to use at least:
    - room membership
    - Cat capability metadata
    - room workflow claim rules
    - availability or current branch state when known
13. The first group slice may resolve to one claimer by default, with escalation
    or additional fan-out only when policy requires it.
14. The product shall define a room workflow policy separate from explicit
    mention routing.
15. Room workflow policy should be able to retain at least:
    - current stage
    - last completed checkpoint
    - preferred handoff order or claim groups
    - converge target or reviewer role
    - parallelization rules when known
16. `Boss Cat` or the system layer shall be able to create or update room
    workflow policy on at least:
    - room start
    - room membership change
    - specialist completion or checkpoint creation
    - explicit replanning after new information appears
17. The orchestration model shall support dynamic re-planning after a Cat
    completes meaningful work.
18. The product shall support at least these workflow shapes:
    - sequential handoff
    - parallel branch fan-out
    - converge or review stage after branches complete
19. Parallel branching should not require the full branch set to be known at
    room start.
20. When a new branch needs the parent session's context, the product should be
    able to request one of these execution strategies:
    - `fork_if_possible`
    - `transplant_context`
    - `fresh_no_parent`
21. `fork_if_possible` should be preferred when:
    - the parent provider/runtime supports native fork
    - the child benefits from the exact same session context
    - the child does not require a different provider family or incompatible
      skill/tool surface
22. `transplant_context` should be preferred when:
    - provider-native fork is unavailable
    - the child should run on a different provider, model, or Cat role
    - the child should inherit a curated checkpoint or handoff bundle rather
      than the entire parent provider session
23. Each branch invocation should retain lineage metadata that can point back to
    at least:
    - parent room turn
    - parent checkpoint or branch root
    - branch strategy used
24. When a branch completes, the product shall be able to emit a checkpoint or
    handoff bundle for the next stage.
25. Converge behavior shall be able to wait for multiple required branches or
    proceed when the branch policy allows partial completion.
26. The room shall retain branch status suitable for operator-facing visibility,
    including at least:
    - pending
    - running
    - completed
    - failed
    - cancelled
    - waiting_for_converge
27. The first slice shall remain event-driven and shall not require a general
    heartbeat or timer scheduler.
28. The implementation shall preserve the `cats-inc -> cats-runtime` boundary.

### Non-Functional Requirements

- **Determinism**: explicit mentions must not depend on model mood
- **Clarity**: room workflow should explain why a Cat is acting, even if the
  full policy is not shown to the operator
- **Boundary integrity**: product owns room workflow policy; runtime owns branch
  execution primitives
- **Extensibility**: group policy, branch strategies, and converge rules should
  be extendable without redefining mention semantics

## Conceptual Model

### Mention Semantics

- `direct_single`
  - one explicitly addressed Cat
- `direct_multi`
  - multiple explicitly addressed Cats; fan out directly
- `group_claim`
  - one group mention resolved through room policy and capability lookup

### Room Workflow

- `RoomWorkflowPolicy`
  - product-owned hidden or semi-visible workflow state for the room
- `WorkflowCheckpoint`
  - durable summary or handoff bundle produced after meaningful work
- `WorkflowBranch`
  - a sequential or parallel child execution path derived from a checkpoint
- `WorkflowConverge`
  - the stage that gathers branch outputs before the room moves on

### Branch Strategy

- `fork_if_possible`
  - ask runtime to branch from the parent session natively
- `transplant_context`
  - hydrate a fresh child session from curated parent context
- `fresh_no_parent`
  - start a new child without branch inheritance

## Illustrative Product Shapes

```ts
type MentionRoutingMode =
  | 'direct_single'
  | 'direct_multi'
  | 'group_claim';

type BranchStrategy =
  | 'fork_if_possible'
  | 'transplant_context'
  | 'fresh_no_parent';

type RoomBranchStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'waiting_for_converge';

interface RoomWorkflowPolicy {
  stageId: string;
  checkpointId?: string;
  preferredHandoffOrder?: string[];
  claimGroups?: string[];
  convergeTargetId?: string;
  reviewRequired?: boolean;
}

interface WorkflowBranchRequest {
  parentCheckpointId: string;
  targetCatId: string;
  strategy: BranchStrategy;
  rationale?: string;
}
```

## Flow

```text
user turn arrives
      |
      +--> explicit @single/@multi -> deterministic routing
      |
      +--> @group -> group resolution policy
      |
      +--> no explicit mention -> current room workflow policy
                    |
                    v
            current stage runs
                    |
                    v
          checkpoint or specialist completion
                    |
                    +--> continue sequentially
                    +--> fan out in parallel
                    +--> converge and review
                    +--> replan room workflow
```

## First-Slice Direction

The first implementation slice should prioritize:

- deterministic explicit single and multi mentions
- event-driven branch and handoff state
- first-finished-first-reply for explicit multi-target fan-out
- branch strategy selection between native fork and context transplant
- operator-visible branch status without requiring a full task board

The first slice should not require:

- long-running background heartbeat
- timer-driven retries
- operator-visible DAG editing UI
- fully generic workflow programming

## Dependencies

- [ADR-024](../decisions/024-separate-explicit-mentions-from-dynamic-room-workflow.md)
- [ADR-017](../decisions/017-allow-direct-cat-chat-and-move-routing-into-system-layer.md)
- [SPEC-015](./SPEC-015-cat-capability-registry-and-runtime-skill-mcp-mapping.md)
- [SPEC-016](./SPEC-016-chat-session-sleep-wake-lifecycle.md)
- [SPEC-018](./SPEC-018-direct-cat-chat-and-conversation-routing-layer.md)
- [SPEC-019](./SPEC-019-product-skill-profiles-and-runtime-skill-manifests.md)
- [cats-runtime SPEC-003](../../../cats-runtime/docs/specs/SPEC-003-agent-backend.md)
- [cats-runtime SPEC-011](../../../cats-runtime/docs/specs/SPEC-011-session-fork-and-context-transplant-primitives.md)

## Open Questions

- [ ] How much of room workflow policy should be visible in the first chat UI:
      none, lightweight stage/status, or explicit branch cards?
- [ ] Should first-slice `@group` support exactly one claimer only, or also
      limited multi-claimer group policies?
- [ ] At convergence time, should the first slice require all required branches
      to finish, or allow policy-driven partial completion with warnings?

## References

- [requirements.md](../requirements.md)
- [architecture.md](../architecture.md)
- [Paperclip Control-Plane Analysis](../research/paperclip-control-plane-analysis.md)
- [2026-03-20 OpenClaw Chat/Runtime Gap Analysis](../research/2026-03-20-openclaw-chat-runtime-gap-analysis.md)

---

*Created: 2026-03-20*
*Author: Codex*
*Related Plan: [PLAN-016](../plans/PLAN-016-dynamic-room-workflow-orchestration.md)*

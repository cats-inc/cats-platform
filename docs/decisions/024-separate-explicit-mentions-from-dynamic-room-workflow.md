# ADR-024: Separate Explicit Mentions from Dynamic Room Workflow

> Keep explicit `@mentions` as deterministic addressing semantics, while
> letting room-level workflow and dynamic parallelization remain a separate
> product-owned orchestration concern.

## Status

Accepted

## Date

2026-03-20

## Context

[ADR-017](./017-allow-direct-cat-chat-and-move-routing-into-system-layer.md)
already established that routing truth belongs in the product/system layer
rather than in prompt wording.

That solved only part of the collaboration problem.

In real operator chat, there are at least three different coordination intents:

- explicit individual mention: `@Cat_A`
- explicit multi-target mention: `@Cat_A @Cat_B`
- implicit room workflow: Cats continue or hand off work without the operator or
  `Boss Cat` naming every next step manually

Those intents should not be collapsed into one mechanism.

The suite also needs to support work that becomes parallel only after a prior
specialist finishes. For example, an architecture-oriented Cat may first define
the module boundaries, after which `Boss Cat` or the system can decide whether
the next slice should remain sequential or branch into parallel specialist work.

`cats-runtime` already exposes session lifecycle and fork primitives. Those are
execution tools. They do not decide room workflow policy on their own.

The product therefore needs a clearer rule:

- explicit mentions express addressing intent
- room workflow expresses orchestration intent

## Decision

`cats-inc` will separate explicit mention semantics from dynamic room workflow
orchestration.

1. Explicit mention semantics remain deterministic product logic.
   - `@Cat_A` means that Cat is directly addressed and must be routed work
   - `@Cat_A @Cat_B` means both Cats are directly addressed and must each be
     routed work
   - a future `@group` form may resolve through group policy rather than
     expanding to "everyone must reply"

2. Room workflow is a distinct product-owned layer above explicit mentions.
   - it may define current stage, preferred handoff order, review expectations,
     claim rules, and convergence behavior
   - it may be hidden from the operator in the first slice
   - it may be created or updated by `Boss Cat` or the system layer when the
     room starts, membership changes, or a checkpoint completes

3. Room workflow is dynamic and event-driven.
   - the product must be able to re-plan after meaningful outputs
   - the product must not require every room to start with a fixed full DAG
   - a room may move between sequential, parallel, and converge phases over
     time

4. Runtime branching primitives stay on the runtime side; branching policy stays
   on the product side.
   - the product decides when a branch should happen
   - runtime provides executable primitives such as session fork and context
     transplant

5. The first slice does not require a full heartbeat or scheduler subsystem.
   - completion events, checkpoint creation, and room-state transitions are
     sufficient for the initial orchestration loop
   - heartbeat or timer-driven orchestration may come later if the suite grows
     toward longer autonomous workflows

## Consequences

### Positive

- `@mention` semantics stay understandable and deterministic.
- `Boss Cat` no longer needs to point at every next teammate turn-by-turn for
  normal room collaboration.
- The product can support dynamic "plan after discovery" flows instead of
  forcing static DAGs.
- Existing runtime fork capability becomes usable without moving workflow policy
  out of the product.

### Negative

- `cats-inc` needs another explicit system-layer model: room workflow state.
- The product must track branch/converge state rather than only immediate
  routing outcomes.
- Some current "mention teammates when needed" prompt guidance will need to be
  demoted further from behavior truth to presentation guidance.

### Neutral

- This ADR does not require the operator to see every room-policy detail.
- This ADR does not require `Boss Cat` to disappear from workflow control; it
  narrows where its workflow intent should live.
- This ADR does not require `cats-runtime` to own scheduling semantics.

## Alternatives Considered

### Alternative 1: Encode all coordination through explicit mentions

- **Pros**: simpler visible model; less hidden orchestration state
- **Cons**: forces `Boss Cat` or the operator to keep manually naming every next
  actor; scales poorly for normal collaboration
- **Why rejected**: explicit addressing and workflow continuation are different
  concepts

### Alternative 2: Require a fixed execution DAG at room start

- **Pros**: easy to reason about up front; closer to traditional workflow tools
- **Cons**: many useful workflows cannot be planned completely before discovery
  work or architecture work lands
- **Why rejected**: the suite needs dynamic re-planning after checkpoints

### Alternative 3: Introduce heartbeat/scheduler semantics first

- **Pros**: stronger long-running automation story
- **Cons**: adds heavy control-plane machinery before the chat collaboration
  model is even settled
- **Why rejected**: first-slice room workflow should be event-driven before it
  becomes scheduler-driven

## References

- [ADR-017](./017-allow-direct-cat-chat-and-move-routing-into-system-layer.md)
- [ADR-018](./018-separate-product-skill-intent-from-runtime-skill-hosting.md)
- [SPEC-015](../specs/SPEC-015-cat-capability-registry-and-runtime-skill-mcp-mapping.md)
- [SPEC-018](../specs/SPEC-018-direct-cat-chat-and-conversation-routing-layer.md)
- [SPEC-019](../specs/SPEC-019-product-skill-profiles-and-runtime-skill-manifests.md)
- [cats-runtime SPEC-003](../../../cats-runtime/docs/specs/SPEC-003-agent-backend.md)
- [cats-runtime SPEC-011](../../../cats-runtime/docs/specs/SPEC-011-session-fork-and-context-transplant-primitives.md)

---

*Accepted: 2026-03-20*
*Decision makers: user + Codex*

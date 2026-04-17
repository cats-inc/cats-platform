# SPEC-069: Chat Continuity Semantics and Context Transplant

> Define what "the same chat continues" means across runtime-session changes,
> provider/model retargeting, handoff, and new participant joins.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Summary

`Cats Chat` currently has a clear conversation model, but continuity semantics
are still too implicit. In practice, several different boundaries are being
mixed together:

- the conversation the user thinks they are still in
- the logical participant who is currently speaking
- the execution target currently backing that participant
- the runtime session used to talk to the target
- the provider-native session or thread holding model memory

Those layers do not mean the same thing. In particular, a same-chat solo
retarget should not silently become "start fresh" just because the runtime or
provider session changed, while a new participant joining a group chat should
not automatically inherit full-room omniscience unless that is the intended join
mode.

This spec defines a product-owned continuity taxonomy for Chat. It separates
`solo retarget`, `group handoff`, and `group join`, and it defines when the
system must transplant prior context into a new provider session versus when a
targeted continuity package or no prior context is the correct behavior.

## Goals

- Define one explicit continuity model for Chat that does not depend on
  incidental runtime-session identity.
- Make same-chat `solo` provider/model switching preserve continuity by
  default.
- Separate `solo retarget`, `group handoff`, and `group join` into different
  semantic cases instead of one vague "new session" bucket.
- Define what the first message into a new provider-native session must contain
  when continuity should be preserved.
- Make any "fresh start" behavior explicit in UI and contract terms rather than
  silently implied by transport changes.

## Non-Goals

- Defining the final implementation algorithm for transcript compaction across
  all providers.
- Replacing provider-native resume or wakeup capabilities where those already
  preserve continuity correctly.
- Redesigning every Chat settings surface or model selector in this spec.
- Extending the same continuity taxonomy to `Work` or `Code` in the same slice.

## User Stories

- As a Chat user, I want switching the model in the same solo chat to preserve
  the conversation unless I explicitly start fresh.
- As a group-chat operator, I want a handoff to another room member to include
  the context they need, without assuming they must know the entire room
  history.
- As a group-chat operator, I want adding a new participant to have an explicit
  meaning about how much prior context they should inherit.
- As a product developer, I want continuity behavior to be testable from
  product semantics rather than reverse-engineered from runtime session churn.

## Requirements

### Functional Requirements

1. The Chat product shall distinguish these continuity units:
   - `conversation`
   - `logical participant`
   - `execution target`
   - `runtime session`
   - `provider-native session`
2. `conversation` continuity shall be owned by product semantics rather than by
   runtime-session or provider-session identity alone.
3. A change in `runtime session`, by itself, shall not redefine what the user
   means by "same chat".
4. A `solo retarget` shall mean:
   - same `conversation`
   - same `logical participant`
   - different `execution target`, `runtime session`, or `provider-native session`
5. `solo retarget` shall preserve continuity by default.
6. When `solo retarget` lands on a provider-native session that does not already
   contain prior chat memory, the first new turn shall receive a continuity
   transplant.
7. A `solo` continuity transplant shall be derived from the full relevant prior
   conversation state for that participant. It shall not be modeled as an
   arbitrary fixed-size recent-message excerpt.
8. When the full prior transcript cannot be sent verbatim due to provider
   constraints, the system shall construct a semantically complete continuity
   package derived from the full transcript. That package shall preserve, at
   minimum:
   - the user-visible problem or request thread
   - unresolved questions and open loops
   - decisions or adopted outcomes already made
   - task-relevant facts and constraints
   - enough recent verbatim turns to continue naturally from the latest state
9. Any UI action that intentionally clears `solo` continuity shall be explicit
   product language such as `Start fresh`, `New branch`, or equivalent. Changing
   provider or model alone shall not imply that behavior.
10. A `group handoff` shall mean:
    - same `conversation`
    - different already-known `logical participant`
    - targeted continuation of work from one participant to another
11. `group handoff` shall not default to full-room transcript transplant.
12. `group handoff` shall instead provide a targeted continuity package that
    may include:
    - the latest routed ask or handoff content
    - the reason this participant is now being engaged
    - recent relevant room messages
    - additive room facts or decisions needed to perform the task honestly
13. A `group join` shall mean a participant becoming a room member for the first
    time in that conversation.
14. `group join` shall require an explicit join continuity mode. The product
    model shall support at least:
    - `full_room_member`
    - `task_scoped_member`
    - `fresh_member`
15. First-slice default for mid-conversation participant joins shall be
    `task_scoped_member`, not implicit full-room continuity.
16. `full_room_member` join shall allow a continuity transplant equivalent in
    fidelity to a `solo retarget`, scoped to the room.
17. `task_scoped_member` join shall provide only the continuity package needed
    for the task the new participant is joining.
18. `fresh_member` join shall not automatically include prior room history
    beyond the immediate turn payload that introduces the participant.
19. Provider-native resume, when available for the same intended continuity
    scope, shall be treated as an optimization path rather than a separate
    product semantic.
20. The product shall test continuity selection at the semantic boundary. Tests
    should verify which continuity mode applies for:
    - `solo retarget`
    - `group handoff`
    - `group join`
    - explicit `start fresh`

### Non-Functional Requirements

- **Predictability**: same-chat `solo` retarget must behave consistently across
  providers.
- **Honesty**: group joins must not silently pretend a new participant knows
  room history that was never actually delivered.
- **Portability**: continuity rules must survive provider swaps rather than
  depending on one provider's native thread model.
- **Auditability**: the chosen continuity mode must be inspectable and
  explainable in product and test terms.
- **Graceful Degradation**: when compaction is necessary, degradation must be
  based on preserved semantics, not a hard-coded small excerpt budget.

## Design Overview

### Continuity Taxonomy

| Scenario | Conversation | Logical Participant | Default Continuity | First Turn Into New Provider Session |
|----------|--------------|---------------------|--------------------|--------------------------------------|
| `solo retarget` | Same | Same | Preserve | Full or semantically complete continuity transplant |
| `group handoff` | Same | Different existing member | Targeted | Targeted handoff package |
| `group join` | Same | New member | Depends on join mode | Join-mode-specific package |
| `start fresh` | Same or new UI surface | Same or different | Reset intentionally | No prior continuity unless explicitly reintroduced |

### Continuity Boundary Rule

The primary continuity boundary is not `runtime session`.

The primary continuity question is:

> What should this logical participant know at this moment in this conversation?

`runtime session` and `provider-native session` are implementation mechanisms
used to satisfy that question.

### Continuity Delivery Modes

The product should think in these delivery modes:

1. `native_resume`
   - reuse the same provider-native session when it already holds the intended
     continuity
2. `full_transplant`
   - send the prior conversation context in full
3. `semantic_transplant`
   - derive a semantically complete package from the full transcript when full
     verbatim replay is too large
4. `targeted_handoff`
   - deliver only task-relevant continuity to another participant
5. `fresh_start`
   - intentionally do not preserve prior continuity

### Anti-Pattern Clarification

The current-style "bootstrap instructions" approach of replaying only a small
fixed recent excerpt is not sufficient as the general continuity contract for
same-chat `solo retarget`.

Small recent excerpts may still appear as one ingredient inside a larger
semantic transplant, but they must not be treated as the whole continuity model.

### UI Semantics

This spec implies these product-language rules:

- same-chat solo model/provider changes mean `continue this chat`
- adding a new room member means `join with a defined continuity mode`
- handing work to an existing member means `handoff`
- wiping prior continuity must be explicit and user-visible

## Dependencies

- [SPEC-016](./SPEC-016-chat-session-sleep-wake-lifecycle.md)
- [SPEC-050](./SPEC-050-group-chat-temporary-participants-and-reusable-lightweight-presets.md)
- [SPEC-052](./SPEC-052-current-turn-recipients-dispatch-policy-and-parallel-chat-terminology.md)
- [SPEC-059](./SPEC-059-heterogeneous-runtime-delivery-normalization.md)
- [SPEC-061](./SPEC-061-concurrent-parallel-semantics-and-code-entry-presets.md)
- [ADR-004](../decisions/004-separate-cat-identity-from-provider-execution.md)
- [ADR-015](../decisions/015-adopt-cat-sleep-wake-lifecycle-for-chat-sessions.md)
- [ADR-051](../decisions/051-generalize-participants-and-adopt-guide-cat-terminology.md)
- [ADR-060](../decisions/060-normalize-heterogeneous-runtime-delivery-into-product-events.md)
- [PLAN-053](../plans/PLAN-053-concurrent-parallel-semantics-and-code-entry-presets.md)
- [ADR-068](../decisions/068-own-chat-continuity-semantics-above-runtime-session-boundaries.md)

## Open Questions

- [ ] Should the first explicit `group join` UI expose all three join modes, or
      should `task_scoped_member` remain implicit until a later surface pass?
- [ ] Which canonical product artifact should own semantic-transplant summaries:
      product-side transcript compactor, runtime-side continuity helper, or a
      shared substrate between them?
- [ ] Should explicit `new branch` preserve any room-level memory/checkpoint
      artifacts even when transcript continuity resets?
- [ ] How should tool results, file previews, and other non-text transcript
      artifacts be represented inside `semantic_transplant` packages?

## References

- [docs/architecture.md](../architecture.md)
- [docs/terminology.md](../terminology.md)
- [docs/product-integration-guide.md](../product-integration-guide.md)

---

*Created: 2026-04-17*
*Author: Codex*
*Related Plan: [PLAN-053](../plans/PLAN-053-concurrent-parallel-semantics-and-code-entry-presets.md)*

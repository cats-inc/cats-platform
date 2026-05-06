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

Those layers do not mean the same thing. In particular, a same-chat default
retarget should not silently become "start fresh" just because the runtime or
provider session changed, while a new participant joining a group chat should
not automatically inherit full-room omniscience unless that is the intended join
mode.

This spec defines a product-owned continuity taxonomy for Chat. It separates
`default retarget`, `group handoff`, and `group join`, and it defines when the
system must transplant prior context into a new provider session versus when a
targeted continuity package or no prior context is the correct behavior.

Today, same-chat `default` provider/model switching can restart the backing
session without delivering an equivalent continuity transplant. This should be
treated as a product defect relative to expected chat behavior, not as a valid
semantic of "new model, new blank context".

## Goals

- Define one explicit continuity model for Chat that does not depend on
  incidental runtime-session identity.
- Make same-chat `default` provider/model switching preserve continuity by
  default.
- Separate `default retarget`, `group handoff`, and `group join` into different
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

- As a Chat user, I want switching the model in the same default chat to preserve
  the conversation unless I explicitly start fresh.
- As a group-chat operator, I want a handoff to another room member to include
  the context they need, without assuming they must know the entire room
  history.
- As a group-chat operator, I want adding a new participant to have an explicit
  meaning about how much prior context they should inherit.
- As a product developer, I want continuity behavior to be testable from
  product semantics rather than reverse-engineered from runtime session churn.

## Current Defect and Anti-Patterns

Current implementation behavior is not yet aligned with the intended product
contract.

The main defects and anti-patterns are:

- same-chat `default` retarget currently restarts the session when provider/model
  changes, but it does not guarantee an equivalent continuity transplant into
  the replacement session
- `buildDefaultChatBootstrapInstructions` is being used as a thin re-entry patch
  in cases where same-chat continuity should be a first-class semantic
  transplant
- `MAX_PROMPT_RECENT_MESSAGES = 8` currently constrains that bootstrap path,
  which is acceptable for bounded recent-message formatting but not as the
  general continuity rule
- `shouldRestartDefaultChatSession` currently acts as a lifecycle gate for session
  restart, but it also effectively becomes a hidden continuity boundary because
  continuity is not re-established at equivalent fidelity after restart

This spec treats those as implementation problems to remove, not as behavior to
bless.

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
4. A `default retarget` shall mean:
   - same `conversation`
   - same `logical participant`
   - different `execution target`, `runtime session`, or `provider-native session`
5. `default retarget` shall preserve continuity by default.
6. When `default retarget` lands on a provider-native session that does not already
   contain prior chat memory, the first new turn shall receive a continuity
   transplant.
7. A `default` continuity transplant shall be derived from the full relevant prior
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
9. Any UI action that intentionally clears `default` continuity shall be explicit
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
    fidelity to a `default retarget`, scoped to the room.
17. `task_scoped_member` join shall provide only the continuity package needed
    for the task the new participant is joining.
18. `fresh_member` join shall not automatically include prior room history
    beyond the immediate turn payload that introduces the participant.
19. Provider-native resume, when available for the same intended continuity
    scope, shall be treated as an optimization path rather than a separate
    product semantic.
20. Provider-native `resume` shall count as preserved continuity only when the
    new execution path can actually resume the same intended provider-native
    session. Cross-provider retarget or any incompatible provider-native session
    boundary shall be treated as loss of native continuity.
21. A `parallel container` shall not itself be treated as one continuity unit.
    Continuity inside parallel chat shall be evaluated per child conversation.
22. Dispatching one operator turn to many parallel child conversations shall not
    imply sibling transcript sharing by default.
23. Creating or resuming one parallel child conversation shall not implicitly
    transplant private transcript state from sibling child conversations unless
    an explicit relay, adopt, or future continuity policy says so.
24. The product shall define a first-slice continuity seed rule for new
    parallel child conversations so they do not silently start from blank state
    when the creation flow intends carry-over from a source chat or draft.
25. The product shall test continuity selection at the semantic boundary. Tests
    should verify which continuity mode applies for:
    - `default retarget`
    - `group handoff`
    - `group join`
    - `parallel child conversation`
    - explicit `start fresh`
26. First-slice implementation shall explicitly define the delivery path for
    continuity transplant material. Same-chat replacement-session transplant and
    per-turn targeted handoff/join payloads shall not share an implicit
    undifferentiated instruction path.

### Non-Functional Requirements

- **Predictability**: same-chat `default` retarget must behave consistently across
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
| `default retarget` | Same | Same | Preserve | Full or semantically complete continuity transplant |
| `group handoff` | Same | Different existing member | Targeted | Targeted handoff package |
| `group join` | Same | New member | Depends on join mode | Join-mode-specific package |
| `parallel child conversation` | Child-local | Child-local | Child-local | Explicit seed context only; no sibling transcript sharing by default |
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

`native_resume` is only valid when the new execution path can actually reopen
the same intended provider-native session. It does not cover cross-provider
retarget or any incompatible native-session boundary.

### Runtime Session Recovery Contract

For a routed turn that targets the same logical participant in the same
conversation, a stale or closed runtime session is not itself a product-level
fresh start.

If the execution lease still points at a runtime session ID and the runtime
client supports the `resume` operation, Chat shall attempt to resume that same
runtime session before starting a replacement session. This applies both to
explicit wake/activation paths and to stale-session recovery during message
dispatch.

Only when the existing runtime session cannot be resumed may Chat rotate to a
new runtime session. That rotation must remain a runtime delivery boundary, not
a hidden conversation boundary; the replacement path is then responsible for the
appropriate `native_resume`, `full_transplant`, `semantic_transplant`,
`targeted_handoff`, or `fresh_start` decision described above.

Direct-message Cat lanes are stricter than shared rooms. When a direct-message
lane already has a runtime `sessionId`, stale-session recovery must not silently
rotate to a replacement runtime session. If native resume is unavailable or
fails, Chat shall mark the existing direct-lane lease `error`, preserve its
`sessionId` / `cwd` for a later retry or explicit reset, and avoid appending a
second `session_started` message. Replacement is allowed only after an explicit
user/operator action that intentionally resets or retargets the direct lane.

In-flight dispatch persistence must also treat an execution lease as a
single-owner lifecycle object. When concurrent product writes touch the same
channel while the same runtime `sessionId` is advancing from `initializing` to
`ready`, merge logic shall preserve the lifecycle advancement instead of
letting an older persisted snapshot overwrite it.

Terminal runtime lease statuses are lifecycle-monotonic in the same merge path:
`closed` and `removed` must not be overwritten by an older non-terminal
snapshot during in-flight dispatch persistence.

Activation for a healthy attached session shall use the same
ensure-target-session pathway as recovery. The resulting room wake entry may be
recorded as `skipped`, while the user-facing activation result still maps that
case to `already_started`.

### Anti-Pattern Clarification

The current-style "bootstrap instructions" approach of replaying only a small
fixed recent excerpt is not sufficient as the general continuity contract for
same-chat `default retarget`.

Small recent excerpts may still appear as one ingredient inside a larger
semantic transplant, but they must not be treated as the whole continuity model.

The current implementation names that embody this anti-pattern include:

- `buildDefaultChatBootstrapInstructions`
- `MAX_PROMPT_RECENT_MESSAGES`
- `shouldRestartDefaultChatSession` when used without an equivalent transplant path

They should remain bounded helpers or lifecycle gates, not the semantic source
of truth for same-chat continuity.

### Parallel Container Clarification

`parallel` is a container/composition concept, not a fourth participant
continuity mode.

This spec therefore treats parallel-chat continuity as:

- one continuity decision per child conversation
- optional seed context from the source draft/chat when the creation flow says
  so
- no implicit sibling transcript sharing
- future relay/adopt behavior as explicit additive policy rather than hidden
  continuity leakage

### UI Semantics

This spec implies these product-language rules:

- same-chat default model/provider changes mean `continue this chat`
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
- [ ] Should a future slice split `same-provider different-model retarget` from
      `cross-provider retarget` once a provider can prove native continuity
      across model overrides?
- [ ] Which canonical product artifact should own semantic-transplant summaries:
      product-side transcript compactor, runtime-side continuity helper, or a
      shared substrate between them?
- [ ] Should explicit `new branch` preserve any room-level memory/checkpoint
      artifacts even when transcript continuity resets?
- [ ] How should tool results, file previews, and other non-text transcript
      artifacts be represented inside `semantic_transplant` packages?
      First follow-through for this question is tracked under `PLAN-053`, not
      left unowned.

## References

- [docs/architecture.md](../architecture.md)
- [docs/terminology.md](../terminology.md)
- [docs/product-integration-guide.md](../product-integration-guide.md)

---

*Created: 2026-04-17*
*Author: Codex*
*Related Plan: [PLAN-053](../plans/PLAN-053-concurrent-parallel-semantics-and-code-entry-presets.md)*

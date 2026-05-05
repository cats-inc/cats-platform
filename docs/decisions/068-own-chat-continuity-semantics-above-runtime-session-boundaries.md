# ADR-068: Own Chat Continuity Semantics Above Runtime-Session Boundaries

> Treat chat continuity as a product-owned semantic contract that sits above
> runtime-session and provider-session mechanics.

## Status

Accepted

## Context

`Cats Chat` already has a strong product model for conversations, participants,
and execution targets, but continuity behavior is still too easy to misread as
an implementation accident of session reuse.

That creates three different kinds of confusion:

1. In `default`, the user reasonably expects that changing model or provider in
   the same chat still means the same participant knows the earlier chat.
2. In `group`, a handoff to another room member is not the same thing as
   replaying the entire room history.
3. A newly joined group participant should not automatically inherit full-room
   omniscience unless the join semantics explicitly say so.

The underlying runtime/provider layers already expose useful mechanisms such as:

- runtime sessions
- provider-native sessions or threads
- native resume behavior
- prompt/instruction packaging

Those are important delivery details, but they are not the right source of
truth for continuity semantics. If the product lets continuity meaning drift
with those mechanisms, the user-visible behavior becomes arbitrary:

- same-chat default retarget silently loses continuity today when provider/model
  switching restarts the backing session without an equivalent continuity
  transplant; this is a user-facing UX defect, not an acceptable product
  semantic
- group join may accidentally know too much or too little
- tests end up proving transport quirks instead of product intent

## Decision

`Cats Chat` will own continuity semantics above runtime-session boundaries.

### 1. Continuity is defined by product meaning, not by session IDs

The product will treat these as separate concepts:

- `conversation`
- `logical participant`
- `execution target`
- `runtime session`
- `provider-native session`

Changing runtime or provider session identity does not automatically change the
continuity contract.

### 2. `default retarget` preserves continuity by default

When the same logical participant in the same chat changes execution target,
the product will treat that as one continuing conversation unless the operator
explicitly starts fresh.

Only a truly compatible native resume path counts as preserved continuity. If
the new execution path cannot actually resume the same intended provider-native
session, including any cross-provider retarget, the first turn into the new
provider session must receive a continuity transplant derived from the prior
conversation.

### 3. `group handoff` and `group join` are distinct continuity modes

The product will not reuse the `default retarget` rule for all group cases.

- `group handoff`
  - targeted continuity to an existing room member
  - not full-room continuity by default
- `group join`
  - explicit join mode
  - may be `full_room_member`, `task_scoped_member`, or `fresh_member`

### 4. Small recent-message bootstrap is not the general continuity model

Fixed-size recent-message excerpts may still be useful as one ingredient, but
they are not an acceptable product-level substitute for same-chat continuity.
Current helpers such as `buildDefaultChatBootstrapInstructions` and
`MAX_PROMPT_RECENT_MESSAGES` must not remain the general continuity contract
for same-chat `default` retarget.

The product contract should prefer:

- native resume when it truly preserves the intended context
- full transcript transplant when feasible
- semantically complete compaction when full transplant is too large

### 5. Fresh starts must be explicit

Any behavior that intentionally clears continuity must be surfaced as an
explicit user action such as `Start fresh` or `New branch`, not implied by
changing provider, changing model, or rotating runtime sessions.

## Consequences

### Positive

- Same-chat default model/provider switching gets a clear, user-aligned meaning.
- Group handoff and group join can be designed honestly instead of borrowing
  `default` assumptions.
- Runtime and provider mechanics remain useful optimizations without owning the
  product story.
- Continuity behavior becomes testable in stable semantic terms.

### Negative

- The product now needs explicit continuity-transplant logic for cases where
  native provider resume is unavailable.
- More continuity metadata and testing vocabulary will be needed across chat
  flows.
- Join-mode semantics may require additional UI and contract work.

### Neutral

- Native resume still matters, but only as one delivery path under the product
  contract.
- Different providers may continue to vary in how much continuity they can hold
  natively.
- This ADR does not finalize the implementation location of continuity
  compaction helpers.

## Alternatives Considered

### Alternative 1: Let provider-native session continuity define product continuity

- **Pros**: lowest implementation effort when a provider already supports
  resume/thread continuity well
- **Cons**: provider swaps and session churn produce arbitrary product behavior
- **Why rejected**: users think in terms of chats and participants, not provider
  thread IDs

### Alternative 2: Always replay the entire transcript for every new session in every case

- **Pros**: simple conceptual rule; continuity loss is less likely
- **Cons**: wrong for scoped joins and many handoffs; expensive and often
  unnecessary
- **Why rejected**: `default retarget`, `group handoff`, and `group join` do not
  mean the same thing

### Alternative 3: Use a fixed recent-message bootstrap excerpt as the continuity contract

- **Pros**: easy to implement; small payloads
- **Cons**: loses important earlier semantics and makes same-chat continuity
  brittle
- **Why rejected**: a small recent excerpt is not faithful enough for the
  default `default` product promise

## References

- [SPEC-069](../specs/SPEC-069-chat-continuity-semantics-and-context-transplant.md)
- [ADR-004](./004-separate-cat-identity-from-provider-execution.md)
- [ADR-015](./015-adopt-cat-sleep-wake-lifecycle-for-chat-sessions.md)
- [ADR-051](./051-generalize-participants-and-adopt-guide-cat-terminology.md)
- [ADR-060](./060-normalize-heterogeneous-runtime-delivery-into-product-events.md)
- [PLAN-053](../plans/PLAN-053-concurrent-parallel-semantics-and-code-entry-presets.md)

---

*Accepted: 2026-04-17*
*Accepted by: user direction captured through Codex*

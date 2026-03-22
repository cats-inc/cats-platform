# SPEC-018: Direct Cat Chat and Conversation Routing Layer

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft (Pending Review) |
| **Owner** | Codex |
| **Reviewer** | User |

## Summary

`cats` should support two first-class conversation modes:

- `Boss Chat`: the default orchestrated conversation mode
- `Direct Cat Chat`: a direct room with one chosen Cat as the lead participant

To make that reliable, mention parsing and target resolution must move into a
shared routing layer owned by the product, not mainly by prompt conventions.

## Goals

- allow the operator to talk directly to a chosen Cat without routing every
  turn through `Boss Cat`
- keep `Boss Chat` as the default mode for `+ New Chat`
- make mention handling and default-target rules deterministic
- share one routing model across web rooms, direct specialist chats, and
  transport-bound private lanes

## Non-Goals

- replacing `Boss Cat` as the default public entry identity
- finalizing every UI affordance for starting direct chats in this slice
- shipping a full approval or takeover model in this slice
- removing prompts from collaboration language entirely

## User Stories

- As an operator, I want to open a direct chat with one Cat so I can work with
  that Cat without going through `Boss Cat` first.
- As an operator, I want unmentioned turns in a direct chat to keep going to
  that Cat automatically.
- As an operator, I want explicit `@mentions` to be respected consistently
  without depending on the model to remember routing instructions.

## Requirements

### Functional Requirements

1. The product shall support at least these room modes:
   - `boss_chat`
   - `direct_cat_chat` (which may optionally bind to external transports such
     as Telegram)
2. Every persisted conversation shall have a routing mode.
3. A room may also declare a lead participant for default target resolution.
4. `+ New Chat` shall continue creating `boss_chat` rooms by default.
5. The product shall support a Cat-private lane whose lead participant is a
   chosen Cat.
6. Selecting a Cat from `My Cats` shall resolve to that Cat's private lane.
   If a persisted `direct_cat_chat` room already exists for that Cat, the
   product should reopen it. Otherwise the product shall open a direct `/new`
   draft for that Cat without creating a persisted room yet.
7. In `boss_chat`, an unmentioned operator turn shall default to `Boss Cat`.
8. In `direct_cat_chat`, an unmentioned operator turn (or inbound transport
   message) shall default to the chosen lead Cat.
10. Explicit `@mentions` shall be parsed and resolved by the routing layer
   before prompt construction.
11. If an explicit `@mention` resolves to a valid room participant, that target
    shall be included in routing even if the prompt would have behaved
    differently.
12. If an explicit `@mention` does not resolve, the product shall surface that
    as a routing outcome instead of silently ignoring it.
13. The routing layer shall decide whether a target needs to be woken before
    work is dispatched.
14. Prompt construction shall consume resolved routing decisions rather than
    acting as the only source of routing truth.

### Non-Functional Requirements

- **Determinism**: explicit mentions and default targets should resolve the same
  way regardless of model behavior
- **Mode reuse**: the same routing layer should support future room types and
  transport entrypoints
- **Separation of concerns**: prompts should shape tone and collaboration style,
  while routing state owns target resolution

## Routing Model

### Core Concepts

- `roomMode`
  - `boss_chat`
  - `direct_cat_chat` (with optional transport binding)
- `leadParticipantId`
  - the default non-mentioned target for that room mode
- `resolvedTargets`
  - the participants selected by the routing layer for this turn
- `unresolvedMentions`
  - mentions that the routing layer could not map to a valid participant

### Resolution Rules

```text
Operator turn arrives
        |
        v
Parse explicit @mentions
        |
        +--> if explicit valid mentions exist -> route to them
        |
        +--> if no valid explicit mentions:
                use roomMode default target
                  - boss_chat -> Boss Cat
                  - direct_cat_chat -> lead Cat
        |
        v
Wake missing targets if needed
        |
        v
Build prompts from resolved targets
        |
        v
Dispatch
```

## UX Direction

### Boss Chat

- This remains the default room creation path.
- It is the best fit for orchestrated or open-ended work.
- `Boss Cat` may still involve other Cats through system-layer routing and
  surfaced collaboration behavior.

### Direct Cat Chat

- The operator should be able to start a direct room with one Cat from at least
  one obvious UI surface.
- `My Cats` should behave like Cat-private lane selection, not like a button
  that always creates a new persisted room.
- Clicking a Cat in `My Cats` should reopen that Cat's existing direct room
  when one exists, or open `/new?cat=<catId>` when the private lane has not
  been persisted yet.
- Once inside that room, the chosen Cat is the implicit counterpart.
- `Boss Cat` is not required in the route for normal unmentioned turns.

### Mention Behavior

- `@Name` should feel authoritative.
- If the room contains that participant, the app should route accordingly.
- If not, the app should say so clearly.
- Mention syntax may still be visible in transcripts, but routing success must
  not depend on the model obeying prompt text.

## Implementation Direction

- Extend room state to carry routing mode and lead participant metadata.
- Move target resolution into a reusable routing module or routing service.
- Keep `prompts.ts` as a consumer of resolved routing outcomes, not the owner of
  target truth.
- Align wake/sleep lifecycle with routing outcomes so newly targeted Cats can be
  awakened before dispatch.

## Dependencies

- [SPEC-011](./SPEC-011-primary-orchestrator-chat-entry-and-trace-separation.md)
- [SPEC-016](./SPEC-016-chat-session-sleep-wake-lifecycle.md)
- [SPEC-017](./SPEC-017-telegram-inbox-and-room-routing.md)
- [ADR-011](../decisions/011-model-primary-orchestrator-as-visible-cat.md)
- [ADR-015](../decisions/015-adopt-cat-sleep-wake-lifecycle-for-chat-sessions.md)
- [ADR-016](../decisions/016-treat-telegram-as-boss-cat-inbox-not-room-mirror.md)
- [ADR-017](../decisions/017-allow-direct-cat-chat-and-move-routing-into-system-layer.md)

## Design Notes

- The current code already parses explicit mentions in the chat-state layer, but
  this spec upgrades that into a clearer product-owned routing contract.
- This spec does not forbid prompts from suggesting collaboration. It forbids
  prompts from being the only thing enforcing explicit target resolution.
- `Direct Cat Chat` should feel like a UI-native direct session with a chosen
  specialist, not like a hidden Boss Cat room wearing a different label.
- The Cat-private lane and the persisted direct room are related but not
  identical states. A private lane may exist first as a `/new` draft and become
  persisted only after the first message is sent.

## Open Questions

- [ ] What is the best first UI affordance for starting a direct Cat chat:
      cat card action, add button menu, or a new composer picker?
- [ ] Should a `direct_cat_chat` room allow `Boss Cat` to be added later as a
      participant or escalation path?
- [ ] Should direct rooms support multi-Cat participation after creation, or
      should they stay one-lead-but-expandable from the start?

## References

- [terminology.md](../terminology.md)
- [Architecture](../architecture.md)

---

*Created: 2026-03-19*
*Author: Codex*
*Last updated: 2026-03-23*


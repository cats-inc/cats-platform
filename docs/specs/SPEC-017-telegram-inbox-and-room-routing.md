# SPEC-017: Telegram Inbox and Room Routing

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft (Pending Review) |
| **Owner** | Codex |
| **Reviewer** | User / Telegram workstream |

## Summary

Telegram should be treated as a single external inbox where the operator talks
to `Boss Cat`, while `Cats Chat` remains the canonical place for topic rooms and
multi-Cat collaboration.

This spec defines how one Telegram thread can safely drive many internal rooms
without collapsing all work into one transcript. It also captures the future UI
direction hinted by products like Manus: a higher-level agent/channel surface
can coexist with room-based chat, but must not replace the room model.

## Goals

- keep Telegram as one clean operator-to-`Boss Cat` entry thread
- preserve `Cats Chat` rooms as the canonical multi-topic workspace units
- allow `Boss Cat` to continue existing rooms or create new rooms from Telegram
- ensure new rooms created from Telegram appear naturally in `Recents`
- keep worker Cats internal to room orchestration rather than direct Telegram
  senders

## Non-Goals

- shipping the full Telegram bridge in this document alone
- mirroring every internal room message back into Telegram
- exposing worker Cats as individual Telegram identities
- finalizing the full future `Agent` tab navigation implementation

## User Stories

- As an operator, I want to message one Telegram bot and let `Boss Cat` decide
  whether to answer directly or organize the work into a dedicated room.
- As an operator, I want complex topics to become separate rooms in `Recents`
  instead of disappearing into one endless Telegram thread.
- As an operator, I want `Boss Cat` to tell me when it opened or continued a
  room so I can follow the work in the app.

## Requirements

### Functional Requirements

1. A Telegram private chat bound to `Boss Cat` shall be treated as a transport
   inbox, not as the canonical transcript for all work.
2. `Cats Chat` rooms shall remain the canonical units for topic work and
   multi-Cat collaboration.
3. One Telegram inbox may relate to many internal rooms over time.
4. For each inbound Telegram message, `Boss Cat` shall be able to choose one of
   these routing modes:
   - reply directly in Telegram
   - continue a known internal room
   - propose or create a new internal room
5. If `Boss Cat` continues an existing room, the system shall record or reuse a
   binding between the Telegram inbox context and that internal room.
6. If `Boss Cat` creates a new room from Telegram, that room shall appear in
   `Cats Chat Recents` as a normal room.
7. A room created from Telegram may be created with pre-assigned Cats selected
   by `Boss Cat`.
8. Worker Cats shall remain internal room participants and shall not appear as
   separate Telegram senders.
9. Telegram responses for room-backed work shall default to concise summaries,
   questions, approvals, or milestone updates instead of full transcript
   mirroring.
10. When a new room is created or an existing room is selected, Telegram should
    receive a short explanation that names the room or describes the topic.
11. When inbound intent is ambiguous, the first slice should prefer asking for
    clarification or confirmation rather than silently attaching the message to
    the wrong room.
12. The first slice should support operator-visible room creation from Telegram
    even before a dedicated `Agent` tab ships.
13. The current transport model shall not assume that one Telegram inbox model
    permanently forbids future multi-`Boss Cat`, multi-bot expansion.
14. If later slices add multiple public `Boss Cat` identities, each one should
    have its own explicit bot binding and inbox scope.

### Non-Functional Requirements

- **Transport separation**: Telegram routing records shall remain transport
  concerns, not ad hoc state hidden inside normal room transcript messages.
- **Canonical room history**: durable multi-step work should live in the room
  transcript, not only in Telegram replies.
- **Extensibility**: the model should apply later to LINE and similar
  one-thread bot channels.

## Model Direction

```text
Telegram private chat
        |
        v
 Boss Cat inbox
        |
        +--> direct Telegram reply
        |
        +--> continue existing Cats Chat room
        |
        +--> create new Cats Chat room
                  |
                  +--> assign specialist Cats
                  +--> show room in Recents
                  +--> send Telegram summary/confirmation
```

## Product Rules

### Telegram as Inbox

- Telegram should feel like one always-available front door to `Boss Cat`.
- The operator should not have to understand room ids, bindings, or internal
  orchestration terms.
- Telegram is allowed to stay concise and summary-oriented even when large room
  work is happening elsewhere.

### Rooms as Canonical Workspaces

- Long-running or topic-specific work should live in normal `Cats Chat` rooms.
- `Recents` should continue to mean "real rooms I can open and inspect".
- A Telegram-created room should be indistinguishable from a web-created room
  once it exists.

### Room Creation Behavior

- For obvious new topics, `Boss Cat` may propose a new room immediately.
- The early slice should bias toward explicit confirmation when room creation is
  costly, surprising, or ambiguous.
- After creation, Telegram should receive a short note such as:
  - room title
  - which Cats were invited
  - whether operator input is needed next

### Existing Room Continuation

- If a Telegram message clearly continues a known topic, `Boss Cat` may route it
  into that room.
- If multiple candidate rooms are plausible, `Boss Cat` should ask rather than
  silently guess.
- Future slices may maintain a stronger "active room" pointer for faster
  routing, but ambiguity rules should remain conservative.

## UX Direction

### Current Slice

- Telegram-backed work can create normal rooms that appear in `Recents`.
- The operator learns about new room creation through concise Telegram replies.
- The web app does not need a finished `Agent` tab yet to make this model work.

### Future Slice

- The product may add a top-level `Agent` surface alongside room-native chat.
- That surface should manage:
  - Telegram and LINE channel bindings
  - inbox state
  - bot health and policy
  - references into spawned or continued rooms
- The future `Agent` surface should complement `Recents`, not replace it.
- A later slice may also support multiple public `Boss Cat` identities, each
  paired with its own Telegram or LINE bot, as long as inbox ownership and room
  routing remain explicit.

## Dependencies

- [SPEC-011](./SPEC-011-primary-orchestrator-chat-entry-and-trace-separation.md)
- [SPEC-014](./SPEC-014-telegram-boss-cat-relay-mvp.md)
- [SPEC-016](./SPEC-016-chat-session-sleep-wake-lifecycle.md)
- [ADR-011](../decisions/011-model-primary-orchestrator-as-visible-cat.md)
- [ADR-015](../decisions/015-adopt-cat-sleep-wake-lifecycle-for-chat-sessions.md)
- [ADR-016](../decisions/016-treat-telegram-as-boss-cat-inbox-not-room-mirror.md)

## Design Notes

- `SPEC-014` defines the Telegram relay seam; this spec defines the product
  behavior that seam must eventually support.
- Inspiration from Manus is useful at the transport-entry level, especially the
  idea of a higher-level `Agent` surface, but `cats` should keep room-based
  chat as the canonical work model.
- This spec intentionally keeps Telegram summary-first. If a later slice wants
  selective transcript mirroring, that must be an explicit additive policy.

## Open Questions

- [ ] Should the first room title created from Telegram come from the first
      message text, an operator-confirmed title, or Boss Cat synthesis?
- [ ] Should the web app show a visible "created from Telegram" note inside the
      new room, or keep that provenance in transport metadata only?
- [ ] What is the smallest acceptable confirmation UX for "Boss Cat wants to
      open a new room" inside Telegram itself?

## References

- [terminology.md](../terminology.md)
- [Architecture](../architecture.md)
- Manus official reference:
  - https://manus.im/blog/manus-agents-telegram
  - https://help.manus.im/en/articles/14033617-how-do-i-set-up-and-use-manus-agents-in-telegram
  - https://help.manus.im/en/articles/14033996-is-my-data-safe-when-using-manus-agents-in-telegram

---

*Created: 2026-03-19*
*Author: Codex*

# SPEC-017: Telegram Inbox and Room Routing

## Metadata

| Field | Value |
|-------|-------|
| **Status** | In Progress (Boss Cat inbox MVP landed) |
| **Owner** | Codex |
| **Reviewer** | User / Telegram workstream |

## Summary

Telegram should be treated as one external inbox per bot binding, while
`Cats Chat` remains the canonical place for topic rooms and multi-Cat
collaboration. The current implementation now ships the first Boss Cat inbox
MVP with webhook ingress, durable room linking, diagnostics, and transport-owned
outbound replies; this spec remains the broader product contract for follow-on
room-rotation and multi-bot behavior.

This spec defines how one Telegram thread owned by one bot-bound Cat can safely
drive many internal rooms without collapsing all work into one transcript. It
also captures the future UI direction hinted by products like Manus: a
higher-level agent/channel surface can coexist with room-based chat, but must
not replace the room model.

Under the current re-architecture, each Telegram thread should be modeled as a
transport binding that remains distinct from:

- the bot binding that exposes a Cat/Agent identity publicly
- the canonical direct-lane or room conversation used by the interaction engine
- any runtime session used to answer or continue work

## Goals

- keep each Telegram bot as one clean operator-to-one-Cat entry thread
- preserve `Cats Chat` rooms as the canonical multi-topic chat units
- allow the bound Cat or product system layer to continue existing rooms or
  create new rooms from Telegram
- ensure new rooms created from Telegram appear naturally in `Recents`
- keep non-bot-bound worker Cats internal to room orchestration rather than
  direct Telegram senders

## Non-Goals

- shipping the full Telegram bridge in this document alone
- mirroring every internal room message back into Telegram
- exposing every internal worker Cat as a Telegram identity by default
- finalizing the full future `Agent` tab navigation implementation

## User Stories

- As an operator, I want to message one Telegram bot tied to one Cat and let
  that Cat or the system decide whether to answer directly or organize the work
  into a dedicated room.
- As an operator, I want complex topics to become separate rooms in `Recents`
  instead of disappearing into one endless Telegram thread.
- As an operator, I want the Cat I am messaging to tell me when it opened or
  continued a room so I can follow the work in the app.

## Requirements

### Functional Requirements

1. A Telegram bot binding shall deliver inbound messages into the bound Cat's
   private lane (`direct_cat_chat`), not into a separate channel type.
2. `Cats Chat` rooms shall remain the canonical units for topic work and
   multi-Cat collaboration.
3. One Cat's private lane may relate to many internal rooms over time.
4. For each inbound Telegram message, the bound Cat plus the product routing
   layer shall be able to choose one of these routing modes:
   - reply directly in the private lane (and optionally echo to Telegram)
   - continue a known internal room
   - propose or create a new internal room
5. If the binding continues an existing room, the system shall record or reuse a
   binding between the private lane context and that internal room.
6. If the binding creates a new room from Telegram, that room shall appear in
   `Cats Chat Recents` as a normal room.
7. A room created from Telegram may be created with pre-assigned Cats selected
   by the bound Cat or system policy.
8. Non-bot-bound worker Cats shall remain internal room participants and shall
   not appear as separate Telegram senders.
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
13. The current transport model shall allow multiple Telegram bots in one
    environment.
14. Each Telegram bot binding shall deliver into the bound Cat's private lane.
15. The global `Boss Cat` role shall remain singular even when multiple
    Telegram bot bindings exist.
16. A non-`Boss Cat` Cat may still own a Telegram bot binding.
17. Telegram bot binding ownership shall attach to Cat identity and deliver
    into that Cat's private lane.
18. The web product may surface Cat-owned Telegram binding state from the same
    `My Cats` roster used for Cat-private entry, while durable topic work still
    belongs in `Recents`.
19. Each Telegram chat thread shall be represented by a transport binding that
    is distinct from bot binding identity, canonical conversation identity, and
    runtime session identity.
20. A transport binding may continue a direct lane or link into one or more
    internal rooms over time without changing the external Telegram thread
    identity.
21. Runtime session reconnects, reroutes, or room changes shall not redefine
    transport-binding identity or thread ownership.

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
 Bot binding + transport binding
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

- Telegram should feel like one always-available front door to the Cat bound to
  that bot.
- The operator should not have to understand room ids, bindings, or internal
  orchestration terms.
- Telegram is allowed to stay concise and summary-oriented even when large room
  work is happening elsewhere.
- In the web app, the Cat that owns a Telegram bot may be indicated from
  `My Cats`, because the binding belongs to Cat identity rather than a single
  `Recents` thread.

### Rooms as Canonical Chats

- Long-running or topic-specific work should live in normal `Cats Chat` rooms.
- `Recents` should continue to mean "real rooms I can open and inspect".
- A Telegram-created room should be indistinguishable from a web-created room
  once it exists.

### Room Creation Behavior

- For obvious new topics, the bound Cat may propose a new room immediately.
- The early slice should bias toward explicit confirmation when room creation is
  costly, surprising, or ambiguous.
- After creation, Telegram should receive a short note such as:
  - room title
  - which Cats were invited
  - whether operator input is needed next

### Existing Room Continuation

- If a Telegram message clearly continues a known topic, the bound Cat may route it
  into that room.
- If multiple candidate rooms are plausible, the bound Cat or system layer
  should ask rather than silently guess.
- Future slices may maintain a stronger "active room" pointer for faster
  routing, but ambiguity rules should remain conservative.

## UX Direction

### Current Slice

- Telegram-backed work can create normal rooms that appear in `Recents`.
- The operator learns about new room creation through concise Telegram replies.
- The web app does not need a finished `Agent` tab yet to make this model work.

### Future Slice

- The product may add a top-level `Agent` or `Bots` surface alongside
  room-native chat.
- That surface should manage:
  - Telegram and LINE channel bindings
  - inbox state
  - bot health and policy
  - references into spawned or continued rooms
- The future `Agent` surface should complement `Recents`, not replace it.
- A later slice may support multiple Cat-bound Telegram or LINE bots in one
  environment, as long as inbox ownership and room routing remain explicit.

## Dependencies

- [SPEC-011](./SPEC-011-primary-orchestrator-chat-entry-and-trace-separation.md)
- [SPEC-014](./SPEC-014-telegram-boss-cat-relay-mvp.md)
- [SPEC-016](./SPEC-016-chat-session-sleep-wake-lifecycle.md)
- [ADR-011](../decisions/011-model-primary-orchestrator-as-visible-cat.md)
- [ADR-015](../decisions/015-adopt-cat-sleep-wake-lifecycle-for-chat-sessions.md)
- [ADR-016](../decisions/016-treat-telegram-as-boss-cat-inbox-not-room-mirror.md)
- [ADR-028](../decisions/028-allow-multiple-public-bot-bindings-with-one-boss-cat.md)
- [ADR-063](../decisions/063-agent-missions-and-transport-bindings.md)

## Design Notes

- `SPEC-014` defines the Telegram relay seam; this spec defines the product
  behavior that seam must eventually support.
- Inspiration from Manus is useful at the transport-entry level, especially the
  idea of a higher-level `Agent` surface, but `cats` should keep room-based
  chat as the canonical work model.
- This spec intentionally keeps Telegram summary-first. If a later slice wants
  selective transcript mirroring, that must be an explicit additive policy.
- Telegram thread identity should survive room reroute and session reconnect by
  way of transport bindings rather than renderer heuristics.

## Open Questions

- [ ] Should the first room title created from Telegram come from the first
      message text, an operator-confirmed title, or Boss Cat synthesis?
- [ ] Should the web app show a visible "created from Telegram" note inside the
      new room, or keep that provenance in transport metadata only?
- [ ] What is the smallest acceptable confirmation UX for "this Cat wants to
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
*Last updated: 2026-03-23*

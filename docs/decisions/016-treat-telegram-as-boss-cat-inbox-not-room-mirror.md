# ADR-016: Treat Telegram as a Boss Cat Inbox, Not a Room Mirror

> Model Telegram as one Boss Cat inbox that can route into many internal Cats
> Chat rooms instead of trying to mirror all room traffic into one transport
> transcript.

## Status

Accepted

## Context

`cats` is now making `Boss Cat` the visible public orchestrator identity,
and Telegram is the first planned external bot channel behind that identity.

That creates a structural tension:

- Telegram private chat with one bot is effectively one visible thread
- `Cats Chat` is room-first and topic-first
- users should be able to open many separate topic rooms in `Recents`
- `Boss Cat` should be able to coordinate multiple Cats across those rooms

If we treat one Telegram thread as one canonical `Cats Chat` room, several
problems appear quickly:

- unrelated topics collapse into one mixed transcript
- multi-Cat room work becomes hard to follow
- `Recents` stops representing real topic rooms
- Telegram becomes the accidental source of truth for room structure

We also reviewed Manus' recent `Agents` launch as a market reference. Manus
appears to treat Telegram as an external agent entrypoint exposed via a
top-level `Agents` surface, not as a direct mirror of all chat rooms.
That pattern is useful, but `cats` has a stronger room-native product
direction and should not flatten its multi-room model into one transport
thread.

## Decision

`cats` will treat Telegram as a `Boss Cat` inbox transport, not as a room
mirror.

1. One Telegram bot thread represents one operator-to-`Boss Cat` inbox.
   - it is an external transport conversation
   - it is not the canonical home of all multi-topic work

2. `Cats Chat` rooms remain the canonical product units for topic-based work.
   - `Recents` continues to represent real internal rooms
   - one Telegram inbox may relate to many rooms over time

3. `Boss Cat` is responsible for routing Telegram messages.
   - direct reply in Telegram when a request is simple
   - continue an existing internal room when the topic clearly matches
   - propose or create a new room when the work deserves its own track

4. When `Boss Cat` opens a new room from Telegram, that room becomes visible in
   `Cats Chat Recents`.
   - from the operator's point of view, a new multi-Cat chat simply appears
   - the room may already contain assigned Cats selected by `Boss Cat`

5. Telegram should receive summaries, approvals, clarifications, and milestone
   updates rather than full room mirroring by default.
   - worker Cats remain internal room participants
   - they do not become separate Telegram senders

6. Room creation from Telegram should start conservatively.
   - the first slice should prefer proposal and confirmation for new room
     creation when the topic is not obvious
   - later slices may allow more autonomous room creation behind operator
     policy

7. The product may expose a future top-level `Agent` surface for transport
   inboxes and bot-channel management.
   - that surface is parallel to, not a replacement for, room-based `Cats Chat`
   - this ADR fixes the model direction, not the final navigation UI

8. The current single-`Boss Cat` rule remains a product simplification, not a
   permanent architectural cap.
   - today, one `cats` environment still exposes one default public
     `Boss Cat`
   - future slices may allow multiple public `Boss Cat` identities
   - each additional public `Boss Cat` should own its own transport inbox and
     bot binding rather than sharing one ambiguous Telegram identity

## Consequences

### Positive

- Telegram stays clean as one personal entry thread with `Boss Cat`.
- `Cats Chat` keeps a clear topic-room mental model.
- `Boss Cat` can create or continue multiple rooms without pretending Telegram
  itself has many rooms.
- Multi-Cat work remains inspectable in canonical room transcripts instead of a
  compressed transport log.
- The same model can extend to LINE and similar channels later.

### Negative

- The system must track routing between one transport inbox and many internal
  rooms.
- `Boss Cat` will need ambiguity-handling behavior for "is this a new topic or
  the previous room?"
- Product surfaces must explain room creation and room references clearly so the
  operator understands where work is happening.

### Neutral

- This ADR does not require shipping a full `Agent` tab immediately.
- This ADR does not decide exact room-title generation rules.
- This ADR does not require Telegram to expose internal trace or activity logs.
- This ADR leaves room for future multi-`Boss Cat`, multi-bot expansion as long
  as bot bindings and inbox ownership stay explicit.

## Alternatives Considered

### Alternative 1: Treat the Telegram thread as one canonical room

- **Pros**: Simple initial mapping; fewer routing records
- **Cons**: Topic sprawl, poor multi-Cat readability, weak fit for `Recents`
- **Why rejected**: `cats` is explicitly room-first

### Alternative 2: Mirror every internal room back into the same Telegram thread

- **Pros**: User never has to leave Telegram for updates
- **Cons**: One transport transcript becomes noisy, ambiguous, and hard to
  search; worker activity pollutes the owner-facing channel
- **Why rejected**: transport summary is useful; full room mirroring is not

### Alternative 3: Open a separate Telegram thread per room

- **Pros**: Strong topic separation in theory
- **Cons**: Does not match the practical one-bot private-chat constraint; hard
  to manage from a single personal Telegram relationship
- **Why rejected**: the transport channel does not naturally offer room-native
  structure here

### Alternative 4: Keep Telegram as a thin shortcut that never creates rooms

- **Pros**: Smaller scope
- **Cons**: wastes the orchestrator's ability to structure work and prevents
  Telegram from becoming a serious front door
- **Why rejected**: `Boss Cat` should be able to create and route real work

## References

- [ADR-011](./011-model-primary-orchestrator-as-visible-cat.md)
- [ADR-014](./014-freeze-parallel-delivery-boundaries-for-provider-telegram-and-chat-workstreams.md)
- [ADR-015](./015-adopt-cat-sleep-wake-lifecycle-for-chat-sessions.md)
- [SPEC-014](../specs/SPEC-014-telegram-boss-cat-relay-mvp.md)
- [SPEC-016](../specs/SPEC-016-chat-session-sleep-wake-lifecycle.md)
- [Architecture](../architecture.md)
- Manus official reference:
  - https://manus.im/blog/manus-agents-telegram
  - https://help.manus.im/en/articles/14033617-how-do-i-set-up-and-use-manus-agents-in-telegram

---

*Accepted: 2026-03-19*
*Accepted by: user direction captured through Codex*


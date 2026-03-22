# ADR-027: Adopt Chat-First Information Architecture with a Default Boss Cat

> Keep `Cats Chat` centered on topic-based chats and visible Cats, while
> avoiding a registry-first onboarding barrier.

## Status

Accepted

## Date

2026-03-22

## Context

`Cats Chat` needs to serve two valid product expectations at the same time:

- a familiar chat UX where `Recents` looks and feels like Claude or ChatGPT
- a richer Cats model where named Cats, direct Cat chats, and household-style
  multi-Cat chats are first-class

The current planning direction already established several important pieces:

- `Boss Cat` is a visible product role rather than a hidden backend identity
- direct Cat chat is a valid first-class mode
- Telegram is a transport inbox model, not a room mirror
- contextual `Add cat` is the main chat-time action, while the reusable
  registry lives under `Settings > Cats`

What remained unclear was the top-level information architecture:

- should the product begin as an anonymous neutral assistant and reveal Cats
  later?
- should users be forced to create Cats before they can chat?
- should sidebar navigation be organized around Cats or around chats?
- how should direct Cat chat, multi-Cat chat, and topic-based recents coexist?

The product name is already `Cats Chat`. Hiding `Cat` language is unnecessary.
The actual risk is forcing users into Cat administration before they have a
reason to care.

## Decision

`cats` will use a chat-first information architecture with an always-available
default `Boss Cat`.

1. `Chat` is the primary navigation unit.
   - `Recents` remains topic-first
   - each recent item still represents one chat/session, not one Cat or one
     participant set

2. `Cat` remains an explicit first-class product concept.
   - the product does not disguise Cats as a generic "assistant" layer
   - users do not need to pre-build a Cat registry before first use

3. The product auto-provisions one neutral default `Boss Cat` for first use.
   - first-run setup should not require naming, selecting, or designing a Cat
   - the initial `Boss Cat` may start unnamed or minimally personalized
   - users can rename it, personalize it, or replace it later

4. Any Cat may later be assigned as the global `Boss Cat`.
   - the global `Boss Cat` becomes the default lead for new chats
   - existing chats do not need to be retroactively rewritten when the global
     `Boss Cat` changes

5. `Direct Cat Chat` is a first-class mode.
   - any Cat may have its own one-to-one chat thread
   - `Add cat to chat` and `Chat with this cat` are distinct actions

6. Multi-Cat chats are allowed, but each chat still has one lead Cat.
   - the default lead is the current `Boss Cat` unless the chat explicitly uses
     another lead
   - group chats should default to one primary reply voice rather than all Cats
     replying every turn

7. `Recents` remains the main sidebar surface, but chat items show Cat avatar
   markers.
   - single-Cat chats show one avatar
   - multi-Cat chats show stacked avatars
   - avatars are participant markers, not the primary sorting key

8. A lightweight `My Cats` roster should remain visible in the sidebar.
   - it should still show the current `Boss Cat` even when that is the only Cat
   - it exists for quick entry into direct chats and quick switching
   - selecting a Cat there should reopen an existing direct thread when one
     exists, or create the canonical direct thread immediately when it does not
   - Cat-owned transport markers such as Telegram bindings may be shown there
   - it is not the full management registry
   - the reusable registry and full Cat management remain under `Settings > Cats`

9. Sidebar organization uses one `View` mode control rather than separate
   `group by` and `sort by` controls in the first slice.
   - initial modes: `Latest`, `By Cat`, `By Chat Type`
   - exact-participant grouping is deferred

10. Telegram bot bindings may front different Cats.
    - the current `Boss Cat` remains the default public transport identity
    - additional Cats may also own their own Telegram bot bindings
    - each bot binding owns its own inbox scope
    - Telegram remains a transport surface, not the canonical internal room
      model

## Consequences

### Positive

- New users can begin chatting immediately without understanding Cat registry
  mechanics.
- The product remains visibly and honestly about Cats from the first screen.
- Topic-based recents stay familiar for mainstream chat usage.
- Named Cats, direct Cat chats, and household-style multi-Cat chats remain
  first-class rather than being bolted on later.
- Telegram mapping becomes clearer because transport identity is Cat-owned and
  explicit instead of being one anonymous assistant.

### Negative

- The product now needs explicit rules for global `Boss Cat`, per-chat lead Cat,
  direct chats, and multi-Cat chats.
- Sidebar IA becomes more nuanced because `Recents`, `My Cats`, contextual
  `Add cat`, and `Settings > Cats` all coexist for different reasons.
- Copy and state transitions must avoid implying that changing the global
  `Boss Cat` rewrites older chats.

### Neutral

- This ADR does not remove the need for a full `Settings > Cats` management
  surface.
- This ADR does not require all multi-Cat orchestration behavior to ship in the
  first UI slice.
- This ADR does not require Telegram direct-entry for every Cat to ship in the
  first transport slice.

## Alternatives Considered

### Alternative 1: Require users to create Cats before first chat

- **Pros**: pure Cats-first story
- **Cons**: creates onboarding friction before users understand the product
- **Why rejected**: the first message should not depend on a registry setup task

### Alternative 2: Start with an anonymous neutral assistant and hide Cats

- **Pros**: familiar to mainstream chat users
- **Cons**: weakens the product identity and makes later Cat behavior feel like
  a second product
- **Why rejected**: `Cats Chat` should speak in Cat language from the start

### Alternative 3: Make Cats the primary sidebar navigation instead of chats

- **Pros**: emphasizes persona relationships
- **Cons**: makes finding prior topics harder and drifts away from established
  chat-product expectations
- **Why rejected**: most users return to a previous topic, not to a registry row

### Alternative 4: Group recents by exact participant set

- **Pros**: sounds attractive for household-style chats
- **Cons**: unstable when participants change and harder to scan than flat
  topic-based recents
- **Why rejected**: keep the first slice simple and chat-first

## References

- [ADR-009](./009-prefer-chat-contextual-cat-entry-and-settings-registry.md)
- [ADR-011](./011-model-primary-orchestrator-as-visible-cat.md)
- [ADR-016](./016-treat-telegram-as-boss-cat-inbox-not-room-mirror.md)
- [ADR-017](./017-allow-direct-cat-chat-and-move-routing-into-system-layer.md)
- [ADR-024](./024-separate-explicit-mentions-from-dynamic-room-workflow.md)
- [ADR-028](./028-allow-multiple-public-bot-bindings-with-one-boss-cat.md)
- [SPEC-007](../specs/SPEC-007-chat-contextual-cat-entry.md)
- [SPEC-012](../specs/SPEC-012-first-run-setup-wizard-and-boss-cat-bootstrap.md)
- [SPEC-018](../specs/SPEC-018-direct-cat-chat-and-conversation-routing-layer.md)

---

*Accepted: 2026-03-22*
*Decision makers: user + Codex*

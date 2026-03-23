# SPEC-027: Chat-First Information Architecture and Default Boss Cat

Status: Approved

> Revision note (2026-03-23): ordinary `Recents` composer semantics are now
> refined by [SPEC-030](./SPEC-030-composer-scoped-lead-cat-and-boss-auto-helper-semantics.md).
> This accepted spec still governs chat-first IA, `My Cats`, direct lanes, and
> Cat-led chat behavior, while `+ New Chat` for normal `Recents` threads now
> follows the solo-composer refinement in `SPEC-030`.

## Summary

Define the product-facing UI model for `Cats Chat` so it can support both:

- familiar topic-based chat usage
- named Cats, direct Cat chats, and household-style multi-Cat chats

The key rule is:

- `Chat` is the primary navigation unit
- `Cat` remains an explicit first-class participant layer
- the product starts with a neutral default `Boss Cat` instead of forcing Cat
  setup before first use

## Goals

- Keep `Recents` familiar and topic-first
- Keep Cats explicit instead of disguising them as a generic assistant
- Avoid making Cat setup a first-run barrier
- Make `Direct Cat Chat` a first-class experience
- Support multi-Cat chats without turning the product into a noisy agent console
- Keep Telegram aligned to explicit Cat-owned public identities, with
  `Boss Cat` as the default

## Non-Goals

- Finalize `Work` or `Code` UI
- Ship full multi-Cat orchestration policy in this spec
- Expose exact internal system-layer routing state in the default main thread UI
- Support Telegram direct-entry for every Cat in the first slice
- Add exact-participant grouping as a first-slice sidebar mode

## Product Rules

1. Every chat has at least one visible Cat participant.
   - Revision note: for ordinary `Recents` threads, `SPEC-030` supersedes this
     assumption during the initial solo-composer phase before a lead Cat is
     chosen.
2. The product always has one current global `Boss Cat`.
3. First-run setup auto-provisions a neutral default `Boss Cat` if no Cat exists.
4. Users may later rename that Cat, personalize it, or assign another Cat as
   the global `Boss Cat`.
5. `Recents` remains topic-first even when chats contain the same Cats.
6. `Add cat to chat` is not the same action as `Chat with this cat`.
7. Group chats may contain multiple Cats, but each chat still has one lead Cat.
8. Telegram bot bindings may target different Cats, while the current
   `Boss Cat` remains the default public transport identity.
9. If the current `Boss Cat` has not been explicitly named yet, UI surfaces
   should use `Boss Cat` as the fallback display name.
10. `My Cats` direct chats are Cat-scoped in-place private lanes.
    They are not normal `Recents` threads and should not create a persisted
    chat/channel record just because the user opened them.

## Progressive Disclosure Model

### Stage 0: Default Boss Cat Only

The product should still feel immediately familiar:

- sidebar shows `+ New Chat`, `Recents`, and `Settings`
- sidebar still shows a lightweight `My Cats` presence with the current
  `Boss Cat`, even when it is the only Cat
- the environment already has a default `Boss Cat`
- the fallback display name is `Boss Cat` until the user renames it
- new `Recents` threads may begin in solo composer mode without a visible Cat
  participant, while `My Cats` still exposes the current `Boss Cat`

The user should be able to ignore Cat customization entirely and still use the
product normally.

### Stage 1: Named Boss Cat

Once the user names or personalizes the default `Boss Cat`:

- the Cat name should appear in chat headers and recent-item participant meta
- a lightweight sidebar Cat presence may appear
- the product may prompt `Rename your Boss Cat` or `Personalize your Boss Cat`
  after early successful chats, but it must remain optional
- if there is still only one Cat, new chats effectively remain single-Cat chats
  with that named `Boss Cat`

### Stage 2: Multiple Cats

Once the user adds more Cats:

- the sidebar may show a lightweight `My Cats` roster
- direct Cat chats become easier to discover
- `+ New Chat` should default to the current `Boss Cat`, while still allowing
  the user to switch the lead Cat or start a group chat

## Sidebar Information Architecture

### Primary Navigation

The main sidebar should prioritize:

1. `+ New Chat`
2. `Recents`
3. `Settings`

`Recents` is the primary return surface because users usually look for a prior
topic, not for a registry item.

### Lightweight `My Cats` Roster

The sidebar should show a lightweight `My Cats` roster, starting with the
current `Boss Cat` even when it is the only Cat.

`My Cats` is:

- a quick-access roster
- a Cat-identity and private-lane launcher
- a lightweight visibility surface for who exists in the household
- an acceptable place to show transport ownership markers such as Telegram bot
  bindings

`My Cats` is not:

- the full registry management surface
- the place for detailed editing, archive, or system administration
- part of the `Recents` thread list

Those remain under `Settings > Cats`.

If only one Cat exists, the roster may stay visually minimal, but the current
`Boss Cat` should still remain visible there.

### View Mode

The sidebar should use one `View` control rather than separate `group by` and
`sort by` controls in the first slice.

Supported initial modes:

- `Latest`
  - default
  - flat recent list by most recent activity
- `By Cat`
  - groups chats by lead Cat
  - each group and each chat within the group uses recent activity ordering
- `By Chat Type`
  - groups by `Direct`, `Group`, and `Boss Chat`

Deferred:

- exact-participant grouping
- independent sort controls

## Recents List

Each recent item should represent one chat thread.

Even if two threads contain the same Cats, they remain separate recent items if
their session/thread identity differs.

Each recent item should show:

- topic/title as the primary label
- Cat avatar markers as secondary participant metadata
- stacked avatars for multi-Cat chats
- a small `Boss Cat` marker only when that distinction adds value, not as a
  noisy default badge everywhere

## New Chat Flow

### If only the default Boss Cat exists

`SPEC-030` now refines ordinary `Recents` new-chat behavior so that a normal
thread may begin in solo composer mode before a visible lead Cat is chosen.

The environment may still have only one configured `Boss Cat`, and explicit
Boss-led or Cat-led chats remain valid, but the default `Recents` path no
longer needs to begin as a visible Cat-led thread.

### If multiple Cats exist

`SPEC-030` now refines ordinary `Recents` new-chat behavior so that:

- a thread may begin in solo composer mode by default
- adding one Cat upgrades the thread into a Cat-led chat
- choosing another single Cat or starting a group chat remains valid

The goal is to keep the default path simple while still allowing multi-Cat chat
creation without opening the registry first.

## Direct Cat Chat

`Direct Cat Chat` is a first-class chat mode.

It should be reachable from:

- clicking a Cat in `My Cats`
- selecting a Cat during `+ New Chat`
- a `Chat privately` action from other chat surfaces

Direct Cat Chat semantics:

- `participant_cat_ids = [selected cat]`
- `lead_cat_id = selected cat`
- unmentioned turns default to that Cat
- the main header should show the selected Cat clearly
- clicking a Cat in `My Cats` resolves to that Cat's private lane
- that private lane is an in-place direct-chat surface under `My Cats`
- opening it does not create a new persisted chat/channel or `Recents` item
- `/new?cat=<catId>` may still exist as an internal draft/deep-link route, but
  it should not materialize a normal persisted `Recents` thread merely because
  the lane was opened from `My Cats`

## Group Chat

Group chats are allowed when the user intentionally includes multiple Cats.

Group chat semantics:

- `participant_cat_ids` contains multiple Cats
- `lead_cat_id` is still singular
- the lead Cat owns the default main reply path
- other Cats should speak when explicitly addressed, invited, or clearly needed

The first slice should avoid a noisy "everyone replies every turn" feel.

## Chat Header

### Direct Chat

The header should show:

- Cat avatar
- Cat name
- a short subtitle or relationship line
- settings/details access for that Cat or chat

### Group Chat

The header should show:

- stacked avatars
- the combined chat title or participant summary
- a subtitle such as `Boss Cat: <name>` or `Lead Cat: <name>`

## Add Cat vs Chat With Cat

These are different actions and should remain different in copy and behavior.

### `Add cat to chat`

- modifies the current chat's participant set
- keeps the current thread
- does not create a new direct chat

### `Chat with this cat`

- opens that Cat's private lane
- keeps the operator in that Cat's in-place direct lane
- does not create a normal persisted chat/channel or `Recents` item as a side
  effect
- does not silently add the Cat to the currently open thread

## Boss Cat Assignment

Users may assign any Cat as the global `Boss Cat`.

That change should affect:

- the default Cat for new chats
- the default public transport identity
- other places where the product needs a default lead Cat

That change should not automatically rewrite older chats.

## Setup Wizard

The first-run setup should remain minimal.

Required setup steps:

1. welcome
2. user name / owner name, with optional Boss Cat rename
3. provider/runtime setup or readiness
4. enter the app

Provider/model selection still belongs in setup. What setup should avoid is
forcing Cat naming or persona design before first use.

The setup wizard should not require:

- creating a custom Cat
- naming the first Cat
- designing memory/persona before first use

If no Cat exists after setup readiness is complete, the system should
auto-provision a neutral default `Boss Cat` using the provider/model target
selected during setup, or the current environment default if setup chose a
single default runtime target.

After setup completes, the product should enter the normal `/new` draft route.
That draft route uses the current `Boss Cat` as the default visible entrypoint,
but setup should not auto-create or auto-select a first persisted chat thread.

After entry, the product may gently offer:

- `Rename your Boss Cat`
- `Add another Cat`
- `Personalize memory`

Those are optional post-setup enhancements, not setup blockers.

## Telegram Direction

Telegram should map to explicit Cat-owned bot bindings.

Initial behavior:

- the default Telegram bot may still front the current `Boss Cat`
- additional Cats may later have their own Telegram bots
- the binding belongs to the Cat identity shown in `My Cats`, not to one
  persisted `Recents` thread
- a Cat-bound bot should feel like talking to that Cat directly
- when another Cat speaks inside a bot-bound thread, the product may label that
  reply explicitly
- Telegram does not expose the full internal room topology or every internal
  participant by default

This keeps Telegram consistent with [ADR-016](../decisions/016-treat-telegram-as-boss-cat-inbox-not-room-mirror.md)
and [ADR-028](../decisions/028-allow-multiple-public-bot-bindings-with-one-boss-cat.md),
while still allowing the app itself to support direct chats and group chats
more richly.

## Data Model Assumptions

The UI direction assumes product state can represent at least:

- a global `bossCatId`
- per-chat `participantCatIds`
- per-chat `leadCatId`
- per-chat mode such as `boss`, `direct`, or `group`

This spec does not require those exact field names to be the final API, but the
concepts must exist.

## Implementation Note

The current implementation is still largely `channel`- and
`channel-assignment`-based.

- current persisted state and APIs still center on channel records plus cat
  assignment records
- `leadCatId`, explicit per-chat mode, and participant-first room metadata are
  target concepts, not fully landed source-of-truth fields yet
- shipping this spec will require an incremental migration layer rather than a
  single global rename from `channel` to `chat`

In other words, this spec defines the target product model and UI behavior, not
the claim that the underlying store has already been fully renamed or migrated.

## Acceptance Criteria

- A new user can begin chatting without creating or naming a Cat first.
- The product still visibly reads as `Cats Chat`, not as a disguised anonymous
  assistant.
- `Recents` remains topic-first and each item shows Cat avatar markers.
- A user can open a direct private chat with a non-`Boss Cat`.
- Opening a Cat from `My Cats` does not create a `Recents` item.
- `Add cat to chat` and `Chat with this cat` behave differently and clearly.
- A user can assign a different Cat as the global `Boss Cat`.
- Sidebar view uses a single `View` mode control with `Latest`, `By Cat`, and
  `By Chat Type`.
- Telegram remains aligned to explicit Cat-owned bot identities with `Boss Cat`
  as the default.

## References

- [ADR-027](../decisions/027-adopt-chat-first-information-architecture-with-default-boss-cat.md)
- [ADR-028](../decisions/028-allow-multiple-public-bot-bindings-with-one-boss-cat.md)
- [ADR-017](../decisions/017-allow-direct-cat-chat-and-move-routing-into-system-layer.md)
- [ADR-016](../decisions/016-treat-telegram-as-boss-cat-inbox-not-room-mirror.md)
- [SPEC-007](./SPEC-007-chat-contextual-cat-entry.md)
- [SPEC-012](./SPEC-012-first-run-setup-wizard-and-boss-cat-bootstrap.md)
- [SPEC-018](./SPEC-018-direct-cat-chat-and-conversation-routing-layer.md)
- [SPEC-030](./SPEC-030-composer-scoped-lead-cat-and-boss-auto-helper-semantics.md)

---

*Last updated: 2026-03-23*

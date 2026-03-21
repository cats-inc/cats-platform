# SPEC-016: Chat Session Sleep/Wake Lifecycle

Status: Approved

## Summary

`cats` should stop making chat-session lifecycle feel like a hidden runtime
implementation detail.

The product will describe chat participation using a cat-native model:

- Cats can be `Sleeping`, `Waking up`, or `Awake`
- `Boss Cat` is the visible one who wakes other Cats into a room when needed
- entering a persisted chat should usually mean the `Boss Cat` is already awake
  or in the process of waking up
- sleeping is a normal lifecycle state used for idle cleanup and active-chat
  limits, not a failure

This spec defines the user-facing behavior, routing expectations, and first
configuration rules for sleep/wake lifecycle across Boss Cat chats and multi-Cat
chats.

## Goals

- Make chat presence understandable in product language instead of raw runtime
  jargon.
- Align visible room-entry behavior with what users expect from a chat app.
- Ensure newly added Cats are meaningfully available instead of being only
  visually assigned.
- Create a stable foundation for active-chat limits and idle sleep behavior.
- Keep multi-chat, multi-Cat execution compatible with the current per-chat
  session model.

## Non-Goals

- Designing the full Activity / Trace panel in this slice
- Shipping Telegram relay lifecycle UI in this slice
- Adding per-Cat custom active-chat limits in the first implementation slice
- Turning session lifecycle into a developer-facing connection dashboard
- Replacing the `Boss Cat` terminology already accepted in
  [SPEC-011](./SPEC-011-primary-orchestrator-chat-entry-and-trace-separation.md)

## User Stories

- As an operator, I want opening a real chat room to feel like the `Boss Cat` is
  already there, so the product matches the chat metaphor.
- As an operator, I want a newly added Cat to visibly wake up and become
  available, so "joined the chat" means something real.
- As an operator, I want older idle chats to sleep automatically without losing
  history.
- As an operator, I want the product to explain this behavior using cat-native
  language I can understand quickly.

## Requirements

### Functional Requirements

- `/new` shall remain a draft surface and shall not require any Cat to wake
  before a real chat exists.
- Completing setup and landing in the first persisted chat shall trigger a
  background wake for `Boss Cat`.
- Opening an existing persisted chat shall trigger a background wake for
  `Boss Cat` if that chat does not already have an awake Boss Cat session.
- `Boss Cat` greeting content shown as a normal chat message shall not imply a
  fully fake presence state. If the transcript presents the greeting as a live
  Cat utterance, the wake flow must already be underway.
- Sending the first message in a newly created chat shall wake `Boss Cat` before
  routing work, but this shall no longer be the only time `Boss Cat` is allowed
  to wake.
- Adding another Cat to an already active chat shall immediately start a wake
  flow for that Cat.
- Multi-Cat routing shall not fail only because a newly joined Cat has not yet
  been explicitly activated by a separate manual step.
- If a routed target Cat is sleeping when the product needs it, the system shall
  wake that Cat and continue the routing flow instead of forcing the operator to
  discover a hidden activation prerequisite.
- Sleep/wake state shall be tracked per chat per Cat.
- The product shall support at least these user-visible states:
  - `Awake`
  - `Waking up`
  - `Sleeping`
- The first settings slice shall support:
  - `Boss Cat active chat limit`
  - `Other Cats active chat limit`
  - automatic sleep for older idle chats when limits are exceeded
- When active-chat limits are exceeded, the product shall put the oldest
  eligible idle chat sessions to sleep instead of refusing new wake requests.
- Chats that are currently foregrounded, currently responding, or holding
  unfinished operator-critical work shall not be chosen first for automatic
  sleep.
- Sleeping a Cat shall preserve:
  - transcript history
  - Cat assignment
  - chat membership
  - chosen execution target
- The following actions shall explicitly put sessions to sleep:
  - delete chat
  - remove Cat from chat
  - change execution target for that chat participant
  - reset setup / wipe workspace state
- The following actions shall not immediately put a chat to sleep on their own:
  - browser refresh
  - navigating to another page
  - opening `/new`
  - entering Settings

### Non-Functional Requirements

- Product copy should prefer cat-native language over raw runtime session
  terminology in user-facing surfaces.
- The implementation should preserve the existing per-chat isolation model so one
  chat does not accidentally leak runtime state into another.
- Session lifecycle should remain compatible with the current `cats ->
  cats-runtime` boundary.
- The first slice should optimize for predictable behavior over maximum
  configurability.

## Design Overview

```text
/new
  -> draft only
  -> no Cat required to be awake yet

Persisted chat entry
  -> Boss Cat wakes in background
  -> chat can show "Waking up" or "Awake"

Add Cat to active chat
  -> Cat joins
  -> Cat starts waking immediately

Route work to Cat
  -> if awake: send now
  -> if sleeping: wake, then send

Too many active chats
  -> put oldest eligible idle sessions to sleep
  -> keep transcript + membership intact
```

### Session Scope Rule

One active runtime connection is scoped to:

- one Cat
- in one chat
- for one execution target

That means a single `Boss Cat` may be awake in multiple chats at the same time,
subject to active-chat limits.

### Product Terminology Rule

- `Awake` = active runtime session exists for this Cat in this chat
- `Sleeping` = no active runtime session, but the Cat still belongs to the chat
- `Waking up` = wake request is running
- `Put to sleep` = close the session but keep the chat relationship

### UI Direction

#### Draft vs Real Chat

- `/new` should remain the only clearly "not yet awake" chat-entry surface.
- once a real chat exists, entering it should make the visible `Boss Cat` feel
  present rather than dormant

#### Boss Cat Presence

The product should prefer one of these UI patterns:

- header status: `Boss Cat awake`
- header status: `Boss Cat waking up`
- subtle system note or activity state when waking takes longer than expected

The product should not require the operator to think in terms of session IDs,
leases, or manual activation buttons.

#### Multi-Cat Presence

When another Cat is added to a chat, the UI should reflect a progression like:

- `Designer joined`
- `Designer is waking up`
- `Designer is awake`

The Cat may still reply through the existing chat transcript model, but its
availability should be represented honestly.

## Dependencies

- [ADR-011](../decisions/011-model-primary-orchestrator-as-visible-cat.md)
- [ADR-015](../decisions/015-adopt-cat-sleep-wake-lifecycle-for-chat-sessions.md)
- [SPEC-011](./SPEC-011-primary-orchestrator-chat-entry-and-trace-separation.md)
- [SPEC-012](./SPEC-012-first-run-setup-wizard-and-boss-cat-bootstrap.md)

## Open Questions

- What exact idle timeout should the first slice use before a chat becomes
  eligible for automatic sleep?
- Should the first wake status live in the chat header, activity panel, or both?
- Should background wake on old-chat entry be eager for all assigned Cats, or
  only for `Boss Cat` plus routed specialists?
- In the first slice, should the system route after waiting for a sleeping Cat
  to wake, or should it show a visible intermediate "waking" state first?

## References

- [ADR-015](../decisions/015-adopt-cat-sleep-wake-lifecycle-for-chat-sessions.md)
- [PLAN-015](../plans/PLAN-015-chat-session-sleep-wake-lifecycle.md)
- [Architecture](../architecture.md)
- [Terminology](../terminology.md)

---

*Last updated: 2026-03-19*

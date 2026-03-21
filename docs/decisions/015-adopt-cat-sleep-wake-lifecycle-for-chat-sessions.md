# ADR-015: Adopt Cat Sleep/Wake Lifecycle for Chat Sessions

> Use a cat-native sleep/wake model for chat session lifecycle instead of
> exposing runtime activation semantics directly in the product.

## Status

Accepted

## Context

`cats` now has a clear `Boss Cat` entry identity, but chat-session behavior
is still explained in low-level runtime terms such as "activate" and
"sessionId".

That creates product confusion:

- users see a chat room and assume the visible Cat is already present
- `setup wizard`, `+ New Chat`, and existing-chat entry currently look similar
  in the UI but behave differently under the hood
- adding another Cat to a chat currently looks like "they joined", even if no
  runtime session has actually started yet
- connection limits and idle cleanup will be difficult to explain if the
  product only exposes technical session language

The product already has a strong theme: Cats sleep, wake up, and get called
into a room when needed. That metaphor is both intuitive and operationally
useful.

We also need a stable rule for how many connections can exist when one `Boss
Cat` is reused across many chats. The current implementation is effectively
"one orchestrator session per chat", but the product does not yet describe that
clearly.

## Decision

`cats` will describe chat-session lifecycle using a `sleep / wake` product
model layered on top of runtime sessions.

1. Product-facing lifecycle language will use cat-native terms.
   - `Awake`: this Cat currently has an active runtime session in this chat
   - `Sleeping`: this Cat is still part of the chat, but its runtime session is
     not currently active
   - `Waking up`: a wake request is in progress
   - `Put to sleep`: the product intentionally closes the session while keeping
     the chat relationship

2. Sleep/wake state is scoped per chat, not globally per Cat.
   - one Cat may be awake in Chat A and sleeping in Chat B
   - one Cat may be awake in multiple chats at the same time, subject to active
     chat limits

3. The visible product story is that `Boss Cat` wakes other Cats when needed.
   - in UI copy and operator mental model, the `Boss Cat` is the one calling
     others into the room
   - in engineering terms, the system layer still performs the actual runtime
     activation

4. Entering a persisted chat should imply presence, not absence.
   - opening an existing chat should make `Boss Cat` awake or visibly waking
   - completing setup and landing in the first chat should also wake `Boss Cat`
   - `/new` is the exception because it is a draft page, not a persisted room

5. Adding a Cat to an active chat means it should actually start joining the
   room.
   - the product should not show a Cat as joined while it remains silently
     unconnected
   - the Cat may appear as `Waking up` first, but the wake flow should begin
     immediately

6. Sleep is a first-class product behavior, not an error state.
   - the app may put older idle chats to sleep to stay within active-chat limits
   - sleeping does not remove the Cat from the chat or delete transcript state
   - revisiting the chat or routing work to that Cat should wake it again

7. The first configuration surface for limits should be simple.
   - first slice: one limit for `Boss Cat` active chats and one limit for
     `Other Cats`
   - future slice: optional per-Cat overrides

## Consequences

### Positive

- The UI can explain runtime behavior in natural product language.
- The difference between `/new` and a real chat room becomes easier to explain.
- Adding a Cat to a chat gains a clear visible lifecycle: sleeping, waking,
  awake.
- Future idle cleanup and active chat limits become understandable to
  non-technical users.
- The product can preserve the idea that `Boss Cat` coordinates the room
  without turning the user into a runtime operator.

### Negative

- The implementation must keep product-facing sleep/wake vocabulary aligned with
  lower-level runtime state.
- Wake policies now affect entry routing, join flows, and connection cleanup, so
  the implementation touches multiple layers.
- The app needs explicit limits and reconciliation rules or the metaphor will
  drift from real behavior.

### Neutral

- This ADR does not decide the exact idle-timeout value.
- This ADR does not require per-Cat custom limits in the first slice.
- This ADR does not replace the existing `Boss Cat` / `Primary Orchestrator
  Cat` model; it extends it with lifecycle semantics.

## Alternatives Considered

### Alternative 1: Keep using raw activation/session language in the product

- **Pros**: Closest to the implementation
- **Cons**: Hard to understand; breaks the product tone; weak for future session
  management settings
- **Why rejected**: The product already has a better native metaphor

### Alternative 2: Treat every visible Cat as always online

- **Pros**: Simple story
- **Cons**: False once active-chat limits and idle cleanup exist
- **Why rejected**: The product needs an honest lifecycle

### Alternative 3: Hide lifecycle entirely and silently reconnect whenever needed

- **Pros**: Minimal UI work
- **Cons**: Users cannot understand why a newly joined Cat is not responding or
  why old chats stop holding active runtime resources
- **Why rejected**: Silent background behavior will become confusing as the
  product scales

## References

- [ADR-011](./011-model-primary-orchestrator-as-visible-cat.md)
- [SPEC-011](../specs/SPEC-011-primary-orchestrator-chat-entry-and-trace-separation.md)
- [SPEC-012](../specs/SPEC-012-first-run-setup-wizard-and-boss-cat-bootstrap.md)

---

*Accepted: 2026-03-19*
*Accepted by: user direction captured through Codex*

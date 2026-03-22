# ADR-017: Allow Direct Cat Chat and Move Routing into the System Layer

> Keep `Boss Cat` as the default entry identity while also allowing explicit
> one-to-one Cat chats, and make mention/target resolution a system-layer
> responsibility instead of a prompt-only convention.

## Status

Accepted

## Context

`cats` has already decided that `Boss Cat` is the default visible public
entry identity for new conversations. That solves the "who am I talking to?"
question for the main product entry flow.

However, the product also needs a second valid mode:

- sometimes the operator does not want orchestration first
- sometimes they want to talk directly to one specific Cat
- that interaction should feel closer to using a UI-native CLI session with a
  chosen specialist

At the same time, current routing behavior is too soft in the wrong places:

- explicit `@mentions` are parsed in code today
- but too much turn-routing behavior still depends on prompt instructions such
  as "respect explicit @mentions" and "mention teammates with @Name"
- that makes routing behavior fragile, especially once `Boss Chat`,
  `Direct Cat Chat`, and transport inboxes all coexist

The product needs a stable routing model that does not depend on model
compliance for basic target resolution.

## Decision

`cats` will support both `Boss Chat` and `Direct Cat Chat`, and conversation
routing will be owned by a shared system-layer routing model.

1. `Boss Cat` remains the default product entry identity.
   - `+ New Chat` still defaults to a `Boss Chat`
   - Telegram messages enter through the bound Cat's private lane
     (`direct_cat_chat`), which is the Boss Cat's lane by default

2. The operator may also open a `Direct Cat Chat` with a specific Cat.
   - this is a first-class chat mode, not a hidden workaround
   - the selected Cat becomes the room's lead participant
   - unmentioned turns in that room default to that Cat, not to `Boss Cat`
   - the `My Cats` roster is Cat-lane entry, not automatic room creation
   - selecting a Cat there should reopen an existing direct room when one
     exists, or open a direct `/new` draft when it does not
   - the first send, not the roster click, is what creates a new persisted
     direct room

3. Routing rules are product rules and must live in the system layer.
   - explicit mention parsing
   - participant lookup
   - default target selection
   - unresolved-mention handling
   - wake-before-route behavior
   - mode-specific target resolution

4. Prompt instructions may still shape style and delegation language, but they
   do not own core routing truth.
   - prompts may encourage helpful mention syntax
   - prompts may influence how Cats explain handoffs
   - prompts must not be the only reason a message reaches the correct target

5. The routing layer must be mode-aware.
   - `Boss Chat`: unmentioned turns default to `Boss Cat`
   - `Direct Cat Chat`: unmentioned turns default to the chosen lead Cat
   - Telegram-bound `Direct Cat Chat`: inbound messages default to the bound Cat
     (no separate `transport_inbox` mode needed)

6. `Boss Cat` is no longer the only valid implicit target in the product.
   - it is the default public entry identity
   - it is not a mandatory hop for every conversation

## Consequences

### Positive

- Operators can use `cats` both as an orchestrated room product and as a
  direct specialist-chat UI.
- Direct specialist chats become easier to reason about and closer to the
  mental model of a chosen CLI session.
- Mention and target behavior becomes more predictable across web chat and
  transport entrypoints.
- Future room modes can reuse one routing layer instead of inventing
  prompt-specific behavior per mode.

### Negative

- The app now needs explicit room mode and lead-participant metadata.
- Routing implementation becomes a more formal subsystem instead of scattered
  convenience logic.
- Some current prompt assumptions will need to be demoted from "truth" to
  "presentation guidance."

### Neutral

- This ADR does not remove `Boss Cat` from the product; it narrows its role to
  the default orchestrated entry mode.
- This ADR does not require all direct-chat UI to ship immediately.
- This ADR does not decide the final room-creation affordance labels.

## Alternatives Considered

### Alternative 1: Force every chat through `Boss Cat`

- **Pros**: simpler initial story; fewer room modes
- **Cons**: blocks direct specialist interaction; makes the product less useful
  as a native chat wrapper over real agent sessions
- **Why rejected**: direct Cat access is a valid primary use case

### Alternative 2: Let prompt engineering continue to own routing semantics

- **Pros**: less explicit product-state design
- **Cons**: fragile, inconsistent, and hard to scale across modes
- **Why rejected**: routing is product logic, not model mood

### Alternative 3: Make every room require explicit `@mentions` on every turn

- **Pros**: deterministic
- **Cons**: unnatural for normal chat; too much operator burden
- **Why rejected**: each room should still have a sensible default target

## References

- [ADR-011](./011-model-primary-orchestrator-as-visible-cat.md)
- [ADR-015](./015-adopt-cat-sleep-wake-lifecycle-for-chat-sessions.md)
- [ADR-016](./016-treat-telegram-as-boss-cat-inbox-not-room-mirror.md)
- [SPEC-011](../specs/SPEC-011-primary-orchestrator-chat-entry-and-trace-separation.md)
- [SPEC-016](../specs/SPEC-016-chat-session-sleep-wake-lifecycle.md)
- [SPEC-017](../specs/SPEC-017-telegram-inbox-and-room-routing.md)

---

*Accepted: 2026-03-19*
*Accepted by: user direction captured through Codex*

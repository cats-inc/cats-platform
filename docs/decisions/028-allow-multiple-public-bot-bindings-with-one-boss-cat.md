# ADR-028: Allow Multiple Public Bot Bindings with One Boss Cat

> Keep one global `Boss Cat` role for default leadership, while allowing
> multiple external bot identities to front different Cats.

## Status

Accepted

## Date

2026-03-22

## Context

`cats` already decided that one environment has one current `Boss Cat`.
That rule is still useful:

- new chats need one default lead Cat
- default orchestration and household leadership should stay understandable
- the product should not present multiple competing "main bosses" by default

However, transport identity has a different requirement.

For companion usage, the product needs to support cases such as:

- one Telegram bot for `將將`
- one Telegram bot for `醜醜`
- possibly another Telegram or LINE bot for a broader family or Boss Cat entry

That means this assumption is too narrow:

- one environment = one public bot identity

The real boundary is:

- one environment = one current `Boss Cat`
- one environment = zero to many public transport bot bindings

Transport identities and household leadership are related, but they are not the
same thing.

## Decision

`cats` will keep one global `Boss Cat` while allowing multiple external bot
bindings.

1. One environment still has exactly one current `Boss Cat`.
   - this remains the default lead for new chats
   - this remains the default orchestrated public identity when no more
     specific transport binding is chosen

2. External bot bindings are many, not one.
   - one Cat may own zero or more public transport bindings
   - one environment may expose multiple Telegram bots and later multiple LINE
     or other transport identities

3. A transport bot binding attaches to one visible Cat identity.
   - the bot's public persona is that Cat
   - the binding owns its own inbox scope, access policy, and conversation
     mapping records

4. A bot-bound Cat does not need to be the global `Boss Cat`.
   - `將將` may be the `Boss Cat`
   - `醜醜` may still have its own Telegram bot identity
   - public bot availability is a transport/persona choice, not proof of being
     the global household lead

5. Transport messages route into the bound Cat's private lane
   (`direct_message`).
   - there is no separate `transport_inbox` channel type
   - each Cat has one private lane that receives both web and transport messages
   - the private lane can optionally bind to Telegram (or not)

6. Each bot binding is a transport property of one Cat's private lane.
   - `將將_bot` and `醜醜_bot` deliver into their respective Cat's private lane
   - they are separate external entrypoints even if they live in the same
     environment

7. The product must separate these concepts cleanly:
   - global `Boss Cat`
   - Cat identity/persona
   - transport bot binding (a property of the Cat, not a separate channel)
   - private lane (the Cat's `direct_message` channel)

## Consequences

### Positive

- Companion use cases become natural instead of being forced through one
  overworked public bot.
- The product can preserve one household `Boss Cat` without blocking
  one-bot-per-Cat companion design.
- Telegram and later LINE bindings become more flexible without multiplying
  the global leadership role.

### Negative

- Transport settings, status, and diagnostics need to handle multiple bot
  bindings instead of one global bot.
- The UI must explain the difference between "Make Boss Cat" and "Create or
  bind a Telegram bot for this Cat."
- Access control and cost policy need to become per-binding rather than purely
  environment-wide.

### Neutral

- This ADR does not require the first shipped Telegram slice to expose all
  multi-bot management UI immediately.
- This ADR does not remove the usefulness of a default Boss Cat Telegram
  binding.
- This ADR does not decide whether one Cat may eventually own multiple bot
  bindings across different platforms or personas, though the model allows it.

## Alternatives Considered

### Alternative 1: Keep one environment-level public bot only

- **Pros**: simpler first implementation
- **Cons**: blocks direct companion bots for multiple Cats
- **Why rejected**: it conflicts with the product's companion direction

### Alternative 2: Treat every public bot as another Boss Cat

- **Pros**: superficially simple language
- **Cons**: collapses household leadership and transport identity into the same
  concept
- **Why rejected**: one household can have one Boss Cat and still many public
  Cat personas

### Alternative 3: Allow multiple bots but route them all through Boss Cat

- **Pros**: preserves one control point
- **Cons**: weakens the feeling of talking directly to `將將` or `醜醜`
- **Why rejected**: companion bots should be allowed to feel like direct Cat
  entrypoints

## References

- [ADR-011](./011-model-primary-orchestrator-as-visible-cat.md)
- [ADR-016](./016-treat-telegram-as-boss-cat-inbox-not-room-mirror.md)
- [ADR-017](./017-allow-direct-cat-chat-and-move-routing-into-system-layer.md)
- [ADR-027](./027-adopt-chat-first-information-architecture-with-default-boss-cat.md)
- [SPEC-014](../specs/SPEC-014-telegram-boss-cat-relay-mvp.md)
- [SPEC-017](../specs/SPEC-017-telegram-inbox-and-room-routing.md)
- [SPEC-027](../specs/SPEC-027-chat-first-information-architecture-and-default-boss-cat.md)

---

*Accepted: 2026-03-22*
*Decision makers: user + Codex*

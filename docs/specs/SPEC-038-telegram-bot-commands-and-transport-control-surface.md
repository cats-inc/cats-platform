# SPEC-038: Telegram Bot Commands and Transport Control Surface

> Define a product-owned Telegram slash-command surface so bot-bound Cats can
> respond to transport control commands such as `/start`, `/help`, and
> `/status` without mixing those commands into normal private-lane chat turns.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Summary

`cats` already owns Telegram bot bindings, polling/webhook ingress, and
Cat-private lane routing. What it does not yet define clearly is how Telegram
slash commands should behave.

Today, a message like `/commands` or `/help` is effectively just another text
message unless special handling is added. That is not enough for a home-user
product. Telegram commands should behave like a small transport control surface:

- easy to understand
- safe to expose publicly through a bot
- not polluting the normal private-lane transcript by default
- consistent with the bound Cat and the product's web/private-lane model

This spec defines the first command surface for Telegram-bound Cats.

## Goals

- give Telegram-bound Cats a clear first-slice slash-command surface
- keep slash commands product-owned inside `cats`, not delegated to runtime
- distinguish transport control commands from ordinary chat text
- keep command behavior simple enough for home users to understand
- allow command discovery through Telegram command menus and plain `/help`

## Non-Goals

- a full Telegram mini-app or rich inline UX in this slice
- arbitrary custom slash commands per Cat in this slice
- mirroring every command and command response into the normal transcript
- moving Telegram command semantics into `cats-runtime`
- making slash commands the only way to use a Telegram-bound Cat

## User Stories

- As an owner, when I message a Telegram-bound Cat for the first time, I want
  `/start` to explain what this bot is and connect me to the right private
  lane.
- As an owner, I want `/help` or `/commands` to show me what this bot can do
  without guessing.
- As an owner, I want `/status` to tell me whether the bot is healthy and which
  Cat it is bound to.
- As an owner, I do not want transport commands to clutter the Cat's normal
  chat history unless the product explicitly chooses to record them.

## Requirements

### Functional Requirements

#### Command routing and scope

1. `cats` shall inspect Telegram inbound messages for slash-command syntax
   before normal private-lane chat routing.
2. Recognized Telegram slash commands shall be handled by a product-owned
   command router in `cats`.
3. Command handling shall remain above the transport and runtime boundary and
   shall not depend on `cats-runtime` tool or session behavior.
4. The command router shall be scoped to the bound Cat and its Telegram binding.

#### First-slice command set

5. The first slice shall support at least:
   - `/start`
   - `/help`
   - `/commands`
   - `/status`
   - `/open`
   - `/mode`
6. `/commands` shall behave as an alias of `/help`.
7. `/start` shall:
   - confirm which Cat this bot is bound to
   - explain that Telegram messages reach that Cat's private lane
   - ensure the private lane exists or can be opened
8. `/help` shall return a short command list with plain-language descriptions.
9. `/status` shall return a short health summary including at least:
   - bound Cat name
   - inbound mode (`polling` or `webhook`) when known
   - whether the binding appears healthy or degraded
10. `/open` shall return a stable web link or route hint into the bound Cat's
    private lane when the host knows how to construct one.
11. `/mode` shall:
   - show the current behavior mode for the bound Cat when called without args
   - support at least `companion` and `agent` as first-slice modes
   - update product-owned Cat behavior state without delegating the mode switch
     itself to runtime

#### Unknown commands

12. Unknown slash commands shall not silently fall through to ordinary chat by
    default.
13. For unknown slash commands, the bot shall respond with a short “unknown
    command” message and point the user to `/help`.
14. Unknown slash commands shall be treated as transport control mistakes, not
    as ordinary Cat-chat input.

#### Transcript policy

15. Recognized slash commands shall not be appended to the normal private-lane
    transcript as owner chat turns by default.
16. Transport command responses shall not be mirrored into the normal
    private-lane transcript as ordinary Cat replies by default.
17. The product may retain command handling in transport diagnostics or command
    logs, but this slice shall keep the visible room transcript focused on real
    chat.

#### Private-lane relationship

18. Telegram slash commands shall still resolve against the bound Cat's private
    lane identity and ownership context.
19. If the user has never opened that private lane in the web UI, `/start` and
    `/open` may cause the product to create or rehydrate the lane so it can be
    opened later in the web product.
20. Command handling shall not create a duplicate transport-only room separate
    from the bound Cat's private lane.

#### Command menu synchronization

21. `cats` shall own a canonical command registry for the Telegram command set.
22. When feasible, `cats` shall sync that registry to Telegram using the Bot API
    command menu mechanism rather than requiring manual BotFather setup for each
    command change, including `setMyCommands`.
23. `cats` shall also configure the Telegram private-chat menu button to open
    the command list when the Bot API supports it, using `setChatMenuButton`.
24. Command/menu sync should run as a best-effort reconcile on server startup
    and after Telegram bot binding mutations.
25. If a Telegram bot token becomes stale because a binding was removed,
    disabled, or switched to a different token, `cats` shall best-effort clear
    that token's command list with `deleteMyCommands`.
26. If command-menu sync fails, slash-command handling shall still work when the
    user types commands manually.

#### Per-binding behavior

27. Each Telegram bot binding shall expose the same baseline command surface in
    the first slice.
28. Command responses may include the bound Cat's display name and private-lane
    context so users understand which Cat/bot they are talking to.
29. This slice shall not require different command sets per Cat, though that
    may be added later.

### Non-Functional Requirements

- **Clarity**: Command replies should be short, direct, and understandable to a
  home user.
- **Safety**: Slash commands should not accidentally trigger arbitrary runtime
  actions or tool execution.
- **Consistency**: A command should behave the same whether the Cat is the
  current Boss Cat or another Telegram-bound Cat.
- **Extensibility**: The registry/router shape should leave room for later
  commands without forcing a rewrite.

## Design Overview

The first-slice model is:

```text
Telegram inbound message
  -> slash-command check
      -> recognized command? yes
          -> product-owned command router
          -> transport reply
          -> optional private-lane ensure/open hint
      -> recognized command? no
          -> if slash-prefixed: unknown-command reply
          -> else: normal private-lane chat routing
```

This keeps Telegram commands as a thin transport control surface while
preserving the existing rule that real message turns belong to the Cat's
private lane.

## Dependencies

- [ADR-016](../decisions/016-treat-telegram-as-boss-cat-inbox-not-room-mirror.md)
- [ADR-017](../decisions/017-allow-direct-cat-chat-and-move-routing-into-system-layer.md)
- [SPEC-017](./SPEC-017-telegram-inbox-and-room-routing.md)
- [SPEC-028](./SPEC-028-automated-tunnel-and-telegram-webhook-lifecycle.md)
- [SPEC-037](./SPEC-037-transport-driven-live-chat-updates-and-private-lane-transition.md)

## Open Questions

- [ ] Should `/open` return a full clickable URL, a route path, or both?
- [ ] Should `/status` include lightweight polling/webhook diagnostics, or stay
      intentionally vague for home users?
- [ ] Should command invocations appear anywhere in the product UI, such as a
      hidden transport activity log?
- [ ] Which future commands, if any, belong in this transport surface:
      `/sleep`, `/wake`, `/settings`, `/memory`, `/share`?

## References

- Telegram Bot API command/menu behavior
- Existing product-owned Telegram transport seam under `src/platform/transports/telegram/`
- Existing Cat private-lane routing semantics in `direct_cat_chat`

---

*Created: 2026-03-27*
*Author: Codex*
*Related Plan: TBD*

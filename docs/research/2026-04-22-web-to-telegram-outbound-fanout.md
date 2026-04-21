# Web-Originated Messages Fanout to Bound Transports

> Research into why messages typed in the web UI for a
> Telegram-bound cat never reach the Telegram app, and how to wire
> outbound fanout so every transport bound to a cat's private lane
> participates in the same conversation symmetrically.

## Metadata

| Field | Value |
|-------|-------|
| **Date** | 2026-04-22 |
| **Author** | Claude (under user-directed investigation) |
| **Status** | Draft |
| **Follow-up** | ADR-080, SPEC-081, PLAN-073 (proposed) |

## Motivating Incident

User noticed that when they type a message from the local web UI
(`/chat/my-cats/:catId`) to a Telegram-bound cat, the message never
appears in the Telegram app. User's initial hypothesis was that
polling mode was the cause.

Polling mode is not the reason. Polling is a strictly inbound
mechanism (the Telegram `getUpdates` pull). Outbound to Telegram is
always an HTTP POST to `sendMessage`, which works regardless of
inbound mode. Flipping inbound to webhook would not change anything
about outbound.

The real reason is that **`telegramRelay.deliver` is only called
from inside `bridgeTelegramWebhookToRoom`**. Every call site sits
on the Telegram-ingress path. No web-UI-originated flow invokes
delivery. The web UI writes to the room via `appendMessage`, runs
the LLM, writes the assistant response, and stops there.

Net effect: the cat's private lane behaves as **two separate
windows** that happen to share a room, not as **one conversation
with two inboxes**.

## What we observed in the code

### The bridge is the only call site of `telegramRelay.deliver`

`telegramRelay.deliver` is invoked exactly once, inside
`bridgeTelegramWebhookToRoom` (`cats-platform/src/platform/transports/telegram/bridge.ts`
line 426). It runs:

- after the user's Telegram message is appended to the room
- after `routeRoomMessage` returns the assistant reply
- it chunks the reply (`chunkTelegramReply`, `TELEGRAM_REPLY_LIMIT`)
- it issues one `deliver` per chunk, threading `replyToMessageId`
  for the first chunk so Telegram threads the reply

No chat API handler (web-UI-originated send), no parallel chat
handler, no group chat handler calls `deliver`. They all stop at
`appendMessage` + runtime dispatch.

### `telegramRelay` in `routeSupport.ts` is plumbing-only

`routeSupport.ts` imports `TelegramRelay` and passes it to
`reconcileTelegramTransportAfterBindingMutation`. That function
only restarts polling after binding mutations. It does not send
messages.

### Web UI message path ignores the binding

When the user submits a message in `/chat/my-cats/:catId`, the
request lands in the chat routes, runs `appendMessage`, triggers
the runtime turn, appends the assistant reply, fires chat events.
None of that looks up whether the room has an active transport
binding. The binding exists; the code just does not consult it for
outbound.

### Inbound-originated messages echo correctly to the web UI

By contrast, when a Telegram user sends a message:

- the bridge appends the user's inbound message to the room
- the LLM generates a reply
- the bridge appends the assistant reply to the room
- the bridge delivers the assistant reply to Telegram
- event hub publishes ingress/mutation events — the web UI sees
  both the user's Telegram message and the assistant reply

So the room transcript is already "single source of truth" for the
cat's conversation. The asymmetry is purely in **outbound fanout**:
Telegram ingress fans out to both Telegram and web; web ingress
fans out to web only.

### Private-lane model supports bidirectional fanout intent

The user memory states: "One Cat = one private lane, Telegram binds
to it, no separate transport_inbox." That framing strongly suggests
the intended model is **one conversation, multiple inboxes**. Under
that model, fanout should go both ways. Today's code falls short of
that intent.

## Design-space considerations

### What to mirror

Three choices, in order of UX consistency:

- **(A) User message only.** When Kenneth types in web UI, send his
  message text to Telegram. Assistant reply stays only in web UI.
  Low-cost, preserves clean separation between response channels.
  Downside: Telegram user sees Kenneth's side but never sees the
  assistant replying.
- **(B) Assistant reply only.** Telegram user sees the cat
  responding even when Kenneth initiated from web. Kenneth's own
  messages stay web-only. Asymmetric, useful only for "silent
  observer" scenarios.
- **(C) Both user and assistant.** Full mirror. Telegram user sees
  the whole conversation. Matches the private-lane intent best.
  Requires the most care around loops and duplicate-delivery
  guards.

(C) is the right default. (A) could be a per-binding opt-in if a
user wants to silence assistant-to-Telegram specifically.

### Loop prevention

If every `appendMessage` naively triggers `deliver`, the bridge's
own `appendMessage` calls would fanout right back to Telegram,
producing duplicates (or infinite loops if an envelope comes back).
The fix is origin tagging:

- every message append carries an `origin` marker: `'web'`,
  `'telegram'`, `'browser-transport'`, etc.
- fanout logic only triggers when the origin is **not** the same
  transport it would fanout to
- the bridge's appends already sit on a known origin path; add the
  origin tag there and the fanout helper filters trivially

### Per-binding opt-in

Some bindings may want to stay ingress-only (user sends from
Telegram, replies come back, but web-originated messages do not
bother Telegram). A per-binding `outboundFanoutEnabled` flag
(default `true`) keeps the option open without forcing every user
into a specific mode.

### Timing of fanout

Two natural emission points:

- **Synchronous with append.** Fanout runs inline after
  `appendMessage`. Simple, deterministic, but slows the web UI's
  own send path by the Telegram API round trip.
- **Deferred via event hub.** The same chat event hub that already
  drives `room_updated` can power a fanout subscriber. Web UI
  returns immediately; fanout runs asynchronously. Matches the
  general invalidation-driven architecture and keeps the web UI
  snappy.

Deferred is better. The fanout is "best-effort notification to a
secondary transport", exactly the class of work an event subscriber
is built for.

### Attribution on the Telegram side

When the cat replies to a Telegram user, the Telegram message comes
from the bot (already today). When Kenneth's web-originated message
is mirrored to Telegram, the Telegram user sees... a message from
the bot? That is confusing — the bot says "hey it's Kenneth typing
from web".

Reasonable answers:

- prefix the mirrored text with an attribution line (`💬 [from
  web]` or similar)
- render the mirror as a distinct "system" visual in Telegram
  (edit the bot's presentation, e.g. italic + sender badge)
- do nothing and let content make it obvious

Prefix is the clearest first slice. The prefix format can be
user-configurable per binding later.

### Idempotency

Every fanout must be idempotent against retries. The bridge already
has delivery idempotency at the Telegram API level (dedup on
`update_id`). Fanout needs its own marker: every message appended
to the room carries an id; fanout records which ids it has
successfully delivered to which transport; on retry, skip delivered
ids.

### Scope of the first slice

- Telegram only. Future transports (browser bridge, email,
  WhatsApp) reuse the fanout pattern.
- Text only. Attachments (images, files) on web-originated messages
  are deferred; if fanout sees an unsupported content type, it
  either skips (with warning) or mirrors the text portion only.
- No retroactive fanout — messages that already landed before
  fanout was enabled stay where they are.

## Options matrix

### Option 1: Do nothing

- **Pros**: zero code change. The private-lane model works for
  Telegram-initiated conversations.
- **Cons**: "web typed messages never reach Telegram" stays
  user-visible. Users who mix channels get confused.
- **Why rejected**: user explicitly asked for this to work.

### Option 2: Hook `telegramRelay.deliver` into the chat send handler inline

- **Pros**: simplest mental model. Web UI calls chat API, chat API
  calls `deliver` directly.
- **Cons**: web UI send latency now includes a Telegram round trip;
  error handling in chat API has to absorb Telegram failures; not
  polymorphic for future transports.
- **Why rejected as sole answer**: fine as a prototype, but the
  coupling will haunt us once a second transport shows up.

### Option 3: Event-hub-driven fanout subscriber

- **Pros**: decouples web send latency from Telegram latency;
  reuses existing chat event hub; polymorphic (each transport adds
  its own subscriber); composes naturally with the staged events
  from ADR-079.
- **Cons**: introduces a new subscriber on the hub; must get
  ordering vs `publishTelegramBridgeResult` right to avoid
  echoing.
- **Why appealing**: cleanest long-term shape; the minimum
  plumbing to unlock correct behavior without regressing anything.

### Option 4: Origin-tagged append hook at the room layer

- **Pros**: sits at the exact moment a message is persisted,
  guaranteed to see every append regardless of which handler made
  it; origin tag comes for free from the call site.
- **Cons**: mixes transport concerns into room-layer code; harder
  to keep polymorphic cleanly.
- **Why not preferred**: too low-level; better to keep room a
  pure store and let an explicit fanout stage consume hub events.

## Recommendation

Ship Option 3 with per-binding opt-in and origin tagging:

1. Extend chat message append with an `origin` tag
   (`'web' | 'telegram' | ...`).
2. Add a new subscriber on the chat event hub, `TransportFanout`,
   that receives `room_updated` events (or a new more specific
   event) and, for every message whose `origin` is not the target
   transport, looks up the cat's bindings and dispatches the
   message to each eligible binding.
3. For Telegram, `TransportFanout` calls `telegramRelay.deliver`
   with the mirrored chunk(s).
4. Add a per-binding `outboundFanoutEnabled` flag, default `true`.
5. Ship text-only. Log-and-skip unsupported content types.
6. Reuse the chunking logic from the bridge; share the
   `TELEGRAM_REPLY_LIMIT` constant.

Compose well with the [ADR-079 staged events rollout](../decisions/079-stage-telegram-ingress-events-and-subscribe-cat-drafts.md):
once the bridge fires user-ingress events before the runtime turn,
the fanout subscriber can mirror the web user's message immediately
while the runtime still runs, mirroring the assistant reply on the
completion event.

## Open questions

- [ ] Should the initial fanout prefix be hard-coded (e.g. `[web]`)
      or per-binding configurable from day one?
- [ ] Should assistant replies be mirrored verbatim, or should they
      render differently on the Telegram side (e.g. italic, quoted
      block) so the Telegram user can distinguish "bot speaking in
      reply to Telegram" from "bot mirroring a web conversation"?
- [ ] Where should `outboundFanoutEnabled` live on the binding
      schema? New column vs reuse of an existing capabilities bag?
- [ ] Do group chat / parallel chat bindings need different fanout
      semantics, or does a single per-binding toggle suffice?
- [ ] What happens if the web-originated message is edited or
      deleted after fanout? Out of scope for first slice, but we
      need a stance.
- [ ] Polymorphic future: how does the fanout subscriber
      discriminate transport kind (telegram / browser / email)?
      Registry of deliverers keyed by `binding.platform`?

## References

- [ADR-079: Stage Telegram Ingress Events and Subscribe Cat Drafts](../decisions/079-stage-telegram-ingress-events-and-subscribe-cat-drafts.md)
- [SPEC-080: Telegram Ingress Staged Events and Cat Subscription](../specs/SPEC-080-telegram-ingress-staged-events-and-cat-subscription.md)
- [ADR-041: Push Transport and Chat Invalidations Over SSE](../decisions/041-push-transport-and-chat-invalidations-over-sse.md)
- `cats-platform/src/platform/transports/telegram/bridge.ts` — sole call site of `telegramRelay.deliver`
- `cats-platform/src/platform/transports/telegram/delivery.ts` — `TelegramDeliveryClient` contract and implementation
- `cats-platform/src/products/chat/api/routeSupport.ts` — chat message append path (no fanout)
- `cats-platform/src/products/chat/api/chatEventHub.ts` — event hub the fanout subscriber would consume

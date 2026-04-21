# ADR-080: Fan Out Web-Originated Messages to Bound Transports

> Web-UI-originated messages in a Telegram-bound cat's private
> lane are invisible to the Telegram user today because
> `telegramRelay.deliver` is only called from inside the Telegram
> ingress bridge. Adopt a chat-event-hub-driven outbound fanout
> stage so every binding on the cat's private lane stays in sync
> with the room's canonical transcript.

## Status

Proposed

## Context

A cat's private lane is meant to be "one conversation, multiple
inboxes" (see user memory on the private-lane model). Today the
room already behaves as the single source of truth — it stores
messages regardless of which transport originated them, and all
readers (web UI, future browser bridge, future email) see the full
transcript.

The outbound direction does not match that intent. The only place
in the codebase that pushes messages to Telegram is inside
`bridgeTelegramWebhookToRoom` (`cats-platform/src/platform/transports/telegram/bridge.ts`
line 426). That call site runs only when Telegram itself was the
ingress. Web-UI-originated messages never reach Telegram.

User feedback framed this as a polling question ("是因為目前是
polling"). Polling is not the cause — polling is strictly an
inbound concern. Outbound uses HTTP POST to Telegram's
`sendMessage` endpoint regardless of inbound mode. Switching to
webhooks would not change this behavior.

The real gap is the missing outbound fanout stage. The current
architecture handles:

- ingress from Telegram → room → runtime turn → response persists
  to room → response delivered back to Telegram
- ingress from web UI → room → runtime turn → response persists
  to room → **stops**

To complete symmetry we need: any message that lands in a room
(from any origin) must be mirrored to every other transport bound
to the cat's private lane, subject to a per-binding policy and
loop-prevention rules.

See the background research —
[`2026-04-22-web-to-telegram-outbound-fanout.md`](../research/2026-04-22-web-to-telegram-outbound-fanout.md) —
for the full observation set and options matrix.

## Decision

### 1. Outbound fanout is a chat-event-hub subscriber, not an inline hook

Every message append publishes a chat event via the existing
`chatEventHub`. We add a new subscriber, `TransportFanout`, that:

- reads messages from the canonical room store after append
- evaluates per-binding fanout policy
- dispatches to each eligible transport via that transport's
  `deliver` client

The subscriber runs out-of-band from the caller that triggered the
append, so web UI send latency stays independent of Telegram
round-trip latency. Failures in fanout log and surface as diagnostics
but do not fail the append itself.

### 2. Every appended message carries an `origin` tag

`appendMessage` (and its callers) take an explicit `origin` value
that identifies the transport or surface that produced the message:

- `'web'` — web UI chat composer
- `'telegram'` — Telegram bridge ingress path
- `'browser'` — browser bridge transport (future)
- `'email'` — email transport (future)
- `'runtime'` — assistant turn produced by runtime session

`TransportFanout` uses `origin` to avoid echoing a message back to
its source transport. A Telegram-origin message does not re-fanout
to Telegram; a web-origin message fans out to every non-web
transport.

### 3. Mirror both user and assistant messages by default

A cat's Telegram user should see the whole conversation, not only
the half that originated from Telegram. Default policy:

- user message with `origin='web'` → mirror to every non-web
  binding on the cat's private lane
- assistant message with `origin='runtime'` produced in response
  to any ingress → mirror to every binding except the one that
  originated the triggering message (which already gets delivered
  by its own ingress handler — for Telegram, the bridge delivers
  the reply directly; for web, the reply is visible in the UI
  natively)

This rule makes the bridge's existing `deliver` and the new fanout
stage non-overlapping:

- bridge delivers the assistant reply to Telegram **only when the
  triggering ingress was Telegram** (today's behavior)
- fanout delivers to Telegram when the triggering ingress was
  web (new)

If a future design collapses the bridge's delivery into fanout
(one call site for every case), this ADR does not stand in the way,
but it is not the first-slice target.

### 4. Per-binding `outboundFanoutEnabled` toggle, default on

Every binding gains an `outboundFanoutEnabled: boolean` flag.
Default is `true`. Users who want a binding to stay ingress-only
can turn it off without breaking anything. The toggle lives on the
binding record; surfacing it in the UI is out of scope for the
first slice but the field exists so the runtime path can be
flipped ahead of the UI.

### 5. Fanout prefixes mirrored content with origin attribution

On the Telegram side, the bot is the sender for every outbound
message. A Telegram user looking at the chat can already tell
"assistant reply to my Telegram message" (threaded reply semantics,
`replyToMessageId`). A mirrored web-originated message would look
like "the bot is suddenly talking" without context.

First-slice attribution: prepend a short marker to mirrored text.

- `💬 [from web] <text>` for web-origin user messages
- assistant replies keep their current rendering (no prefix), but
  receive no `replyToMessageId` (there is nothing to thread under
  since the trigger was a web-side event, not a Telegram message)

Prefix format is hard-coded for first slice. ADR leaves room for a
later ADR to make it per-binding configurable if demand emerges.

### 6. Idempotent fanout with per-message dispatch log

`TransportFanout` tracks which `(messageId, bindingId)` pairs it has
already delivered. On retry (subscriber re-run after a hub
reconnect, for example), it skips already-delivered pairs. This
dispatch log is scoped to the active process and can be backed by
persistent storage in a later phase if at-least-once delivery is
upgraded to exactly-once-across-restarts.

### 7. Scope: Telegram only, text only, first slice

- Only Telegram bindings participate as fanout destinations in the
  first slice. Browser / email / other platforms extend the
  registry in follow-ups.
- Only text content is mirrored. Messages with attachments
  (images, files) mirror the text portion (if any) and log the
  skipped attachment; a later slice can extend.
- No retroactive fanout — messages appended before rollout stay
  where they are.
- No edit/delete sync of mirrored messages in the first slice. A
  follow-up can add it.

## Consequences

### Positive

- a cat's private lane behaves symmetrically: every binding stays
  in sync with the canonical transcript
- web-originated messages reach the Telegram user, completing the
  "one conversation, multiple inboxes" promise
- the fanout subscriber is polymorphic from day one — each new
  transport registers a deliverer by `binding.platform`, no
  per-transport branching elsewhere
- composes cleanly with the [ADR-079 staged events](./079-stage-telegram-ingress-events-and-subscribe-cat-drafts.md)
  rollout: once user-ingress events fire before the runtime turn,
  web-user mirroring can race ahead of the assistant reply
- no behavior change for Telegram-ingress flows (bridge still
  owns that delivery)

### Negative

- introduces a second outbound-delivery call site
  (`TransportFanout`) that runs alongside the bridge's existing
  delivery, so future maintenance must keep the "who delivers
  what" policy consistent
- message append path grows an `origin` parameter that every
  caller must fill in correctly; forgetting it defaults to an
  obvious fallback (`'unknown'`) but the subscriber refuses to
  fanout unknown origins (loop safety)
- per-binding toggle is a new policy field on bindings; must be
  respected by fanout and surfaced in binding diagnostics
- first-slice idempotency is in-memory; a process restart mid-fanout
  may re-deliver an already-sent message

### Neutral

- does not change persisted message shapes except the `origin`
  field (additive)
- does not change the Telegram bridge's reply-threading or
  chunking behavior; fanout reuses the same chunking helper
- does not change `/api/events/chat` event shapes
- does not introduce a new network transport

## Alternatives Considered

### Alternative 1: Do nothing

- **Pros**: zero code change.
- **Cons**: user-reported issue stays; "private lane" framing
  stays half-implemented.
- **Why rejected**: user explicitly asked for this to work.

### Alternative 2: Inline `deliver` call inside the chat send handler

- **Pros**: minimum diff; one call in one place.
- **Cons**: couples web send latency to Telegram latency; error
  paths in the chat API must absorb transport-layer failures; does
  not generalize when a second transport (browser, email) lands.
- **Why rejected**: prototype-grade coupling for a pattern we will
  repeat.

### Alternative 3: Collapse bridge delivery into the fanout subscriber

- **Pros**: one call site for all outbound delivery; clean unified
  policy.
- **Cons**: reshapes an already-working path; risks regressing
  Telegram-ingress reply threading (`replyToMessageId`) and
  delivery timing; bigger blast radius than the gap requires.
- **Why rejected**: the gap is "web→Telegram missing", not
  "bridge delivery misbehaving". Keep the bridge as-is and add
  fanout alongside. A future refactor can unify.

### Alternative 4: Origin-tagged append hook inside the room layer

- **Pros**: guaranteed to see every append regardless of
  handler.
- **Cons**: mixes transport concerns into room storage code;
  harder to make polymorphic cleanly.
- **Why rejected**: keeps room a pure store; fanout lives above
  it as an explicit stage.

## References

- [Research: Web-Originated Messages Fanout to Bound Transports](../research/2026-04-22-web-to-telegram-outbound-fanout.md)
- [ADR-079: Stage Telegram Ingress Events and Subscribe Cat Drafts](./079-stage-telegram-ingress-events-and-subscribe-cat-drafts.md)
- [ADR-041: Push Transport and Chat Invalidations Over SSE](./041-push-transport-and-chat-invalidations-over-sse.md)
- [SPEC-081: Transport Fanout for Web-Originated Messages](../specs/SPEC-081-transport-fanout-for-web-originated-messages.md)
- [PLAN-073: Transport Fanout Rollout](../plans/PLAN-073-transport-fanout-rollout.md)
- `cats-platform/src/platform/transports/telegram/bridge.ts` — sole current `deliver` call site
- `cats-platform/src/platform/transports/telegram/delivery.ts` — `TelegramDeliveryClient`
- `cats-platform/src/products/chat/api/chatEventHub.ts` — event hub the fanout subscribes to

---

*Proposed: 2026-04-22*
*Proposed by: Claude under user-directed investigation*

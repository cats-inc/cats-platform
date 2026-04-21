# SPEC-081: Transport Fanout for Web-Originated Messages

> Define the outbound fanout stage that mirrors messages appended
> to a cat's private lane across every eligible binding, so the
> canonical room transcript stays consistent whether the user is
> reading from the web UI, from Telegram, or from future
> transports.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | TBD (Conductor on accept) |
| **Reviewer** | User |
| **Related ADR** | [ADR-080](../decisions/080-fan-out-web-originated-messages-to-bound-transports.md) |
| **Companion ADR** | [ADR-079](../decisions/079-stage-telegram-ingress-events-and-subscribe-cat-drafts.md), [ADR-041](../decisions/041-push-transport-and-chat-invalidations-over-sse.md) |
| **Follow-up plan** | [PLAN-073](../plans/PLAN-073-transport-fanout-rollout.md) |

## Summary

Today the only outbound Telegram delivery happens inside the
ingress bridge. A message typed in the web UI for a Telegram-bound
cat never reaches Telegram. This spec defines a single fanout
subscriber that reads new appended messages from the chat event
hub, evaluates per-binding policy, and dispatches to every
eligible transport via its delivery client. The first slice covers
Telegram text content; the design is polymorphic so future
transports (browser, email) plug in by registering a deliverer
for their `binding.platform`.

## Goals

- make the cat's private lane symmetric: every binding receives
  every canonical message regardless of which transport (or the
  web UI) produced it
- keep the outbound path decoupled from the sender's latency —
  web UI sends return immediately; delivery happens on the event
  hub
- support per-binding opt-out so a binding can remain ingress-only
- preserve the existing Telegram-ingress reply threading and
  delivery behavior — the bridge keeps its `deliver` call site
- shape the fanout registry polymorphically so the second
  transport to land requires no protocol change

## Non-Goals

- no change to persisted message shapes except adding a
  non-optional `origin` tag and optional
  `sourceTransportBindingId` at append time
- no replacement of the bridge's existing `deliver` call site (it
  stays; fanout covers the gap, not the overlap)
- no edit / delete sync of mirrored messages in the first slice
- no attachment / rich-media mirroring in the first slice (text
  only; unsupported content logs a warning and skips)
- no retroactive fanout of messages appended before rollout
- no new persisted storage for the dispatch log in the first slice
  (in-memory only; at-least-once across restarts is a follow-up)
- no new network transport; fanout reuses each binding's existing
  deliverer

## User Stories

- As a user who just bound a cat to my Telegram bot, when I type
  a message in the web UI, the Telegram user on the other end
  sees my message with an origin marker.
- As a user reading the cat's Telegram chat, when the assistant
  replies to a web-originated message, I see that reply appear
  in Telegram too (not just the web).
- As a user who wants a binding that only listens (no outbound
  mirroring), I can toggle `outboundFanoutEnabled = false` on
  that binding and the fanout skips it.

## Requirements

### Functional Requirements

1. **FR-1 (`origin` on appends).** Every call to `appendMessage`
   (and equivalents) supplies an `origin` value. Allowed values
   are an extensible enum: `'web' | 'telegram' | 'browser' |
   'email' | 'runtime' | 'system' | 'unknown'`. Callers that
   cannot determine origin default to `'unknown'`, which the
   fanout subscriber treats as "do not fanout".
2. **FR-2 (Fanout subscriber registration).** On server startup,
   a `TransportFanout` module subscribes to the chat event hub.
   It receives every `room_updated` event with
   `mutation: 'message_added'` and looks up the appended
   message's metadata (id, origin, source binding, content).
3. **FR-3 (Eligibility rules).** For a given message `M` on a
   room attached to a cat `C` with bindings `B1..Bn`:
   - skip fanout if `M.origin === 'unknown'`
   - for each binding `Bi` where `Bi.outboundFanoutEnabled !==
     false` (default `true`):
      - if `M.sourceTransportBindingId === Bi.id`, skip (that
        source bridge owns same-ingress delivery for this binding)
      - if `Bi.platform === M.origin`, skip (do not echo to
        source)
      - otherwise, dispatch `M` to `Bi` via the deliverer
        registered for `Bi.platform`
4. **FR-4 (Deliverer registry).** Each transport registers a
   deliverer under its `binding.platform` key:
   `{ platform: 'telegram', deliver: (binding, message) => ... }`.
   Telegram's deliverer wraps `telegramRelay.deliver` and reuses
   the existing `chunkTelegramReply` helper plus
   `TELEGRAM_REPLY_LIMIT`.
5. **FR-5 (Text content formatting).** For the first slice:
   - user messages with `origin='web'` dispatched to Telegram
     carry a prefix: `"💬 [from web] "` followed by the text
   - assistant messages (`origin='runtime'`) dispatched to
     Telegram carry no prefix; they are sent as standalone bot
     messages without `replyToMessageId`
   - attachments: log and skip; future FRs can extend
6. **FR-6 (Per-binding toggle).** `Binding.outboundFanoutEnabled:
   boolean` is a new field (default `true`). Binding-management
   surfaces can read/write it; a missing field is treated as
   `true` for backward compatibility.
7. **FR-7 (Idempotency).** The subscriber maintains an in-memory
   `Map<messageId, Set<bindingId>>` of already-delivered pairs.
   On duplicate signal (retry, hub reconnect), skip
   already-delivered pairs.
8. **FR-8 (Error isolation).** A delivery failure for binding
   `Bi` does not block delivery to `Bj`. Failures are logged with
   `(messageId, bindingId, error)` and surfaced through the
   existing binding diagnostics channel. The underlying
   `appendMessage` call is unaffected.
9. **FR-9 (Source-binding non-overlap).** When Telegram ingress
   appends the inbound user message, it stamps
   `sourceTransportBindingId` with the Telegram binding id. The
   runtime assistant reply produced for that ingress carries the
   same source binding id before it is appended and before
   `room_updated` is emitted. Fanout reads this stable metadata and
   skips that exact `(messageId, bindingId)` pair; it does not wait
   for a post-delivery bridge marker.

### Non-Functional Requirements

- **Compatibility**: Phase 1 updates every existing caller of
  `appendMessage` to supply an explicit origin. Older persisted
  records without origin/source-binding metadata normalize to
  `'unknown'` and are not fanned out.
- **Observability**: every dispatch attempt logs start / end /
  result; counts surface under the binding diagnostics.
- **Performance**: fanout runs async; the subscriber uses
  bounded concurrency per binding to avoid hammering a single
  transport's API.
- **Backpressure**: on transport-side rate limiting, the
  subscriber defers retry with exponential backoff within the
  lifetime of the process.
- **Security**: no new auth surface; each deliverer reuses its
  existing binding-scoped auth.

## Design Overview

### Event flow — before and after

```
BEFORE (today):

  Web UI sends → chat API → appendMessage(user) → runtime →
    appendMessage(assistant) → publishRoomMutation(room_updated)
  (stops here; Telegram never sees it)

  Telegram poll → bridge → appendMessage(user) → runtime →
    appendMessage(assistant) → telegramRelay.deliver(assistant) →
    publishTelegramBridgeResult (post-everything)
  (Telegram sees both via bridge)

AFTER (this spec):

  Web UI sends → chat API →
    appendMessage(user, origin='web') →
    publishRoomMutation(room_updated, {messageId, origin})
      └─ TransportFanout: for each binding where platform != 'web' and
         outboundFanoutEnabled, dispatch user message text
    → runtime →
    appendMessage(assistant, origin='runtime') →
    publishRoomMutation(room_updated, {messageId, origin})
      └─ TransportFanout: dispatch to each enabled non-web binding

  Telegram poll → bridge →
    appendMessage(user, origin='telegram',
      sourceTransportBindingId=bindingId) →
    publishRoomMutation(room_updated,
      {messageId, origin, sourceTransportBindingId})
      └─ TransportFanout: skip source/telegram binding;
         dispatch to other bindings if they exist
    → runtime →
    appendMessage(assistant, origin='runtime',
      sourceTransportBindingId=bindingId) →
    publishRoomMutation(room_updated,
      {messageId, origin, sourceTransportBindingId})
      └─ TransportFanout: skip source binding (bridge owns delivery);
         dispatch to other bindings if they exist
    → telegramRelay.deliver(assistant) [bridge delivery for source binding]
```

### Deliverer contract

```ts
interface TransportDeliverer {
  platform: BindingPlatform;
  deliver(input: {
    binding: BindingRecord;
    message: AppendedMessage;
    formattedText: string;
    messageId: string;
  }): Promise<FanoutDispatchResult>;
}

interface FanoutDispatchResult {
  status: 'delivered' | 'skipped' | 'failed';
  deliveryId?: string;   // transport-native id, for correlation
  reason?: string;       // for skipped / failed
}
```

Telegram deliverer wraps `telegramRelay.deliver`:

```ts
export const telegramFanoutDeliverer: TransportDeliverer = {
  platform: 'telegram',
  async deliver({ binding, formattedText, messageId }) {
    const chunks = chunkTelegramReply(formattedText, TELEGRAM_REPLY_LIMIT);
    let lastReceipt: TelegramDeliveryReceipt | null = null;
    for (const chunk of chunks) {
      lastReceipt = await telegramRelay.deliver({
        request: {
          operation: 'send',
          conversationId: binding.conversationId,
          chatId: binding.chatId,
          text: chunk,
          disableLinkPreview: true,
        },
        context: binding.context,
      });
    }
    return {
      status: 'delivered',
      deliveryId: lastReceipt?.deliveryId,
    };
  },
};
```

### ChatEvent extension

`room_updated` events gain optional detail fields:

```ts
{
  kind: 'room_updated',
  channelId: string,
  timestamp: string,
  detail: {
    mutation: 'message_added' | 'updated' | 'created',
    messageId?: string,
    origin?: MessageOrigin,
    sourceTransportBindingId?: string | null,
  }
}
```

Existing consumers that ignore the additive detail fields are
unaffected.

### Message metadata extension

Persisted chat messages gain `origin: MessageOrigin` and optional
`sourceTransportBindingId?: string | null`. The source binding field
is set only when a transport binding owns the ingress that produced
the message or its immediate runtime reply.

### Binding schema extension

Adds `outboundFanoutEnabled?: boolean` (default `true` when absent).
Migration is additive; existing rows need no backfill.

## Dependencies

- existing `chatEventHub` infrastructure (ADR-041)
- existing `telegramRelay.deliver` contract and `chunkTelegramReply`
  helper
- existing `appendMessage` and its callers across chat routes,
  parallel chat routes, group chat routes, and bridge
- cooperates with ADR-079's staged event emission: once user-ingress
  fires before the runtime turn, the fanout subscriber picks up that
  event just like any other `room_updated`

## Open Questions

- [ ] Is the `"💬 [from web] "` prefix acceptable as a hard-coded
      default, or should it be per-binding configurable at first
      ship?
- [ ] Should the `outboundFanoutEnabled` toggle surface in the UI
      as part of this slice, or stay a backend-only flag that only
      the binding API supports?
- [ ] How do parallel chat groups interact with fanout? Each
      member room has its own bindings; do we fanout from every
      member, or only from the group's canonical room?
- [ ] Do we need a runtime-turn correlation in addition to
      `sourceTransportBindingId` for multi-step assistant flows, or
      is the source binding id enough for first-slice non-overlap?
- [ ] Persistent dispatch log (FR-7 upgrade) — when do we commit
      to it? Tied to a user-visible "retry fanout" action?
- [ ] Polymorphic deliverer registry location — live in
      `platform/transports/<platform>/fanout.ts`, or centralized
      under `platform/transports/fanout/registry.ts`?

## References

- [ADR-080: Fan Out Web-Originated Messages to Bound Transports](../decisions/080-fan-out-web-originated-messages-to-bound-transports.md)
- [ADR-079: Stage Telegram Ingress Events and Subscribe Cat Drafts](../decisions/079-stage-telegram-ingress-events-and-subscribe-cat-drafts.md)
- [ADR-041: Push Transport and Chat Invalidations Over SSE](../decisions/041-push-transport-and-chat-invalidations-over-sse.md)
- [SPEC-080: Telegram Ingress Staged Events and Cat Subscription](./SPEC-080-telegram-ingress-staged-events-and-cat-subscription.md)
- [Research: Web-Originated Messages Fanout to Bound Transports](../research/2026-04-22-web-to-telegram-outbound-fanout.md)
- [PLAN-073: Transport Fanout Rollout](../plans/PLAN-073-transport-fanout-rollout.md)

---

*Created: 2026-04-22*
*Author: Claude under user-directed investigation*
*Related Plan: [PLAN-073](../plans/PLAN-073-transport-fanout-rollout.md)*

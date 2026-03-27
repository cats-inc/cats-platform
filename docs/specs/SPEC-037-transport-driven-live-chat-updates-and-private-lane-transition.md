# SPEC-037: Transport-Driven Live Chat Updates and Private-Lane Transition

> Allow `Cats Chat` to update the web UI after Telegram ingress without manual
> refresh by exposing a product-owned SSE invalidation stream and supporting
> in-place private-lane promotion from landing into live transcript mode.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Summary

Telegram traffic already reaches `cats` and can create or update a Cat's
private lane, but the web renderer does not reliably learn about those changes
until another fetch path happens.

This spec defines the missing live-update seam:

- Telegram remains server-polled/webhook-driven
- `cats` emits chat invalidation events over SSE
- the renderer subscribes to those events
- the renderer refetches only what is necessary
- Cat-private routes can transition from landing/draft state to a real
  transcript view when transport traffic makes that lane real

## Goals

- make inbound Telegram traffic visible in the web UI without manual refresh
- keep Telegram polling/webhook handling on the server
- avoid making periodic `/api/app-shell` polling the primary solution
- support `My Cats` private-lane promotion from landing to transcript
- refresh `RECENTS`, unread state, and the current room when transport traffic
  changes them
- keep this contract product-owned inside `cats`

## Non-Goals

- raw Telegram message-stream mirroring into the browser
- full transcript-delta streaming as the first slice
- WebSocket adoption in the first slice
- moving transport ownership into `cats-runtime`
- replacing runtime/operator streaming contracts

## User Stories

- As an owner, when I send a Telegram message to a bound Cat, I want the web UI
  to reflect that without needing a manual refresh.
- As an owner, if I am already on a Cat's private-lane route, I want that route
  to turn into the real transcript view when the first Telegram message arrives.
- As an owner, if I am in another room, I want `RECENTS` and unread indicators
  to update when Telegram traffic changes another room.
- As an owner, I want live transport-driven updates without the app constantly
  polling everything in the background.

## Requirements

### Functional Requirements

#### SSE invalidation seam

1. `cats` shall expose a product-owned SSE endpoint for chat invalidation
   events.
2. The SSE endpoint shall be renderer-consumable without requiring direct
   Telegram access from the browser.
3. The first slice may emit invalidation-oriented events rather than raw
   transcript deltas.

#### Event shape

4. Each SSE event shall include at least:
   - event type
   - timestamp
   - reason
   - relevant channel id when known
   - relevant Cat id when known
   - transport id or transport kind when relevant
5. The first slice shall support reasons including:
   - `telegram_inbound`
   - `telegram_outbound`
   - `channel_updated`
   - `message_created`
   - `private_lane_available`
6. The SSE contract shall not assume Telegram is the only future producer.

#### Renderer subscription

7. `Cats Chat` shall subscribe to the SSE invalidation stream while the chat
   product shell is active.
8. When an event affects the current visible room, the renderer shall refetch
   enough state to update that room.
9. When an event affects another room, the renderer shall refresh `RECENTS` and
   unread state.
10. On disconnect, the renderer shall attempt SSE reconnection with bounded
    retry/backoff behavior.
11. After reconnect, the renderer may perform a full app-shell refetch to
    recover missed invalidations.

#### Private-lane landing -> transcript transition

12. If the user is on `/chat/my-cats/:catId` and that Cat's private lane gains
    transport-driven transcript state, the UI shall be able to transition
    in-place from the landing/draft presentation to the normal chat view.
13. That transition may include:
    - appearance of the top bar
    - transcript rendering
    - composer repositioning
    - replacement of the landing copy
14. This transition shall not require a hard page reload or route change away
    from the Cat-private path.

#### App-shell refresh strategy

15. The first slice may refetch `/api/app-shell` after an invalidation event if
    that is the simplest correct way to recover consistent state.
16. The product should keep room for later narrower refetch behavior, such as:
    - refetch current channel only
    - refetch `RECENTS` only
    - merge event payloads more directly
17. Periodic whole-app polling shall not be the primary live-update contract.

### Non-Functional Requirements

- **Correctness**: transport-driven state changes must eventually become visible
  in the web UI without user refresh.
- **Ownership clarity**: Telegram polling stays server-side; browser consumes
  product events only.
- **Incrementality**: first slice may use invalidation + refetch instead of a
  full transcript-diff stream.
- **Extensibility**: future transports and non-transport chat mutations should
  be able to reuse the same SSE invalidation framework.

## Proposed API Shape

### SSE endpoint

```http
GET /api/events/chat
Accept: text/event-stream
```

### Example event

```text
event: chat.invalidated
data: {
  "reason": "telegram_inbound",
  "channelId": "channel-cat-001",
  "catId": "cat-jiangjiang",
  "transport": "telegram",
  "occurredAt": "2026-03-27T08:15:00.000Z"
}
```

### First-slice handling model

```text
Telegram ingress
  -> bridge updates chat state
  -> server emits SSE invalidation
  -> renderer receives event
  -> renderer refetches app shell / selected room
  -> route resolver updates visible lane
```

## Renderer Behavior Rules

### Case 1: Current visible thread changed

- refresh current thread view
- keep the user on the current route
- show new message(s) once refetch completes

### Case 2: Another thread changed

- refresh `RECENTS`
- update unread state
- do not steal focus

### Case 3: `My Cats` landing became a real private lane

- keep the same `/chat/my-cats/:catId` route
- swap from landing/draft shell to `ChatView`
- render transcript and top bar in place

## Dependencies

- [ADR-041](../decisions/041-push-transport-and-chat-invalidations-over-sse.md)
- [SPEC-017](./SPEC-017-telegram-inbox-and-room-routing.md)
- [SPEC-018](./SPEC-018-direct-cat-chat-and-conversation-routing-layer.md)
- [SPEC-028](./SPEC-028-automated-tunnel-and-telegram-webhook-lifecycle.md)

## Open Questions

- [ ] Should the first SSE event family include only invalidations, or also a
      small `snapshot_hint` for narrower refetch?
- [ ] Should the first reconnect policy be fixed-timer retry, exponential
      backoff, or visibility-aware retry?
- [ ] When the current room changes while the tab is hidden, should the UI
      defer transcript refetch until focus/visibility restore?

## References

- [ADR-016](../decisions/016-treat-telegram-as-boss-cat-inbox-not-room-mirror.md)
- [ADR-017](../decisions/017-allow-direct-cat-chat-and-move-routing-into-system-layer.md)
- [ADR-028](../decisions/028-allow-multiple-public-bot-bindings-with-one-boss-cat.md)

---

*Created: 2026-03-27*
*Author: Codex*
*Related Plan: [PLAN-026](../plans/PLAN-026-transport-live-updates-and-private-lane-transition.md)*

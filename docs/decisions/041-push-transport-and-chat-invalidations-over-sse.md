# ADR-041: Push Transport and Chat Invalidations Over SSE

> Keep Telegram as a server-polled transport seam, but push chat invalidation
> events to the web renderer over Server-Sent Events so `Cats Chat` can refresh
> current rooms, recents, and private lanes without periodic app-shell polling.

## Status

Proposed

## Date

2026-03-27

## Context

`cats` already owns the Telegram ingress seam and the direct Cat private-lane
model:

- Telegram polling/webhook handling stays server-side
- transport messages route into the bound Cat's private lane
- `My Cats` routes use in-place direct lanes rather than standalone duplicated
  rooms

However, the web renderer still behaves like a request/response shell:

- the initial app shell is fetched on load
- route changes and explicit mutations refetch app state
- operator status has its own background refresh
- inbound transport traffic does **not** currently update the visible chat UI
  unless the user refreshes, changes route, or triggers another fetch path

That gap becomes especially visible when:

- a Cat is already Telegram-bound
- the owner has not yet sent a web message in that Cat's private lane
- Telegram traffic creates or rehydrates the first visible private-lane state
- the web route is still showing the landing/draft surface

In that moment, the web product should not remain stale.

The product direction here is clear:

- Telegram polling is acceptable and correct on the server side
- browser-side periodic polling of `/api/app-shell` is not the preferred
  long-term answer
- what the renderer needs is prompt invalidation delivery from the server

## Decision

`cats` will keep external transport polling/webhook handling on the server, and
will push chat invalidation events to the web renderer over SSE.

### 1. Telegram remains server-polled or webhook-driven

This ADR does **not** move Telegram transport handling into the browser.

`cats` continues to own:

- Telegram polling/webhook ingress
- transport-to-room/private-lane bridging
- relay state, dedupe, diagnostics, and delivery

### 2. Browser refresh becomes event-driven

The renderer shall subscribe to a product-owned SSE stream for chat invalidation
events.

The SSE stream is not a raw Telegram transcript mirror and not a raw runtime
event feed. Its job is to tell the web client:

- something relevant changed
- which Cat/channel/private-lane is affected
- whether the current view should refetch

### 3. The first slice is invalidation-driven, not diff-stream-driven

The initial SSE slice should deliver invalidation events such as:

- channel updated
- message created
- private lane became available
- transport ingress linked to a Cat/private lane

The renderer may refetch the relevant read model after receiving such events.

This ADR does **not** require the first slice to stream transcript deltas or
individual transport receipts directly into the renderer.

### 4. Private-lane promotion is a first-class use case

If the owner is already on `/chat/my-cats/:catId` and that Cat's private lane
goes from landing/draft state to a real message-bearing lane because Telegram
traffic arrived, the UI should transition in place:

- the route stays on the same Cat-private path
- the landing shell may disappear
- the top bar may appear
- the transcript becomes visible
- the composer may move to its normal in-room position

That larger UI transition is acceptable and expected.

### 5. SSE beats periodic app-shell polling for this responsibility

The product should not solve transport-driven web freshness by permanently
polling the whole app shell every few seconds.

Background app-shell polling may exist as a fallback or reconnect recovery
mechanism, but the primary live-update contract should be:

- server-side transport handling
- server-side invalidation emission
- browser-side SSE subscription

### 6. The contract stays product-owned

This invalidation stream belongs to `cats`, not `cats-runtime`.

`cats-runtime` may own runtime-session streaming, but the web product's
concerns here are broader:

- transport ingress
- app-shell read-model freshness
- private-lane promotion
- recents/unread refresh

## Consequences

### Positive

- Telegram and future transport traffic can update the web UI without manual
  refresh.
- The private-lane route can naturally transition from landing to live chat.
- The renderer no longer needs coarse app-wide polling as the primary answer.
- The same invalidation seam can later cover non-Telegram chat mutations too.

### Negative

- `cats` now needs a lightweight event hub and SSE route.
- The renderer must own reconnect/refetch behavior for the SSE stream.
- There is a new cross-cutting live-update contract to test.

### Neutral

- This ADR does not require WebSockets.
- This ADR does not require raw runtime event tape in the transcript.
- This ADR does not move transport ownership into `cats-runtime`.

## Alternatives Considered

### Alternative 1: Periodically poll `/api/app-shell`

- **Pros**: simple first patch
- **Cons**: wasteful, delayed, and still wrong as the primary live-update model
- **Why rejected**: acceptable as a fallback, not as the main contract

### Alternative 2: Browser polls Telegram directly

- **Pros**: apparently direct
- **Cons**: breaks transport ownership, secrets, and the current server-side
  bridge model
- **Why rejected**: Telegram ingress belongs on the server

### Alternative 3: Use WebSocket first

- **Pros**: flexible bidirectional channel
- **Cons**: heavier than needed for one-way invalidation delivery
- **Why rejected**: SSE is sufficient for the first slice

### Alternative 4: Wait for `cats-runtime` to provide a universal event stream

- **Pros**: fewer product routes at first glance
- **Cons**: mixes product invalidation with runtime execution concerns and still
  leaves transport freshness unresolved
- **Why rejected**: this responsibility is product-owned

## References

- [ADR-010](./010-separate-read-model-app-shell-from-restful-resource-apis.md)
- [ADR-016](./016-treat-telegram-as-boss-cat-inbox-not-room-mirror.md)
- [ADR-017](./017-allow-direct-cat-chat-and-move-routing-into-system-layer.md)
- [ADR-028](./028-allow-multiple-public-bot-bindings-with-one-boss-cat.md)
- [ADR-036](./036-unify-api-contract-and-namespace-endpoints-by-product.md)
- [SPEC-017](../specs/SPEC-017-telegram-inbox-and-room-routing.md)
- [SPEC-018](../specs/SPEC-018-direct-cat-chat-and-conversation-routing-layer.md)
- [SPEC-028](../specs/SPEC-028-automated-tunnel-and-telegram-webhook-lifecycle.md)

---

*Proposed: 2026-03-27*
*Author: Codex*

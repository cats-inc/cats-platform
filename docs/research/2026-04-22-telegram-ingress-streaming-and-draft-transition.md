# Telegram Ingress Streaming UX and Direct-Lane Draft Transition

> Research into closing the "bulk update, no typing dot" gap for
> Telegram-originated messages and the sibling "direct-lane draft
> stays frozen when the first inbound message arrives" transition,
> building on the ADR-041 invalidation tier and the ADR-075
> per-entity subscription tier already in flight.

## Metadata

| Field | Value |
|-------|-------|
| **Date** | 2026-04-22 |
| **Author** | Claude (under user-directed investigation) |
| **Status** | Draft |
| **Follow-up** | ADR-079, SPEC-080, PLAN-072 (proposed) |

## Motivating Incident

Commit `9f428603` ("fix(chat): refresh rooms after telegram polling
ingress") added `publishTelegramBridgeResult` and wired it into the
polling supervisor so that Telegram-originated messages would refresh
the chat UI. The user reported that after the fix "the screen still
does not update" in a specific scenario: a freshly-created cat (DD,
then EE) bound to a Telegram bot, sitting on its direct-lane draft
page, receiving its very first inbound message.

Live debugging in Chrome (via the Chrome extension bridge) confirmed
the fix **does** work for the steady-state active-channel case but
leaves two related gaps open:

1. **No progressive streaming UX** — the user's Telegram message and
   the assistant reply appear together in one render, with no "typing
   dot" / dot-bubble transition.
2. **Draft-to-active transition runs through a heavyweight path** —
   because the draft page has no channel to subscribe to, the
   transition relies on an app-shell refetch triggered by
   `recents_changed`, giving the user-visible "waits a beat, then
   pops in whole" effect.

Both are currently acceptable to the user ("不是大問題") but together
they limit how close Telegram-originated conversations can feel to
UI-originated conversations, where the typing dot / streaming
segment UX is already wired.

## What we observed in the running system

### Server side: events fire once, post-completion

For each Telegram message processed through
`bridgeTelegramWebhookToRoom`:

- bridge awaits the entire round trip (user message append →
  `routeRoomMessage` which runs the LLM → `deliver` to send Telegram
  reply)
- only after the whole chain completes does `publishTelegramBridgeResult`
  fire
- three `ChatEvent` envelopes are emitted within the same millisecond:
  - `transport_ingress { channelId: roomId, catId: null }`
  - `recents_changed  { channelId: null,   catId: null }`
  - `room_updated     { channelId: roomId, mutation: 'message_added' }`

Concretely captured during the EE debug session, all three events
arrived with `channelId = 9d64b89b-...` (EE's freshly-created room)
within the same timestamp down to the millisecond, and `catId = null`
on every event.

### Client side: `/api/events/chat` is the only live subscription in play

Using a probe `EventSource('/api/events/chat')` plus a patched
`window.EventSource` constructor to catch any app-initiated
`EventSource`:

- the probe always received the three events above
- the app opens `/api/subscribe?kind=channel&id=<channelId>` only
  when the user navigates into an active channel that already exists
  (confirmed on DD's main chat — the subscription opened 1 second
  after the inbound Telegram events had already fired, which meant
  **the subscription missed those exact events** and the page
  recovered via its initial snapshot)
- on the EE draft page, no per-channel subscription exists at all
  (there is no channel id yet); the only live subscription is the
  global `/api/events/chat` consumed by `useChatEvents` in
  `useChatAppShellRefresh`, which calls `refreshAppShell()` on
  `recents_changed`
- the refresh path is a full `GET /api/app-shell` HTTP round trip
  plus React re-render against the merged payload — correct, but
  heavy

### End user effect

- **Active channel, new Telegram message**: the user and assistant
  bubble appear together after a visible delay; no dot bubble, no
  token-by-token streaming.
- **Draft → active on first Telegram message**: the page does switch
  from the "Meow. Ready when you are." draft layout to the fully
  populated chat view, but only after the app-shell refetch settles;
  no streaming in the transition.
- **Browser refresh does not change any of the above** — both paths
  run the same way before and after refresh.

## Architectural analysis

### Which tier each event path currently uses

Two renderer sync tiers already exist:

- **Tier A — collection-level invalidation** (ADR-041):
  `/api/events/chat` SSE stream, consumed by `useChatEvents`, drives
  `refreshAppShell()`. Scope: "something about the shell changed,
  refetch."
- **Tier B — per-entity deep state** (ADR-075, SPEC-076):
  `/api/subscribe?kind=&id=` SSE stream, scoped to the single
  mounted entity, delivers `snapshot` + ordered `patch` events.

Today's Telegram bridge events land exclusively on Tier A.
Regardless of whether the mounted view has a Tier B subscription
open or not, the bridge fires `transport_ingress` + `recents_changed`
+ `room_updated` into the event hub, which pushes them to Tier A
subscribers and (if the `channelId` matches) to Tier B subscribers
too. Tier A responds by refetching the whole app-shell. Tier B
responds — where subscribed — by refreshing the entity snapshot.

### Why there is no "typing dot" for Telegram flows

The `liveIndicator` and its unnamed-dot anonymization gate (see
`anonymizeLiveIndicatorSegmentIfSessionUnconfirmed` / ADR-075
context) are driven by runtime-session streaming events arriving on
a separate stream (`/api/channels/:id/stream` historically, or the
Tier B subscription as PLAN-068 rolls the projector over). The gate
depends on the transcript receiving a `session_started` canonical
message that the dot can bind to.

For **UI-originated** messages, the flow is: user types → runtime
session is started → `session_started` message is projected → dot
binds → `assistant_turn_segment` segments stream → dot anchors to a
named identity and fills in.

For **Telegram-originated** messages, the bridge currently awaits
the whole runtime turn inside the same async call before publishing
any event at all. By the time the Tier A events fire, the
transcript already contains both the user message and the completed
assistant response. No segment ever "streams" to the renderer,
because the mounted view did not see the runtime session at all —
it only sees the finished state via an app-shell refetch.

### Why draft → active has no progressive signal

`publishTelegramBridgeResult` fires `transport_ingress` with
`channelId = roomId`. But the direct-lane draft page renders at
`/chat/my-cats/:catId` and does **not** know the room id in advance
(the room is created by the bridge when the first message arrives).
The draft page also has no Tier B subscription open, because there
is no entity id to key it on.

So the only signal the draft page currently receives is the
collection-level `recents_changed` without any `channelId` — which
triggers `refreshAppShell()`, which eventually brings the new room
into the payload. That works, but it is inherently:

- single-shot (fires once the whole round trip is done)
- bulky (full app-shell JSON)
- opaque (the draft page cannot tell if the recents change is "my
  cat's first message" or "some unrelated channel moved up")

### `catId = null` is the load-bearing gap

The draft page cannot self-identify "this event is for the cat I am
rendering" because `publishTransportIngress` is called without a
`catId`. The `ChatEvent` contract already carries an optional
`catId`, but `publishTelegramBridgeResult` does not supply it.
Closing this gap is the minimum-diff unlock: once the event carries
`catId`, a draft-page handler can recognize "this is for me" and
start an optimistic transition the moment the first segment lands.

## Options considered

### Option A — Ship nothing; keep bulk refetch

- **Pros**: zero code change; the ADR-075 push rollout (PLAN-068)
  will eventually subsume Telegram-originated updates for active
  channels once channel-kind subscriptions are default.
- **Cons**: the draft case stays on the heavy path forever; no
  streaming UX for Telegram flows ever; Telegram-originated rooms
  will feel second-class next to UI-originated ones.

### Option B — Minimum-diff: populate `catId` on Telegram events

- **Pros**: one-line backend add (`publishTelegramBridgeResult`
  resolves the binding's `catActorId` / cat id and passes it to
  `publishTransportIngress`); draft page gains a clean signal to
  self-recognize.
- **Cons**: does not solve streaming on its own — the bridge still
  fires once post-completion; the draft page can only transition
  faster, not gain a dot bubble.
- **Why appealing**: unblocks every higher option below without
  committing to them.

### Option C — Stage the bridge events

- **Pros**: gives the renderer a real "user message received,
  assistant is thinking" signal; enables the dot bubble on both
  draft and active paths; reuses the existing `liveIndicator` /
  unnamed-dot plumbing without inventing a new UI.
- **Cons**: requires restructuring `bridgeTelegramWebhookToRoom`
  so that (1) user-message persist + event fire happens
  synchronously, then (2) runtime turn starts and streams
  independently, then (3) a completion event fires when the
  assistant segment lands; non-trivial because the bridge today
  also owns `deliver` (the outbound Telegram reply) and the
  ordering must stay: persist → fire user-ingress → run turn →
  stream segments → fire completion → deliver to Telegram.
- **Staging set (proposed vocabulary)**:
  - `transport_ingress` fired immediately after the user message
    is persisted (carries `catId`, `channelId`, maybe
    `messagePreview`)
  - the runtime session already emits `session_started` +
    `assistant_turn_segment` via the existing projector, so the
    `liveIndicator` path lights up naturally once the Telegram-
    initiated turn uses the same session plumbing
  - a final `room_updated` with `mutation: 'message_added'` fires
    on assistant completion (as today)

### Option D — Extend entity subscription with `kind='cat'`

- **Pros**: aligns cleanly with ADR-075's polymorphic contract;
  the draft page mounts a subscription on the **cat** it renders,
  receives snapshot + patches including "binding produced its
  first room, here is the new channel id"; once the active
  channel subscription opens, the cat subscription can hand off
  cleanly.
- **Cons**: new subscription kind = new server-side projector =
  non-trivial work; may be overkill if cat-level subscription
  never has anything else to deliver.
- **Nuance**: the first deliverable on cat subscription is exactly
  the "this cat's direct lane just got its first room" event the
  draft page needs. Additional cat-scoped patches (avatar changed,
  name changed, binding toggled) can layer on over time.

### Option E — Optimistic UI with local state

- **Pros**: no protocol change; the draft page detects
  `transport_ingress` for "my" cat via Option B's `catId` and
  synthesizes a local pending bubble until the refetch completes.
- **Cons**: client-side projection is explicitly called out in
  ADR-075 as an anti-pattern that duplicates authoritative server
  projection; drift risk.
- **Why only partial**: acceptable as an interim "dot bubble" stand-in
  while Option C / D land, but not as the durable answer.

## Recommendation

Ship in three stages:

1. **Stage 1 (lands with this research): `catId` on Telegram events.**
   Smallest unlock; closes the "draft cannot self-recognize" gap;
   required by every later stage.
2. **Stage 2: Extend the bridge to stage events (Option C).**
   The user-message-ingress event fires before the runtime turn
   starts. Existing `liveIndicator` + segment streaming plumbing
   then lights up the dot bubble for free. Completion event fires
   as today.
3. **Stage 3: Add `kind='cat'` entity subscription (Option D).**
   The draft page subscribes on mount; receives the new
   `channelId` as a cat patch; hands off to a `kind='channel'`
   subscription for the freshly-created room. The "full app-shell
   refetch" path becomes the fallback instead of the default.

Each stage is a standalone improvement; the plan sequences them so
nothing blocks on later stages.

## Open questions

- [ ] Does `publishTransportIngress` need both `catId` and
      `bindingId`, or is `catId` sufficient for the direct-lane
      draft recognition?
- [ ] Do we want the Stage-1 `catId` to be derived from
      `bridgeResult.receipt.bindingId` → binding lookup (needs
      binding context available to `publishTelegramBridgeResult`),
      or carried on the bridge result directly?
- [ ] Should Stage 2's "user message ingress" event be a distinct
      `ChatEvent.kind`, or can we reuse `transport_ingress` and add
      a discriminator field (`detail.phase = 'user_message'` vs
      `'assistant_response'`)?
- [ ] Stage 3's cat snapshot shape: does it include the list of
      bindings with their current room ids, or only the most
      recent transport event?
- [ ] How does this compose with Parallel Chat / Group Chat where
      one Telegram message might fan out to multiple active rooms?

## References

- [ADR-041: Push Transport and Chat Invalidations Over SSE](../decisions/041-push-transport-and-chat-invalidations-over-sse.md)
- [ADR-075: Adopt Push-Based Per-Entity State Subscription](../decisions/075-adopt-push-based-per-entity-state-subscription.md)
- [SPEC-076: Per-Entity State Subscription Protocol](../specs/SPEC-076-per-entity-state-subscription-protocol.md)
- [PLAN-068: Per-Entity State Subscription Rollout](../plans/PLAN-068-per-entity-state-subscription-rollout.md)
- Commit `9f428603`: fix(chat): refresh rooms after telegram polling ingress
- `cats-platform/src/server/routes/telegram.ts` — `publishTelegramBridgeResult`
- `cats-platform/src/platform/transports/telegram/bridge.ts` — `bridgeTelegramWebhookToRoom`, `TelegramWebhookBridgeResult`
- `cats-platform/src/platform/transports/telegram/polling.ts` — `onBridgeResult` callback plumbing
- `cats-platform/src/products/chat/api/transportEventPublisher.ts` — `publishTransportIngress`, `publishRoomMutation`
- `cats-platform/src/products/chat/renderer/hooks/useChatEvents.ts` — global Tier A consumer
- `cats-platform/src/app/server/subscribeRoutes.ts` — Tier B `/api/subscribe` endpoint

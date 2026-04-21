# ADR-079: Stage Telegram Ingress Events and Subscribe Cat Drafts

> Telegram-originated messages currently fire a single post-completion
> ingress event, which works for "is the chat up to date" but forbids
> typing-dot / segment-streaming UX on both active channels and
> direct-lane drafts. This ADR stages the bridge's event emission and
> introduces a `kind='cat'` entity subscription so draft pages can
> transition smoothly to the first arriving room.

## Status

Proposed

## Context

Commit `9f428603` added `publishTelegramBridgeResult` and wired it
into polling so the chat UI refreshes when a Telegram message lands.
Live debugging confirmed the fix works but surfaced two UX gaps that
together keep Telegram-originated conversations feeling second-class
versus UI-originated ones:

- **No dot bubble on Telegram ingress.** The bridge
  (`bridgeTelegramWebhookToRoom`) awaits the whole round trip —
  append user message → run runtime turn → deliver Telegram reply —
  before firing any event. By the time `publishTelegramBridgeResult`
  runs, the transcript already holds both the user message and the
  completed assistant response. The `liveIndicator` anonymization
  gate (`anonymizeLiveIndicatorSegmentIfSessionUnconfirmed`) never
  gets a chance to bind a dot; segments never stream to the mounted
  view.
- **Direct-lane draft runs through a heavy refetch.** Draft pages at
  `/chat/my-cats/:catId` have no channel id to subscribe to. Their
  only live signal is `recents_changed` without a `channelId`,
  consumed by `useChatEvents` in `useChatAppShellRefresh`, which
  triggers a full `refreshAppShell()` HTTP round trip. The UI does
  eventually switch from draft to active chat — confirmed during
  debugging — but the transition feels like a bulk swap rather than
  a progressive reveal.

See the background research —
[`2026-04-22-telegram-ingress-streaming-and-draft-transition.md`](../research/2026-04-22-telegram-ingress-streaming-and-draft-transition.md) —
for the full observation set and options matrix.

A deeper architectural problem: `publishTransportIngress` has an
optional `catId` parameter but `publishTelegramBridgeResult` does
not supply it. That makes every Telegram event look "anonymous" to
a cat-scoped subscriber. No draft page can self-identify "this
ingress event is for the cat I am rendering" without an
out-of-band lookup.

## Decision

### 1. Populate `catId` on every Telegram bridge event

`publishTelegramBridgeResult` resolves the `catId` from the
bridge context (via the accepted receipt's binding or the
`TelegramRelay` resolution path) and threads it through to
`publishTransportIngress`. This extends the event from
`{ channelId }` to `{ channelId, catId }`, matching the shape
`publishTransportIngress` already accepts. The
`room_updated`/`recents_changed` events remain channel-scoped and
do not gain a `catId` today.

No ordering guarantee beyond best-effort. If the binding cannot be
resolved (unknown binding, archived cat), `catId` stays `null` and
the event still fires — this is a signal, not an authoritative
projection.

### 2. Stage bridge event emission

`bridgeTelegramWebhookToRoom` splits its event emission into two
phases:

- **User ingress phase (synchronous with user-message persist).**
  After the user's Telegram message is appended to the room, fire
  a `transport_ingress` event that identifies the accepted user
  message. No `room_updated` yet — the runtime turn has not
  started.
- **Assistant completion phase (after runtime turn completes).**
  After the runtime session emits its final assistant segment and
  the room is updated, fire `room_updated` with
  `mutation: 'message_added'` as today.

The streaming itself between those phases keeps using the existing
runtime-session plumbing (`session_started` + `assistant_turn_segment`
canonical messages), which already drives `liveIndicator` dot binding
for UI-originated flows. Nothing about the segment stream is
Telegram-specific — once the bridge gives the runtime session room
to breathe without being awaited inline, the streaming UX lights up
for free.

`recents_changed` fires on the user-ingress phase (because recents
ordering does change the moment the user's message lands) and is
intentionally not re-fired on completion unless subsequent mutation
demands it.

### 3. Introduce `kind='cat'` entity subscription

Extend the ADR-075 / SPEC-076 entity subscription protocol with a
new polymorphic kind, `'cat'`:

- `GET /api/subscribe?kind=cat&id=<catId>` returns a snapshot of
  the cat's subscription-relevant state (bindings, most recent
  active room per direct lane, draft-vs-active status) and
  subsequent patches (new room created, binding toggled, name
  changed, ...).
- The direct-lane draft page opens the cat subscription on mount.
  On the patch announcing "new room created" (which carries the
  new `channelId`), the page transitions in-place to the active
  chat view and opens the corresponding `kind='channel'`
  subscription to stream segments.
- The cat subscription is cheap to open on any cat-scoped view,
  not just the draft (the Catlas overview, the companion settings
  surface, etc. can all benefit from authoritative cat state
  without inventing their own refetch).

The `kind='cat'` projector on the server reuses the same
subscription-hub contract as `kind='channel'` — snapshot + ordered
patches, reconnect-on-drop re-snapshots, one subscriber per
`(kind, id)` per tab via the shared hub.

### 4. Preserve ADR-041 as the fallback path

The global `/api/events/chat` stream continues to carry the Tier A
invalidations and keeps driving `refreshAppShell()`. The staged
events and cat subscription are **additive**: they take the common
case off the heavy refetch path without removing the fallback.

Concretely, a draft page whose cat subscription dropped mid-flight
will still notice a new room via the next `recents_changed` tick,
exactly as today.

### 5. Keep the subscription semantics clean across draft→active

When a cat subscription delivers "new room created" and the draft
page opens a channel subscription, the cat subscription stays open
so subsequent cat-scoped patches (binding toggles, other direct
lanes) continue to flow. The channel subscription closes when the
user navigates away. The two subscriptions run side-by-side with
no cross-talk — the projector owns that division cleanly.

## Consequences

### Positive

- Telegram-originated conversations gain the same dot-bubble /
  streaming affordance that UI-originated ones already have,
  without inventing a new UI surface.
- Direct-lane drafts transition progressively instead of bulk-swap:
  user message bubble lands first, typing dot binds, assistant
  response streams in.
- `catId` on events makes every future cat-scoped consumer (draft
  pages, Catlas, companion dashboards) addressable without a
  per-consumer lookup.
- `kind='cat'` adds a second polymorphic subscription kind, which
  is the pattern ADR-075 wants to demonstrate; future kinds
  (binding, runtime session, memory item) plug in through the
  same protocol.
- Each stage is independently shippable; Stage 1 delivers user
  value even if Stage 2 / 3 stall.

### Negative

- Staging the bridge requires restructuring an already-load-bearing
  function (`bridgeTelegramWebhookToRoom`); we must not regress
  the existing correctness guarantees (idempotency per
  `update_id`, receipt lifecycle, outbound delivery ordering).
- The server must now produce cat-level patches, which means a
  new projector path that cat-scoped mutations must remember to
  feed. This is the same "don't forget to publish" discipline
  ADR-075 already introduced for channel-kind.
- Two coexisting subscriptions on the draft page (cat + channel,
  once the first room lands) increases renderer-side state
  management. The shared subscription hub absorbs the fan-out but
  the handoff logic is a new thing to write.

### Neutral

- Does not change persisted entity shapes.
- Does not remove the ADR-041 fallback; the two tiers keep
  their current division of labor.
- Does not commit to a specific `'cat'` patch event vocabulary
  beyond "new room created"; additional cat-scoped patches can
  land incrementally as other views adopt the subscription.
- Does not alter Telegram outbound delivery semantics or
  idempotency around `update_id`.

## Alternatives Considered

### Alternative 1: Populate `catId` only (stop at Stage 1)

- **Pros**: one-line diff; tiny blast radius; draft page can
  start doing optimistic transitions on `transport_ingress`.
- **Cons**: no streaming — the user still sees bulk update; the
  draft transition improves slightly but still waits for the
  refetch.
- **Why rejected as sole answer**: misses the more valuable UX
  work. Kept as Stage 1 of the recommended rollout.

### Alternative 2: Stage events only (stop at Stage 2, no cat kind)

- **Pros**: unlocks dot bubble on active channels; avoids new
  subscription kind.
- **Cons**: draft pages still lack a real-time signal for "first
  room landed" because `transport_ingress` arrives with a
  `channelId` the draft cannot subscribe to yet; they'd still
  depend on the refetch to surface the new room.
- **Why rejected as sole answer**: solves active but not draft.
  Kept as Stage 2 of the recommended rollout.

### Alternative 3: Client-side optimistic bubbles

- **Pros**: no protocol change; draft page fakes the bubble until
  refetch completes.
- **Cons**: ADR-075 explicitly calls out client-side re-projection
  as the anti-pattern that created the cross-surface sync bug;
  drift risk between optimistic and authoritative state.
- **Why rejected**: acceptable as short-lived UI polish during
  rollout, not durable architecture. May still ship as a
  renderer-local nicety during Stage 2 before Stage 3 lands.

### Alternative 4: Wait for PLAN-068 to cover Telegram implicitly

- **Pros**: zero extra work; once `kind='channel'` subscriptions
  are default, active Telegram flows pick up the streaming path
  automatically once the bridge stops awaiting the runtime turn.
- **Cons**: PLAN-068 does not address the draft case at all; and
  Stage 2's bridge restructure is independent of whether the
  view's subscription is Tier B or Tier A.
- **Why rejected as sole answer**: leaves the draft gap open
  indefinitely and couples streaming UX to an unrelated rollout.

## References

- [Research: Telegram Ingress Streaming UX and Direct-Lane Draft Transition](../research/2026-04-22-telegram-ingress-streaming-and-draft-transition.md)
- [ADR-041: Push Transport and Chat Invalidations Over SSE](./041-push-transport-and-chat-invalidations-over-sse.md)
- [ADR-075: Adopt Push-Based Per-Entity State Subscription](./075-adopt-push-based-per-entity-state-subscription.md)
- [SPEC-076: Per-Entity State Subscription Protocol](../specs/SPEC-076-per-entity-state-subscription-protocol.md)
- [SPEC-080: Telegram Ingress Staged Events and Cat Subscription](../specs/SPEC-080-telegram-ingress-staged-events-and-cat-subscription.md)
- [PLAN-072: Telegram Ingress Streaming Rollout](../plans/PLAN-072-telegram-ingress-streaming-rollout.md)
- Commit `9f428603`: fix(chat): refresh rooms after telegram polling ingress

---

*Proposed: 2026-04-22*
*Proposed by: Claude under user-directed investigation*

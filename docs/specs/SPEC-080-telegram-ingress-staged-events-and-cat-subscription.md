# SPEC-080: Telegram Ingress Staged Events and Cat Subscription

> Extend the existing chat-event hub and the ADR-075 entity
> subscription protocol so Telegram-originated messages carry a
> `catId`, emit user-ingress events synchronously ahead of the
> runtime turn, and expose a new `kind='cat'` subscription that
> draft pages can use to transition in-place on first inbound
> message.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | TBD (Conductor on accept) |
| **Reviewer** | User |
| **Related ADR** | [ADR-079](../decisions/079-stage-telegram-ingress-events-and-subscribe-cat-drafts.md) |
| **Companion ADR** | [ADR-041](../decisions/041-push-transport-and-chat-invalidations-over-sse.md), [ADR-075](../decisions/075-adopt-push-based-per-entity-state-subscription.md) |
| **Follow-up plan** | [PLAN-072](../plans/PLAN-072-telegram-ingress-streaming-rollout.md) |

## Summary

Today `publishTelegramBridgeResult` fires three chat events
(`transport_ingress`, `recents_changed`, `room_updated`) once,
after `bridgeTelegramWebhookToRoom` completes the entire round
trip. Events carry `channelId` but always `catId = null`, and the
bridge awaits the runtime turn inline, so no segment ever streams
to the mounted view. Direct-lane draft pages have no channel id
to subscribe to; they transition via a full `refreshAppShell()`
refetch.

This spec defines three additive protocol changes, each
independently shippable, that together unlock dot-bubble /
segment-streaming UX for Telegram-originated messages and a
progressive draft-to-active transition:

1. `catId` becomes a first-class field on Telegram-originated
   chat events.
2. The bridge stages its event emission: user-ingress event fires
   synchronously after the user message is persisted, before the
   runtime turn starts; the completion event fires as today.
3. A new `kind='cat'` entity subscription lets cat-scoped views
   receive a snapshot + ordered patches, including the "first
   room created on this cat" patch the draft page needs to
   transition in-place.

## Goals

- identify every Telegram-originated chat event by the cat it
  belongs to, enabling cat-scoped consumers to filter without
  out-of-band lookups
- let the mounted channel view receive its user-message event
  before the runtime turn starts, so the existing `liveIndicator`
  dot-bubble plumbing can engage on Telegram flows the same way
  it does on UI flows
- give direct-lane draft pages a push-based signal for "your cat
  just got its first room" instead of relying on an app-shell
  refetch
- shape the cat subscription contract consistently with
  SPEC-076's channel subscription so a single renderer hook can
  consume both

## Non-Goals

- no change to persisted cat, binding, or channel data models
- no new outbound Telegram delivery semantics; `deliver` ordering
  and idempotency stay as today
- no cross-host transport work
- no replacement of ADR-041 collection invalidation; the new
  signals coexist with `/api/events/chat` rather than replacing
  it
- no reorganization of how the runtime session emits
  `session_started` / `assistant_turn_segment`; streaming UX
  reuses the existing runtime projector as-is
- no guarantee of ordered delivery across independent
  subscriptions (cat and channel subscriptions may race on the
  wire; consumers must tolerate "first message appears before
  snapshot" via the subscription hub's dedup)

## User Stories

- As a user with a Telegram-bound cat I opened for the first
  time, I want to see my message land, a typing dot appear, then
  the assistant reply stream in — not a bulk swap after a pause.
- As a user who bound a brand-new cat to Telegram and is sitting
  on the direct-lane draft page, I want the page to transition to
  the active chat in-place when the first inbound message
  arrives, without a visible refetch flicker.
- As a user browsing an already-active Telegram channel, I want
  inbound messages and my own sent messages to update the
  transcript in real time with the same streaming cues as
  UI-typed messages.

## Requirements

### Functional Requirements

1. **FR-1 (`catId` on events).** `publishTelegramBridgeResult`
   resolves the cat id from the bridge context and threads it
   into `publishTransportIngress` as the optional `catId`
   argument. If resolution fails (binding archived, cat not
   found), `catId` is `null` and the event still fires.
2. **FR-2 (Staged event shape).** The bridge emits the
   user-ingress `transport_ingress` event after the user message
   is persisted and before the runtime turn starts. The
   completion `room_updated` event fires after the runtime turn's
   final assistant segment lands, as today.
3. **FR-3 (Runtime session reuse).** Between Stage 1 and Stage 3,
   the runtime session path remains unchanged — it already emits
   `session_started` / `assistant_turn_segment` that drive the
   `liveIndicator` on mounted channel views.
4. **FR-4 (Cat subscription endpoint).**
   `GET /api/subscribe?kind=cat&id=<catId>` returns an SSE stream
   following the SPEC-076 shape: one `snapshot` event, then
   ordered `patch` events, then an eventual `close` event on
   disposal or error.
5. **FR-5 (Cat snapshot shape).** The cat snapshot includes:
   - `catId`
   - each active direct-lane binding with its current
     `channelId` (or `null` if the direct lane is still in
     draft), and the platform kind (`'telegram' | 'browser' | ...`)
   - a stable subscription version number
6. **FR-6 (Cat patch vocabulary — first slice).** The first
   patch kinds shipped are:
   - `direct_message.room_created` — carries the new `channelId`,
     the binding id, and the platform kind; emitted when a
     bridge's `bridgeTelegramWebhookToRoom` produces a new room
     for a binding that previously had none
   - `direct_message.binding_changed` — emitted when a binding's
     platform kind, status, or metadata changes
   Additional cat patches (name, avatar, memory summary) can
   land under the same contract later.
7. **FR-7 (Draft-page transition contract).** When a draft page
   mounted on `/chat/my-cats/:catId` receives a
   `direct_message.room_created` patch for the direct lane it is
   rendering, it:
   - opens a `kind='channel'` subscription for the new
     `channelId`
   - applies the incoming channel snapshot in-place, replacing
     the draft UI
   - keeps the cat subscription open
8. **FR-8 (Fallback safety).** If the cat subscription is not
   open (disconnected, unsupported, first-time-migration), the
   draft page's existing `refreshAppShell()` pathway still
   recovers the new room on the next `recents_changed` invalidation.

### Non-Functional Requirements

- **Compatibility**: existing Telegram flows that do not observe
  `catId` or cat subscriptions continue to work unchanged.
- **Observability**: every staged event and patch carries a
  correlation id tying the user-ingress event to the completion
  event (reuse the bridge receipt id where possible).
- **Backpressure**: the subscription hub reference-counts and
  dedups so two draft pages on the same cat share one upstream
  stream.
- **Error isolation**: failures in cat-patch publishing must not
  block message persistence or Telegram delivery (the existing
  `onBridgeResult` `try { } catch { }` discipline applies).

## Design Overview

### Event flow — before and after

```
BEFORE (today):

  Telegram poll → accept → bridge:
    ├─ append user message
    ├─ run runtime turn (awaited)
    ├─ append assistant message
    └─ deliver Telegram reply
  → publishTelegramBridgeResult
      ├─ transport_ingress(channelId, catId=null)
      ├─ recents_changed
      └─ room_updated(channelId)
  (all three fire together, after full round trip)

AFTER (this spec):

  Telegram poll → accept → bridge:
    ├─ append user message
    ├─ publishUserIngress(channelId, catId, bindingId)   ← NEW, synchronous
    │     emits transport_ingress(channelId, catId) + recents_changed
    ├─ publishCatPatch(catId, direct_message.room_created)  ← NEW, if room just created
    ├─ run runtime turn (awaited only for delivery ordering;
    │   segments stream via existing liveIndicator projector)
    ├─ append assistant message
    └─ deliver Telegram reply
  → publishAssistantCompletion(channelId, catId)         ← replaces old bulk call
      └─ room_updated(channelId, mutation='message_added')
```

### Cat subscription snapshot + patch shapes

```ts
// Snapshot
{
  kind: 'cat',
  id: '<catId>',
  version: CAT_ENTITY_SUBSCRIPTION_VERSION,
  state: {
    catId: string;
    bindings: Array<{
      bindingId: string;
      platform: 'telegram' | 'browser' | 'email' | ...;
      status: 'active' | 'paused' | 'archived';
      directLane: {
        channelId: string | null;   // null = still in draft
        updatedAt: string | null;
      };
    }>;
  };
}

// Patch: direct_message.room_created
{
  kind: 'cat',
  id: '<catId>',
  version: CAT_ENTITY_SUBSCRIPTION_VERSION,
  patch: {
    op: 'direct_message.room_created',
    bindingId: string;
    channelId: string;
    platform: 'telegram' | ...;
    timestamp: string;
  };
}
```

Exact field names and optionality are tied to the existing cat
state model; the spec freezes intent, not field-level bike-shedding.

### Chat event shape extension

`ChatEvent`'s `transport_ingress` kind already carries an optional
`catId`. This spec formalizes that every Telegram-originated
`transport_ingress` must supply a non-null `catId` when the
binding resolves, and may supply `null` only when resolution
fails.

`room_updated` and `recents_changed` keep their current shapes;
cat-scoped routing happens through `transport_ingress` and
through the cat subscription's patches.

### Interaction with ADR-075 / SPEC-076

- cat subscription follows the same protocol scaffold — snapshot
  event, ordered patch events, reconnect-on-drop re-snapshot,
  shared subscription hub on the renderer, one projector on the
  server
- `CAT_ENTITY_SUBSCRIPTION_VERSION` is introduced alongside
  `CHANNEL_ENTITY_SUBSCRIPTION_VERSION`; bumps follow the same
  migration rules
- the renderer `useEntitySubscription` hook gains a `'cat'`
  specialization; the hook contract stays the same as channel

### Interaction with ADR-041

- ADR-041's `/api/events/chat` keeps firing `recents_changed`,
  `transport_ingress`, `room_updated` as today, now with `catId`
  on Telegram-originated events
- consumers already on Tier A (like `useChatEvents` in
  `useChatAppShellRefresh`) see no behavioral regression — they
  still get the global invalidation and run their refetch
- the new cat subscription is additive; it provides a faster
  path for cat-scoped views without removing the fallback

## Dependencies

- ADR-075 / SPEC-076 entity subscription infrastructure
  (`/api/subscribe` endpoint, subscription hub, projector pattern)
- PLAN-068 Phase 1 / 2 work for `kind='channel'` lands before the
  Stage 3 cat→channel handoff can be fully exercised
- Existing runtime-session projector that emits `session_started`
  / `assistant_turn_segment` canonical messages (used by
  Stage 2's streaming UX)

## Open Questions

- [ ] Does `publishTelegramBridgeResult` need a `bindingId` field
      on its input, or can it continue to derive everything from
      the bridge result + relay lookup?
- [ ] Should the user-ingress event be a distinct `ChatEvent.kind`
      (e.g. `user_message_added`) for clarity, or keep reusing
      `transport_ingress` with a `detail.phase` discriminator?
- [ ] When the cat subscription delivers `direct_message.room_created`
      while the draft page is in the middle of its own composer
      draft, should the transition preserve the local draft text?
- [ ] Parallel chat groups: if one Telegram message fans out to
      multiple member rooms, does the cat subscription emit one
      patch per room or one group-level patch?
- [ ] Does `bridgeResult.roomCreated` (existing boolean) suffice
      as the signal to publish the cat patch, or do we need a
      finer "binding-level first room landed" check?

## References

- [ADR-079: Stage Telegram Ingress Events and Subscribe Cat Drafts](../decisions/079-stage-telegram-ingress-events-and-subscribe-cat-drafts.md)
- [ADR-075: Adopt Push-Based Per-Entity State Subscription](../decisions/075-adopt-push-based-per-entity-state-subscription.md)
- [ADR-041: Push Transport and Chat Invalidations Over SSE](../decisions/041-push-transport-and-chat-invalidations-over-sse.md)
- [SPEC-076: Per-Entity State Subscription Protocol](./SPEC-076-per-entity-state-subscription-protocol.md)
- [PLAN-072: Telegram Ingress Streaming Rollout](../plans/PLAN-072-telegram-ingress-streaming-rollout.md)
- [Research: Telegram Ingress Streaming UX and Direct-Lane Draft Transition](../research/2026-04-22-telegram-ingress-streaming-and-draft-transition.md)

---

*Created: 2026-04-22*
*Author: Claude under user-directed investigation*
*Related Plan: [PLAN-072](../plans/PLAN-072-telegram-ingress-streaming-rollout.md)*

# PLAN-072: Telegram Ingress Streaming Rollout

> Ship the three additive stages defined in ADR-079 / SPEC-080 —
> populate `catId` on Telegram events, stage bridge event emission
> to unlock dot-bubble streaming, and introduce a `kind='cat'`
> entity subscription so direct-lane drafts transition in-place on
> first inbound message.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | TBD (Conductor on accept) |
| **Reviewer** | User |

## Related Spec / Dependencies

- [SPEC-080: Telegram Ingress Staged Events and Cat Subscription](../specs/SPEC-080-telegram-ingress-staged-events-and-cat-subscription.md)
- [ADR-079: Stage Telegram Ingress Events and Subscribe Cat Drafts](../decisions/079-stage-telegram-ingress-events-and-subscribe-cat-drafts.md)
- [ADR-075: Adopt Push-Based Per-Entity State Subscription](../decisions/075-adopt-push-based-per-entity-state-subscription.md)
- [SPEC-076: Per-Entity State Subscription Protocol](../specs/SPEC-076-per-entity-state-subscription-protocol.md)
- [ADR-041: Push Transport and Chat Invalidations Over SSE](../decisions/041-push-transport-and-chat-invalidations-over-sse.md)
- [PLAN-068: Per-Entity State Subscription Rollout](./PLAN-068-per-entity-state-subscription-rollout.md) — cat subscription reuses its server scaffold
- [Research: Telegram Ingress Streaming UX and Direct-Lane Draft Transition](../research/2026-04-22-telegram-ingress-streaming-and-draft-transition.md)

## Overview

Three stages, each shippable standalone, landing in order:

- **Stage 1 — `catId` on events.** Smallest unlock. Closes the
  "draft page cannot self-identify" gap and makes every Telegram
  event cat-addressable for future consumers.
- **Stage 2 — Staged bridge emission.** Enables dot-bubble +
  segment streaming for active Telegram channels by firing the
  user-ingress event before the runtime turn starts, letting the
  existing `liveIndicator` projector do its job.
- **Stage 3 — `kind='cat'` subscription.** Gives direct-lane draft
  pages a push-based "your cat just got its first room" signal so
  they transition progressively instead of via a full app-shell
  refetch.

Each stage adds user value without requiring later stages to
land. Stage 2 can ship before Stage 3 (active-channel streaming
without draft-case improvement) or after (uniform UX). The plan
sequences them in the order that minimizes rework.

## Implementation Phases

### Phase 1: Populate `catId` on Telegram Events

- [ ] Task 1.1: Thread `catId` resolution into
      `publishTelegramBridgeResult` — accept either a resolved
      `catId` on the bridge result or derive it from the
      binding via `telegramRelay.resolveBinding`. Pass through
      to `publishTransportIngress`.
- [ ] Task 1.2: Make `catId` resolution failure a logged warning,
      not a thrown error; event still fires with `catId = null`.
- [ ] Task 1.3: Update `ChatEvent` JSDoc / type comments so
      consumers know `catId` is populated on Telegram-originated
      `transport_ingress` events (when resolution succeeds).
- [ ] Task 1.4: Server-side unit test — given a bridge result
      with a known binding, the emitted `transport_ingress`
      event carries the expected `catId`.
- [ ] Task 1.5: Server-side unit test — given a bridge result
      whose binding cannot be resolved, the event still fires
      with `catId = null`, no throw.

**Deliverables**: every Telegram-originated `transport_ingress`
event carries the originating cat id when the binding resolves;
no renderer-visible UX change yet but the signal is available to
future consumers.

### Phase 2: Stage Bridge Event Emission

- [ ] Task 2.1: Split `bridgeTelegramWebhookToRoom` so the user
      message persist + `transport_ingress` fire synchronously
      before `routeRoomMessage` (the LLM turn) starts.
- [ ] Task 2.2: Introduce an internal helper
      `publishUserIngressAfterPersist` (or reuse
      `publishTelegramBridgeResult` with a phase flag) so the
      persist → fire sequence is explicit and testable.
- [ ] Task 2.3: Ensure the runtime session initiated by
      `routeRoomMessage` continues to emit `session_started` +
      `assistant_turn_segment` as today so the `liveIndicator`
      dot-bubble plumbing binds naturally on the mounted
      Telegram channel view.
- [ ] Task 2.4: After the runtime turn completes and the
      assistant message is appended, fire `room_updated` with
      `mutation: 'message_added'` (replacing the current
      post-everything bulk emission for that event).
- [ ] Task 2.5: Audit and preserve existing invariants — idempotency
      per `update_id`, receipt status transitions, outbound
      `deliver` ordering, error paths in the bridge. Update the
      existing integration test for accepted receipts to cover
      the new phased emission order.
- [ ] Task 2.6: Server-side integration test — simulate a
      Telegram poll delivering a message, assert the
      user-ingress `transport_ingress` event fires before any
      runtime session / assistant segment event, and the final
      `room_updated` fires after.
- [ ] Task 2.7: Manual verification — on an active Telegram
      channel mounted in Chat, send a Telegram message and
      observe dot-bubble + segment streaming land the same way
      as for UI-originated messages.

**Deliverables**: active-channel Telegram flows stream with the
same dot-bubble + per-segment reveal as UI-originated flows. No
draft-case change yet.

### Phase 3: `kind='cat'` Entity Subscription

- [ ] Task 3.1: Add the server-side `kind='cat'` projector under
      `platform/orchestration/entitySubscriptions/cat.ts` (or
      parallel location). Implement `buildCatSubscriptionState`
      and `buildCatSubscriptionPatches` following the
      SPEC-076 contract.
- [ ] Task 3.2: Wire cat-patch emission into the places that
      currently create new direct-lane rooms — primarily the
      accepted-receipt branch of `bridgeTelegramWebhookToRoom`
      when `bridgeResult.roomCreated` is `true`. Emit
      `direct_message.room_created` on the cat subscription as
      soon as the new `roomId` is known.
- [ ] Task 3.3: Wire cat-patch emission for binding lifecycle
      changes (activate / pause / archive / metadata edit) where
      cat-scoped views would want to see it without an app-shell
      refetch.
- [ ] Task 3.4: Extend `/api/subscribe` routing to accept
      `kind=cat` with the same auth / session scoping as
      `kind=channel`.
- [ ] Task 3.5: Introduce `CAT_ENTITY_SUBSCRIPTION_VERSION` and
      document the migration rules (same shape as the channel
      version).
- [ ] Task 3.6: Renderer — specialize `useEntitySubscription`
      for `kind='cat'`, add cat reducer that applies the
      first-slice patch vocabulary, and expose the resulting
      cat state through the subscription hub.
- [ ] Task 3.7: Direct-lane draft page wiring — open a cat
      subscription on mount when the route resolves to a cat id;
      on receipt of a `direct_message.room_created` patch for the
      rendered direct lane, open a `kind='channel'` subscription
      for the new `channelId` and transition the page in-place.
- [ ] Task 3.8: Renderer unit + integration tests — draft page
      mounts → opens cat subscription → receives
      `direct_message.room_created` patch → opens channel
      subscription → renders the room content coming in via
      `snapshot` + `patch`; no `refreshAppShell()` fire on the
      happy path.
- [ ] Task 3.9: Fallback test — cat subscription closed or
      unsupported on the server; `refreshAppShell()` path still
      recovers the new room on the next `recents_changed`
      invalidation.
- [ ] Task 3.10: Manual verification — create a brand-new cat
      bound to a Telegram bot, land on its direct-lane draft
      page, send the first Telegram message, observe the page
      transition in-place with dot-bubble + streaming (Stage 2 +
      Stage 3 composed).

**Deliverables**: direct-lane drafts transition to active chat
via push, with the same streaming UX as active channels.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `cats-platform/src/server/routes/telegram.ts` | Modify | `publishTelegramBridgeResult` accepts / resolves `catId`, threads to `publishTransportIngress`; exports staged user-ingress helper. |
| `cats-platform/src/products/chat/api/transportEventPublisher.ts` | Modify | Public contract note: `catId` must be provided for Telegram-originated ingress when resolvable. |
| `cats-platform/src/platform/transports/telegram/bridge.ts` | Modify | Expose the user-message persist boundary so the caller can fire ingress events before the runtime turn starts. |
| `cats-platform/src/platform/transports/telegram/polling.ts` | Modify | Update `onBridgeResult` callback contract to accept / forward the staged emission callbacks. |
| `cats-platform/src/products/chat/api/routeSupport.ts` | Modify | Same update for the `reconcileTelegramTransportAfterBindingMutation` caller. |
| `cats-platform/src/app/server/polling.ts` | Modify | Same update for startup reconciliation. |
| `cats-platform/src/platform/orchestration/entitySubscriptions/cat.ts` | Create | `kind='cat'` projector: `buildCatSubscriptionState`, `buildCatSubscriptionPatches`, `CAT_ENTITY_SUBSCRIPTION_VERSION`. |
| `cats-platform/src/app/server/subscribeRoutes.ts` | Modify | Route `kind=cat` to the new projector. |
| `cats-platform/src/products/shared/renderer/hooks/useEntitySubscription.ts` | Modify | Add `kind='cat'` specialization. |
| `cats-platform/src/products/chat/renderer/App.tsx` | Modify | Direct-lane draft page opens cat subscription on mount; transitions in-place on `direct_message.room_created` patch. |
| `cats-platform/tests/chat-event-hub.test.js` | Modify | Add `catId`-on-ingress assertion to the existing Telegram bridge test. |
| `cats-platform/tests/telegram-polling.test.js` | Modify | Extend polling test to cover staged user-ingress + completion emission order. |
| `cats-platform/tests/cat-entity-subscription.test.js` | Create | Cat subscription: snapshot + `direct_message.room_created` patch on Telegram bridge; fallback without subscription. |

## Technical Decisions

- **Stage sequencing** — ship Stage 1 first because it is load-bearing
  for both later stages and carries near-zero risk. Stage 2 before
  Stage 3 because active-channel streaming is the more broadly
  valuable UX win and exercises the bridge restructure in isolation
  before the draft page handoff adds more moving parts.
- **Reuse `liveIndicator` plumbing in Stage 2** — do not invent a
  Telegram-specific dot-bubble path. The existing runtime session
  projector already emits the events the dot needs; staging the
  bridge is enough.
- **Cat subscription scope stays minimal at first** — only
  `direct_message.room_created` and `direct_message.binding_changed`
  patches ship in the first slice. Additional cat patches (name,
  avatar, memory) can land on demand without contract change.
- **Keep ADR-041 fallback intact** — the `refreshAppShell()` path
  is the safety net for any case the subscription does not cover.
  The plan explicitly tests the fallback still recovers.

## Testing Strategy

- **Unit Tests**:
  - `catId` threading through `publishTelegramBridgeResult`
    (Phase 1)
  - staged bridge emission order (Phase 2)
  - cat snapshot / patch construction (Phase 3)
- **Integration Tests**:
  - Telegram polling → bridge → user-ingress event fires before
    runtime turn (Phase 2)
  - New cat → first Telegram message → cat subscription emits
    `direct_message.room_created` patch (Phase 3)
  - Fallback: cat subscription unavailable, `refreshAppShell()`
    still recovers the new room (Phase 3)
- **Manual Testing**:
  - Phase 2 verification: active Telegram channel, observe
    dot-bubble + streaming
  - Phase 3 verification: draft page, observe in-place transition
    with streaming on first Telegram message

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Bridge restructure regresses idempotency around `update_id` | High | Keep the receipt pipeline untouched; move only the event-publish boundary; cover with existing integration tests. |
| `catId` resolution fails silently and consumers assume non-null | Medium | Document the null fallback in SPEC-080; consumers that require `catId` must handle null defensively. |
| Cat subscription projector misses a mutation site, stale cat state shipped to renderers | Medium | Co-locate patch emission with mutation sites; add a lint / review gate similar to PLAN-068's discipline. |
| Double subscriptions (cat + channel) leak on rapid navigation | Medium | Reuse the subscription hub's reference counting; add a renderer test that navigates in/out of draft pages repeatedly. |
| User composer draft lost during Phase 3 in-place transition | Low | Draft preservation is an explicit open question in SPEC-080; design the transition to copy draft text across the state swap. |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-22 | Plan created alongside ADR-079 / SPEC-080 and research note. |

---

*Created: 2026-04-22*
*Author: Claude under user-directed investigation*

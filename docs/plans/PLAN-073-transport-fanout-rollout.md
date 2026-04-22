# PLAN-073: Transport Fanout Rollout

> Ship the ADR-080 / SPEC-081 outbound fanout stage so web-UI
> messages mirror to Telegram (and future transports) via a single
> chat-event-hub subscriber. Three phases: add message origin/source
> binding metadata, introduce the fanout subscriber with Telegram as
> the first deliverer, then wire the per-binding toggle.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | TBD (Conductor on accept) |
| **Reviewer** | User |

## Related Spec / Dependencies

- [SPEC-081: Transport Fanout for Web-Originated Messages](../specs/SPEC-081-transport-fanout-for-web-originated-messages.md)
- [ADR-080: Fan Out Web-Originated Messages to Bound Transports](../decisions/080-fan-out-web-originated-messages-to-bound-transports.md)
- [ADR-079: Stage Telegram Ingress Events and Subscribe Cat Drafts](../decisions/079-stage-telegram-ingress-events-and-subscribe-cat-drafts.md)
- [ADR-041: Push Transport and Chat Invalidations Over SSE](../decisions/041-push-transport-and-chat-invalidations-over-sse.md)
- [Research: Web-Originated Messages Fanout to Bound Transports](../research/2026-04-22-web-to-telegram-outbound-fanout.md)

## Overview

Three phases, each shippable standalone:

- **Phase 1 — Origin/source-binding tagging on appends.** Add a
  `MessageOrigin` type; require every `appendMessage` call to
  supply it; carry optional `sourceTransportBindingId` for
  transport-owned ingress; `chatEventHub`'s `room_updated` detail
  carries those fields forward. No behavioral change alone, but
  every later phase depends on it.
- **Phase 2 — `TransportFanout` subscriber with Telegram deliverer.**
  The subscriber reads `room_updated` events, applies the
  eligibility rules from SPEC-081, and dispatches to Telegram via
  a deliverer that wraps the existing `telegramRelay.deliver`.
  Users see web-typed messages land on Telegram after this phase.
- **Phase 3 — Per-binding `outboundFanoutEnabled` toggle.** Add
  the field to the binding record with default `true`, make
  `TransportFanout` respect it, and expose a minimum API endpoint
  for flipping it (UI surface is out of scope for this plan).

## Implementation Phases

### Phase 1: Origin and Source-Binding Tagging on Message Appends

- [ ] Task 1.1: Introduce `MessageOrigin` type under the chat
      message model: `'web' | 'telegram' | 'browser' | 'email' |
      'runtime' | 'system' | 'unknown'`.
- [ ] Task 1.2: Thread `origin` into `appendMessage` as a required
      argument. Update every caller:
  - chat API handlers (composer submit) — `origin='web'`
  - parallel chat routes — `origin='web'` for user composer,
    `origin='runtime'` for assistant segments
  - group chat routes — same discipline as parallel
  - Telegram bridge ingress persist — `origin='telegram'` for
    user message and `sourceTransportBindingId=<bindingId>`;
    `origin='runtime'` for the assistant message with the same
    source binding id
  - any system / room-lifecycle append — `origin='system'`
- [ ] Task 1.3: Extend `ChatEvent.detail` on `room_updated` to
      include optional `messageId`, `origin`, and
      `sourceTransportBindingId`. Update `publishRoomMutation` to
      pass through metadata that already exists on the appended
      message.
- [ ] Task 1.4: Unit tests — append from each call site results in
      the expected `origin` and source binding metadata on the
      persisted message and the published event.
- [ ] Task 1.5: Add an ESLint rule or review checklist note
      reminding future `appendMessage` callers to supply `origin`
      and source binding metadata where applicable.

**Deliverables**: every new message persists with a known origin and
transport-ingress messages persist their source binding;
`room_updated` events carry that metadata; no user-visible behavior
change.

### Phase 2: `TransportFanout` Subscriber with Telegram Deliverer

- [ ] Task 2.1: Create `platform/transports/fanout/registry.ts`
      with `TransportDeliverer` contract and a runtime registry
      keyed by `binding.platform`.
- [ ] Task 2.2: Create `platform/transports/telegram/fanout.ts`
      implementing `telegramFanoutDeliverer` per SPEC-081. Wire
      registration on server boot.
- [ ] Task 2.3: Create `platform/transports/fanout/subscriber.ts`
      implementing `TransportFanout`. It:
  - subscribes to `chatEventHub` on startup
  - filters `room_updated` with `mutation: 'message_added'` and a
    known origin
  - resolves the message, the cat's bindings, and applies the
    SPEC-081 eligibility rules
  - dispatches through the deliverer registry
  - maintains the in-memory idempotency map
- [ ] Task 2.4: Wire the Telegram bridge to pass the selected
      binding id into the message append path before publication.
      The subscriber skips `sourceTransportBindingId` for the same
      message; do not depend on a post-delivery event marker.
- [ ] Task 2.5: Implement text formatting — `"[<sender name>] "`
      prefix for `origin='web'` user messages dispatched to
      Telegram, with `senderName` sourced from the owner profile
      display name. No prefix for `origin='runtime'` assistant messages.
      No `replyToMessageId` on fanout dispatches (since there is
      no originating Telegram message to thread under).
- [ ] Task 2.6: Server integration tests:
  - web-originated user message with an active Telegram binding
    → Telegram delivery fires with prefixed text
  - telegram-ingress flow → bridge delivers assistant reply →
    fanout skips the source binding from the first `room_updated`
    event (no duplicate delivery)
  - web-originated message with no Telegram binding → fanout is
    a no-op
  - message with `origin='unknown'` → fanout skips
- [ ] Task 2.7: Manual verification — in the EE-style scenario,
      type a message in web UI, observe it land in the Telegram
      chat with `[<sender name>] ...`. Send from Telegram, observe
      it NOT come back via fanout (bridge delivers, fanout skips).

**Deliverables**: web-originated messages reach Telegram; no
duplicate delivery on Telegram-ingress flows.

### Phase 3: Per-Binding `outboundFanoutEnabled` Toggle

- [ ] Task 3.1: Extend the binding schema / record type with
      `outboundFanoutEnabled?: boolean`. Missing field treated as
      `true`. No migration required.
- [ ] Task 3.2: Update `TransportFanout` to check
      `binding.outboundFanoutEnabled !== false` before dispatch.
- [ ] Task 3.3: Add a minimum binding-management API endpoint
      (`PATCH /api/bot-bindings/:id { outboundFanoutEnabled }`) so
      the flag is flippable without a UI change.
- [ ] Task 3.4: Integration test — binding with
      `outboundFanoutEnabled: false` receives no fanout
      deliveries; binding with `true` behaves as Phase 2.
- [ ] Task 3.5: Document the flag in the binding diagnostics
      surface so on-call can see its current value.

**Deliverables**: users can opt a binding out of fanout at the
backend; UI surface can land in a follow-up.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `cats-platform/src/products/chat/state/messages.ts` (or the canonical append helper) | Modify | `appendMessage` requires `origin: MessageOrigin`; persist origin and optional `sourceTransportBindingId` on the message record. |
| `cats-platform/src/products/chat/api/chatEventHub.ts` | Modify | `ChatEvent.detail` gains optional `messageId`, `origin`, `sourceTransportBindingId`. |
| `cats-platform/src/products/chat/api/transportEventPublisher.ts` | Modify | `publishRoomMutation` accepts and forwards the new detail fields. |
| `cats-platform/src/server/routes/telegram.ts` | Modify | Preserve the selected binding id through Telegram ingress so appends can stamp `sourceTransportBindingId`. |
| `cats-platform/src/platform/transports/telegram/bridge.ts` | Modify | Persist user-ingress message with `origin='telegram'`; assistant with `origin='runtime'`; both carry the selected `sourceTransportBindingId` before publish. |
| `cats-platform/src/products/chat/api/resources/parallelChatGroupRoutes.ts` | Modify | Supply `origin='web'` / `origin='runtime'` on every append. |
| `cats-platform/src/products/chat/api/routeSupport.ts` / `routeStateSupport.ts` | Modify | Same discipline on all non-bridge append sites. |
| `cats-platform/src/platform/transports/fanout/registry.ts` | Create | `TransportDeliverer` contract + registry keyed by `binding.platform`. |
| `cats-platform/src/platform/transports/fanout/subscriber.ts` | Create | `TransportFanout` subscribes to `chatEventHub`; applies eligibility; dispatches via registry; idempotency map. |
| `cats-platform/src/platform/transports/telegram/fanout.ts` | Create | `telegramFanoutDeliverer` wrapping `telegramRelay.deliver` and `chunkTelegramReply`. |
| `cats-platform/src/app/server/contracts.ts` (or equivalent) | Modify | Wire `TransportFanout` into `ResolvedServerDependencies` construction and startup. |
| `cats-platform/src/core/types.ts` | Modify | `BotBindingRecord` gains `outboundFanoutEnabled?: boolean`. |
| `cats-platform/src/products/chat/api/botBindingRoutes.ts` | Modify | `PATCH /api/bot-bindings/:id` accepts the toggle. |
| `cats-platform/tests/transport-fanout.test.js` | Create | Covers eligibility rules, source-binding dedup, text prefix, unsupported origins. |
| `cats-platform/tests/telegram-bridge-fanout.test.js` | Create | End-to-end: Telegram ingress does not duplicate; web ingress fans out correctly. |

## Technical Decisions

- **Phase 1 lands first** because it is load-bearing for every
  later phase and has zero user-visible change, so it is the
  safest to ship independently.
- **Phase 2 uses a single event type (`room_updated`)** rather
  than introducing a new fanout-specific event — keeps the event
  hub contract lean; fanout decisions stay in the subscriber.
- **No UI surface for the toggle in this plan** — the API
  endpoint is enough to flip the flag manually; a UI surface can
  land when a user asks for it.
- **Idempotency map is in-memory only.** At-least-once guarantees
  across process restarts are out of scope for first slice;
  acceptable because (a) duplicate Telegram messages are
  annoying but not dangerous, (b) the dispatch volume per
  process is low, (c) a persistent log can land later without
  contract change.

## Testing Strategy

- **Unit Tests**:
  - Phase 1: every caller of `appendMessage` supplies a valid
    `origin`; persisted record carries it.
  - Phase 2: fanout eligibility rules in isolation (mock
    registry, mock bindings).
  - Phase 2: Telegram deliverer formats text correctly, handles
    chunking, propagates `deliveryId`.
  - Phase 3: toggle respected.
- **Integration Tests**:
  - Phase 2: web send → Telegram delivery fires.
  - Phase 2: Telegram ingress + assistant reply → no duplicate
    Telegram delivery (bridge handles it; fanout skips).
  - Phase 2: same cat with two Telegram bindings → both receive
    the fanout.
- **Manual Testing**:
  - Phase 2: EE-style cat, type in web UI, check Telegram shows
    the prefixed message; send from Telegram, check web UI shows
    the bidirectional transcript without duplicates.
  - Phase 3: flip the toggle off, send from web, confirm nothing
    reaches Telegram; flip back on, confirm resumption.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Forgotten `origin` on a future `appendMessage` call creates silently-unrouted messages | Medium | Required argument in TS; ESLint rule / review gate; `'unknown'` is the explicit fallback and is never fanned out. |
| Fanout races the bridge's own delivery and produces duplicate Telegram messages | High | `sourceTransportBindingId` is persisted before `room_updated`; subscriber skips the source binding without waiting for bridge delivery; integration test covers this exact race. |
| Rate limiting on Telegram's `sendMessage` causes cascading failures | Medium | Bounded concurrency per binding in the subscriber; exponential backoff; visible in binding diagnostics. |
| Attachments on web-originated messages get silently dropped | Low | Log-and-skip with visible diagnostic; follow-up slice extends to attachments. |
| In-memory idempotency map loses state on restart, causing duplicate delivery on subscriber re-run | Low | Documented limitation; persistent log is a follow-up; process restart during active fanout is a rare event. |
| Parallel chat group semantics unclear for fanout | Medium | Phase 2 scope explicitly restricts to per-room fanout; parallel / group semantics are an open question in SPEC-081 and handled in a follow-up. |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-22 | Plan created alongside ADR-080 / SPEC-081 and research note. |

---

*Created: 2026-04-22*
*Author: Claude under user-directed investigation*

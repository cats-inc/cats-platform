# PLAN-026: Transport Live Updates and Private-Lane Transition

> Implement the first product-owned live-update slice for Telegram/private-lane
> changes by adding an SSE invalidation stream, wiring renderer subscriptions,
> and making `My Cats` routes promote from landing into real transcript view.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Assigned To** | Codex |
| **Reviewer** | User |

## Related Spec

[SPEC-037: Transport-Driven Live Chat Updates and Private-Lane Transition](../specs/SPEC-037-transport-driven-live-chat-updates-and-private-lane-transition.md)

## Overview

The Telegram transport side is now capable of receiving inbound traffic and
mapping it into Cat-private lanes, but the web product still treats state
changes as mostly pull-based.

This plan adds the missing push seam:

- server-side invalidation hub
- product-owned SSE route
- renderer-side subscription and refetch behavior
- in-place route promotion for Cat-private landing surfaces

The first slice should be correct before it becomes fancy. Invalidation +
refetch is acceptable for phase one.

## Implementation Phases

### Phase 1: Product-Owned Chat Invalidation Hub

- [ ] Add a small in-process invalidation publisher/subscriber seam inside
      `cats`
- [ ] Keep it product-owned and independent from `cats-runtime`
- [ ] Define a minimal event payload containing:
      - reason
      - occurredAt
      - channelId?
      - catId?
      - transport?
- [ ] Ensure transport, channel, and future app-shell mutations can publish
      through the same seam

**Deliverables**: shared server-side invalidation hub.

### Phase 2: SSE Route

- [ ] Add `GET /api/events/chat` SSE route
- [ ] Stream invalidation events using the hub from Phase 1
- [ ] Add connection lifecycle handling:
      - subscribe
      - unsubscribe
      - cleanup on disconnect
- [ ] Add tests for:
      - event delivery
      - disconnected clients
      - multiple subscribers

**Deliverables**: stable product-owned SSE endpoint.

### Phase 3: Publish Transport and Channel Invalidations

- [ ] Publish invalidation events from Telegram ingress/bridge paths when:
      - inbound message accepted
      - outbound reply written
      - linked room/private lane becomes available
- [ ] Publish channel/message invalidations from relevant room mutation paths
- [ ] Ensure Cat-bound Telegram traffic includes enough channel/cat context for
      renderer routing decisions

**Deliverables**: transport and room mutations actually drive SSE output.

### Phase 4: Renderer Subscription

- [ ] Add a renderer hook to subscribe to `GET /api/events/chat`
- [ ] Add reconnect logic with bounded retry/backoff
- [ ] On event:
      - refetch current state
      - keep route stable
      - avoid unnecessary focus stealing
- [ ] Keep the first slice simple: invalidation -> refetch

**Deliverables**: live client subscription path.

### Phase 5: Private-Lane Promotion

- [ ] Ensure `/chat/my-cats/:catId` can transition from landing/draft state to
      real transcript view after a transport invalidation
- [ ] Reuse existing route/direct-lane resolution rather than inventing a
      second route model
- [ ] Validate that the following can appear in place:
      - top bar
      - transcript
      - moved composer
      - new recents entry or updated recents state
- [ ] Keep the route unchanged during promotion

**Deliverables**: in-place Cat-private lane promotion.

### Phase 6: Targeted Refresh Follow-Through

- [ ] Narrow whole-app refetch where practical:
      - current room refresh
      - recents refresh
      - unread refresh
- [ ] Keep the fallback path able to refetch full app shell on reconnect or
      ambiguity

**Deliverables**: more selective refresh behavior without breaking correctness.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/products/chat/api/**` | Modify/Create | SSE route and invalidation plumbing |
| `src/server/routes/telegram.ts` | Modify | Publish transport invalidations |
| `src/platform/transports/telegram/bridge.ts` | Modify | Publish Cat/channel context for invalidation |
| `src/products/chat/renderer/hooks/**` | Modify/Create | SSE subscription and reconnection |
| `src/products/chat/renderer/App.tsx` | Modify | integrate live update hook |
| `src/products/chat/renderer/hooks/useAppShellRouting.ts` | Modify | support route-stable private-lane promotion |
| `tests/**` | Modify/Create | SSE, transport invalidation, and private-lane promotion regression tests |

## Technical Decisions

- Use `SSE`, not WebSocket, for the first slice.
- Keep the event contract invalidation-oriented rather than transcript-delta
  oriented.
- Preserve Telegram polling/webhook handling on the server.
- Treat private-lane promotion as a first-class behavior, not an edge case.
- Allow full app-shell refetch as the first correctness path, then narrow later.

## Testing Strategy

- **Server Tests**
  - SSE subscriber receives invalidation after Telegram ingress
  - multiple subscribers receive the same event
  - disconnect cleanup works
- **Integration Tests**
  - Telegram ingress updates linked Cat/private lane and emits invalidation
  - direct lane route can resolve newly materialized room state
- **Renderer Tests**
  - current thread refetch on event
  - recents/unread update on background thread event
  - Cat-private landing promotes to transcript view after live invalidation

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| SSE is introduced but only Telegram uses it, creating one-off logic | Medium | define it as a generic chat invalidation seam from the start |
| Renderer over-refetches and causes visible thrash | Medium | start with correctness, then narrow refresh scope in Phase 6 |
| Private-lane promotion causes route confusion or duplicate channels | High | reuse existing direct-lane resolution and keep route unchanged |
| Transport and runtime live-update concerns get mixed together | High | keep this seam product-owned and invalidation-oriented |

## Progress Log

| Date | Update |
|------|--------|
| 2026-03-27 | Plan created for SSE-based chat invalidation and Cat-private lane promotion after Telegram ingress |

---

*Created: 2026-03-27*
*Author: Codex*

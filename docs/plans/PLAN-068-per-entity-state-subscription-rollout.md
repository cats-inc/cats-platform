# PLAN-068: Per-Entity State Subscription Rollout

> Replace the current warm-snapshot + filtered-poll + liveIndicator-only
> sync with a push-based subscription layer keyed by `(entityKind, entityId)`,
> delivered first for `channel` and shaped so later entity kinds (project,
> artifact, run, ...) plug in without protocol change.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | TBD (Conductor on accept) |
| **Reviewer** | User |

## Related Spec / Dependencies

- [SPEC-076: Per-Entity State Subscription Protocol](../specs/SPEC-076-per-entity-state-subscription-protocol.md)
- [ADR-075: Adopt Push-Based Per-Entity State Subscription](../decisions/075-adopt-push-based-per-entity-state-subscription.md)
- [ADR-041: Push Transport and Chat Invalidations Over SSE](../decisions/041-push-transport-and-chat-invalidations-over-sse.md) — collection-level invalidation tier this rollout coexists with
- [Research: Per-Entity State Subscription Architecture](../research/2026-04-21-per-entity-state-subscription-architecture.md)
- [SPEC-074: Cross-Surface Draft Dispatch and Warm Product Handoff](../specs/SPEC-074-cross-surface-draft-dispatch-and-warm-product-handoff.md)
- [ADR-073: Target-Surface Dispatch and Warm Cross-Surface Handoff](../decisions/073-use-target-surface-dispatch-and-warm-cross-surface-handoff.md)
- [SPEC-059: Heterogeneous Runtime Delivery Normalization](../specs/SPEC-059-heterogeneous-runtime-delivery-normalization.md)

## Overview

The rollout replaces three loosely coupled state-refresh paths with one
push-based subscription primitive:

- cold fetch of `/api/app-shell`
- ADR-073 warm-handoff snapshot (frozen at submit time)
- 5s `/api/app-shell` background poll with `chat` excluded from merge
- `/api/channels/:id/stream` driving `liveIndicator` only

becomes:

- cold fetch of `/api/app-shell` (kept; still seeds channel list / cats
  metadata)
- warm-handoff snapshot (kept; **repositioned to first-paint-only**)
- `/api/subscribe?kind=<kind>&id=<id>` per-entity stream (new) driving the
  authoritative state of each mounted entity view
- background poll (kept; narrowed in scope to runtime health)

The plan ships `channel` first to close the observed cross-surface
handoff bug (Chat→Code conversation stuck on unnamed dot), then proves
the protocol is polymorphic by landing a second kind, then retires the
remaining workaround paths.

## Implementation Phases

### Phase 1: Server Subscription Endpoint and Channel Publisher

- [ ] Task 1.1: Add `GET /api/subscribe?kind=&id=` SSE endpoint in the
      platform host, reusing existing session/auth middleware. Parse
      `kind`, `id`; validate access; return `text/event-stream`.
- [ ] Task 1.2: Define the serialized event envelope (`snapshot`,
      `patch`, `close`) plus a shared `version` field per kind.
- [ ] Task 1.3: Stand up an in-process subscription publisher module
      (`platform/orchestration/entitySubscriptions/` or similar) that
      accepts subscriber registrations and writes events out.
- [ ] Task 1.4: Implement `kind='channel'` projector adapter: on
      subscribe, build a full `SelectedChannelView`-shaped snapshot
      from the current chat state; emit the `snapshot` event.
- [ ] Task 1.5: Hook `kind='channel'` patch emission into every
      server-side mutation that already projects state today —
      `appendStartedRuntimeSessionMessage`, `projectChatChannelInteractionToCore`,
      `canonicalInteraction.ts` paths, workflow turn updates,
      continuation events. Every such mutation must emit the matching
      `message.appended`, `message.updated`, `turn.updated`, or
      `session.*` patch.
- [ ] Task 1.6: Server-side unit + integration tests covering: cold
      subscribe emits snapshot; subsequent mutations emit patches in
      order; reconnect emits a fresh snapshot; unsubscribe releases
      the upstream projection subscriber.

**Deliverables**: one working SSE endpoint that delivers authoritative
channel state continuously; no renderer change yet; server-side
projection remains single-owner.

### Phase 2: Renderer Subscription Hub and `channel` Consumer

- [ ] Task 2.1: Add `products/shared/renderer/entitySubscriptionHub.ts`
      with reference-counted `(kind, id)` coalescing, backoff-reconnect,
      and pluggable dispatcher per kind.
- [ ] Task 2.2: Add `useEntitySubscription({ kind, id, onSnapshot,
      onPatch, onClose })` hook backed by the hub.
- [ ] Task 2.3: Register a `channel` dispatcher that applies patches
      to the local app-shell `selectedChannel` slice via the shared
      `setState` seam. Must correctly upsert messages by id, update
      `roomRouting.workflow`, and keep local optimistic state from
      being clobbered.
- [ ] Task 2.4: Wire the `channel` subscription at the ChatView mount
      (for chat surface) and at the equivalent Code/Work surface
      mount. First integration: open subscription on
      `selectedChannel.id` change.
- [ ] Task 2.5: Redefine warm-handoff consumption — the handoff
      bundle still seeds first-paint, but `useEntitySubscription` is
      opened on the same `(channel, id)` immediately, and the first
      `snapshot` event replaces the warm state. Document this
      transition in the ADR-073 / SPEC-074 ownership section.
- [ ] Task 2.6: Renderer tests: handoff snapshot is superseded by the
      first `snapshot` event; `message.appended` appends to
      `selectedChannel.messages`; stale patches on reconnect are
      absorbed by the replacement snapshot; multiple components
      subscribing to the same channel share one upstream stream.

**Deliverables**: the cross-surface Chat→Code handoff no longer leaves
the target surface frozen. Observable symptom: the unnamed dot
transitions to the assistant identity and the assistant reply lands in
`selectedChannel.messages` on both Chat and Code renders of the same
channel.

### Phase 3: Cross-Surface Acceptance, Polling Cleanup, and ADR-041 Coexistence

- [ ] Task 3.1: Lock in the target-surface regression test from
      SPEC-076's acceptance criteria: both `/chat/chats/:id` and
      `/code/chats/:id` reach the same final transcript within the
      turn's normal latency.
- [ ] Task 3.2: Make `mergeWorkspaceBackgroundRefreshPayload`'s `chat`
      exclusion a permanent, documented contract. Add a code comment
      pointing at ADR-075 and SPEC-076 so future contributors don't
      "fix" it by merging chat again.
- [ ] Task 3.3: Audit other places in the renderer that treat
      `app-shell` polling as an implicit chat-state refresh path.
      Update or remove as needed; none should exist post-rollout.
- [ ] Task 3.4: Ensure `/api/app-shell` background polling's response
      payload does not balloon just to keep chat-field clients happy;
      if we can trim chat slices in the poll response now that nothing
      consumes them, do it (optional tail task).
- [ ] Task 3.5: Verify ADR-041 coexistence on target surface. After
      a cross-surface handoff, `/api/events/chat` invalidation events
      must continue flowing to `useChatAppShellRefresh` /
      `useChatEvents` and must continue driving `refreshAppShell()`
      on `room_updated` / `recents_changed` / `unread_changed` /
      `transport_ingress`. The entity subscription must not prevent
      or duplicate this path.
- [ ] Task 3.6: Document the two-tier model in code: add a
      structured comment at the `useChatEvents` call site in
      `useChatAppShellRefresh.ts` pointing at ADR-041 (collection
      tier) and ADR-075 (entity tier) so future contributors don't
      try to collapse them into one stream.
- [ ] Task 3.7: Audit every surface that reads collection-level
      chat state — `payload.chat.channels`, `payload.chat.recents`,
      `payload.chat.parallelChatGroups`, unread counters — to
      confirm none of them accidentally depend on the entity
      subscription for freshness. Anything that does must either
      move to the entity snapshot (if it's truly per-entity) or
      stay on the ADR-041 refetch path (if it's collection-level).

### Phase 4: Polymorphism Proof with a Second Entity Kind

- [ ] Task 4.1: Pick second kind (recommended: `project` for the
      Chat→Work preview slice, or `artifact` for Work→Code). Confirm
      with product scope.
- [ ] Task 4.2: Server-side projector publishes snapshot + patches for
      the chosen kind using the Phase 1 subscription facility (no new
      transport, no new hub).
- [ ] Task 4.3: Consuming view uses `useEntitySubscription({ kind:
      '<chosen>', id })` and a kind-specific dispatcher registered
      with the hub.
- [ ] Task 4.4: Happy-path acceptance: cross-surface preview stays
      live over at least two server-side mutations of the chosen
      entity.

**Deliverables**: explicit evidence the protocol is polymorphic;
subsequent kinds (run, cat, memory, deployment, ...) follow the same
template without architecture change.

### Phase 5 (Optional, Post-Rollout): LiveIndicator and Stream Consolidation

- [ ] Task 5.1: Evaluate folding `/api/channels/:id/stream` delivery
      into the `channel` subscription so liveIndicator patches
      travel on the same wire as transcript patches.
- [ ] Task 5.2: If adopted, keep backwards-compat shim on the old
      endpoint until all consumers migrate.

**Deliverables**: optional; not required for closing the handoff bug.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `cats-platform/src/platform/orchestration/entitySubscriptions/index.ts` | Create | Subscription publisher core (refcount, projector hook-in, event serializer). |
| `cats-platform/src/platform/orchestration/entitySubscriptions/channel.ts` | Create | `kind='channel'` snapshot/patch adapter. |
| `cats-platform/src/app/server/api/subscribe.ts` (or nearest routing equivalent) | Create | `GET /api/subscribe?kind=&id=` SSE handler. |
| `cats-platform/src/products/chat/state/runtime-dispatch/canonicalInteraction.ts` | Modify | Emit `message.appended` / `turn.updated` patches after existing state mutations. |
| `cats-platform/src/products/chat/state/runtime-session/shared.ts` | Modify | Emit `session.started` / `session.closed` / `message.appended` patches alongside existing appends. |
| `cats-platform/src/products/shared/renderer/entitySubscriptionHub.ts` | Create | Renderer-side hub + `useEntitySubscription` hook. |
| `cats-platform/src/products/shared/renderer/entitySubscriptionChannelDispatcher.ts` | Create | Kind-specific reducer for `channel` patches against app-shell state. |
| `cats-platform/src/products/shared/renderer/components/chat-view/ChatView.tsx` | Modify | Open channel subscription on mount / selected channel change. |
| `cats-platform/src/products/shared/renderer/WorkspaceProductApp.tsx` | Modify | Redefine warm-handoff semantics as first-paint only; confirm subscription is opened immediately. |
| `cats-platform/src/products/shared/renderer/hooks/useWorkspaceAppShellRouting.ts` | Modify | Doc comment making `chat` exclusion permanent with pointer to ADR-075. |
| `cats-platform/src/products/shared/renderer/crossSurfaceNavigationHandoff.ts` | Modify (comment/contract) | Clarify snapshot is first-paint placeholder; no state-of-record role. |
| `cats-platform/src/products/shared/renderer/hooks/useLiveIndicator.ts` | Possibly modify in Phase 5 | Optional consolidation into channel subscription. |
| `cats-platform/tests/entity-subscription-channel-roundtrip.test.ts` | Create | Server-side publisher + renderer dispatcher roundtrip (snapshot, patch, reconnect). |
| `cats-platform/tests/cross-surface-handoff-transcript-sync.test.tsx` | Create | Target surface receives `session_started` + assistant segments after warm handoff. |
| `cats-platform/tests/app-shell-background-refresh-chat-exclusion.test.ts` | Create | Explicit regression lock: chat state is never merged from poll. |
| `cats-platform/tests/adr-041-coexistence-after-cross-surface-handoff.test.tsx` | Create | After warm handoff, ADR-041 invalidation events still reach `useChatEvents` and trigger `refreshAppShell()` for collection-level changes. |
| `cats-platform/src/products/chat/renderer/hooks/useChatAppShellRefresh.ts` | Modify (comment only) | Add structured comment at the `useChatEvents` call site pointing at the ADR-041 / ADR-075 two-tier model. |

## Technical Decisions

- **Transport: SSE for first slice.** Same-origin same-process; matches
  existing `/api/channels/:id/stream`. WebSocket upgrade stays an open
  option; revisit if bidirectional client→server messages are needed.
- **One SSE connection per `(kind, id)` per tab.** Simpler to start;
  multiplex later if connection count becomes a real cost.
- **Version field per kind.** Additive field bumps ignored; incompatible
  schema change bumps version and renderer refuses to apply until it
  knows the new version.
- **Reconnect strategy: snapshot-on-reconnect.** No cursor-based replay
  in first slice; snapshot is authoritative and small enough for v1.
- **No new persisted fields.** Everything in this rollout is delivery
  plumbing, not a model change.
- **Channel subscription is authoritative for `selectedChannel`; other
  app-shell slices still flow through cold fetch and runtime poll.**
  Narrow ownership = simpler contract.

## Testing Strategy

- **Unit Tests**:
  - subscription hub: refcount open/close, reconnect backoff, dispatch
    to registered kind
  - channel dispatcher: idempotent message upsert, turn-state merge,
    optimistic-state preservation
  - server channel publisher: snapshot shape matches
    `SelectedChannelView`; each projection mutation emits the matching
    patch
- **Integration Tests**:
  - end-to-end channel roundtrip: subscribe, mutate via existing
    server paths, confirm renderer state reflects the mutation
  - cross-surface handoff regression: staged warm bundle + open
    subscription, verify `session_started` and assistant segments
    reach target renderer
  - reconnect: drop the SSE mid-turn, reconnect, confirm replacement
    snapshot brings the view back in sync
  - ADR-041 coexistence: with an active entity subscription on
    channel A, emit a server-side `room_updated` / `unread_changed`
    / `recents_changed` / `transport_ingress` event for channel B;
    assert the target surface calls `refreshAppShell()` and picks
    up collection-level changes without disturbing the entity
    subscription state on channel A
- **Manual Testing**:
  - `+New chat → Pomodoro app` → target Code surface shows named
    assistant bubble and streams the reply; Chat surface in parallel
    tab shows identical transcript
  - open the same channel on `/chat/chats/:id` and `/code/chats/:id`
    in two tabs, observe identical state end-to-end
  - disconnect network briefly during a running turn; confirm state
    recovers on reconnect

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Server-side projectors forget to emit a patch after a mutation | High — silent state drift on target surface | Route every persisted state mutation through a helper that combines mutate + publish; add projection unit tests that assert patch is emitted |
| Snapshot payload grows too large for long-lived channels | Medium — first-paint lag after reconnect | Transcript truncation + separate `/api/channels/:id/messages?before=` pagination for history; only the live tail is required in the snapshot |
| Multiple components subscribing to the same `(kind, id)` open multiple streams | Medium — server fan-out pressure | Subscription hub refcounts and coalesces; integration test asserts one upstream per `(kind, id)` per tab |
| Optimistic client state clobbered by incoming patches | Medium — user types a message and sees it flicker | Dispatcher preserves locally-pending messages by correlating on message id; server emits the canonical id when the message lands |
| Electron host or future mobile client transports differ | Low (first slice same-origin only) | Keep transport and hub layers separable; SSE handler is a thin wrapper over the publisher core |
| Phase 1 lands server-side without any renderer consumer | Low — dead code risk | Phase 1 and Phase 2 gated together in rollout; server publisher stays feature-flagged until renderer hub ships |
| A contributor "simplifies" by folding ADR-041 invalidation into the entity subscription or vice versa | Medium — regresses sibling-channel recents/unread or forces every sidebar channel to subscribe | Structured comment at the `useChatEvents` site plus SPEC-076 non-goal plus explicit coexistence test (Task 3.5) block the refactor at review time |
| Channel snapshot drifts into carrying collection-level state (sibling channels, global unread, recents) | Medium — snapshot payload bloats and ADR-041 boundary erodes | SPEC-076 scopes snapshot to channel-local fields + compare-group membership of the mounted channel only; review must reject snapshot additions that aren't channel-local |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-21 | Plan drafted alongside ADR-075 / SPEC-076 |

---

*Created: 2026-04-21*
*Author: Claude under user-directed investigation*

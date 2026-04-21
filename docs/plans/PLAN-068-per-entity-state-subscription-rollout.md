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
- [ ] Task 2.7: **Write the subscription-aware refetch merge
      helper.** Today `useChatAppShellRefresh.ts:134-148` applies
      a refetched payload via `setPayloadImmediate(payload)` —
      full state replace. Once entity subscriptions land, that
      path would stomp the subscription-owned `selectedChannel`
      state on every ADR-041 invalidation for a sibling channel.
      Introduce
      `mergeAppShellPreservingActiveEntityState(current, next,
      activeSubscribedIds)` in
      `products/shared/renderer/` (or a peer location). The full
      per-field rule lives in SPEC-076 *Merge contract* — the
      helper implements exactly that. Summary of the load-bearing
      parts:
      - **Envelope-level fields** (`app`, `products`, `desktop`,
        `lobby`, `guideCatAssist`, `runtime`, `runtimeSetup`,
        `metadata`, `bootstrapAttemptId`, plus owner-context
        fields): copy from `next` unconditionally.
      - **Chat collection fields** (inside `chat`): copy from
        `next` unconditionally — `id`, `name`, `bossCatId`,
        `cats`, `channels` (carries per-channel unread/last-activity),
        `globalOrchestrator`, `newChatDefaults`, `capabilities`,
        `conversationBehavior`, `advancedDraftControls`,
        `folderBrowsePreferences`, `botBindings`, `newChatAssist`.
      - **Selection identity pair**
        (`chat.selectedChannelId` + `chat.selectedChannel`):
        preserve **both** from `current` when
        `activeSubscribedIds` contains
        `current.chat.selectedChannelId`; otherwise copy **both**
        from `next`. Never split the pair — the shared renderer
        reads both independently (`workspaceAppViewState.ts:46-47`)
        and mismatches trigger `channelEntry.ts:66` route wake.
      - **Compare-group membership** (`chat.parallelChatGroups`):
        for each group, if `memberChannelIds` intersects
        `activeSubscribedIds`, keep the `current` entry
        (subscription is the writer); otherwise take the `next`
        entry. New groups in `next` with no subscribed member
        get added; groups dropped by `next` that still contain
        a subscribed member are kept for the subscription to
        resolve.
      Expose `entitySubscriptionHub.getActiveSubscribedIds(kind)`
      so the helper can query active subscriptions without
      reaching into hub internals. Replace the
      `setPayloadImmediate(payload)` call at
      `useChatAppShellRefresh.ts:141-145` with a call that uses
      this merge helper.
- [ ] Task 2.8: Tests for the merge helper:
      - sibling-channel invalidation doesn't modify the mounted
        `selectedChannel.messages` or its
        `selectedChannelId`/`selectedChannel` pair
      - selection identity pair moves together — no half-update
        that would trip `channelEntry.ts:66`
      - compare-group membership: a sibling group updates
        freely, but a group containing the mounted channel is
        not overwritten by a stale `next.parallelChatGroups`
      - invalidation that also changes `chat.channels` /
        `chat.cats` / `chat.botBindings` /
        `chat.parallelChatGroups` (sibling groups) still applies
        those collection fields
      - no active subscription → full-replace behavior preserved
      - edge case: `next` drops a group that `current` has with
        a subscribed member → group kept, subscription patches
        resolve the fate

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
- [ ] Task 3.5: **Land an ADR-041 consumer on the shared workspace
      shell, using the Task 2.7 merge helper.** Today the
      `/api/events/chat` invalidation SSE is only consumed by
      `src/products/chat/renderer/hooks/useChatAppShellRefresh.ts`
      (which is mounted by the Chat-only `App.tsx`). The shared
      `src/products/shared/renderer/WorkspaceProductApp.tsx` — used
      by Code, Work, and any future product target surfaces — only
      runs cold load (`useWorkspaceAppShellRouting.ts:176` and
      `:313`) plus the 5s runtime-health refresh via
      `mergeWorkspaceBackgroundRefreshPayload`, which explicitly
      excludes chat state. That means after a cross-surface
      handoff (e.g. Chat → Code Pomodoro), the Code target shell
      has **no** live path for channel list / recents /
      `parallelChatGroups` / unread freshness. Fix this by either:
      - extracting the ADR-041 consumer into a shared hook
        (e.g. `products/shared/renderer/hooks/useWorkspaceChatEvents.ts`)
        and mounting it inside `WorkspaceProductApp`, or
      - lifting `useChatEvents` itself into a shared location and
        wiring both `App.tsx` and `WorkspaceProductApp.tsx` to it.
      Implementer choice; either path must reach every target
      shell (`/chat`, `/code`, `/work`). **The consumer must call
      the Task 2.7 `mergeAppShellPreservingActiveEntityState`
      helper on refetch, not `setPayloadImmediate` / full replace.**
      Otherwise every sibling-channel invalidation would stomp the
      mounted channel's entity subscription state. This task is a
      **hard prerequisite** for declaring Phase 3 done: without
      it, the target-surface promise of "collection state stays
      live via ADR-041 while entity subscription streams deep
      state" is false on Code/Work surfaces — and without Task
      2.7's merge helper, even the Chat shell regresses.
- [ ] Task 3.6: Verify ADR-041 coexistence on every target
      surface. After a cross-surface handoff to Code or Work,
      emit a server-side `room_updated` / `recents_changed` /
      `unread_changed` / `transport_ingress` event and assert the
      target shell calls `refreshAppShell()` and updates its
      collection state. The entity subscription on the mounted
      channel must not be disturbed by the refetch.
- [ ] Task 3.7: Document the two-tier model in code: add a
      structured comment at the shared `useChatEvents` (or
      `useWorkspaceChatEvents`) call site and at the Chat-side
      `useChatAppShellRefresh.ts` consumer, pointing at ADR-041
      (collection tier) and ADR-075 (entity tier). If Task 3.5
      consolidates the consumer into a shared hook, the old
      Chat-only call site is removed rather than duplicated.
- [ ] Task 3.8: Audit every surface that reads collection-level
      chat state — `payload.chat.channels`, `payload.chat.recents`,
      `payload.chat.parallelChatGroups`, unread counters — on
      Chat, Code, and Work shells. Confirm none of them accidentally
      depend on the entity subscription for freshness and none are
      stranded on cold-load-only. Anything that is must either
      move to the entity snapshot (if it's truly per-entity) or
      move onto the ADR-041 refetch path (if it's collection-level).

**Deliverables**: the polling path is explicitly runtime-health only;
chat state sync is owned end-to-end by two **named, landed** paths
— ADR-041 collection-tier invalidation consumed on the **shared
workspace shell** (not only on the Chat shell) plus ADR-075 entity
subscription on the mounted entity. Code and Work target surfaces
observably receive collection-level invalidations after handoff.

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
| `cats-platform/tests/adr-041-coexistence-after-cross-surface-handoff.test.tsx` | Create | After warm handoff to Code/Work, ADR-041 invalidation events reach the shared workspace shell and trigger `refreshAppShell()` for collection-level changes. |
| `cats-platform/src/products/shared/renderer/hooks/useWorkspaceChatEvents.ts` | Create (or lift `useChatEvents` into this shared location) | Shared ADR-041 consumer that every target shell (Chat/Code/Work) mounts. Closes the gap where `WorkspaceProductApp` today has no `/api/events/chat` consumer and relies solely on cold load + runtime-health poll. |
| `cats-platform/src/products/shared/renderer/mergeAppShellPreservingActiveEntityState.ts` | Create | Subscription-aware refetch merge helper. Copies collection-level fields from the fresh payload; preserves `selectedChannel` when an entity subscription is active for that id. Replaces `setPayloadImmediate(payload)` in the ADR-041 consumer path. Queries `entitySubscriptionHub.getActiveSubscribedIds('channel')`. |
| `cats-platform/tests/merge-app-shell-preserving-active-entity-state.test.ts` | Create | Unit tests for the merge helper: sibling-channel invalidation preserves mounted `selectedChannel.messages`; collection-level fields flow through; no active subscription preserves full-replace behavior. |
| `cats-platform/src/products/shared/renderer/WorkspaceProductApp.tsx` | Modify | Mount the shared ADR-041 consumer so Code/Work target surfaces refresh collection state on invalidation. Add structured comment at the call site pointing at ADR-041 (collection tier) and ADR-075 (entity tier). |
| `cats-platform/src/products/chat/renderer/hooks/useChatAppShellRefresh.ts` | Modify | Re-point at the shared `useWorkspaceChatEvents` (or equivalent) so the Chat shell uses the same consumer as Code/Work. Add structured comment at the call site pointing at ADR-041 / ADR-075 two-tier model. |

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
  app-shell slices flow through cold fetch, the runtime-health
  background poll, and the ADR-041 `/api/events/chat` invalidation
  path (now mounted on the shared workspace shell, not only the
  Chat shell — see Task 3.5).** Narrow ownership = simpler contract.
- **ADR-041 refetch must be subscription-aware.** The existing
  `refreshAppShell()` uses `setPayloadImmediate(payload)` which
  is a full state replace and would stomp entity-subscription
  state if left unchanged. Phase 2 introduces a
  `mergeAppShellPreservingActiveEntityState` helper that the
  shared ADR-041 consumer routes through. Preservation scope when
  a subscription is active for the mounted channel: the selection
  identity pair (`chat.selectedChannelId` AND `chat.selectedChannel`,
  never split), and any `chat.parallelChatGroups` entry whose
  `memberChannelIds` contains a subscribed channel id. Everything
  else (sibling channels, cats roster, product-level settings,
  envelope-level runtime/metadata) copies from the fresh payload.
  See SPEC-076 *Merge contract: ADR-041 refetch must not overwrite
  subscribed entity state* for the full per-field rule.

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
  - ADR-041 coexistence — shared workspace shell: mount
    `WorkspaceProductApp` on `/code/chats/:id=A` (and separately
    on `/work/...`), open an entity subscription on channel A
    that has received (a) some `message.appended` patches whose
    content is NOT yet in the server's app-shell projection
    (e.g. patched mid-turn) and (b) a
    `compareGroupMembership.updated` patch putting channel A
    into group G1 while the server's app-shell projection still
    returns an older `parallelChatGroups` without G1 containing
    A. Then emit a server-side `room_updated` /
    `unread_changed` / `transport_ingress` event for channel B;
    assert:
    - the target surface calls `refreshAppShell()`
    - collection fields for non-subscribed entities update from
      the refetched payload: `chat.channels` (including per-
      channel unread on B), `chat.cats`, `chat.botBindings`,
      and sibling entries in `chat.parallelChatGroups` (groups
      that don't contain channel A)
    - `selectedChannel.messages` on channel A is **unchanged** —
      the patched messages are still there, *not* replaced by
      the staler server projection of A
    - the selection identity pair is preserved together —
      `chat.selectedChannelId` still equals A and
      `chat.selectedChannel.id` still equals A; `channelEntry.ts`
      does not fire a spurious route-wake
    - group G1 in `chat.parallelChatGroups` still contains A —
      the subscription-applied membership is not overwritten by
      the staler refetch
    - parity against the Chat shell at `/chat/chats/:id=A`
    This test is the durable regression lock for the Task 2.7
    merge helper.
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
| Phase 3 lands but ADR-041 consumer stays Chat-only; Code/Work target shells have no collection-level refresh path after handoff | High — recents/sidebar/parallelChatGroups go stale on Code/Work surfaces; the two-tier model is a false promise outside Chat | Task 3.5 is a hard prerequisite for closing Phase 3. Acceptance test must exercise ADR-041 invalidation arriving while mounted on `/code/chats/:id` and `/work/...`, not only `/chat/chats/:id` |
| ADR-041 consumer keeps its current `setPayloadImmediate(payload)` full-replace behavior after entity subscriptions land | High — every sibling-channel invalidation stomps the mounted channel's entity-subscription state; the cross-surface transcript regresses to the exact bug this rollout was written to close | Task 2.7 introduces `mergeAppShellPreservingActiveEntityState` and the ADR-041 consumer must route through it. Task 3.5 explicitly requires the shared consumer to call the merge helper, not `setPayloadImmediate`. Integration test asserts mounted `selectedChannel.messages` unchanged after a sibling-channel invalidation |
| Merge helper preserves `selectedChannel` but not `selectedChannelId`, so the selection identity pair ends up half-updated | Medium — the shared renderer reads both fields independently (`workspaceAppViewState.ts:46-47`) and `channelEntry.ts:66` treats a mismatch as "route is out of sync", firing extra `updateSelectedChannel()` calls and selection churn | Task 2.7 rule explicitly mandates moving the pair together. Task 2.8 tests include "selection identity pair moves together". Integration test asserts both halves stay on A after sibling invalidation |
| Merge helper lets `next.chat.parallelChatGroups` fully replace the array, overwriting a live `compareGroupMembership.updated` patch for the mounted channel | Medium — compare footer flips back to the staler server projection whenever any sibling-channel ADR-041 event fires; the "entity snapshot owns mounted channel's compare membership" contract is a false promise | Task 2.7 partitions `parallelChatGroups` by `memberChannelIds ∩ activeSubscribedIds`: subscribed-intersecting groups come from `current`, others from `next`. Task 2.8 tests include "group containing mounted channel is not overwritten". Integration test asserts the subscription-applied G1 membership survives a sibling invalidation |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-21 | Plan drafted alongside ADR-075 / SPEC-076 |

---

*Created: 2026-04-21*
*Author: Claude under user-directed investigation*

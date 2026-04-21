# SPEC-076: Per-Entity State Subscription Protocol

> Define the contract by which a renderer subscribes to the
> authoritative state of a single entity on the platform host and
> receives a snapshot plus an ordered stream of patches. First shipping
> kind is `channel`; the contract is polymorphic so `project`,
> `artifact`, `run`, and future kinds plug in without redesign.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | TBD (Conductor on accept) |
| **Reviewer** | User |
| **Related ADR** | [ADR-075](../decisions/075-adopt-push-based-per-entity-state-subscription.md) |
| **Companion ADR** | [ADR-041](../decisions/041-push-transport-and-chat-invalidations-over-sse.md) (collection-level invalidation tier) |
| **Follow-up plan** | [PLAN-068](../plans/PLAN-068-per-entity-state-subscription-rollout.md) |

## Summary

Today the renderer keeps entity state "fresh" through three loosely
coupled mechanisms — cold fetch of `/api/app-shell`, cross-surface
warm-handoff snapshot, and a 5s background `/api/app-shell` poll that
deliberately ignores conversation content. Runtime events flow to the
server (which projects them into persisted state) and to the renderer
(which only drives the `liveIndicator`), so canonical messages never
reach the target surface after a cross-surface handoff.

This spec defines a single subscription protocol, keyed by
`(entityKind, entityId)`, where:

- the server is the sole projector of every entity's state
- the renderer is a pure subscriber
- the warm-handoff bundle is repositioned as a first-paint placeholder

## Goals

- give the renderer one way to keep the state of a specific entity in
  sync with the server's authoritative state
- make cross-surface navigation delivery (Chat→Code conversation,
  Chat→Work project, Work→Code artifact, and future analogues)
  correct end-to-end with no surface-specific sync code
- keep the server as the only place that knows how to project events
  into entity state
- preserve the warm-handoff "feel continuous" promise from ADR-073 at
  the state layer, not only the visual layer
- shape the contract polymorphically from day one, even if only
  `channel` is wired in the first slice

## Non-Goals

- no change to persisted `Conversation`, `Project`, `Artifact`, or
  `Run` data models
- no multi-machine, LAN-tunneled, or cross-host transport work
- no durable event log, cursor-based replay, or at-least-once delivery
  guarantee beyond "snapshot on reconnect"
- no offline conflict resolution or local cache persistence
- no WebSocket migration decision (stay on SSE for first slice; keep
  WS as an open option)
- no new persisted auth tokens; stream auth reuses the existing
  platform host session
- no removal of `/api/app-shell` cold-boot fetch or background
  runtime-health refresh in the first slice
- **does not define or replace collection-level invalidation.** The
  existing [ADR-041](../decisions/041-push-transport-and-chat-invalidations-over-sse.md)
  `/api/events/chat` SSE stream — today consumed only by
  `useChatAppShellRefresh` on the Chat shell, and which PLAN-068
  Task 3.5 extends to the shared workspace shell so Code/Work
  target surfaces are also covered — remains the authoritative
  seam for "channel list / parallelChatGroups / recents / unread /
  transport-ingress changed → refetch app-shell." Entity
  subscriptions only cover the deep state of a single mounted
  `(kind, id)`; they do not replace ADR-041, and ADR-041 does not
  replace them. The merge rule that keeps these two from stomping
  each other is defined below in *Merge contract: ADR-041 refetch
  must not overwrite subscribed entity state*.

## User Stories

- As a user who clicks `+New chat → Pomodoro app`, I want the
  redirected Code conversation to show the assistant typing and then
  streaming a reply within seconds, matching what I would see if I
  had started the same chat directly on `/code/new`.
- As a user who later clicks a `project` deep-link in Chat that opens
  in Work, I want the project's status, tasks, and latest activity to
  be live, not a snapshot from when I clicked the link.
- As a product owner, I want to add a new entity kind (say, `run`)
  and have cross-surface previews work without redesigning the sync
  story.

## Problem Statement

The target surface's `selectedChannel.messages` is frozen at the
warm-handoff snapshot. The server continues projecting messages onto
the channel (`session_started`, assistant segments), but those
projections never reach the target renderer. As a result:

- `hasConfirmedLiveIndicatorSessionStart()` permanently returns false
  on the target surface
- `anonymizeLiveIndicatorSegmentIfSessionUnconfirmed()` permanently
  masks the live typing indicator into an "unnamed dot" state
- the assistant reply never materializes as a persisted transcript
  entry on the target surface, even after the server has sealed it

The root cause is architectural: there is no push-based state sync
between the server's canonical projector and the target surface's
rendered state. The existing `/api/channels/:id/stream` subscription
is scoped to `liveIndicator` only. The existing `/api/app-shell`
poll is scoped to runtime health only. Nothing carries projected
state to the target surface.

## Requirements

### Functional Requirements

1. **FR-1: Subscription opening.** The renderer must be able to call
   `subscribeEntity({ kind, id })` and receive:
   - exactly one `snapshot` event containing the complete current
     state of `(kind, id)` before any `patch` event
   - zero or more `patch` events in the order they were applied on the
     server
   - a terminal `close` event if the server decides to stop the
     subscription (entity deleted, auth lost, etc.)

2. **FR-2: Snapshot semantics.** The `snapshot` event payload must be
   sufficient for the renderer to render the entity without
   referencing any other cache. It is a self-contained object shaped
   per entity kind.

3. **FR-3: Patch semantics.** Each `patch` event must be
   independently applicable in receive order. Patches that depend on
   an earlier state must carry enough context (e.g., `messageId`,
   `turnId`, `segmentIndex`) that the renderer can refuse to apply
   out-of-order events without corrupting state.

4. **FR-4: Reconnect recovery.** On transient disconnect, the
   subscription hub must reconnect and receive a fresh `snapshot` event
   that replaces local state. Missed patches between disconnect and
   reconnect are not replayed; the replacement snapshot is the
   recovery contract.

5. **FR-5: Reference-counted fan-in.** If multiple components in the
   same renderer tab subscribe to the same `(kind, id)`, the hub must
   open at most one upstream stream. When the last subscriber
   unsubscribes, the upstream stream must close.

6. **FR-6: Server sole projector.** The server projects runtime
   events into entity state and publishes corresponding `patch`
   events. The renderer must not contain projection logic that would
   derive the same state from a different event stream.

7. **FR-7: First-paint warm snapshot handoff.** When a view mounts
   against a warm-handoff bundle from ADR-073, the renderer must
   still open the matching `(kind, id)` subscription. The first
   `snapshot` event replaces the warm state; the warm bundle is
   discarded at that point.

8. **FR-8: Polymorphic contract.** The protocol is parameterized on
   `kind`. Adding a new kind requires publishing a typed schema for
   its `snapshot` and `patch` event payloads; it must not require
   changes to the transport, hub, or general client machinery.

### Non-Functional Requirements

- **Performance:**
  - snapshot event delivered within 500ms p95 under normal conditions
  - patch event end-to-end latency within 200ms p95 once projected
  - subscription open call non-blocking; first paint must not wait
    for snapshot
- **Scalability:**
  - one tab may hold up to ~10 active `(kind, id)` subscriptions
    without degradation
  - server must deduplicate publishers per `(kind, id)` so one
    projection does not fan out N times internally
- **Reliability:**
  - automatic reconnect with exponential backoff on transient network
    loss
  - server snapshot on reconnect absorbs missed-patch recovery
- **Security:**
  - subscription stream auth reuses platform host session; no new
    tokens introduced
  - server validates the requesting session has access to
    `(kind, id)` before accepting the subscription

## Design Overview

### Surface shape

Client hook:

```ts
interface EntitySubscriptionOptions<Kind extends EntityKind> {
  kind: Kind;
  id: string;
  onSnapshot: (snapshot: EntitySnapshot<Kind>) => void;
  onPatch: (patch: EntityPatch<Kind>) => void;
  onClose?: (reason: SubscriptionCloseReason) => void;
}

function useEntitySubscription<Kind extends EntityKind>(
  options: EntitySubscriptionOptions<Kind>,
): EntitySubscriptionHandle;
```

Under the hood, a platform-owned hub (`entitySubscriptionHub`)
coalesces subscribers, opens at most one upstream stream per
`(kind, id)` per tab, and fans events out to local subscribers.

### Server endpoint

```
GET /api/subscribe?kind=<kind>&id=<id>
  text/event-stream

event: snapshot
data: { "kind": "...", "id": "...", "state": { ... }, "version": 1 }

event: patch
data: { "kind": "...", "id": "...", "patch": { ... }, "version": 1 }

event: close
data: { "reason": "..." }
```

`version` is per-kind; it lets the renderer reject a `snapshot` with
an unsupported shape rather than silently render corrupt state.

### Event vocabulary for `kind = 'channel'` (first slice)

Snapshot `state` payload is the existing `ChatChannelView`
projection (the shape today served as
`ChatShellState.selectedChannel`) plus the channel-local fields
the renderer reads today to render the mounted channel. Concretely
the snapshot must carry:

- the `ChatChannelView` fields for the mounted channel id —
  transcript messages, room routing / workflow / active turn,
  participants, runtime-session metadata carried on the channel
  itself — all of the state currently populated under
  `AppShellPayload.chat.selectedChannel`
- the **selection identity pair** `chat.selectedChannelId` +
  `chat.selectedChannel.id`; the snapshot asserts both and the
  merge helper preserves them together
- the **parallel chat group membership of the mounted channel** —
  the subset of `ChatShellState.parallelChatGroups` entries whose
  `memberChannelIds` contains the subscribed channel id (so
  `resolveChatViewCompareState` can render the compare footer for
  the mounted channel without depending on an app-shell refetch)

The snapshot is explicitly *not* the whole `AppShellPayload.chat`
tree. Sibling channels (`chat.channels`), cross-channel product
metadata (`chat.globalOrchestrator`, `chat.capabilities`,
`chat.botBindings`, `chat.newChatAssist`), the cats roster
(`chat.cats`), and compare groups that don't include the mounted
channel all stay on the ADR-041 collection tier and are not
republished on this stream. Envelope-level fields
(`runtime: RuntimeStatusSummary`, `runtimeSetup`, `metadata`,
`bootstrapAttemptId`, etc.) likewise stay off-stream.

Patch event kinds:

- `message.appended` — a new `ChatMessage` added to the transcript
  (room_created, user input, session_started, assistant segments,
  system notices, ...)
- `message.updated` — in-place edit of an existing message (rare;
  used for reply commits and continuation edits)
- `message.removed` — retracted or gc'd message
- `turn.updated` — `roomRouting.workflow.activeTurn` or
  `turnHistory` change
- `session.started` — `runtime.*Session` set; may be redundant with
  `message.appended` for the session_started message but kept
  explicit for clarity
- `session.closed` — paired lifecycle event
- `compareGroupMembership.updated` — the subscribed channel was
  added to / removed from / reordered inside a parallel chat group
  (only the membership relevant to the mounted channel; the global
  group-list invalidation still flows via ADR-041)

Exact payload shapes are enumerated in the implementation plan; the
contract owner here is that every patch carries enough identity
(`messageId`, `turnId`, `sessionId`) to be applied idempotently.

### Future kinds (not implemented in first slice)

- `project` — for Chat→Work project previews; patches like
  `task.added`, `task.updated`, `status.changed`
- `artifact` — for Work→Code artifact previews; patches like
  `artifact.file.changed`, `artifact.run.attached`
- `run` — for Work→Code run detail; patches like `run.phase.updated`,
  `run.log.appended`
- `cat`, `memory`, `deployment` — TBD per future roadmap

These kinds MUST NOT require new transport or new hub logic. Adding
one is: (1) server-side projector publishes patches, (2) a typed
schema lands for the snapshot and patch payloads, (3) consuming
views call `useEntitySubscription({ kind, id })`.

### Interaction with warm-handoff (ADR-073)

1. Chat submits; staging writes a warm bundle and navigates.
2. Target surface mounts against the warm snapshot (instant first
   paint).
3. Target view immediately opens a `channel` subscription for the
   routed channel id.
4. First `snapshot` event from the server replaces the target
   surface's state; warm bundle is discarded.
5. Subsequent `patch` events keep the target surface current.

`mergeWorkspaceBackgroundRefreshPayload`'s chat exclusion stays in
place — chat state is owned by the subscription, not the poll.

### Interaction with ADR-041 (two-tier state model)

This spec is **orthogonal** to [ADR-041's invalidation
contract](../decisions/041-push-transport-and-chat-invalidations-over-sse.md).
The two run side-by-side on every target surface:

- ADR-041's `/api/events/chat` stream drives
  `refreshAppShell()` on `room_updated`, `recents_changed`,
  `unread_changed`, `transport_ingress` so collection-level state
  (channel list, `parallelChatGroups`, recents, unread,
  private-lane promotion) stays fresh.
- SPEC-076's `/api/subscribe?kind=channel&id=<mounted>` stream
  keeps the *deep* state of the currently-mounted channel fresh
  via snapshot + patch.
- A renderer mount opens both: ADR-041 once at shell level,
  ADR-075 per mounted entity. Neither contract tries to absorb
  the other.
- When a message lands on a sibling channel that the user is not
  viewing, ADR-041 invalidates and `refreshAppShell()` updates the
  sidebar; SPEC-076 is silent because no subscription targets that
  entity. When the user navigates into that channel, a new
  subscription opens and its `snapshot` provides the full live
  state.

**Mount owner for the ADR-041 consumer is the shared workspace
shell, not only the Chat shell.** Today
`src/products/chat/renderer/hooks/useChatAppShellRefresh.ts` is the
only place that calls `useChatEvents` — which means
`src/products/shared/renderer/WorkspaceProductApp.tsx` (used by
Code, Work, and any future cross-surface product) currently relies
exclusively on cold load + the runtime-health background refresh
for its `chat.channels`, `chat.recents`, `chat.parallelChatGroups`,
and unread slices. That is a real freshness gap on Code and Work
target surfaces after cross-surface handoff. PLAN-068 Task 3.5
names the fix: extract (or lift) the ADR-041 consumer into a
shared hook that every target shell mounts. Without that, the
two-tier model is a false promise on non-Chat surfaces.

**Merge contract: ADR-041 refetch must not overwrite subscribed
entity state.**

Today only the 5s background runtime-health poll is safe against
overwriting entity state — it uses
`mergeWorkspaceBackgroundRefreshPayload`
(`useWorkspaceAppShellRouting.ts:176`), which only copies
`runtime`, `runtimeSetup`, `metadata`, and `bootstrapAttemptId`
from the fresh payload. The ADR-041 path is *not* safe today:
`useChatAppShellRefresh.ts:134-148` calls
`setPayloadImmediate(payload)` which does
`setState({ status: 'ready', payload })`, a full replace. If that
path keeps running unchanged after entity subscriptions land, an
invalidation on a sibling channel would clobber the active
subscription's `selectedChannel.messages` on every
`refreshAppShell()` call.

The contract this spec imposes on implementers is stated below.
Field names refer to the actual shapes of
`AppShellPayload extends PlatformHostEnvelope` and
`ChatShellState` in
`src/products/shared/api/workspaceContracts.ts` and
`src/shared/platform-contract.ts`.

1. The ADR-041 consumer must not apply an incoming
   `refreshAppShell()` payload with a blind full replace when any
   entity subscription is active. It must route the payload
   through a merge helper that preserves subscription-owned
   slices.

2. Implementers introduce (or extend) a helper — working name
   `mergeAppShellPreservingActiveEntityState(current, next,
   activeSubscribedIds)` — with these per-field rules. The
   helper returns a new `AppShellPayload`.

3. **Envelope-level fields** (from `PlatformHostEnvelope`). Copy
   from `next` unconditionally: `app`, `products`, `desktop`,
   `lobby`, `guideCatAssist`, `runtime`, `runtimeSetup`,
   `metadata`, `bootstrapAttemptId`, plus the `PlatformOwnerContext`
   fields (`setupCompleteAt`, `ownerDisplayName`, `ownerAvatarColor`,
   `ownerAvatarUrl`, `lastProductSurface`, `guideCat`,
   `assistantPresets`). None of these are owned by channel-kind
   subscriptions.

4. **Chat collection fields** (inside `chat: ChatShellState`).
   Copy from `next` unconditionally: `id`, `name`, `bossCatId`,
   `cats`, `channels`, `globalOrchestrator`, `newChatDefaults`,
   `capabilities`, `conversationBehavior`,
   `advancedDraftControls`, `folderBrowsePreferences`,
   `botBindings`, `newChatAssist`. These describe sibling
   channels, the whole-tenant roster, and product-level settings;
   they are not owned by any single channel subscription.
   Per-channel unread counts and last-activity markers live
   inside `ChatChannelSummary` entries on `chat.channels`, so
   they ride along with the collection refresh.

5. **Selection identity pair** (`chat.selectedChannelId` and
   `chat.selectedChannel`). These **must move together**. The
   shared renderer reads both independently
   (`workspaceAppViewState.ts:46` reads `selectedChannelId`,
   `:47` reads `selectedChannel?.id`) and a mismatch triggers
   `shouldWakeRouteChannel` in `channelEntry.ts:66` → extra
   `updateSelectedChannel()` calls and churn. The merge rule:
   - If `activeSubscribedIds` contains `current.chat.selectedChannelId`:
     keep both `current.chat.selectedChannelId` AND
     `current.chat.selectedChannel` as a pair (the subscription
     owns both halves of this identity).
   - Otherwise: copy both `next.chat.selectedChannelId` AND
     `next.chat.selectedChannel` from `next` as a pair.
   Never split the pair across `current` and `next` — that is the
   split-brain state `channelEntry.ts:66` is specifically checking
   against.

6. **Compare-group membership** (`chat.parallelChatGroups`). The
   entity snapshot declares the subscription is the authoritative
   writer for "which groups contain the mounted channel" (see
   *Event vocabulary for `kind = 'channel'`* above — the snapshot
   carries the mounted channel's membership, and
   `compareGroupMembership.updated` patches keep it current). If
   the merge helper let `next.chat.parallelChatGroups` fully
   replace the array, a stale `memberChannelIds` from an
   app-shell refetch could overwrite a live subscription patch.
   Rule:
   - Partition `next.chat.parallelChatGroups` and
     `current.chat.parallelChatGroups` by whether each group's
     `memberChannelIds` intersects `activeSubscribedIds` for kind
     `'channel'`.
   - For groups that **do not** intersect (sibling groups): take
     the `next` version. These are pure ADR-041 territory.
   - For groups that **do** intersect (groups containing at
     least one subscribed channel): take the `current` version.
     The entity subscription writes these; the refetch must not
     touch them.
   - Groups that exist in `current` but not `next` while
     containing a subscribed channel: keep them (let the
     subscription deliver a `compareGroupMembership.updated`
     patch or a fresh snapshot decide their fate).
   - Groups that exist in `next` but not `current`: add them
     (new group creation visible to the refetch).

7. The entity subscription hub exposes
   `getActiveSubscribedIds(kind)` (or equivalent) so the merge
   helper can query active subscriptions without reaching into
   hub internals.

8. The 5s poll's existing exclusion via
   `mergeWorkspaceBackgroundRefreshPayload` stays as-is.

9. Reconnect behavior remains: when an entity subscription
   reconnects, its fresh `snapshot` is authoritative and
   replaces local subscription-owned slices regardless of what
   the ADR-041 refetch path last wrote.

Symmetric rule: when no subscription is active
(`activeSubscribedIds` empty, or the mounted channel's id is
not in the set), ADR-041 refetches may write the full payload —
there is no subscription-owned state to preserve. The merge
helper degrades to a full replace in that case.

Without this merge contract, the two-tier model deadlocks: every
sidebar invalidation would flush the live transcript and/or flip
the mounted channel's compare membership back to a stale server
projection. Implementers who follow PLAN-068 Task 3.5 without
Task 2.7 (the merge helper task) would ship a renderer that
regresses the very bug this spec was written to close.

### Interaction with liveIndicator (no regression)

`useLiveIndicator` continues to consume `/api/channels/:id/stream`.
Once the channel subscription lands, we have a choice:

- option i: keep both streams, let the hub open both and dispatch
  patches into the message store while runtime events still drive
  liveIndicator separately
- option ii: fold liveIndicator event delivery into the channel
  subscription's patch stream

The first slice picks option i to avoid entangling the liveIndicator
reducer with the new protocol. Option ii is an explicit follow-up
once the subscription layer has matured.

## Dependencies

- platform host HTTP server (SSE support)
- existing channel state projector in
  `cats-platform/src/products/chat/state/runtime-dispatch/canonicalInteraction.ts`
  and `runtime-session/shared.ts`
- renderer state dispatch seam used by `useWorkspaceAppShellRouting`
- existing `crossSurfaceNavigationHandoff` infrastructure (for
  first-paint semantics redefinition)

## Open Questions

- [ ] Transport finalization: SSE (default) vs WebSocket (supports
      client→server messages on the same channel for future
      bidirectional flows like acks).
- [ ] Stream multiplexing: one SSE connection per `(kind, id)` vs
      one multiplexed connection per tab. Simpler to start per-entity
      and consolidate later.
- [ ] Snapshot size for long-running channels: do we truncate
      transcripts beyond N and let the renderer request older history
      via a separate `/api/channels/:id/messages?before=...` call?
- [ ] Should the hub expose a public `getLatestSnapshot(kind, id)`
      cache for other in-app systems (analytics, offline indexing)?
- [ ] Event versioning strategy: additive-only field bumps, or
      explicit schema version negotiation at subscription open?
- [ ] Do we need a per-entity sequence number in patches to let the
      renderer detect out-of-order delivery, or is the ordered SSE
      channel sufficient?

## Acceptance Criteria

- [ ] Cross-surface Pomodoro flow (Chat → Code) shows the unnamed
      typing dot transitioning to the assistant identity and then to
      the streaming reply within the turn's normal backend latency,
      with the target surface's `selectedChannel.messages` reflecting
      `session_started` and all assistant segments.
- [ ] Starting the same chat directly on `/code/new` shows identical
      end-state behavior as the cross-surface case.
- [ ] Opening the same channel in two tabs (one on Chat surface, one
      on Code surface) shows identical transcripts end-to-end.
- [ ] `mergeWorkspaceBackgroundRefreshPayload` remains scoped to
      runtime-health fields; no chat state leaks into the poll path.
- [ ] Adding a second entity kind (in a follow-up slice) touches
      server-side projector + schema + consuming view only; no
      subscription hub or transport change required.
- [ ] ADR-041 collection-level invalidation continues to flow on
      **every** target surface (Chat / Code / Work) after cross-
      surface handoff, not only on the Chat shell. The shared
      `WorkspaceProductApp` mounts an ADR-041 consumer, so a new
      message on a sibling channel still updates recents / unread /
      `parallelChatGroups` via `refreshAppShell()` whether the user
      is on `/chat/chats/:id`, `/code/chats/:id`, or `/work/...`.
      A new private lane still promotes on all three. Entity
      subscription and ADR-041 stream coexist without either
      shadowing the other.

## References

- [ADR-075: Adopt Push-Based Per-Entity State Subscription](../decisions/075-adopt-push-based-per-entity-state-subscription.md)
- [ADR-041: Push Transport and Chat Invalidations Over SSE](../decisions/041-push-transport-and-chat-invalidations-over-sse.md)
- [PLAN-068: Per-Entity State Subscription Rollout](../plans/PLAN-068-per-entity-state-subscription-rollout.md)
- [Research: Per-Entity State Subscription Architecture](../research/2026-04-21-per-entity-state-subscription-architecture.md)
- [ADR-073](../decisions/073-use-target-surface-dispatch-and-warm-cross-surface-handoff.md)
- [SPEC-074](./SPEC-074-cross-surface-draft-dispatch-and-warm-product-handoff.md)
- [ADR-060](../decisions/060-normalize-heterogeneous-runtime-delivery-into-product-events.md)
- [SPEC-059](./SPEC-059-heterogeneous-runtime-delivery-normalization.md)
- `cats-platform/src/products/chat/renderer/hooks/useChatAppShellRefresh.ts` (ADR-041 consumer)
- `cats-platform/src/products/shared/renderer/hooks/useWorkspaceAppShellRouting.ts`
- `cats-platform/src/products/shared/renderer/hooks/useLiveIndicator.ts`
- `cats-platform/src/products/chat/state/runtime-dispatch/canonicalInteraction.ts`
- `cats-platform/src/products/chat/state/runtime-session/shared.ts`
- `cats-platform/src/shared/liveIndicator.ts`

---

*Created: 2026-04-21*
*Author: Claude under user-directed investigation*
*Related Plan: [PLAN-068](../plans/PLAN-068-per-entity-state-subscription-rollout.md)*

# ADR-075: Adopt Push-Based Per-Entity State Subscription as the Renderer Sync Primitive

> Replace the current mix of warm-snapshot-then-freeze + filtered
> background polling + single-purpose channel stream with one
> push-based subscription protocol keyed by `(entityKind, entityId)`.
> Server is the sole projector; renderer is a pure subscriber; warm
> handoff bundles are first-paint-only.

## Status

Proposed

## Implementation Note

As of 2026-05-09, the first `channel` slice has landed: the platform host
serves `/api/subscribe?kind=channel&id=<channel-id>`, the renderer consumes it
through the shared entity subscription hub, and ADR-041 collection refetches use
subscription-aware merging instead of replacing the mounted channel state.
PLAN-098 also landed `artifact` as the second entity kind:
`/api/subscribe?kind=artifact&id=<artifact-id>` streams artifact snapshots and
update/removal patches, and Artifact Canvas refreshes its mounted projection
from that subscription. The browser acceptance fixture covers a mounted
Artifact Canvas observing two subscription mutations. The post-polymorphism
cleanup decision keeps `/api/channels/:id/stream` separate for liveIndicator
because it carries ephemeral turn-progress and segment timeline state, while
`/api/subscribe` carries authoritative entity snapshots and patches.

## Context

ADR-073 introduced target-surface dispatch and warm cross-surface
handoff. Since landing, a structural bug has surfaced whenever a
conversation is handed off from one product surface to another:

- Chat submits a draft with `targetSurface = 'code'`.
- Handoff bundle stages an `AppShellPayload` snapshot taken at
  dispatch time.
- `WorkspaceProductApp` mounts on `/code/chats/:id` with that snapshot
  and skips the initial `fetchAppShell()`.
- Server emits a `session_started` canonical message into the channel
  shortly after, followed by assistant turn segments.
- Target surface's `selectedChannel.messages` never receives those
  messages. `liveIndicator` updates from
  `/api/channels/:id/stream`, but the persisted transcript does not,
  because:
  - `mergeWorkspaceBackgroundRefreshPayload` deliberately excludes
    `chat` from the 5s app-shell poll merge
  - the channel stream reducer only drives `liveIndicator`, never
    `selectedChannel.messages`
  - no client-side projector converts runtime events into transcript
    messages (that projection lives only on the server)

End-user effect: the "unnamed typing dot" anonymization gate in
`anonymizeLiveIndicatorSegmentIfSessionUnconfirmed` never clears,
because `hasConfirmedLiveIndicatorSessionStart` never finds the
`session_started` message in the transcript. The dot stays unnamed
forever on the target surface.

Deeper problem: the same failure mode generalizes. Any future
cross-surface navigation where one surface needs to render an entity
owned by another (Chat→Work project preview, Work→Code artifact
preview, any "open X on surface Y" deep link) will hit the same
sync gap unless we fix the architecture, not just the symptom.

The renderer currently has **two and a half** answers to "keep my
state fresh":

1. initial `fetchAppShell()` on cold mount
2. warm-handoff snapshot on cross-surface mount (replaces 1)
3. 5s background `fetchAppShell()` merging only runtime-level fields
4. channel SSE stream mutating only `liveIndicator`

None of those alone, and none of them in combination as currently
composed, propagates server-side canonical message projections into
the target surface's state. That gap is the ADR-073 warm-handoff
seam falling short of its stated "feel continuous" goal.

See [`2026-04-21-per-entity-state-subscription-architecture.md`](../research/2026-04-21-per-entity-state-subscription-architecture.md)
for the full design-space survey.

## Decision

### 1. Treat state sync as per-entity subscription, not global polling

The renderer must move from "fetch whole app shell periodically" to
"subscribe to the specific entities this view renders". The protocol
is:

```
subscribeEntity({ kind, id })
  -> server opens a stream keyed by (kind, id)
  -> server immediately emits `snapshot` event = full current entity state
  -> server emits `patch` events for every mutation projected onto
     that entity
  -> client disposes when the view no longer needs the entity
```

Supported `kind` values start with `'channel'`. The contract is
designed so `'project'`, `'artifact'`, `'run'`, and later kinds plug
in without contract change, each bringing their own event vocabulary
(`message.appended`, `task.updated`, `artifact.file.changed`, ...).

### 2. Server is the sole projector for every entity kind

Projection logic (event → entity state mutation) lives exclusively
on the server for every entity kind. The renderer is forbidden from
re-implementing the same projection locally.

Concretely:

- channel message projection (`canonicalInteraction.ts`,
  `runtime-session/shared.ts`) remains the only place
  `session_started` / `assistant_turn_segment` messages are created;
  the server then publishes a `message.appended` patch on the channel
  subscription
- the renderer's subscription reducer only knows how to apply patches,
  not how to derive them
- this rule is explicit so a future "I'll just derive it client-side"
  shortcut gets caught at review

### 3. Warm handoff bundles are first-paint placeholders only

The ADR-073 warm-handoff bundle remains valuable for the first render
frame but stops being a semi-durable state copy. Specifically:

- mount renders against the warm snapshot for instant first paint
- the target view immediately opens the relevant entity subscription
- the first `snapshot` event from the server fully replaces the warm
  state
- `mergeWorkspaceBackgroundRefreshPayload`'s chat exclusion becomes
  a permanent contract, not a compromise

### 4. Background `/api/app-shell` refresh is scoped to runtime health

The existing 5s background poll stays but narrows to its
already-effective scope: `runtime`, `runtimeSetup`, `metadata`,
`bootstrapAttemptId`. It must not be expanded to include conversation
state — that state belongs to entity subscriptions.

Cold-boot `fetchAppShell()` remains the right way to seed the cache
when no subscription is active yet (app-shell level payload provides
the list of channels/cats and other non-entity scoped metadata).

### 5. One subscription per `(kind, id)` per tab, managed by a shared hub

To prevent fan-out explosion (multiple components subscribing to the
same entity opening multiple streams):

- a platform-owned subscription hub coalesces subscribers
- reference-counts per `(kind, id)` to open/close the upstream stream
- retries on transient disconnect with exponential backoff
- surfaces reconnect-snapshot events so consumers can resync

### 6. No new persisted model fields

This ADR explicitly does not introduce new server-persisted entity
fields. It defines how existing projected state reaches renderers
over the network. Persistence contracts remain unchanged.

### 7. Relationship with ADR-041 invalidation contract (two tiers)

This ADR deliberately splits "renderer state freshness" into two
tiers with clear ownership so neither contract has to absorb the
other's concerns.

**Tier A — Collection-level invalidation (owned by [ADR-041](./041-push-transport-and-chat-invalidations-over-sse.md))**

- Stream: `/api/events/chat` (existing), consumed today by
  `useChatAppShellRefresh` via `useChatEvents({ onRoomUpdated,
  onRecentsChanged, onUnreadChanged, onTransportIngress })`.
- Scope: "something in the app-shell changed, refetch." Covers
  channel list, `parallelChatGroups`, recents ordering, unread
  counts, private-lane promotion, transport ingress.
- Shape: invalidation + refetch (coarse). Renderer re-runs
  `refreshAppShell()` on signal.

**Tier B — Per-entity deep state (owned by this ADR + SPEC-076)**

- Stream: `/api/subscribe?kind=&id=` (new), consumed by
  `useEntitySubscription`.
- Scope: the authoritative state of a single entity the current view
  is rendering. For `kind='channel'`: `selectedChannel.messages`,
  `selectedChannel.roomRouting.workflow`, runtime metadata for that
  channel, and any channel-local fields that the server projects.
- Shape: snapshot + ordered patches (fine). Renderer applies
  patches without refetching.

**Division of labor**

- When the list of channels changes (a new channel appears in
  recents, a private lane gets promoted, unread count on a sibling
  channel changes), that is Tier A's responsibility — ADR-041
  invalidation fires and `refreshAppShell()` refetches the list.
- When the transcript of the *mounted* channel grows by a new
  assistant segment, that is Tier B's responsibility — the
  `(kind='channel', id=<mounted>)` subscription delivers a
  `message.appended` patch and the renderer upserts locally
  without a full refetch.
- When both are relevant (e.g. a brand-new message on a channel
  the user is not currently viewing), ADR-041 invalidates the
  channel list so the sibling entry can update its unread/preview,
  while Tier B remains silent because there's no active
  subscription on that entity.

**Why both, not one**

- Folding Tier A into Tier B would require the renderer to
  subscribe to every channel the user could possibly see in the
  sidebar — not scalable.
- Folding Tier B into Tier A would keep the refetch-all pattern that
  triggered this ADR in the first place (heavy payload, clobbers
  optimistic UI, doesn't solve cross-surface transcript sync).
- The two tiers stay orthogonal: ADR-041 invalidates collections,
  ADR-075 streams entities. The renderer consumes both, they don't
  cross-talk.

### 8. Relationship with Non-Entity Render Intents

This ADR defines the per-entity state subscription protocol:
`subscribeEntity({ kind, id })` snapshots and patches one entity. The
same app push connection may also carry explicitly namespaced
non-entity messages, but those messages are not ADR-075 entity patches
and must not be reduced by `useEntitySubscription`.

For example, SPEC-101 defines `ArtifactCanvasNavigateIntent` as a
platform render-intent message that asks the currently mounted surface
to navigate to an artifact canvas URL. Its owning SPEC defines the
surface subscription scope, TTL, acknowledgement endpoint, replay
rules, and idempotency behavior. ADR-075 only supplies the push
transport relationship; it does not define render-intent semantics.

If a future push transport becomes bidirectional, the owning SPEC may
move acknowledgements onto that connection. Until then, renderer
acknowledgements for non-entity messages must use the explicit ack path
defined by that message family.

## Consequences

### Positive

- state sync becomes architecturally correct: one projector, one
  source of truth, push-based delivery
- target-surface handoff delivers the stated "feel continuous"
  promise end-to-end, not just visually at t=0
- future cross-surface navigation (project preview, artifact preview,
  run detail preview, live cat profile editing, memory inspector,
  ...) shares one mechanism instead of each inventing its own
- no need for a parallel client-side projector; server projection
  logic stays the single-owner place to add new event kinds
- `/api/app-shell` pressure decreases over time as subscriptions
  absorb what the poll used to nominally refresh
- multi-tab / multi-surface consistency becomes emergent: all
  subscribers to the same `(kind, id)` converge

### Negative

- platform-level implementation work before user-visible payoff
- adds a new transport contract (snapshot + patch event shape per
  kind) that the project must version and maintain
- subscription hub brings non-trivial lifetime / reconnect semantics
- every server-side projector that creates a persisted state change
  must remember to publish the matching patch event
- requires an explicit migration window where both
  `mergeWorkspaceBackgroundRefreshPayload` and per-entity
  subscriptions coexist

### Neutral

- does not change the canonical `Conversation` / `Workflow` / `Turn`
  data model
- does not change `originSurface` ownership semantics from ADR-073
- does not change the warm-handoff bundle data shape itself — only its
  role (first-paint-only instead of semi-durable state carrier)
- keeps `EventSource` (SSE) as the default transport for this first
  slice; WebSocket upgrade stays an open option for future phases

## Alternatives Considered

### Alternative 1: Post-warm catch-up `fetchAppShell()`

- **Pros**: minimal diff; ships today.
- **Cons**: keeps polling as the update mechanism; every future
  cross-surface entity kind relives this bug; heavy payload shape.
- **Why rejected**: permanent answer would mean permanent workaround.

### Alternative 2: Expand background merge to include chat state

- **Pros**: one-helper fix.
- **Cons**: polling architecture stays; clobbers optimistic UI;
  doesn't help non-chat entities at all.
- **Why rejected**: fixes the immediate symptom for one entity kind
  while entrenching the wrong pattern for all others.

### Alternative 3: Client-side re-projection of runtime events

- **Pros**: push-based; no server contract change.
- **Cons**: duplicates the server's canonical projector; silent drift
  risk as events evolve; only helps channels, not arbitrary entity
  kinds.
- **Why rejected**: the "two projectors" is the precise anti-pattern
  that produced today's bug.

### Alternative 4: Persist a per-surface entity cache and replay

- **Pros**: offline friendly; replayable.
- **Cons**: scope explosion well beyond today's problem; conflict
  resolution, storage lifecycle, and schema migrations all become
  renderer concerns.
- **Why rejected**: solves a problem we don't have (offline/replay)
  at the cost of ignoring the one we do (authoritative push sync).

## References

- [Research: Per-Entity State Subscription Architecture](../research/2026-04-21-per-entity-state-subscription-architecture.md)
- [ADR-073: Target-Surface Dispatch and Warm Cross-Surface Handoff](./073-use-target-surface-dispatch-and-warm-cross-surface-handoff.md)
- [SPEC-074: Cross-Surface Draft Dispatch and Warm Product Handoff](../specs/SPEC-074-cross-surface-draft-dispatch-and-warm-product-handoff.md)
- [ADR-060: Heterogeneous Runtime Delivery Normalization](./060-normalize-heterogeneous-runtime-delivery-into-product-events.md)
- [SPEC-059: Heterogeneous Runtime Delivery Normalization](../specs/SPEC-059-heterogeneous-runtime-delivery-normalization.md)
- [ADR-041: Push Transport and Chat Invalidations Over SSE](./041-push-transport-and-chat-invalidations-over-sse.md)
- [SPEC-076: Per-Entity State Subscription Protocol](../specs/SPEC-076-per-entity-state-subscription-protocol.md)
- [PLAN-068: Per-Entity State Subscription Rollout](../plans/PLAN-068-per-entity-state-subscription-rollout.md) — channel-slice closeout
- [PLAN-098: Polymorphic Entity Subscription Follow-up](../plans/PLAN-098-polymorphic-entity-subscription-follow-up.md)

---

*Proposed: 2026-04-21*
*Proposed by: Claude under user-directed investigation*

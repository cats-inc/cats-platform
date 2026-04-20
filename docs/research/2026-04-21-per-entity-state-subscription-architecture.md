# Per-Entity State Subscription Architecture

> Research into replacing polling-based renderer state refresh and
> snapshot-only warm-handoff with a push-based per-entity subscription
> layer, so cross-surface continuity (Chat→Code conversation, Chat→Work
> project, Work→Code artifact, ...) shares one authoritative state
> sync path.

## Metadata

| Field | Value |
|-------|-------|
| **Date** | 2026-04-21 |
| **Author** | Claude (under user-directed investigation) |
| **Status** | Draft |
| **Follow-up** | ADR-075, SPEC-076 (proposed) |

## Motivating Incident

Symptom reported by user: +New Chat → click `Pomodoro app` helper chip →
auto-navigates to `/code/chats/:id`. Instead of the "unnamed typing dot →
assistant identity → streaming reply" flow, the dot stays unnamed forever
and the assistant never materializes, even after the backend runtime turn
seals.

### Proof of the sync gap

Looking at the same channel id `6859c3ff-...` from two surfaces:

- Fiber dump on `/chat/chats/6859c3ff-...`:
  - `selectedChannel.messages.length === 5`
  - messages include `system(room_created)`, `user`, `system(session_started)`,
    `agent(assistant_turn_segment)`, `agent(assistant_turn_segment)`
- Fiber dump on `/code/chats/6859c3ff-...`:
  - `selectedChannel.messages.length === 2`
  - only `system(room_created)` and `user`
  - `liveIndicator.sessionId` IS populated (`baa00588`) — so the
    runtime stream event reached the Code surface
  - `liveIndicator.requiresSessionStartConfirmation === true`, but the
    `session_started` message never lands in Code's transcript, so
    `hasConfirmedLiveIndicatorSessionStart()` permanently returns false,
    so `anonymizeLiveIndicatorSegmentIfSessionUnconfirmed()` permanently
    masks the live segments into "waiting unnamed" visual state

### Why the renderer state splits

1. When Chat submits a cross-surface draft, `stageCrossSurfaceDraftNavigationHandoff`
   snapshots the dispatch-time `AppShellPayload` into an in-memory
   handoff store.
2. Target surface mounts via `WorkspaceProductApp`, consumes the warm
   snapshot, and `useWorkspaceAppShellRouting` sets
   `initialHadReadyStateRef.current = true` to skip the initial
   `fetchAppShell()` call.
3. The 5-second background poll
   (`useWorkspaceAppShellRouting.ts:322-374`) DOES run, but
   `mergeWorkspaceBackgroundRefreshPayload` only merges
   `{ runtime, runtimeSetup, metadata, bootstrapAttemptId }` — it
   deliberately excludes `chat`. So every subsequent `/api/app-shell`
   response is read but the chat slice is thrown away.
4. `useLiveIndicator` subscribes to `/api/channels/{id}/stream`. That
   stream delivers runtime event envelopes. The reducer updates the
   local `liveIndicator` reducer but never mutates
   `selectedChannel.messages`.
5. The canonical projection of runtime events into transcript messages
   happens on the backend (`canonicalInteraction.ts`,
   `runtime-session/shared.ts`). It runs against the backend state
   store, not the client. The client-side renderer has no equivalent
   projector.

Net result: target surface's chat state is an orphaned snapshot.
The moment the server projects a `session_started` message onto the
channel, the Chat origin surface sees it, but the Code target surface
stays frozen at submission time.

### Why this is structural, not local

The same failure mode will show up any time we hand any kind of entity
off across surfaces:

- Chat conversation ↔ Code conversation view (today's bug)
- Chat → Work project summary (near-term roadmap)
- Work → Code artifact / run detail (near-term roadmap)
- Any future "open X on surface Y" deep link

Every one of those flows wants the same contract: "let surface Y render
entity X with instant first paint AND with the authoritative server
state as it changes". The current code tries to answer that with
`warm snapshot + poll + live indicator stream`, and all three pieces
were scoped to partial answers:

- warm snapshot: frozen at submit time
- `/api/app-shell` poll: filtered to runtime-level fields only
- channel stream: intentionally narrow (drives liveIndicator only)

## Design Space Survey

### Option A: Post-warm catch-up fetch

Target surface, after consuming the warm snapshot, fires one extra
`fetchAppShell()` and replaces `state.payload`. Subsequent updates
still rely on the 5s poll.

- Pros: minimal diff; fixes the immediate session_started symptom.
- Cons:
  - polling is the wrong architecture for real-time conversational UI;
    stream events are already the authoritative signal
  - 5s window of staleness still exists for later events
  - every new "handoff to target surface X for entity kind Y" repeats
    this hack
  - `/api/app-shell` payloads are heavy (all channels, all cats,
    assistPayload caches); polling them per tab is wasteful

### Option B: Expand background-refresh merge to include chat

Change `mergeWorkspaceBackgroundRefreshPayload` to also merge
`chat.selectedChannel.messages` (or the full `chat` slice).

- Pros: one-line fix in the helper.
- Cons:
  - still polling architecture
  - risk of clobbering in-flight optimistic UI (user types a message,
    poll response overwrites)
  - does nothing for non-chat entities (project, artifact, run, cat,
    memory, deployment)
  - explicit scope exclusion in the helper was deliberate; reverting it
    reintroduces the problems it was avoiding

### Option C: Client-side re-projection of runtime events into messages

Expand `useLiveIndicator`'s reducer (or a sibling reducer) to apply
`session_started` / `assistant_turn_segment` / turn-lifecycle events
as message appends against `selectedChannel.messages`.

- Pros: push-based; real-time; respects stream authority.
- Cons:
  - duplicates the server-side canonical projector
    (`canonicalInteraction.ts`, `runtime-session/shared.ts`) inside
    the renderer — two projectors for the same state is the core
    anti-pattern that produced this bug in the first place
  - only solves channels; every new entity kind needs its own
    re-projection spec
  - very easy to drift from server truth over time (server adds a new
    event kind, client forgets to handle it, silent state divergence)

### Option D: Push-based per-entity subscription protocol

Treat state sync as "renderer subscribes to an entity on the server;
server is the sole projector and pushes snapshot + patches over a
stream". Generalize the existing channel stream into a
platform-owned subscription facility keyed by `(entityKind, entityId)`.

- Pros:
  - single authoritative projector (server)
  - client is a pure subscriber — no duplicate projection logic
  - first-paint warm snapshot becomes a placeholder that the stream
    replaces immediately; handoff bundles stop being a second source
    of truth
  - one mechanism serves any entity kind (channel, project, artifact,
    run, cat profile, memory, ...)
  - cross-surface continuity reduces to "subscribe to the same
    `(kind, id)` on both surfaces"
  - extensible to multi-tab, multi-user, multi-machine, replay, and
    offline-reconcile flows without redesigning the sync story each
    time
- Cons:
  - platform-level change (server stream + client subscription manager)
  - initial implementation larger than A / B
  - needs a clear versioned event contract per entity kind
  - requires eventual migration of existing polling paths to the
    subscription model

## Recommendation

**Adopt Option D as the long-term root fix.** Use Option A **only as a
temporary symptom mitigation** if immediate user-visible symptom
relief is required while D is in flight, and only with an explicit
deprecation-on-land commitment in the commit message.

Rationale:

1. Options A and B entrench a polling + snapshot-merge mental model
   that doesn't match how the runtime/projection pipeline actually
   works on the server. Every future cross-surface entity will relive
   the same class of bug.
2. Option C shares D's "push beats poll" instinct but puts the
   projector in the wrong place. State projection needs to stay
   single-owner.
3. Option D aligns renderer semantics with how the backend already
   works (event → projector → persisted entity snapshot), and cleanly
   supports the roadmap of non-channel cross-surface links.

## Scope Implications

### In scope for the architecture change

- server: generalize channel-level stream into a `(kind, id)` keyed
  subscription publisher
- server: publish `snapshot` (full current state for the entity) and
  `patch` events (message.appended, turn.updated, session.started,
  session.closed, etc.) for each kind
- server: at minimum ship `channel` subscription first; keep the
  contract polymorphic enough that `project`, `artifact`, `run`, and
  future kinds plug in without contract change
- renderer: `useEntitySubscription({ kind, id })` hook that returns
  `(snapshot, patch$)` and commits updates into the right state slice
- renderer: consume warm-handoff bundle as first-paint only; expect
  stream snapshot to arrive and replace it
- renderer: keep liveIndicator driven by the same stream (it becomes
  one patch-applier among several)

### Explicit non-goals for the first slice

- no multi-machine / WAN / tunneled transport work (stays on
  same-origin same-process SSE for now)
- no durable event log or replay-from-cursor protocol (server
  snapshots fresh each reconnect)
- no offline-mode conflict resolution
- no persisted subscription tokens across app restarts
- no removal of `/api/app-shell` polling on first slice — it can
  degrade to "only runtime/config fields", with chat state owned by
  the new subscription layer

### Migration sequencing (phased)

1. Phase 1 — ship the channel subscription:
   - server emits `channel` patches (`message.appended`,
     `turn.updated`, `session.started`, `session.closed`, plus a
     `snapshot` on connect)
   - renderer `useEntitySubscription` dispatches patches into
     `selectedChannel`
   - cross-surface handoff symptom resolves end-to-end
   - warm-handoff snapshot role is clarified ("first-paint only")
   - `mergeWorkspaceBackgroundRefreshPayload`'s chat exclusion becomes
     a permanent contract
2. Phase 2 — second entity kind (candidate: `project` or `artifact`)
   as a proof that the protocol is truly polymorphic. Ship Chat→Work
   project preview or Work→Code artifact preview on top of the same
   protocol.
3. Phase 3 — phase out `/api/app-shell` background poll entirely once
   every surface consumes what it renders via subscriptions. Keep the
   endpoint for initial cold mount only.

## Relationship to Existing Architecture

- Extends ADR-073 (target-surface dispatch and warm handoff) by
  defining what "the warm bundle is first-paint only" really means
  at the state layer.
- Supersedes the de-facto behavior of
  `mergeWorkspaceBackgroundRefreshPayload` being a state-sync
  mechanism. After this change, background refresh is only for
  runtime/config health.
- Complements liveIndicator: liveIndicator stays exactly as it is for
  the transient UI affordance; the new subscription layer makes sure
  the persisted transcript catches up so liveIndicator's
  anonymization gate can clear.

## Risks

- **Server event contract drift**: if new server-side projections are
  added without publishing matching events, target surfaces silently
  fall behind. Mitigate with a "snapshot on reconnect" fallback and
  require every projector to emit its corresponding event.
- **Multiple subscribers per entity per tab**: if different components
  both subscribe, make sure the subscription manager coalesces so the
  server only sees one SSE per `(kind, id)` per tab.
- **Payload size for snapshots**: channels can have long transcripts.
  First slice may need pagination / truncation for the snapshot event,
  with the renderer requesting history separately.
- **Auth / session binding on subscription stream**: re-use the
  existing platform host cookie/session mechanism; don't invent a new
  one.

## Open Questions

- [ ] Transport: stay on SSE (`EventSource`) or move to WebSocket to
      support client→server subscription management on the same
      channel?
- [ ] Patch event granularity per kind: how fine-grained before it
      becomes a maintenance tax?
- [ ] Should `(kind, id)` subscription multiplex over one socket per
      tab, or one socket per entity?
- [ ] How does this interact with the Electron host / future mobile
      client? (Presumably identical if the platform host is still
      the origin.)
- [ ] Retention policy on server-held subscription state: does the
      server remember which clients are watching, or is it purely
      fan-out-on-demand?

## References

- [ADR-073](../decisions/073-use-target-surface-dispatch-and-warm-cross-surface-handoff.md)
- [SPEC-074](../specs/SPEC-074-cross-surface-draft-dispatch-and-warm-product-handoff.md)
- [ADR-060](../decisions/060-normalize-heterogeneous-runtime-delivery-into-product-events.md)
- [SPEC-059](../specs/SPEC-059-heterogeneous-runtime-delivery-normalization.md)
- `cats-platform/src/products/shared/renderer/hooks/useWorkspaceAppShellRouting.ts`
  (background refresh exclusion)
- `cats-platform/src/products/shared/renderer/hooks/useLiveIndicator.ts`
  (channel stream subscriber — today's single consumer)
- `cats-platform/src/products/chat/state/runtime-dispatch/canonicalInteraction.ts`
  (server-side projector)
- `cats-platform/src/shared/liveIndicator.ts`
  (anonymization gate that permanently blocks when session_started
  never reaches the transcript)

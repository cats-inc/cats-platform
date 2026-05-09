# PLAN-098: Polymorphic Entity Subscription Follow-up

> Finish the non-channel work that PLAN-068 intentionally left open:
> prove the per-entity subscription protocol with a second entity kind,
> lock cross-surface acceptance, and decide whether remaining legacy
> channel streams should converge into the entity-subscription layer.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Implemented |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Spec / Dependencies

- [SPEC-076: Per-Entity State Subscription Protocol](../specs/SPEC-076-per-entity-state-subscription-protocol.md)
- [ADR-075: Adopt Push-Based Per-Entity State Subscription](../decisions/075-adopt-push-based-per-entity-state-subscription.md)
- [ADR-041: Push Transport and Chat Invalidations Over SSE](../decisions/041-push-transport-and-chat-invalidations-over-sse.md)
- [PLAN-068: Per-Entity State Subscription Rollout](./PLAN-068-per-entity-state-subscription-rollout.md) — channel-slice closeout
- [PLAN-090: Cats Code Artifact Canvas Rollout](./PLAN-090-cats-code-artifact-canvas-rollout.md)

## Overview

The `channel` slice proved the basic subscription shape:

- server route: `/api/subscribe?kind=channel&id=<channel-id>`
- server projection: snapshot + diffs from the authoritative platform host state
- renderer hub: one upstream stream per active `(kind, id)`
- renderer dispatcher: kind-specific state application
- coexistence: ADR-041 collection invalidation refetches use a merge helper so
  collection freshness does not overwrite the mounted subscription-owned entity

What it has not proven is the contract's stated polymorphism. Today the shared
type still admits only `channel`, so a future `project`, `artifact`, `run`, or
other entity kind would still require new integration work. This plan owns that
proof and the cleanup decisions that should happen after it.

## Baseline Facts

- `EntitySubscriptionKind` is currently `channel` in both server and renderer
  subscription modules.
- The channel implementation uses projection/diffing after existing chat
  events rather than a mutation-local publisher called directly by each write
  path.
- The current test suite covers channel snapshot/patch behavior, renderer
  application, active-subscription merge behavior, and source-level ADR-041
  coexistence.
- `artifact` is now the second-kind proof: the server route accepts
  `kind=artifact`, Artifact Canvas opens the subscription for the mounted
  artifact id, and targeted tests cover snapshot, repeated update patches,
  removal/close behavior, rejection cases, hub coalescing, dispatcher matching,
  and mounted Artifact Canvas refresh.
- Artifact subscription is event-driven for production stores that expose
  `CoreStore.subscribeCore`; the 500ms poll remains only as a fallback for
  stores without core-change notifications.
- Browser-level Artifact Canvas acceptance now proves a mounted surface observes
  two artifact subscription mutations. ADR-041 collection-refetch coexistence is
  covered by source-level merge regression.
- Channel baseline cleanup is also covered by dispatcher stale-snapshot tests,
  active-merge tests, repeated server patch tests, and hub reconnect regression.
- Post-polymorphism cleanup decision: keep `/api/channels/:id/stream` as the
  specialized liveIndicator stream. Entity subscriptions own authoritative
  entity snapshots and patches; liveIndicator owns ephemeral turn-progress and
  segment timeline state.

## Implementation Phases

### Phase 1: Align the Landed Channel Contract

- [x] Task 1.1: Audit SPEC-076 against the landed channel implementation and
      explicitly document the accepted projection/diffing model where it
      differs from the original mutation-local publisher wording.
- [x] Task 1.2: Confirm channel tests cover snapshot replacement on reconnect,
      patch ordering assumptions, stale patch handling, active subscription
      merge behavior, and ADR-041 coexistence.
- [x] Task 1.3: Identify whether a browser-level Chat/Code/Work transcript
      parity acceptance still adds value beyond existing unit/source-level
      coverage; add it if it will catch real regressions. Current decision:
      keep SPEC-076's broader transcript parity acceptance open, but do not add
      a PLAN-098 browser fixture unless a concrete regression appears.

**Deliverables**: SPEC-076 and tests describe the channel baseline that future
kinds should copy, not the stale PLAN-068 draft shape.

### Phase 2: Choose the Second Entity Kind

- [x] Task 2.1: Pick the second kind. Default recommendation is `artifact`
      because Cats Code Artifact Canvas is active product work and benefits from
      live preview/materialization state. Use `project` instead only if Cats
      Work previewing becomes the nearer cross-surface need.
- [x] Task 2.2: Define the second-kind snapshot shape, patch vocabulary,
      identity fields, version number, close semantics, and access validation.
- [x] Task 2.3: Confirm which mounted surface owns the first consumer and what
      entity mutations must stay live over the stream.

**Deliverables**: one concrete second-kind contract ready to implement without
reopening ADR-075.

### Phase 3: Server Second-Kind Subscription

- [x] Task 3.1: Extend server-side `EntitySubscriptionKind` and route
      validation beyond `channel`.
- [x] Task 3.2: Add the second-kind projector that emits an immediate snapshot
      and ordered patches after authoritative state changes.
- [x] Task 3.3: Keep the route protocol unchanged:
      `/api/subscribe?kind=<kind>&id=<entity-id>`.
- [x] Task 3.4: Add server tests for snapshot delivery, update patching,
      repeated update patching, removal patch generation and stream close,
      missing artifact rejection, and unsupported kind rejection for the second
      kind.

**Deliverables**: server-side polymorphism without new transport or route
shape.

### Phase 4: Renderer Second-Kind Consumer

- [x] Task 4.1: Extend renderer-side `EntitySubscriptionKind` and dispatcher
      registration for the second kind.
- [x] Task 4.2: Add a kind-specific dispatcher that applies snapshots and
      patches without overwriting unrelated app-shell collection state.
- [x] Task 4.3: Mount `useEntitySubscription({ kind: '<chosen>', id })` in the
      owning product surface.
- [x] Task 4.4: Add renderer tests for coalesced artifact subscribers and
      kind-specific snapshot/patch matching.

**Deliverables**: the second kind is live in a product surface using the same
hub and protocol as `channel`.

### Phase 5: Cross-Surface Acceptance

- [x] Task 5.1: Create a cross-surface acceptance fixture where one surface
      opens the second-kind entity and another surface or server path mutates
      it twice.
- [x] Task 5.2: Assert the mounted target surface observes both mutations
      through the subscription without a full app-shell replacement.
- [x] Task 5.3: Assert ADR-041 collection refetches still refresh collection
      state without overwriting the mounted subscribed entity.

**Deliverables**: explicit evidence that the protocol is truly polymorphic and
not merely a channel-specific workaround.

### Phase 6: Post-Polymorphism Cleanup Decision

- [x] Task 6.1: Decide whether `/api/channels/:id/stream` remains a separate
      live-indicator stream or folds into the channel entity subscription.
- [x] Task 6.2: If folding is adopted, migrate consumers in one slice and remove
      obsolete stream semantics rather than keeping unreleased compatibility
      shims. Folding is not adopted for this plan, so no migration is needed.
- [x] Task 6.3: Update SPEC-076, ADR-075, and relevant tests to reflect the
      final split between collection invalidations, entity subscriptions, and
      any remaining specialized streams.

**Deliverables**: clear post-v1 ownership for all renderer live-update paths.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `docs/specs/SPEC-076-per-entity-state-subscription-protocol.md` | Modified | Align protocol notes with the landed channel implementation and second-kind contract. |
| `src/core/store.ts` | Modified | Adds optional core-change subscription support to the shared core store contract. |
| `src/products/chat/state/store.ts` | Modified | Emits core-change notifications from chat-backed stores so artifact subscriptions do not poll in production. |
| `src/platform/orchestration/entitySubscriptions/index.ts` | Modified | Extended server-side kind typing to `channel | artifact`. |
| `src/platform/orchestration/entitySubscriptions/artifact.ts` | Created | Artifact snapshot and patch projector. |
| `src/app/server/subscribeRoutes.ts` | Modified | Validates and routes `kind=artifact` without changing the public route shape. |
| `src/products/shared/renderer/entitySubscriptionHub.ts` | Modified | Extended renderer-side kind typing to `channel | artifact`. |
| `src/products/shared/renderer/entitySubscriptionArtifactDispatcher.ts` | Created | Artifact Canvas dispatcher helpers for matching artifact snapshots/patches. |
| `src/products/shared/renderer/CanvasPane.tsx` | Modified | Mounts `useEntitySubscription({ kind: 'artifact', id })` and refreshes projection on matching snapshots/patches. |
| `tests/entity-subscription-artifact.test.tsx` | Created | Server and projector coverage for artifact snapshot, repeated update patches, removed patch and stream close, missing artifact, and invalid kind. |
| `tests/entity-subscription-artifact-canvas.test.tsx` | Created | Mounted Artifact Canvas acceptance for two artifact subscription patch refreshes. |
| `tests/entity-subscription-renderer.test.tsx` | Modified | Renderer hub reconnect, channel dispatcher, and artifact dispatcher coverage. |
| `tests/merge-app-shell-preserving-active-entity-state.test.tsx` | Modified | ADR-041 collection-refresh coexistence regression for active subscriptions. |

## Technical Decisions

- **Keep SSE for this follow-up.** The goal is protocol polymorphism, not a
  transport redesign.
- **Keep one route shape.** New kinds must use
  `/api/subscribe?kind=<kind>&id=<id>`, not product-local bespoke endpoints.
- **Keep kind-specific dispatchers.** The hub remains generic; projection and
  patch application stay owned by the entity kind.
- **Use `artifact` as the second kind.** Cats Code Artifact Canvas is active
  enough to make this proof useful instead of artificial.
- **Treat Artifact Canvas as a projection consumer.** The `artifact`
  subscription's authoritative entity state is the `CoreArtifactRecord`.
  Artifact Canvas presentation remains surface-scoped and is still resolved
  through `/api/canvas/.../artifacts/...`; matching artifact snapshots and
  patches invalidate that projection rather than replacing it locally.
- **Use event-driven artifact refresh when the store supports it.**
  `CoreStore.subscribeCore` is the production path. The fixed-cadence poll is a
  fallback for non-observable stores, not the intended scalability model.
- **No compatibility shims for unreleased paths.** If cleanup retires an old
  stream or obsolete state path, remove the old path in the same slice.
- **Keep liveIndicator separate.** `/api/channels/:id/stream` remains the
  specialized ephemeral live turn stream; `/api/subscribe` remains the
  authoritative entity snapshot/patch stream.

## Testing Strategy

- **Unit Tests**:
  - second-kind projector emits stable snapshots and ordered patches
  - renderer dispatcher applies snapshots/patches idempotently
  - hub still coalesces multiple subscribers per `(kind, id)`
  - invalid ids and closed streams do not leave stale subscribed state
- **Integration Tests**:
  - `GET /api/subscribe?kind=<second-kind>&id=<id>` emits snapshot, repeated
    patches, and removal close
  - reconnect emits a fresh authoritative snapshot
  - ADR-041 collection refetch does not overwrite the mounted subscribed entity
- **Acceptance Tests**:
  - mounted Artifact Canvas stays live over at least two subscription mutations
    of the chosen second-kind entity

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Second kind is chosen only to satisfy architecture, not product need | Medium | Default to `artifact` because Cats Code Artifact Canvas is active; otherwise wait for the nearest real product surface. |
| Entity snapshot starts carrying collection state | Medium | Keep SPEC-076's two-tier boundary: ADR-041 owns collection freshness, entity subscriptions own mounted entity deep state. |
| Renderer hub becomes over-generic and hides kind-specific semantics | Medium | Keep per-kind dispatchers and tests; do not collapse patch application into a universal reducer. |
| Old channel stream and entity subscription diverge | Medium | Phase 6 requires an explicit keep/fold decision after polymorphism proof. |

## Progress Log

| Date | Update |
|------|--------|
| 2026-05-10 | Follow-up tightened artifact subscription semantics: production stores now expose core-change notifications, Artifact Canvas skips the initial snapshot duplicate refresh, artifact update patches are id-only invalidations, and the plan records the projection-invalidation boundary explicitly. |
| 2026-05-09 | PLAN-098 completed. Phase 6 decision keeps `/api/channels/:id/stream` separate for liveIndicator and leaves `/api/subscribe` focused on authoritative entity snapshots/patches. |
| 2026-05-09 | Channel baseline cleanup completed: reconnect, stale snapshot, active merge, repeated patch, and ADR-041 coexistence regressions are covered; broader transcript parity remains a SPEC-076 acceptance item rather than a PLAN-098 blocker. |
| 2026-05-09 | ADR-041 collection-refresh coexistence regression landed for active subscriptions. |
| 2026-05-09 | Artifact Canvas mounted acceptance landed for two subscription mutations. |
| 2026-05-09 | Artifact selected and landed as the second entity kind. Server route/projector, Artifact Canvas consumer, and targeted tests are implemented. |
| 2026-05-09 | Plan created from PLAN-068 closeout to carry second-kind polymorphism, cross-surface acceptance, and live-stream cleanup decisions. |

---

*Created: 2026-05-09*
*Author: Codex*

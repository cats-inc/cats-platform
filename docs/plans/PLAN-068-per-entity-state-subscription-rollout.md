# PLAN-068: Per-Entity State Subscription Rollout

> Historical rollout and closeout record for the first shipping
> `channel` entity-subscription slice. The remaining polymorphic
> follow-up work is now tracked in
> [PLAN-098](./PLAN-098-polymorphic-entity-subscription-follow-up.md).

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Partially Implemented |
| **Owner** | Historical rollout |
| **Reviewer** | User |
| **Closeout** | Channel slice implemented; follow-up split to PLAN-098 |

## Related Spec / Dependencies

- [SPEC-076: Per-Entity State Subscription Protocol](../specs/SPEC-076-per-entity-state-subscription-protocol.md)
- [ADR-075: Adopt Push-Based Per-Entity State Subscription](../decisions/075-adopt-push-based-per-entity-state-subscription.md)
- [ADR-041: Push Transport and Chat Invalidations Over SSE](../decisions/041-push-transport-and-chat-invalidations-over-sse.md) — collection-level invalidation tier this rollout coexists with
- [Research: Per-Entity State Subscription Architecture](../research/2026-04-21-per-entity-state-subscription-architecture.md)
- [SPEC-074: Cross-Surface Draft Dispatch and Warm Product Handoff](../specs/SPEC-074-cross-surface-draft-dispatch-and-warm-product-handoff.md)
- [ADR-073: Target-Surface Dispatch and Warm Cross-Surface Handoff](../decisions/073-use-target-surface-dispatch-and-warm-cross-surface-handoff.md)
- [PLAN-098: Polymorphic Entity Subscription Follow-up](./PLAN-098-polymorphic-entity-subscription-follow-up.md)

## Closeout Summary

PLAN-068 is no longer a reliable live implementation checklist. Its
core direction remains current — per-entity subscriptions sit beside
ADR-041 collection invalidations — but the first `channel` slice has
already landed and the original task list no longer matches the code
shape exactly.

The correct current reading is:

- **Implemented**: `kind='channel'` subscription endpoint, snapshot and
  patch projection, renderer subscription hub, channel dispatcher,
  mounted shared Workspace shell subscription, subscription-aware
  ADR-041 refetch merge, and regression tests for the channel slice.
- **Implementation divergence from the draft plan**: the landed server
  path is not a standalone publisher explicitly called by every
  mutation path. It routes `/api/subscribe`, listens to existing chat
  invalidation/event-hub signals, rebuilds the channel projection, and
  emits diffs as subscription patches.
- **Not implemented**: a second `EntitySubscriptionKind`, polymorphic
  dispatcher registration beyond `channel`, and explicit second-kind
  cross-surface acceptance.
- **Optional / still deferred**: folding `/api/channels/:id/stream`
  live-indicator delivery into the `channel` subscription.

## Landed Evidence

| Area | Evidence | Notes |
|------|----------|-------|
| Server route | `src/app/server/subscribeRoutes.ts`, `src/app/server/requestRouter.ts` | Handles `GET /api/subscribe?kind=channel&id=<channel-id>`. |
| Event envelope | `src/platform/orchestration/entitySubscriptions/index.ts` | Defines the current subscription event shape and `EntitySubscriptionKind = 'channel'`. |
| Channel projection | `src/platform/orchestration/entitySubscriptions/channel.ts` | Builds channel snapshots and patch diffs including messages, turns, sessions, and compare-group membership. |
| Renderer hub | `src/products/shared/renderer/entitySubscriptionHub.ts` | Coalesces subscribers by `(kind, id)`, exposes `useEntitySubscription`, and reports active subscribed ids. |
| Channel dispatcher | `src/products/shared/renderer/entitySubscriptionChannelDispatcher.ts` | Applies channel snapshots and patches into app-shell load state. |
| Mounted consumer | `src/products/shared/renderer/WorkspaceProductApp.tsx` | Opens the mounted channel subscription for shared Chat/Code/Work route shells. |
| ADR-041 coexistence | `src/products/shared/renderer/hooks/useWorkspaceChatEvents.ts`, `src/products/chat/renderer/hooks/useChatAppShellRefresh.ts` | Uses subscription-aware merge instead of full app-shell replacement. |
| Merge helper | `src/products/shared/renderer/mergeAppShellPreservingActiveEntityState.ts` | Preserves subscription-owned selected channel state while applying collection-tier refetches. |
| Test coverage | `tests/entity-subscription-channel.test.js`, `tests/entity-subscription-renderer.test.tsx`, `tests/merge-app-shell-preserving-active-entity-state.test.tsx`, `tests/adr-041-subscription-coexistence.test.js` | Covers channel snapshot/patch behavior, renderer application, active subscription merge, and source-level ADR-041 coexistence locks. |

## Original Phase Closeout

| Original Phase | Current Status | Closeout Note |
|----------------|----------------|---------------|
| Phase 1: Server Subscription Endpoint and Channel Publisher | Mostly complete for `channel` | Endpoint, envelope, channel snapshot, and diff patching landed. The exact "publisher called by every mutation" shape was not adopted; current implementation projects/diffs after existing chat events. |
| Phase 2: Renderer Subscription Hub and `channel` Consumer | Complete for `channel` | Hub, hook, dispatcher, mounted Workspace consumer, warm-handoff replacement behavior, and merge helper landed. |
| Phase 3: Cross-Surface Acceptance, Polling Cleanup, and ADR-041 Coexistence | Partially complete | Shared Workspace ADR-041 consumer and merge contract landed. Source-level coexistence tests exist; a full browser-level Chat/Code/Work transcript parity acceptance remains follow-up work if still valuable. |
| Phase 4: Polymorphism Proof with a Second Entity Kind | Not started | Moved to PLAN-098. Current `EntitySubscriptionKind` is still only `channel`. |
| Phase 5: LiveIndicator and Stream Consolidation | Not started / optional | Moved to PLAN-098 as a post-polymorphism cleanup decision. |

## Current Boundary

PLAN-068 should not receive new implementation checklist items. It is
closed as the `channel` slice record. New work should either:

- update [SPEC-076](../specs/SPEC-076-per-entity-state-subscription-protocol.md)
  when the protocol contract itself changes, or
- continue in [PLAN-098](./PLAN-098-polymorphic-entity-subscription-follow-up.md)
  when the work is about second-kind proof, acceptance coverage, or
  cleanup after the landed `channel` slice.

## Residual Work Handed to PLAN-098

- Pick the second entity kind for the polymorphism proof. Default
  recommendation: `artifact`, because Cats Code Artifact Canvas is now
  active product work. `project` remains valid if Cats Work previewing
  becomes the nearer product need.
- Extend `EntitySubscriptionKind` and server route validation beyond
  `channel`.
- Add a second-kind projector, event vocabulary, renderer dispatcher,
  and consuming mounted view.
- Add explicit second-kind acceptance proving at least two server-side
  mutations stay live without a protocol redesign.
- Decide whether `/api/channels/:id/stream` stays separate or folds
  into the channel entity subscription.

## Progress Log

| Date | Update |
|------|--------|
| 2026-05-09 | Reconciled PLAN-068 as a historical closeout. Channel slice is implemented; second-kind polymorphism and optional stream consolidation moved to PLAN-098. |
| 2026-04-21 | Plan drafted alongside ADR-075 / SPEC-076. |

---

*Created: 2026-04-21*
*Reconciled: 2026-05-09*
*Author: Claude under user-directed investigation; reconciled by Codex*

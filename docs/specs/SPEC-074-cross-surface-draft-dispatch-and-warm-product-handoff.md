# SPEC-074: Cross-Surface Draft Dispatch and Warm Product Handoff

> Define how a draft may target another product surface, create a
> destination-owned conversation there, and transition without a cold-boot
> product break.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |
| **Related ADR** | [ADR-073](../decisions/073-use-target-surface-dispatch-and-warm-cross-surface-handoff.md) |

## Summary

`Cats Chat`, `Cats Work`, and `Cats Code` already share one conversation
engine, but draft entry is starting to expose cross-product intent before the
submit path is able to honor it.

The current `+New chat -> code` helper demonstrates the gap:

- the draft can visually switch to a Code-looking surface
- the submit path still creates a Chat-owned conversation
- the route still lands on `/chat/chats/:id`
- the target product bundle is not prefetched
- the target product has no warm state handoff for the first optimistic turn

This spec defines one coherent contract for that transition:

- drafts may carry a `targetSurface`
- submit writes `originSurface = targetSurface`
- navigation lands in the target product's active route
- the platform performs a warm navigation handoff across the lazy-route
  boundary

## Goals

- make cross-surface draft switching truthful at submit time
- preserve `originSurface` as the canonical product-ownership field
- keep cross-surface create flow compatible with route-level product lazy
  loading
- preserve optimistic continuity for the first turn during a product handoff
- keep product boundaries clean while enabling future Chat -> Code, Chat ->
  Work, and later other cross-surface draft entries
- shape the continuity seam so later supported cross-surface navigations and
  deep links can reuse it without redefining product-to-product handoff

## Non-Goals

- shipping every possible cross-product entry affordance in one slice
- introducing a new persisted `sourceSurface`/`launchSurface` field
- redesigning the entire product sidebar or recents model
- replacing the current shared channel/group create endpoints
- changing the canonical `Conversation` model or turn/lane engine
- shipping warm optimization for every future conversation/artifact/task deep
  link in the first slice

## Problem Statement

The platform now has two separate truths competing with each other:

1. the draft UI can imply "this will become Code/Work"
2. the submit path still behaves as "this is Chat because the route is Chat"

That mismatch breaks more than labels:

- created conversations receive the wrong `originSurface`
- product-scoped recents become misleading
- route ownership and draft semantics drift apart
- the user sees a false product promise

Even after ownership is corrected, the route transition itself still needs
optimization because product surfaces are lazy-loaded and each app mounts from
its own app-shell refresh path.

The platform therefore needs both:

- semantic correctness
- warm navigation handoff continuity

## User Stories

- As a user starting in `Cats Chat`, I want a helper chip that flips the draft
  to Code to actually open a Code conversation when I send.
- As a user crossing into another product, I want the first optimistic message
  and loading state to feel continuous instead of resetting behind a product
  loading panel.
- As a platform maintainer, I want cross-surface draft handoff to use shared
  seams rather than direct imports between product renderers.
- As a platform maintainer, I want later supported cross-surface conversation
  or artifact navigation to reuse the same continuity seam instead of creating
  another special-case handoff path.

## Requirements

### Functional Requirements

1. The platform shall distinguish `currentSurface`, `targetSurface`, and
   `originSurface`.
2. Draft entry shall default `targetSurface` to `currentSurface`.
3. Draft UI controls may change `targetSurface` without forcing an immediate
   route switch before send.
4. Submitting a new draft with `targetSurface !== currentSurface` shall create
   the destination conversation or parallel group as owned by
   `originSurface = targetSurface`.
5. Cross-surface create shall navigate to the target product's canonical active
   route for the created conversation/group instead of remaining on the source
   product route.
6. The platform shall support this contract for both:
   - single-conversation create
   - parallel container/group create
7. The contract shall be topology-neutral. It must not assume that only default
   drafts can cross surfaces.
8. If a draft has not switched surfaces, submit shall continue to use the
   current product route and ownership behavior unchanged.
9. Cross-surface submit must preserve any already-resolved first-turn metadata
   required for the outgoing request, including attachments and current draft
   execution/workspace policy.
10. If the user leaves the managed draft route before the submit-driven
    transition completes, auto-navigation shall stop rather than force a
    stale redirect.

### Ownership and Boundary Requirements

11. `originSurface` shall remain the canonical persisted product-ownership
    field.
12. `targetSurface` shall be a submit-time destination concept, not a
    replacement for `originSurface`.
13. For new conversations/groups created from a cross-surface submit,
    `originSurface` shall be written from `targetSurface`, not from the source
    route.
14. A draft submitted with `targetSurface = 'code'` shall run the Code entry
    materialization contract at activation time. It creates Code-owned
    Interaction / Task records directly and shall not first create a
    Chat-owned conversation or Chat-bound Task.
14a. A draft submitted with `targetSurface = 'work'` shall run the Work entry
    materialization contract at activation time. It creates the full Work
    anchor set required by `+New work` — one primary `Conversation`, one
    `Project`, one `WorkItem`, and one primary `Task` linked through
    `WorkItem.taskId` — directly. It shall not first create a Chat-owned
    conversation, a Chat-bound Task, or a Code-owned conversation / Task.
    The same identity-at-activation rule applies to any other
    `currentSurface -> targetSurface` switch (e.g. `Code -> Work`): the
    destination product's entry contract runs at first submit / activation,
    not via a later promote step on an already-active conversation.
14b. The platform-shared draft dispatcher shall enforce R14 / R14a uniformly:
    no product-specific renderer shall bypass `targetSurface` and admit a
    surface switch through its own create path. Adding a new
    `currentSurface -> targetSurface` pair (e.g. `Work -> Code`) shall
    require an entry-contract rule covering it before that switch is enabled
    in product UI.
15. The first slice shall not require a new persisted `sourceSurface` field.
16. Cross-surface draft dispatch and warm-navigation handoff shall not be
    implemented by one product importing another product's renderer-local
    submit logic or local state stores.
17. Shared create boundaries may remain:
    - `POST /api/channels`
    - `POST /api/parallel-chat-groups`
18. Product-specific routing and warm-navigation-handoff behavior shall be
    coordinated by a platform/shared renderer seam above those create
    boundaries.

### Warm Navigation Handoff Requirements

19. Before navigating across products, the platform shall be able to store an
    ephemeral warm navigation handoff bundle for the destination surface when
    the transition crosses a `React.lazy` product boundary or when optimistic
    continuity is needed on first render.
20. The handoff bundle shall be in-memory only and shall not be treated as
    durable persisted product state or canonical route truth.
21. The handoff bundle shall be sufficient to render immediate continuity on
    the destination surface, including:
    - handoff kind / destination entity kind
    - route target
    - selected created or resolved conversation/group/entity id
    - optional optimistic first user turn
    - optional current dispatch/busy phase
    - optional snapshot metadata needed for immediate render
    - for the first shipping slice, implemented handoff kinds shall include:
      `draft-create-channel` and `draft-create-parallel-group`
    - reserved future examples may include `navigate-conversation`,
      `navigate-artifact`, `navigate-task`, and `navigate-run`, but those are
      not required to ship in this first slice
22. The destination product shall attempt to consume a matching handoff bundle
    immediately on mount or route activation.
23. After consuming the bundle, the destination product shall refresh
    `/api/app-shell` in the background and reconcile back to server truth.
24. If the handoff bundle is missing, stale, or incompatible, the destination
    product may fall back to the current cold boot behavior without corrupting
    state or changing the route-derived destination truth.

### Performance Requirements

25. When `targetSurface !== currentSurface`, or when another supported
    cross-surface navigation has already resolved a destination product/route,
    the platform should begin prefetching the destination product bundle before
    or during transition.
26. The common happy path should avoid dropping into a visible cold loading
    panel for the full duration of the cross-surface handoff.
27. The current route-level lazy-loading split shall remain intact; this feature
    shall optimize around it rather than remove it.

### Product Behavior Requirements

28. The current Chat draft helper that flips into Code shall create a Code-owned
    conversation, create the Code primary task required by `+New code`, and
    land in the Code active route when submitted. The identity decision happens
    at draft activation / first submit, not through a later promote action.
29. The Chat -> Work draft helper, when shipped, shall similarly create a
    Work-owned anchor set (`Conversation + Project + WorkItem + primary
    Task` with the `WorkItem.taskId` bridge) and land in the Work active
    route. It shall not stage a Chat-bound Task or a Code-bound Task as an
    intermediate step. Other future cross-surface switches shall use the
    same shared contract rather than bespoke one-off flows.
30. Later supported cross-surface navigation targets, such as existing
    conversations, artifacts, tasks, or runs, should layer onto the same
    registry/store seam when continuity optimization is needed instead of
    introducing a second product-to-product handoff stack.
31. Dismissing a surface switch shall restore the draft back to the current
    surface semantics without forcing a new route.
32. Product-scoped recents shall continue to rely on `originSurface`; no
    renderer-side heuristic may override that rule during cross-surface submit.

## Design Overview

```text
current product draft
  -> targetSurface chosen inside draft
  -> platform cross-surface dispatcher / navigation handoff coordinator
       -> shared create endpoint with originSurface = targetSurface
       -> create warm navigation handoff bundle
       -> prefetch target product chunk
       -> navigate to target product route
  -> target product consumes handoff bundle
  -> background /api/app-shell refresh reconciles with server truth
```

## Proposed Architecture

### 1. Surface Vocabulary

- `currentSurface`: mounted product route
- `targetSurface`: draft submit destination
- `originSurface`: stored product ownership on created records

### 2. Platform-Owned Dispatch Registry

The platform should own a registry that can answer:

- how to build the active route for a created conversation/group on each
  surface, and later supported cross-surface entity routes
- how to prefetch the corresponding product bundle
- how the target product reads and clears a warm navigation handoff bundle
- which handoff kinds are currently implemented versus merely reserved for
  later consumers

### 3. Ephemeral Warm Navigation Handoff Store

The warm navigation handoff store should live in platform/shared renderer
space, not in a product-owned persisted store.

The store should be navigation-scoped rather than draft-submit-shaped, even
though draft submit is the first shipping caller.

It should be safe to discard on:

- full reload
- renderer restart
- invalid/mismatched destination route

## Dependencies

- [ADR-073](../decisions/073-use-target-surface-dispatch-and-warm-cross-surface-handoff.md)
- [SPEC-070](./SPEC-070-product-scoped-recents-and-channel-origin-surfaces.md)
- [PLAN-060](../plans/PLAN-060-product-scoped-recents-and-origin-surface-rollout.md)
- [SPEC-042](./SPEC-042-platform-renderer-route-level-chunking-and-lazy-entry.md)
- [ADR-043](../decisions/043-keep-platform-renderer-entry-bounded-with-route-level-lazy-loading.md)
- [SPEC-061](./SPEC-061-concurrent-parallel-semantics-and-code-entry-presets.md)

## Open Questions

- [ ] Do we later need a persisted `sourceSurface` or analytics-only launch
      marker once cross-surface entry is shipping broadly?
- [ ] Should the first implementation slice cover only Chat -> Code, or land
      the generic dispatcher and handoff cache immediately for Work as well?
- [ ] Should target-product bundle prefetch happen eagerly on surface switch,
      or only once the draft becomes sendable?
- [ ] After Chat -> Code, which should be the first non-draft consumer of the
      same seam: conversation deep link, artifact deep link, or task/run deep
      link?

## References

- [ADR-073](../decisions/073-use-target-surface-dispatch-and-warm-cross-surface-handoff.md)
- [PLAN-066](../plans/PLAN-066-cross-surface-draft-dispatch-and-warm-product-handoff-rollout.md)
- [product-integration-guide.md](../product-integration-guide.md)

---

*Created: 2026-04-20*
*Author: Codex*
*Related Plan: [PLAN-066](../plans/PLAN-066-cross-surface-draft-dispatch-and-warm-product-handoff-rollout.md)*

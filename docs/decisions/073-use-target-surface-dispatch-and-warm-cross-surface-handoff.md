# ADR-073: Use Target-Surface Dispatch and Warm Cross-Surface Handoff for Draft Submits

> Treat draft surface switching as a real cross-product handoff, not a local
> UI skin.

## Status

Accepted

## Context

`Cats Chat`, `Cats Work`, and `Cats Code` now share one conversation engine,
but a draft can already expose UI that implies a different destination surface
than the route the user is currently on.

The first visible example is the new Chat draft surface switch:

- `+New chat` can flip into a Code-looking draft via local `draftSurface`
- the draft header/WHERE row then shows Code-flavored cues such as
  `ComposerSurfaceChip`, workspace chooser, branch/worktree chips, and
  permission semantics
- submit still goes through Chat-owned create/route wiring
- the created conversation therefore still lands as `originSurface: 'chat'`
  and navigates to `/chat/chats/:id`

That leaves the product in an inconsistent state:

- the user is told they are starting a Code conversation
- the created record is still Chat-owned
- product-scoped recents and route ownership disagree with the draft UI

There is a second problem behind the same seam: even if submit starts creating
the right destination-owned conversation, a naive `navigate('/code/...')`
handoff would still feel poor because the platform uses route-level lazy
loading and each product app bootstraps from its own `/api/app-shell` fetch.
Without an explicit handoff optimization, the user sees a cold transition,
loading fallback, and possible loss of the just-submitted optimistic state.

The platform therefore needs:

1. one explicit submit-time destination term
2. one platform-owned cross-surface dispatcher
3. one warm navigation handoff mechanism that bridges the lazy-route boundary

## Decision

### 1. Adopt `targetSurface` as the canonical draft-submit destination term

The platform should distinguish three surface terms:

- `currentSurface`
  - the product route currently mounted (`chat`, `work`, or `code`)
- `targetSurface`
  - the surface the current draft intends to materialize into when submitted
- `originSurface`
  - the persisted ownership metadata written onto the created conversation or
    parallel group

Rules:

- drafts default `targetSurface` to `currentSurface`
- cross-surface draft switches mutate `targetSurface`, not persisted ownership
  directly
- when a new conversation/group is created from a cross-surface submit,
  `originSurface` must be written as `targetSurface`
- a Chat-route draft submitted with `targetSurface = 'code'` activates directly
  into the Code entry contract. It creates Code-owned records and appears in
  Code recents; it is not a Chat conversation that later promotes to Code.
- a Chat-route draft submitted with `targetSurface = 'work'` activates directly
  into the Work entry contract. It creates the full Work-owned anchor set
  required by `+New work` (one primary `Conversation`, one `Project`, one
  `WorkItem`, one primary `Task` linked through `WorkItem.taskId`) and appears
  in Work recents; it is not a Chat conversation that later promotes to Work,
  and it is not a Chat-bound or Code-bound task that Work later adopts. The
  same applies to any other `currentSurface -> targetSurface` switch (e.g.
  `Code -> Work`): the destination product's entry contract runs at
  activation, not after a separate promote step.
- the first slice does **not** add a new persisted `sourceSurface` or
  `launchSurface` field

### 2. Use a platform-owned cross-surface draft dispatcher

Cross-surface submit should be handled by a platform/shared renderer seam, not
by one product importing another product's renderer-local state or submit hook.

The dispatcher should own:

- surface-aware route builders for created conversations/groups
- surface-aware lazy-bundle prefetch hooks
- handoff-bundle creation before navigation
- shared create-boundary wiring for channels and parallel groups

This decision intentionally prefers the existing shared create boundaries
(`POST /api/channels`, `POST /api/parallel-chat-groups`) over direct
product-to-product renderer coupling.

The first shipping caller is cross-surface draft submit, but the seam should be
generic enough to later support other cross-surface route transitions where
continuity matters, such as opening an existing conversation, artifact, task,
or run on another product surface.

### 3. Add a platform-owned warm navigation handoff seam

The first implementation slice should have cross-surface submit write an
in-memory, renderer-local navigation handoff bundle before navigation.

That seam should remain reusable for later supported cross-surface navigation
flows and deep links instead of being permanently shaped as a draft-submit-only
bundle.

The bundle should be ephemeral and non-persistent. It should carry only enough
state to make the target surface feel continuous, for example:

- handoff kind / destination entity kind
- target surface id
- selected route target
- created or selected conversation/group/entity id
- optional optimistic first user turn
- optional dispatch/busy phase
- optional snapshot metadata needed for immediate render, such as artifact,
  task, or run summary data

The target product should consume that bundle immediately on mount, then refresh
`/api/app-shell` in the background and reconcile with server truth.

The route remains canonical truth. The handoff bundle is only a temporary
continuity aid and must never become a second source of durable routing truth.

### 4. Prefetch the target product bundle once destination intent is known

The platform should begin product-bundle prefetch once a draft's
`targetSurface` diverges from `currentSurface`, or at latest immediately before
the route transition.

Later supported cross-surface navigations may use the same prefetch seam once a
destination surface/route is known, even when the transition did not start from
a draft surface switch.

This is explicitly tied to the existing `React.lazy` route split. The warm
handoff is not complete if the route still drops into a cold loading panel for
the common happy path.

### 5. Keep the fallback path simple and truthful

If handoff data is unavailable, stale, or rejected, the target route may fall
back to the current cold-boot path:

- lazy-load the product
- fetch app-shell
- render server truth

The fallback is acceptable as recovery behavior, but it must not become the
primary expected path for deliberate cross-surface draft submits.

## Consequences

### Positive

- draft UI semantics and created conversation ownership line up again
- `originSurface` stays the authoritative product-ownership field
- cross-surface submit can remain topology-agnostic across solo, group, and
  parallel create paths
- the lazy-route boundary becomes compatible with seamless cross-product
  product handoff
- product boundaries stay cleaner than direct product-to-product renderer
  imports

### Negative

- submit flow gains a new explicit destination concept
- renderer composition needs one more ephemeral state layer
- testing has to cover both routing correctness and warm-handoff continuity
- the current Chat-local submit path will need non-trivial refactoring

### Neutral

- this does not change the canonical `Conversation` model
- this does not require a new persisted source-surface field in the first slice
- the shared create endpoints remain valid; the change is how the renderer
  chooses destination ownership and route handoff

## Alternatives Considered

### Alternative 1: Keep draft surface switching as UI-only preview

- **Pros**: smallest immediate code change
- **Cons**: user-visible semantic lie; created conversations still land on the
  wrong product
- **Why rejected**: the platform already exposes a surface switch, so leaving
  it UI-only would knowingly preserve incorrect behavior

### Alternative 2: Redirect cold after create without warm navigation handoff

- **Pros**: simpler than adding a handoff cache
- **Cons**: route-level lazy loading plus per-product app-shell boot causes
  loading flash and optimistic-state discontinuity
- **Why rejected**: it solves ownership correctness but leaves the cross-product
  experience obviously broken

### Alternative 3: Let Chat import Code/Work renderer-local create flows

- **Pros**: straightforward for the first helper-chip case
- **Cons**: violates product ownership boundaries and scales poorly as more
  cross-surface entry points appear
- **Why rejected**: shared cross-surface dispatch belongs in a platform seam,
  not in product-to-product renderer imports

### Alternative 4: Persist a new `sourceSurface` field immediately

- **Pros**: preserves analytics/provenance of where the handoff started
- **Cons**: expands the stored contract before the runtime/product need is
  proven
- **Why rejected**: the first slice only needs truthful destination ownership
  and warm client continuity

## References

- [SPEC-074](../specs/SPEC-074-cross-surface-draft-dispatch-and-warm-product-handoff.md)
- [PLAN-066](../plans/PLAN-066-cross-surface-draft-dispatch-and-warm-product-handoff-rollout.md)
- [SPEC-070](../specs/SPEC-070-product-scoped-recents-and-channel-origin-surfaces.md)
- [ADR-069](./069-scope-recents-to-channel-origin-surface-by-default.md)
- [SPEC-042](../specs/SPEC-042-platform-renderer-route-level-chunking-and-lazy-entry.md)
- [ADR-043](./043-keep-platform-renderer-entry-bounded-with-route-level-lazy-loading.md)

---

*Accepted: 2026-04-20*
*Decided by: Codex under user-requested planning direction*

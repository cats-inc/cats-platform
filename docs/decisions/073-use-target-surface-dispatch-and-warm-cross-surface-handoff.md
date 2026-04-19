# ADR-073: Use Target-Surface Dispatch and Warm Cross-Surface Handoff for Draft Submits

> Treat draft surface switching as a real cross-product handoff, not a local
> UI skin.

## Status

Proposed

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
3. one warm handoff mechanism that bridges the lazy-route boundary

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

### 3. Add a platform-owned warm handoff bundle

Cross-surface submit should write an in-memory, renderer-local handoff bundle
before navigation.

The bundle should be ephemeral and non-persistent. It should carry only enough
state to make the target surface feel continuous, for example:

- target surface id
- created conversation/group id
- optimistic first user turn
- dispatch/busy phase
- selected route target
- any already-materialized attachment/body metadata needed for immediate render

The target product should consume that bundle immediately on mount, then refresh
`/api/app-shell` in the background and reconcile with server truth.

### 4. Prefetch the target product bundle when surface intent changes

The platform should begin product-bundle prefetch once a draft's
`targetSurface` diverges from `currentSurface`, or at latest immediately before
the route transition.

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

### Alternative 2: Redirect cold after create without warm handoff

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

*Proposed: 2026-04-20*
*Decided by: Codex under user-requested planning direction*

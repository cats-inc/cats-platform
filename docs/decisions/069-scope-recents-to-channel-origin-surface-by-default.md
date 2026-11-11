# ADR-069: Scope Recents to Channel Origin Surface by Default

> Treat sidebar `RECENTS` as product-scoped by default, using explicit
> `originSurface` metadata on channels and parallel groups.

## Status

Accepted. Amended 2026-11-12 by
[ADR-149](149-let-a-conversation-gain-product-scopes-and-never-lose-them.md) and
[SPEC-141](../specs/SPEC-141-conversation-product-scope.md): Recents and a
conversation's route follow its product scope, not `originSurface`, and the
section 3 fallback is in effect.

## Context

`Cats Chat`, `Cats Work`, and `Cats Code` share one underlying conversation
store, but the user does not experience them as one undifferentiated product.

The first visible failure is already clear:

- `+New code` can create a real active conversation
- if `RECENTS` stays global-by-default, that code session appears in
  `Cats Chat`

The naive alternatives are weak:

- infer `code` from `repoPath`
- infer `work` from some future workflow metadata
- keep separate renderer-owned hidden recents lists

Those all break once surfaces share more of the same conversation engine.

## Decision

`RECENTS` should be scoped to the current product surface by default, backed by
explicit conversation-origin metadata.

### 1. Stamp product ownership at create time

Every newly created channel and parallel group should carry:

- `originSurface: 'chat' | 'work' | 'code'`

This is written by the creating surface, not inferred later.

### 2. Default recents are product-scoped

Sidebar `RECENTS` should include only entries whose `originSurface` matches the
current surface.

That applies to:

- standalone channels
- grouped parallel/compare entries

### 3. Legacy fallback is `chat`

Older persisted records without `originSurface` should resolve as `chat` for
compatibility, because historical data was effectively Chat-owned.

During rollout, raw legacy HTTP create callers may also be normalized to
`chat` at the route boundary for compatibility. Product-owned typed create
paths must not rely on that seam.

**Amendment (2026-11-12): Recents follow the product scope.** Since ADR-149 D7
and SPEC-141 FR-12 and FR-13, a conversation is listed in the Recents of its
product scope and opens on that product's route. `originSurface` still records
where it was created and never changes.

- The scope starts at the origin, and a direct lane is always `chat`.
- Only the owner can raise a scope, and nothing lowers it. A raise moves the
  conversation to the wider product's Recents, and a link under its old product
  redirects to the new route.
- A parallel group has no scope of its own. Its Recents entry stays under its
  `originSurface`.
- Section 3 is now in effect: a conversation or a parallel group with no
  recorded origin is listed under Chat (SPEC-141 S4).

### 4. Cross-product recents are optional and secondary

If the platform later wants an `All` lens or cross-product recents switch, that
must be an explicit secondary view. It should not replace the default
product-scoped behavior.

## Consequences

### Positive

- `Code` and `Work` conversations stop leaking into Chat recents by default
- future `Work` and `Code` recents can reuse one shared rule
- renderer logic stops guessing product ownership from indirect fields
- parallel containers and their member channels share the same ownership model

### Negative

- create payloads and read models gain one more field
- older data needs a compatibility fallback
- future cross-product views must be designed explicitly instead of being
  accidental byproducts of one global list

### Neutral

- shared storage and shared routing still stay shared
- this does not change transcript or dispatch semantics
- `Cats Code` may still choose to hide recents temporarily even after the
  origin contract exists

## Alternatives Considered

### Alternative 1: Keep one global mixed recents list

- **Pros**: simplest current renderer behavior
- **Cons**: wrong product UX once Code and Work create real conversations
- **Why rejected**: it makes Chat absorb every other surface's conversations by
  default

### Alternative 2: Infer product from conversation shape

- **Pros**: no new metadata field
- **Cons**: `repoPath`, `entryKind`, `composerMode`, and routing mode are all
  unreliable ownership proxies
- **Why rejected**: product ownership is not the same thing as routing or repo
  context

### Alternative 3: Keep per-product hidden renderer recents lists

- **Pros**: avoids touching persisted channel contracts
- **Cons**: duplicates logic and creates drift between renderer state and
  canonical conversation state
- **Why rejected**: ownership belongs in the shared contract, not in three
  separate renderer caches

## References

- [SPEC-070](../specs/SPEC-070-product-scoped-recents-and-channel-origin-surfaces.md)
- [PLAN-060](../plans/PLAN-060-product-scoped-recents-and-origin-surface-rollout.md)
- [ADR-048](./048-separate-platform-products-from-installable-apps.md)

---

*Accepted: 2026-04-17*
*Decided by: Codex under user-requested rollout direction*

# ADR-069: Scope Recents to Channel Origin Surface by Default

> Treat sidebar `RECENTS` as product-scoped by default, using explicit
> `originSurface` metadata on channels and parallel groups.

## Status

Proposed

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

*Proposed: 2026-04-17*
*Proposed by: Codex*

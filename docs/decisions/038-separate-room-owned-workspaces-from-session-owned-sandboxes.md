# ADR-038: Separate Room-Owned Workspaces from Session-Owned Sandboxes

> A collaborative room must use an explicit room-owned shared workspace. A
> participant session's private sandbox must never be promoted into room-wide
> workspace authority.

## Status

Proposed

## Date

2026-03-25

## Context

`cats` currently carries room workspace intent using `repoPath` and an
ambiguous `chatCwd` field.

That ambiguity creates a semantic failure:

- when a room has no selected folder, the first participant session may start
  without an explicit room workspace
- once that session returns a `cwd`, the product can persist that path into the
  room
- later participants then join using shared semantics against the same path

This can currently happen through more than one product entry path, including
runtime wake flows and direct channel-assignment persistence flows.

If that first `cwd` came from a participant-owned isolated sandbox, the product
has silently converted a private session workspace into a public room workspace.

That breaks the meaning of `isolated`:

- Cat 1 believes it has a private sandbox
- Cat 2, Cat 3, and later participants can join the same path as shared
- Cat 1 is never told that its private sandbox became room-wide authority
- participant cleanup semantics may now conflict with room expectations

At the same time, requiring every collaborative room to start with an
operator-selected folder is too restrictive. Multi-Cat rooms still need a real
shared writable workspace when no folder was chosen up front.

## Decision

`cats` will separate room-owned workspace authority from participant-owned
runtime cwd state.

1. Collaborative room workspaces are owned by the room, not by any one
   participant session.
   - a room may resolve to a user-selected local folder
   - a room may bootstrap a managed room workspace when no folder was selected

2. A participant session's `cwd` is participant execution state only.
   - it may be stored in the participant lease
   - it must not become room workspace authority by implication

3. Session-owned isolated sandboxes must never be promoted into room-owned
   shared workspace authority.
   - if the first participant starts isolated, that cwd stays private
   - later participants must not be pointed at that cwd as shared room state

4. When a collaborative room needs runtime participation and no operator
   workspace is selected, the product must bootstrap a managed room workspace
   before spawning the first participant session.
   - Cat 1 joins the room workspace as shared from the start
   - Cat 2 and later participants join the same room workspace as shared

5. The first implementation slice keeps managed room workspace bootstrap in
   `cats` host code.
   - use a stable host-owned directory rooted beside `chatStatePath`
   - key the directory by room/channel ID
   - do not use runtime worktree isolation as the `Cats Chat` default strategy
     for this repair

6. Bootstrap must be idempotent per room.
   - concurrent wake or assignment flows for one room reuse the same bootstrap
     result
   - the first slice assumes one `cats` host process serializes room-state
     mutation for a given persisted chat-state store
   - failure persists as room workspace error state instead of silently falling
     back to participant-private isolated sandboxes

7. `channel.chatCwd` should be retired as the room's authoritative workspace
   field in favor of explicit room workspace metadata.
   - keep participant lease cwd separate
   - keep room workspace lifecycle separate

8. Persisted legacy room state must migrate conservatively.
   - `repoPath` maps into room-owned `user_selected` workspace state
   - legacy `chatCwd` only auto-imports as `managed_room` if it still exists
     under the known managed-room workspace root
   - otherwise, legacy `chatCwd` is preserved as `legacy_unknown`
     compatibility data and must not become authoritative shared workspace state
   - new writes stop mutating `chatCwd`

9. Cleanup ownership follows workspace ownership.
   - participant close/reset owns participant cleanup only
   - room deletion or explicit room-workspace reset owns managed room workspace
     cleanup

## Consequences

### Positive

- `isolated` keeps an honest meaning.
- Multi-Cat rooms remain collaborative even without a preselected folder.
- Participant wake order no longer changes room filesystem semantics.
- Cleanup and reset behavior can follow explicit ownership boundaries.
- The product gains a clean place to express future room-workspace status in the
  UI.

### Negative

- Product state needs a new explicit room workspace model.
- Current wake flows must add a workspace-resolution/bootstrap step before
  participant spawn.
- `cats-runtime` may eventually need a dedicated bootstrap contract if the host
  cannot own managed room workspace creation alone.
- A future multi-process deployment will need explicit coordination beyond the
  first-slice single-process assumption.

### Neutral

- This ADR does not decide per-file locking or merge strategy.
- This ADR does not remove isolated workspaces from non-room-private flows.
- This ADR does not require the final runtime bootstrap endpoint shape yet.
- This ADR intentionally leaves runtime worktree isolation to future
  `Cats Code`-specific design work.

## Alternatives Considered

### Alternative 1: Keep the current implicit promotion model

- **Pros**: minimal new state; low short-term implementation cost
- **Cons**: violates `isolated` semantics; workspace ownership becomes implicit;
  cleanup remains unsafe and order-dependent
- **Why rejected**: product language and runtime reality drift apart in a way
  that will keep producing semantic bugs

### Alternative 2: Require an operator-selected folder for every collaborative room

- **Pros**: simple shared workspace story; no managed room workspace needed
- **Cons**: too restrictive; blocks early room collaboration and lightweight
  chat-first flows
- **Why rejected**: the product should allow collaborative rooms before a repo
  is explicitly chosen

### Alternative 3: Keep all participants isolated and rely on Git or manual copy

- **Pros**: preserves private sandboxes
- **Cons**: does not support the intended local multi-Cat collaboration model;
  breaks straightforward shared local-file editing
- **Why rejected**: collaborative rooms need a real shared writable workspace

## References

- [SPEC-034](../specs/SPEC-034-room-owned-workspace-bootstrap-and-ownership.md)
- [ADR-001](./001-use-cats-runtime-boundary.md)
- [ADR-017](./017-allow-direct-cat-chat-and-move-routing-into-system-layer.md)
- [SPEC-016](../specs/SPEC-016-chat-session-sleep-wake-lifecycle.md)
- `src/products/chat/api/shared.ts`
- `src/products/chat/state/runtimeSessionWake.ts`
- `src/products/chat/state/runtimeSessionState.ts`

---

*Proposed: 2026-03-25*
*Decision makers: user + Codex*

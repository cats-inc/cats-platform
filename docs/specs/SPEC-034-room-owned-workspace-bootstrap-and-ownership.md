# SPEC-034: Room-Owned Workspace Bootstrap and Ownership Semantics

Status: Draft (Pending Review)

## Summary

`cats` must stop inferring a room's shared workspace from whichever participant
session wakes first.

A collaborative room needs an explicit room-owned workspace contract:

- if the operator selected a local folder, that folder becomes the room's
  shared workspace
- if the operator did not select a folder, the product bootstraps a managed
  room workspace before starting the first participant session
- session-owned isolated sandboxes remain private and must never be promoted
  into room-shared authority

This spec defines the state model, wake flow, and cleanup rules needed to keep
`shared` and `isolated` semantics honest for Boss Cat and multi-Cat rooms.

## Goals

- Make workspace ownership explicit at the room level instead of inferring it
  from participant session state.
- Preserve the meaning of `isolated` as private session scope.
- Allow multi-Cat collaboration on local files even when the operator did not
  preselect a folder.
- Remove wake-order dependence from collaborative room filesystem behavior.
- Keep the product/runtime boundary compatible with
  [ADR-001](../decisions/001-use-cats-runtime-boundary.md).

## Non-Goals

- Designing per-file locking or merge-conflict resolution
- Defining Git, PR, or delivery-governance policy for room workspaces
- Replacing isolated sandboxes for non-room or diagnostic flows
- Standardizing the exact `cats-runtime` HTTP route shape in this document
- Using runtime worktree isolation as the default `Cats Chat` room-workspace
  strategy; that remains `Cats Code` scope
- Solving cross-machine workspace synchronization

## User Stories

- As an operator, I want Cats in the same room to collaborate on the same local
  files, so room-based work feels real rather than simulated.
- As an operator, I want a room without a preselected folder to still gain a
  shared writable workspace, so I can start working before choosing a repo.
- As a Cat, I want `isolated` to mean my workspace is private, so my runtime
  semantics match what the product claims.
- As a maintainer, I want room workspace lifecycle to survive participant
  resets and cleanup, so one Cat cannot accidentally delete another Cat's
  shared working area.

## Requirements

### Functional Requirements

- A collaborative room shall have at most one authoritative room workspace at a
  time.
- Product state shall distinguish:
  - operator-selected workspace intent
  - resolved room-owned shared workspace
  - participant session runtime cwd
- A participant session's private isolated sandbox shall never be promoted into
  room-owned shared workspace authority.
- If a room has an operator-selected folder, the product shall resolve that
  folder into a room-owned shared workspace before spawning the first
  participant session.
- If a room does not have an operator-selected folder but needs collaborative
  runtime sessions, the product shall bootstrap a managed room-owned workspace
  before spawning the first participant session.
- The first participant in a collaborative room without a selected folder shall
  start against the room-owned managed workspace with shared semantics; it
  shall not start as isolated and then be implicitly upgraded.
- Additional participants in the same room shall start against the same
  room-owned workspace from their first spawned session.
- In the first slice, managed room workspace bootstrap shall be owned by
  `cats` host code rather than inferred from participant session spawn
  side effects.
- The first slice shall place managed room workspaces under a stable host-owned
  root adjacent to chat-state persistence, keyed by room/channel ID. A concrete
  default is:
  - `<dirname(chatStatePath)>/room-workspaces/<channelId>/`
- Room wake flows for Boss Cat, direct Cat routing, and newly assigned Cats
  shall all resolve room workspace first and participant session second.
- The product shall no longer use `channel.chatCwd` as an ambiguous field that
  can mean both:
  - room-shared workspace cwd
  - session-private runtime cwd
- Participant leases may continue to store their own `cwd`, but that value
  shall be treated as participant execution state only, not room workspace
  authority.
- Room workspace state shall support at least these statuses:
  - `unbound`
  - `preparing`
  - `ready`
  - `error`
- Room workspace state shall record what kind of room workspace record is
  currently active:
  - `user_selected`
  - `managed_room`
  - `legacy_unknown`
- Room workspace bootstrap shall be idempotent per room. Concurrent wake or
  assignment flows for the same room shall reuse one `preparing` or `ready`
  room workspace record instead of racing to create separate directories.
- Room workspace metadata shall be persisted and rehydrated on restart. The
  product shall attempt to reuse persisted `resolvedCwd` for `managed_room`
  state before considering a new bootstrap.
- Backward compatibility shall support persisted channels that still carry
  legacy `chatCwd` state:
  - if `repoPath` exists and `roomWorkspace` does not, derive
    `roomWorkspace.kind = user_selected` from `repoPath`
  - if `chatCwd` exists, `repoPath` does not, and that path still exists under
    the stable managed-room workspace root, import it as
    `roomWorkspace.kind = managed_room`
  - otherwise, import legacy `chatCwd` as `roomWorkspace.kind =
    legacy_unknown`, do not treat it as authoritative shared workspace state,
    and require explicit repair or fresh bootstrap before new shared spawn
  - new writes shall stop mutating `chatCwd`
- Resetting, closing, or cleaning up one participant session shall not delete a
  managed room workspace while the room still depends on it.
- Deleting the room or explicitly clearing room workspace state shall own the
  cleanup of managed room workspaces.

### Non-Functional Requirements

- Workspace semantics should be order-independent: Cat 1 then Cat 2 must behave
  the same as Cat 2 then Cat 1.
- Workspace semantics should be honest in product language: `isolated` must not
  silently become public later.
- The first slice should preserve existing room routing concepts where possible
  and minimize leakage of runtime-only implementation details into the product
  model.
- The model should allow a later `cats-runtime` bootstrap API without forcing
  that API shape now.
- The first slice assumes a single `cats` host process serializes room-state
  mutation and bootstrap coordination for a given persisted chat-state store.
- A later multi-process deployment will need external locking or an atomic
  bootstrap primitive; that coordination is out of scope for this slice.

## Design Overview

```text
Operator selected folder?
  yes
    -> resolve room workspace from user folder
    -> Cat 1 shared into room workspace
    -> Cat 2 shared into same room workspace
  no
    -> bootstrap managed room workspace
    -> Cat 1 shared into managed room workspace
    -> Cat 2 shared into same managed room workspace

Session-owned isolated sandbox
  -> private to one session
  -> never promoted into room workspace authority
```

### Proposed State Model

`repoPath` may remain as the operator-facing input in the first compatibility
slice, but it should stop being the only room-level workspace field.

The room should gain an explicit resolved workspace record:

```ts
interface ChatRoomWorkspaceState {
  status: 'unbound' | 'preparing' | 'ready' | 'error';
  kind: 'user_selected' | 'managed_room' | 'legacy_unknown' | null;
  requestedCwd: string | null;
  resolvedCwd: string | null;
  lastError: string | null;
}
```

State responsibilities:

- `requestedCwd`
  - operator intent
  - derived from the current `repoPath` in the first slice
- `kind = legacy_unknown`
  - compatibility-only state derived from legacy `chatCwd`
  - not authoritative for new shared participant spawn
- `resolvedCwd`
  - authoritative shared cwd for participant session spawn
- participant lease `cwd`
  - actual runtime cwd for one participant session
  - not authoritative for the room

### First-Slice Bootstrap Contract

The first implementation slice should not wait for a new runtime bootstrap API.

Instead:

1. `cats` host code owns managed room workspace bootstrap.
2. The bootstrap root is derived from `chatStatePath`:
   - `dirname(chatStatePath)/room-workspaces/<channelId>/`
3. The room persists `roomWorkspace.status = preparing` before directory
   creation begins.
4. Successful bootstrap persists:
   - `roomWorkspace.kind = managed_room`
   - `roomWorkspace.resolvedCwd = <host-owned room directory>`
   - `roomWorkspace.status = ready`
5. Runtime session spawn consumes `roomWorkspace.resolvedCwd` with shared
   semantics; runtime does not own room-workspace authority in this slice.

This keeps the first repair local to `cats`, avoids relying on participant
session side effects, and leaves room for a later runtime-owned bootstrap seam
if product/runtime responsibilities change.

### `channel.chatCwd` Direction

`channel.chatCwd` should be deprecated and replaced by explicit room workspace
state.

The current field is overloaded because it can mean:

- a room-shared workspace selected or accepted by the operator
- a runtime-returned cwd from one participant session

That ambiguity enables the bug where a session-owned isolated sandbox path can
be promoted into room-wide shared authority.

In the first compatibility slice:

- `repoPath` can remain
- `chatCwd` should stop being written from `session.cwd`
- legacy `chatCwd` may still be read during migration/import
- session spawn should resolve from `roomWorkspace.resolvedCwd`

### Bootstrap Locking and Idempotency

Bootstrap is keyed by room/channel ID.

The first slice assumes one `cats` host process owns chat-state mutation for a
given room. In that scope, "wait" means later wake or assignment flows observe a
persisted `preparing` record and reuse it instead of launching a second
bootstrap. Cross-process locking is intentionally out of scope until the
product grows a dedicated coordination primitive.

Rules:

- if one flow marks `roomWorkspace.status = preparing`, later concurrent flows
  for the same room should wait for or reuse that in-flight bootstrap instead of
  starting a second directory creation
- if bootstrap completes and the room reaches `ready`, all pending participants
  should reuse the same `resolvedCwd`
- if bootstrap fails, the room should persist `status = error` plus `lastError`
  and require a visible retry path instead of silently falling back to isolated
  participant sandboxes

### Participant Spawn Flow

#### Flow A: Room with operator-selected folder

1. The room records `requestedCwd` from the selected folder.
2. Before the first participant session spawn, the product resolves:
   - `roomWorkspace.status = ready`
   - `roomWorkspace.kind = user_selected`
   - `roomWorkspace.resolvedCwd = requestedCwd`
3. Cat 1, Cat 2, and later participants all spawn with shared semantics
   against `roomWorkspace.resolvedCwd`.

#### Flow B: Room without operator-selected folder

1. The room enters `roomWorkspace.status = preparing`.
2. The product bootstraps a managed room workspace owned by the room.
3. The room records:
   - `roomWorkspace.kind = managed_room`
   - `roomWorkspace.resolvedCwd = <managed room cwd>`
   - `roomWorkspace.status = ready`
4. Cat 1 starts with shared semantics against that managed room workspace.
5. Cat 2 and later participants use the same room workspace from first spawn.

#### Flow C: Session-private isolated sandbox

This remains valid for non-room-private flows, diagnostics, or future product
surfaces that intentionally need session-private scratch state.

Rules:

- isolated sandbox ownership is `session`, not `room`
- isolated sandbox cwd may appear in participant session metadata
- isolated sandbox cwd must not be copied into room workspace state

### Cleanup and Reset Rules

- participant close/reset should clean up only participant-owned resources
- managed room workspace cleanup should be owned by room lifecycle
- if the first participant leaves, the room workspace remains authoritative for
  later participants until the room explicitly clears it
- if a room-selected folder changes, the old room workspace authority must be
  replaced explicitly rather than drifting through participant wake order

### Migration and Compatibility

This change should migrate persisted state conservatively.

Load-time rules:

- if `roomWorkspace` already exists, trust it
- else if `repoPath` exists, materialize `roomWorkspace.kind = user_selected`
  from `repoPath`
- else if legacy `chatCwd` exists under the stable managed-room workspace root
  and the directory still exists, materialize `roomWorkspace.kind =
  managed_room` from that path
- else if legacy `chatCwd` exists, materialize:
  - `roomWorkspace.kind = legacy_unknown`
  - `roomWorkspace.status = error`
  - `roomWorkspace.lastError = 'Legacy chatCwd provenance is unknown; explicit room workspace repair is required.'`
  - no authoritative `resolvedCwd` for new shared participant spawn
  - retain legacy `chatCwd` only for compatibility/debug visibility during migration

Write-time rules:

- new persistence writes should stop updating `chatCwd`
- participant session `cwd` should remain on leases only
- compatibility export paths may still include legacy `chatCwd` until all
  readers switch to `roomWorkspace`

## Dependencies

- [ADR-001](../decisions/001-use-cats-runtime-boundary.md)
- [ADR-017](../decisions/017-allow-direct-cat-chat-and-move-routing-into-system-layer.md)
- [ADR-024](../decisions/024-separate-explicit-mentions-from-dynamic-room-workflow.md)
- [SPEC-016](./SPEC-016-chat-session-sleep-wake-lifecycle.md)
- [SPEC-018](./SPEC-018-direct-cat-chat-and-conversation-routing-layer.md)
- [SPEC-032](./SPEC-032-core-task-lifecycle-and-wakeup-integration.md)

## Open Questions

- Should a later slice move managed room workspace bootstrap behind a dedicated
  `cats-runtime` API once the product-owned repair is stable?
- What UI language should distinguish `user_selected` versus `managed_room`
  workspaces without exposing implementation jargon?

## References

- [ADR-038](../decisions/038-separate-room-owned-workspaces-from-session-owned-sandboxes.md)
- [Architecture](../architecture.md)
- [API](../api.md)
- `src/products/chat/api/shared.ts`
- `src/products/chat/state/runtime-session/wake.ts`
- `src/products/chat/state/runtime-session/state.ts`

---

*Last updated: 2026-03-25*

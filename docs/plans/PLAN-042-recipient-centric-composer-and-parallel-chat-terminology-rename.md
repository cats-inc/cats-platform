# PLAN-042: Recipient-Centric Composer and Parallel Chat Terminology Rename

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Spec

- [SPEC-052: Current-Turn Recipients, Dispatch Policy, and Parallel Chat Terminology](../specs/SPEC-052-current-turn-recipients-dispatch-policy-and-parallel-chat-terminology.md)
- [ADR-055: Retire Lead Semantics and Separate Composer Recipients from Dispatch Policy](../decisions/055-retire-lead-and-separate-composer-recipients-from-dispatch-policy.md)

## Overview

Implement the terminology and contract refactor required by `SPEC-052`.

This plan intentionally treats the work as two coordinated migrations:

1. retire `lead*` as the primary Chat composer/routing language and replace it
   with recipient plus dispatch-policy language
2. reserve `parallel` for `Parallel Chat` and rename thread-internal workflow
   fan-out to `concurrent`, while renaming `Parallel Chat` internals away from
   `concurrentGroups`

This is not a pure string-replace pass. The implementation must also separate:

- room topology
- default recipient configuration
- current-turn recipient projection
- dispatch policy
- workflow continuation

The work may land in multiple commits and phases.
It does not need one flag-day patch, but it should remain one tracked
pre-launch migration rather than splitting into unrelated terminology efforts.

This plan also covers the first concrete Chat UI work needed to make the new
recipient and dispatch-policy model visible, not only the contract rename.

## Hard Constraints

- Do not leave a long-lived compatibility seam for the old `lead` vocabulary.
- Keep `Parallel Chat` as the product-facing name for isolated multicast chats.
- Keep thread-internal multi-recipient execution on `concurrent`.
- Preserve the `cats-platform` to `cats-runtime` boundary.
- Do not force implicit provider/model recipients to become persisted full
  participants in the first implementation slice.
- Keep direct-lane topology distinct from default-recipient semantics; do not
  blindly rename `leadParticipantId` if that would re-couple topology and
  routing.

## Target Vocabulary

The implementation should converge on this vocabulary:

- `currentTurnRecipients`
- `defaultRecipients`
- `implicitRecipient`
- `dispatchPolicy`
- `sequential`
- `concurrent`
- `Parallel Chat`
- `parallelChatGroups`

Working contract targets for the first implementation slice:

- replace routing-level `leadParticipantId` with a default-recipient concept
  rather than another singular "lead" alias
- add a first-class `dispatchPolicy` contract where recipient fan-out order is
  chosen
- rename thread workflow `parallel` to `concurrent`
- rename `ConcurrentChat*` / `concurrentGroups` to `ParallelChat*` /
  `parallelChatGroups`

## Implementation Phases

### Phase 1: Freeze the Rename Map and Contract Boundaries

- [ ] Task 1.1: Freeze the replacement names for:
      - `leadParticipantId`
      - `leadCatId`
      - `ConcurrentChatMode`
      - `ConcurrentChatGroup*`
      - `parallel` thread workflow shape
      - `parallel_fan_out`
- [ ] Task 1.2: Decide the first-slice contract for default recipients:
      - one implicit recipient
      - one named participant
      - multiple named participants
- [ ] Task 1.2a: Freeze the default-recipient progression rules defined in
      `SPEC-052`, including the rule that workflow continuation may preselect
      transient recipients without silently rewriting stored channel defaults.
- [ ] Task 1.3: Decide where `dispatchPolicy` lives:
      - channel default
      - send-turn override
      - read-model projection
- [ ] Task 1.4: Separate direct-lane topology identity from default-recipient
      routing semantics so direct lanes do not depend on a retired `lead`
      concept.
- [ ] Task 1.5: Freeze the first-slice composer layout contract:
      - recipient chip / stack shape
      - implicit-recipient rendering
      - dispatch-policy control placement
      - recipient editing entry point
      - multi-recipient ordering interaction

**Dependency note**: Phase 3 must not remove or replace direct-lane
`leadParticipantId` behavior until Task 1.4 has frozen the topology split.

**Dependency note**: Phases 2-4 should treat Task 1.5 as the UI-behavior input
for contract work. If implementation later discovers that the frozen composer
contract is insufficient, the plan should explicitly reopen Phase 1 rather than
quietly letting Phase 5 redefine the model after contract changes have landed.

**Deliverables**: one stable rename map and contract boundary before code
changes spread across state, renderer, and tests.

### Phase 2: Shared and Cross-Product Contract Migration

**Review gate**: this phase touches frozen shared contracts
(`src/shared/roomRouting.ts` and `src/products/chat/api/contracts.ts`).
Implementation must pass integration review before code lands.
Under the current repo role assignment, Codex acts as the integrator unless the
user explicitly reassigns that role.

- [ ] Task 2.1: Update shared room-routing contracts in
      `src/shared/roomRouting.ts` to replace `parallel` with `concurrent` and
      introduce recipient/dispatch-policy language.
- [ ] Task 2.2: Update core workflow mirrors in:
      - `src/core/taskControlPlane.ts`
      - `src/core/recovery.ts`
      - `src/core/operatorInbox.ts`
- [ ] Task 2.3: Update chat API contracts in
      `src/products/chat/api/contracts.ts`:
      - `ConcurrentChat*` -> `ParallelChat*`
      - `concurrentGroups` -> `parallelChatGroups`
      - `leadCatId` summary aliases -> recipient-centric replacements
- [ ] Task 2.4: Update mirrored operator-loop type layers in:
      - `src/products/chat/shared/operator-loop/**`
      - `src/products/work/shared/operator-loop/**`
      - `src/products/code/shared/operator-loop/**`
- [ ] Task 2.5: Update cross-product consumers that depend on shared summary or
      topology fields in `Work` and `Code`.

**Deliverables**: shared and read-model contracts carry the new vocabulary, and
Chat/Work/Code compile against one renamed baseline.

### Phase 3: Chat State and Routing Migration

**Dependency note**: Phase 3 depends on Phase 1 Task 1.4 completing first.

- [ ] Task 3.1: Rework chat-state creation and normalization in:
      - `src/products/chat/state/model/index.ts`
      - `src/products/chat/state/model/shared.ts`
      - `src/products/chat/state/chat-snapshot/**`
- [ ] Task 3.1a: Add backward-compatible state and snapshot migration adapters
      for persisted fields and values that may already exist in user data:
      - `leadParticipantId`
      - `leadCatId`
      - `parallel` workflow shape values
      - `parallel_fan_out`
      - `concurrentGroups`
- [ ] Task 3.2: Update routing logic in:
      - `src/products/chat/state/mentionRouter.ts`
      - `src/products/chat/state/runtimeTargeting.ts`
      - `src/products/chat/state/runtime-session/**`
- [ ] Task 3.3: Rename workflow stage and replay handling in:
      - `src/products/chat/state/runtime-dispatch/loop.ts`
      - `src/products/chat/state/runtime-dispatch/results.ts`
      - `src/products/chat/state/runtime-dispatch/replay.ts`
- [ ] Task 3.4: Keep `pendingProvider` / `pendingModel` as the first-slice
      backing store for implicit recipients while projecting them through the
      new recipient model.
- [ ] Task 3.5: Add per-channel default dispatch policy and a per-send override
      path without forcing a full persisted participant-materialization rewrite.

**Deliverables**: chat-state routing and workflow execution speak in recipient
and dispatch-policy terms, while implicit recipients remain truthful in product
semantics.

### Phase 4: Parallel Chat State, Routes, and Busy Keys

- [ ] Task 4.1: Rename state and API resource surfaces:
      - `concurrentGroups` -> `parallelChatGroups`
      - `ConcurrentChatGroup*` -> `ParallelChatGroup*`
      - `concurrentGroupRoutes.ts` -> `parallelChatGroupRoutes.ts`
- [ ] Task 4.2: Rename busy keys and request kinds used only by `Parallel Chat`:
      - `concurrent:ack`
      - `concurrent:dispatch`
      - `concurrent:relay`
      - `concurrent:stop`
- [ ] Task 4.3: Update client helpers and route support:
      - `src/products/chat/renderer/api/chat.ts`
      - `src/products/chat/api/routeSupport.ts`
      - `src/products/chat/state/shell.ts`
      - `src/products/chat/renderer/api/normalization.ts`
- [ ] Task 4.4: Keep user-facing `Parallel Chat` copy stable while removing the
      older internal `concurrent*` mismatch.

**Deliverables**: `Parallel Chat` product language and internal state names are
aligned.

### Phase 5: Renderer and Interaction Refactor

- [ ] Task 5.1: Implement the frozen first-slice composer contract from
      Phase 1 Task 1.5 in the actual Chat UI for:
      - named recipients
      - implicit recipients
      - multi-recipient stacks
      - dispatch-policy control
      - per-send recipient editing
- [ ] Task 5.2: Rework `src/products/chat/renderer/components/ChatView.tsx`
      so the composer slot shows current-turn recipient(s), not the room roster.
- [ ] Task 5.3: Introduce or adapt renderer helpers so recipient stack and
      dispatch policy are first-class UI concepts instead of overloading
      `leadCatId` / `leadParticipantId`.
- [ ] Task 5.4: Implement the recipient-editing interaction:
      - choose recipient(s)
      - remove recipient(s)
      - reorder sequential recipients
      - switch between implicit and named recipients where allowed
- [ ] Task 5.5: Implement the dispatch-policy interaction as its own visible
      control and thread it through per-send state.
- [ ] Task 5.6: Keep room roster and room context in header/side-panel surfaces.
- [ ] Task 5.7: Ensure sequential multi-recipient turns respect stack order
      without adding forced numbering chrome.
- [ ] Task 5.8: Preserve a forward-compatible seam for an explicit
      "make this the channel default" affordance, even if the first slice
      keeps that mutation flow deferred.
- [ ] Task 5.9: Update related renderer helpers and components:
      - `chatUtils.tsx`
      - `conversationMode.ts`
      - `appViewState.ts`
      - `components/ComposerCatStack.tsx`
      - `components/Sidebar.tsx`
      - `hooks/useComposerSubmit.ts`
      - `hooks/useLiveIndicator.ts`
      - `hooks/useAppNavigationActions.ts`

**Deliverables**: the visible Chat UI matches the recipient-centric model
documented in `SPEC-052`.

### Phase 6: Validation, Snapshot Compatibility, and Documentation Sync

- [ ] Task 6.1: Add or update tests covering:
      - default recipient resolution
      - explicit multi-recipient routing
      - sequential vs concurrent dispatch policy
      - `Parallel Chat` group create/send/relay flows
      - snapshot normalization and recovery
- [ ] Task 6.2: Update high-signal docs after implementation lands:
      - `docs/architecture.md`
      - `docs/api.md`
      - any remaining active Chat specs that still describe the old lead model
- [ ] Task 6.3: Remove temporary branch-local adapters used during the rename
      so the landed code does not preserve old terminology as a live seam.

**Deliverables**: implementation, tests, and docs agree on the new vocabulary.

## Candidate Code Areas

| Area | Action | Why |
|------|--------|-----|
| `src/shared/roomRouting.ts` | Refactor | Replace `lead`/`parallel` vocabulary with recipient/dispatch-policy/concurrent vocabulary |
| `src/core/taskControlPlane.ts` | Refactor | Keep core workflow metadata aligned with shared room-routing names |
| `src/core/recovery.ts` | Refactor | Keep stored workflow recovery compatible with renamed workflow shape values |
| `src/core/operatorInbox.ts` | Refactor | Keep shared metadata readers aligned with workflow-shape rename |
| `src/products/chat/api/contracts.ts` | Refactor heavily | Rename `ConcurrentChat*`, `concurrentGroups`, and summary aliases that still expose `lead` |
| `src/products/chat/state/model/**` | Refactor heavily | Replace lead-centric default-target assumptions with recipient-centric defaults and dispatch policy |
| `src/products/chat/state/chat-snapshot/**` | Refactor heavily | Add migration adapters so persisted old names and values can still be read and normalized |
| `src/products/chat/state/mentionRouter.ts` | Refactor heavily | Resolve recipients instead of singular lead/default-target language |
| `src/products/chat/state/runtimeTargeting.ts` | Refactor | Keep implicit provider/model recipients truthful without forcing immediate participant persistence |
| `src/products/chat/state/runtime-dispatch/**` | Refactor | Rename `parallel` workflow shape and stage ids to `concurrent` |
| `src/products/chat/api/resources/concurrentGroupRoutes.ts` | Rename + refactor | Align `Parallel Chat` resource names with product language |
| `src/products/chat/renderer/components/ChatView.tsx` | Refactor heavily | Make the composer slot recipient-centric and separate it from room roster UI |
| `src/products/shared/renderer/components/ExecutionTarget.ts` | Refactor | Keep implicit execution-target labeling shared instead of routing it through product-local default-mode wrappers |
| `src/products/chat/renderer/components/NewChatDraft.tsx` | Refactor | Expose recipient and dispatch-policy choices during channel creation where needed |
| `src/products/chat/renderer/components/ComposerCatStack.tsx` | Refactor or replace | Move from lead-centric cat stack rendering to recipient-centric chip/stack rendering |
| `src/products/chat/renderer/hooks/useComposerSubmit.ts` | Refactor heavily | Carry dispatch-policy overrides and renamed busy keys through send flows |
| `src/products/chat/renderer/api/normalization.ts` | Refactor | Normalize renamed chat-group and recipient/read-model payloads |
| `src/products/work/**` | Targeted updates | Shared contract rename will affect Work read-model and renderer helpers |
| `src/products/code/**` | Targeted updates | Shared contract rename will affect Code read-model and renderer helpers |
| `tests/**` | Expand | Prove renamed contracts and migrated routing behavior hold end to end |

## Technical Decisions

- Decision 1: Treat this as a model refactor plus rename, not as a doc-only
  wording cleanup, because `SPEC-052` explicitly rejects a long-lived
  compatibility seam.
- Decision 2: Keep implicit recipients projected from `pendingProvider` /
  `pendingModel` in the first slice instead of blocking on full participant
  persistence.
- Decision 3: Split direct-lane identity from default-recipient routing before
  removing `leadParticipantId`, otherwise the refactor would recreate the old
  topology/routing coupling in a new name.
- Decision 4: Rename `Parallel Chat` internals together with thread workflow
  terminology so the codebase stops using `parallel` and `concurrent` in the
  opposite product meanings.

## Testing Strategy

- **Unit Tests**: room-routing helpers, recipient/default projection helpers,
  dispatch-policy reducers, renamed parallel-chat helpers
- **Integration Tests**: create channel, send with sequential and concurrent
  multi-recipient paths, direct-lane behavior, `Parallel Chat` group create /
  send / relay / delete flows
- **Manual Testing**:
  - verify the composer slot reflects current-turn recipients rather than the
    room roster
  - verify the operator can discover and use the recipient-editing affordance
  - verify sequential multi-recipient turns follow stack order
  - verify concurrent multi-recipient turns still fan out correctly
  - verify `Parallel Chat` recents, relay, and busy states still work after the
    rename

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| The refactor balloons into a full participant-model rewrite | High | Keep implicit recipient persistence out of scope for the first slice and focus on the composer/routing seam |
| Shared-contract rename breaks Work and Code consumers | High | Treat cross-product updates as part of Phase 2 instead of postponing them |
| Snapshot recovery or persisted state restore breaks on old names | High | Add normalization tests and explicit migration adapters during the branch, then remove residual aliases before landing |
| Direct-lane behavior regresses when `leadParticipantId` is removed | High | Split direct-lane topology identity from routing defaults before deleting old fields |
| The refactor lands as a rename-only patch and leaves the new UI model unimplemented | High | Treat Phase 5 as required product work, not an optional follow-up |
| `Parallel Chat` UI copy and internal keys drift again | Medium | Rename state, routes, busy keys, and docs together in one tracked phase |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-08 | Plan created from ADR-055 and SPEC-052 to drive the recipient-centric composer rename and the Parallel Chat terminology cleanup |
| 2026-04-08 | Phase 1-2 landed: `RoomWorkflowShape` `parallel` renamed to `concurrent` with snapshot migration |
| 2026-04-08 | Phase 4 landed: `ConcurrentChat*` renamed to `ParallelChat*`, `concurrentGroups` to `parallelChatGroups`, busy keys to `parallelChat:*` |
| 2026-04-08 | Phase 3 landed: `leadParticipantId` renamed to `defaultRecipientId`, `leadCatId` to `defaultRecipientCatId` across 94 files |
| 2026-04-08 | Phase 5 started: `ComposerRecipientChip` component added, ChatView and NewChatDraft composer slots unified, lead badges removed |

---

*Created: 2026-04-08*
*Author: Codex*


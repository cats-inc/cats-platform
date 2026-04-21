# PLAN-070: Programmable Per-Branch Draft Rollout

> Make parallel-draft state per-branch-addressable so an orchestrator
> (Guide Cat or any future composer) can author fully populated M×N
> team plans and the renderer / dispatch pipeline projects them
> without special-case glue. Ship in three phases: absorb today's
> parallel arrays into `DraftParallelTarget`, add per-branch
> cwd / session policy detach UI, finish with prompt / task / reserved
> attachments.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | TBD (Conductor on accept) |
| **Reviewer** | User |

## Related Spec / Dependencies

- [SPEC-078: Per-Branch Draft State Schema and Lead-Default Fallback Semantics](../specs/SPEC-078-per-branch-draft-state-schema.md)
- [ADR-077: Make Parallel Draft State Per-Branch-Addressable](../decisions/077-make-parallel-draft-state-per-branch-addressable-for-orchestrator-composition.md)
- [ADR-076: Lay parallel-draft branches in a 3D compare carousel](../decisions/076-lay-parallel-draft-branches-in-a-3d-compare-carousel.md)
- [SPEC-077: Compare Draft Carousel and Per-Card Chrome Contract](../specs/SPEC-077-compare-draft-carousel-and-per-card-chrome.md)
- [PLAN-069: Compare Draft Carousel Rollout](./PLAN-069-compare-draft-carousel-rollout.md)
- [ADR-067: Shared draft primitives with product-owned code-entry drafts](../decisions/067-use-shared-draft-primitives-with-product-owned-code-entry-drafts.md)
- [ADR-071: Reject invalid runtime session policy combinations at the create boundary](../decisions/071-reject-invalid-runtime-session-policy-combinations-at-create-boundary.md)
- [SPEC-072: Runtime Session Policy Boundary Validation](../specs/SPEC-072-runtime-session-policy-boundary-validation.md)
- Memory: `project_cats_draft_orchestrator.md` — design north star for orchestrator-composed drafts

## Overview

PLAN-069 shipped the carousel UI with a read-only "Follows lead"
relationship on non-lead branches because the data model has no home
for per-branch overrides. This plan lands that home.

Three phases, each ships a usable slice:

1. **Phase 1 — Schema foundation and parallel-array absorption.**
   Extend `DraftParallelTarget` with the new optional per-branch
   fields; migrate the two existing parallel arrays
   (`parallelBranchAudienceKeys[]`,
   `parallelBranchWorkflowShapes[]`) onto the target; introduce
   resolution helpers; renderer and dispatch read resolved values
   through the helpers. No new UI — the "Follows lead" behaviour
   from PLAN-069 continues, just routed through the new schema.
2. **Phase 2 — Detach cwd and session policy.** Make the
   "Follows lead" chip on non-lead cards interactive for two
   dimensions: click to open a per-branch cwd picker; click again
   to detach session policy. Advanced-controls gated.
3. **Phase 3 — Detach prompt, wire `taskRef`, reserve
   `attachmentsOverride`.** Prompt detach UX, task-chip wiring
   (depends on an upstream task model spec), and schema-only
   reservation for attachments.

Phase 1 is the critical path because every downstream phase — and
every orchestrator integration — depends on the schema being in
place. Phase 2 and Phase 3 are independent and can ship in either
order once Phase 1 lands.

## Implementation Phases

### Phase 1: Schema foundation and parallel-array absorption

- [x] Task 1.1: Extend `DraftParallelTarget` in
      `src/products/shared/renderer/draftChatUtils.tsx` (the type
      lives there alongside `createDefaultParallelTargetForProvider`
      and the parallel-target list helpers — `ExecutionTarget.ts`
      only declares the unrelated `ExecutionTargetValue` shape) with
      the fields defined in SPEC-078 § Schema. All new fields are
      optional / nullable; no existing code path should break on a
      target where every new field is undefined.
- [x] Task 1.2: Add the resolution module
      `src/products/shared/renderer/draftBranchResolution.ts`
      exporting the **Phase 1 subset** of helpers defined in
      SPEC-078 § Resolution Helpers: `resolveBranchCwd`,
      `resolveBranchSessionPolicy`, `resolveBranchAudienceKeys`,
      `resolveBranchWorkflowShape`, `resolveBranchAttachments`,
      and the aggregate `resolveBranch(target, leadContext) →
      ResolvedBranch`. Do **not** ship `resolveBranchPrompt` or
      `resolveBranchTaskRef` in Phase 1 — those are Phase 3
      additions that arrive together with `promptOverride` /
      `taskRef` on `DraftParallelTarget`. Phase-1 callers read
      the lead prompt directly from `leadContext.composerDraft`.
- [x] Task 1.3: Flatten the existing `DraftParallelBranchState<T>`
      wrapper onto the target.
      - Correction from the previous plan draft: there **is** a
        wrapper today, at
        `src/products/shared/renderer/draftParallelBranches.ts`:
        `interface DraftParallelBranchState<TTarget> { target; audienceKeys; workflowShape }`.
        Chat / Workspace composer hooks
        (`composerParallelDispatch.ts`, `useComposerSubmit.ts`,
        `useWorkspaceComposerSubmit.ts`) hold
        `DraftParallelBranchState<ExecutionTargetValue>[]` as the
        canonical branch state; the renderer-facing
        `parallelBranchAudienceKeys[]` /
        `parallelBranchWorkflowShapes[]` props are derived from
        that wrapper, not stored loose.
      - Migration: move `audienceKeys` and `workflowShape` onto
        the extended `DraftParallelTarget`. The remaining wrapper
        shape becomes trivial (just `{ target }`) — either
        deleted outright (every consumer switches to
        `DraftParallelTarget[]`) or kept as a type alias for one
        release if that simplifies the diff. Decide at
        implementation time based on call-site count.
      - Remove the derived `parallelBranchAudienceKeys` /
        `parallelBranchWorkflowShapes` props from
        `NewChatDraftProps` once consumers switch to the
        resolver suite.
      - Initializers that used to populate `DraftParallelBranchState`
        fields now populate `target.audienceKeys` /
        `target.workflowShape` directly. Reducers that updated a
        branch's audience keys / workflow shape update the target
        in place. `parallelTargets[i].audienceKeys` and
        `parallelTargets[i].workflowShape` become the source of
        truth.
- [x] Task 1.4: Update `ChatNewChatDraft` render path to consume
      resolved branches:
      - Replace inline `parallelBranchAudienceKeys?.[i] ?? []`
        reads with `resolveBranchAudienceKeys(target, lead)`.
      - Replace inline `parallelBranchWorkflowShapes?.[i] ?? 'sequential'`
        reads with `resolveBranchWorkflowShape(target, lead)`.
      - `buildShadowCardContent` reads everything through the
        resolver — the PLAN-069 "Follows lead" chip continues to
        show because every resolved override equals the lead
        value.
- [ ] Task 1.5: Update dispatch pipeline
      (`src/products/chat/state/runtime-dispatch/**`) to iterate
      `resolvedBranches`, not `parallelTargets` + parallel arrays.
      Every per-branch dispatch point reads resolved effective
      values. The per-channel wire from product → runtime is
      unchanged once the parallel group's child channels exist.
- [x] Task 1.6: **Extend the parallel-group create contract** in
      `src/products/chat/api/contracts.ts` so per-branch cwd /
      session policy can round-trip at group-creation time.
      Two coordinated extensions:
      - `CreateParallelChatGroupInput.targets` element gains
        optional `cwd?: string | null` and
        `runtimeSessionPolicy?: RuntimeSessionPolicy | null`.
      - Add a new **group-level** `runtimeSessionPolicy?: RuntimeSessionPolicy | null`
        field on `CreateParallelChatGroupInput` itself, mirroring
        the existing group-level `repoPath`. This is the lead
        default that per-target `runtimeSessionPolicy` falls
        back to; without it, a per-target `null` would collapse
        to a server-side default instead of inheriting the
        lead draft's policy.
      - The read-model `ParallelChatTarget` itself does not grow
        — per-channel `repoPath` / session policy are already
        projected onto the resulting `ChatChannelView`.
      - Mirror the same extension (both group-level and
        per-target) in `src/products/shared/renderer/api/chat.ts`,
        which re-declares the input shape for the renderer-side
        client.
      - **Thread `draftSessionPolicy` through the submit-hook
        chain all the way to the new group-level wire field.**
        The Workspace hook
        (`src/products/shared/renderer/hooks/useWorkspaceComposerSubmit.ts`)
        already receives `draftSessionPolicy` in its options
        (line 103 at the time of writing) but its
        `submitNewParallelChatDraft(...)` call site does not
        forward it. The Chat hook
        (`src/products/chat/renderer/hooks/useComposerSubmit.ts`)
        currently has no option-level `draftSessionPolicy`; do
        not treat it as an already-present pass-through. Phase 1
        must either add Chat draft policy state/options before
        wiring Chat's dispatcher, or explicitly pass the Chat
        product default (`null` / resolved default) and test that
        fallback as the intended behaviour.
        The fix is:
        1. `submitNewParallelChatDraft` (both copies in
           `src/products/{chat,shared}/renderer/composerParallelDispatch.ts`)
           accepts a new `draftSessionPolicy?: RuntimeSessionPolicy | null`
           parameter.
        2. The Workspace hook passes its existing option-level
           `draftSessionPolicy` into that call site.
        3. The Chat hook either passes a newly added option-level
           `draftSessionPolicy` (if Chat owns editable draft policy)
           or an explicit default/null value (if Chat stays governed
           by product defaults).
        4. The dispatcher writes it onto the `CreateParallelChatGroupInput`
           as the group-level `runtimeSessionPolicy`.
        Without the full chain, changing only the dispatcher
        leaves the hook never giving the dispatcher a policy to
        write, and the group-level contract field stays empty —
        reintroducing the server-default-fallback bug.
      - Without this whole chain, Phase 2's per-branch cwd /
        session policy UI ships nowhere it can write to.
- [x] Task 1.7: **Update the product-owned parallel-group create
      path** to consume the extended contract. Per ADR-067, this
      is product-owned, not in `src/app/server/**`. Touch both
      layers:
      - `src/products/chat/api/resources/parallelChatGroupCrudRoutes.ts`
        — the product's HTTP route handler parses
        `CreateParallelChatGroupInput`. Pass the new per-target
        overrides and the new group-level `runtimeSessionPolicy`
        through without collapsing them at this layer.
      - `src/products/chat/state/model/index.ts` — the state
        model's `createParallelChatGroup`-equivalent consumer is
        where the group's child channels are materialized. For
        each target:
        - Resolve `cwd` against the group's `repoPath` (existing
          lead default field).
        - Resolve `runtimeSessionPolicy` against the new
          group-level `runtimeSessionPolicy` lead default.
        - Forward the resolved per-channel values via the
          existing `RuntimeSessionCreateContractInput` mix-in to
          each child `CreateChatChannelInput`.
        - Run ADR-071 validation per resolved per-channel
          policy; reject the whole group create with a
          per-target error if any child fails.
- [x] Task 1.8: Dispatch rejects a target whose
      `attachmentsOverride` is non-null — Phase 1 does not
      implement per-branch attachments. Clear error message
      ("attachments are not yet per-branch; remove the override").
- [ ] Task 1.9: Tests — update existing parallel-chat tests to
      construct per-branch state via target fields rather than
      parallel arrays. Add contract-level test fixtures for
      `CreateParallelChatGroupInput` covering group-level-only
      `runtimeSessionPolicy`, per-target `cwd` /
      `runtimeSessionPolicy` overrides, and neither-set fallback
      to server default. Add a submit-chain propagation guard:
      Workspace / Chat submit with a non-null `draftSessionPolicy`
      (or Chat's explicitly documented default/null path) produces
      the expected group-level `runtimeSessionPolicy`. Add a small
      resolution-helper test suite: null → inherit, concrete →
      use-as-is, lead-target override equals-lead-default.
- [x] Task 1.10: Document in SPEC-078 which fields have landed;
      move Phase 1 items from § Migration into "landed".

### Phase 2: Detach cwd and session policy

- Progress as of 2026-04-21:
      shadow cards now render detached branch cwd chips and detached
      runtime-session-policy chips when those fields are already set on
      `parallelTargets[i]`; both chips expose a re-link action that
      clears the branch override back to lead inheritance. The branch
      cwd "Follows lead" chip is now clickable under advanced draft
      controls and opens the folder picker scoped to that branch.
      Session-policy detach, permission edit, and repo-ready
      workspace-mode edit controls are wired.
      Focused API client coverage now asserts detached branch cwd and
      runtime policy fields are present in the parallel-group create
      POST body, and pure target-helper tests cover set + re-link
      clear for branch cwd and runtime policy. Carousel transition
      stability is guarded by keeping shadow-card ids independent of
      cwd / session-policy detach state.
- [x] Task 2.1: UX for per-branch cwd detach.
      - Non-lead card's `composerFollowsLeadChip` gains a click
        target that opens the side-panel cwd picker scoped to the
        branch.
      - Picker writes to `parallelTargets[i].cwd`.
      - When `resolveBranchCwd` returns a non-lead value, the chip
        swaps to a `composerCwdChip` showing the branch's cwd.
      - "Re-link to lead" action on the branch-cwd chip nulls
        `cwd`, returning to the "Follows lead" state.
      - Gated by "Enable advanced draft controls" — basic users
        never see the detach affordance.
- [x] Task 2.2: Session policy detach. Mirror the cwd flow for
      `runtimeSessionPolicy`. ADR-071 validation runs against the
      resolved per-branch policy at submit time (already wired by
      Phase 1 Task 1.5); Phase 2 just exposes the editing UI.
- [x] Task 2.3: Verify the carousel animation still works when a
      card's header chips change shape (chip→cwd chip) during an
      active carousel transition — edge case when detaching a
      peek card. If janky, debounce chip swap until transition
      settles.
- [x] Task 2.4: Tests — add coverage for "detach cwd on branch 2,
      submit, assert dispatch sees branch-2's cwd" and the re-link
      flow.
- [x] Task 2.5: Update SPEC-078 § Migration and § Surfaces Affected
      to reflect the new UI touch points.

### Phase 3: Detach prompt, add + wire `taskRef`, reserve `attachmentsOverride`

- Progress as of 2026-04-21:
      Prompt override schema / resolver groundwork is landed:
      `DraftParallelTarget.promptOverride` resolves through
      `resolveBranchPrompt`, and renderer parallel dispatch sends
      each branch's `effectivePrompt` through the existing
      `channelInputs[].body` wire. Prompt detach UI is now exposed
      on non-lead carousel cards: clicking the followed textarea
      opens an explicit detach confirmation, detached prompts become
      editable, and re-link clears the override back to lead.
      `attachmentsOverride` remains schema-reserved and rejected
      when non-null; the UI keeps producing null / undefined only.
      A synthetic orchestrator-authored fixture now renders with all
      landed per-branch fields populated. `taskRef` is still blocked
      on the upstream task model spec.
- [x] Task 3.1: Add `promptOverride?: string | null` to
      `DraftParallelTarget`. Add the corresponding resolution
      helper. Wire dispatch to read resolved prompt per branch.
- [x] Task 3.2: Prompt detach UX. Non-lead textarea in carousel
      becomes click-to-detach; detached state enables editing
      that branch's textarea; re-link clears `promptOverride`.
      Guard against accidental detach: require an explicit "Detach
      prompt" confirm (textarea is small enough that a stray
      keystroke could otherwise trigger unwanted editing).
- [ ] Task 3.3: **Add `taskRef?: TaskRef | null` to
      `DraftParallelTarget`** — deferred from Phase 1 because
      `TaskRef` requires an upstream task model spec. When that
      spec lands, add the field, the resolution helper, and wire
      the renderer read path through the task-chip slot reserved
      by SPEC-077. Authoring path (how a `TaskRef` gets written
      into a branch) is decided by the task model spec and is
      handled there, not here.
- [x] Task 3.4: Keep `attachmentsOverride` schema-reserved. Phase
      3 does not implement per-branch attachments; a dedicated
      future SPEC will. Dispatch continues to reject
      `attachmentsOverride != null`.
- [x] Task 3.5: Orchestrator handoff sanity: produce a synthetic
      orchestrator-authored draft (test fixture with all
      per-branch fields populated, including `taskRef` once the
      type exists) and assert the renderer renders it cleanly
      without UI regressions. Confirms the schema is
      orchestrator-ready even though the orchestrator itself
      isn't wired.
- [ ] Task 3.6: Close out SPEC-078 open questions that resolved
      during implementation; carry any remaining forward into
      orchestrator-ingestion spec (TBD).

## Files Touched (Phase 1 expected)

```
# Renderer types + resolver + branch-state flattening
src/products/shared/renderer/draftChatUtils.tsx                              (DraftParallelTarget extension)
src/products/shared/renderer/draftParallelBranches.ts                        (flatten DraftParallelBranchState: fields move onto target)
src/products/shared/renderer/draftBranchResolution.ts                        (new — resolver suite, ResolvedBranch aggregate)
src/products/shared/renderer/composerParallelDispatch.ts                     (update to consume extended target / resolver output)
src/products/chat/renderer/composerParallelDispatch.ts                       (update to consume extended target / resolver output)
src/products/shared/renderer/hooks/useWorkspaceComposerSubmit.ts             (accept extended target)
src/products/chat/renderer/hooks/useComposerSubmit.ts                        (accept extended target)
src/products/shared/renderer/components/ChatNewChatDraft.tsx                 (consume ResolvedBranch; drop derived parallel-array prop reads)

# Draft state hooks across products (audience/workflow move onto target)
src/products/chat/state/**                                                   (draft hooks: return DraftParallelTarget[] with per-branch fields)
src/products/code/state/** / src/products/work/state/**                      (matching migrations if they mirror chat state)

# Frozen API contract (both declaration sites; both group-level AND per-target extensions)
src/products/chat/api/contracts.ts                                           (CreateParallelChatGroupInput gets NEW group-level runtimeSessionPolicy AND per-target cwd / runtimeSessionPolicy on targets[])
src/products/shared/renderer/api/chat.ts                                     (mirror both extensions for the renderer client)

# Renderer submit path — threading draftSessionPolicy from hook options to group-level wire field
src/products/shared/renderer/hooks/useWorkspaceComposerSubmit.ts             (Workspace hook: forward draftSessionPolicy into the submitNewParallelChatDraft call — currently receives draftSessionPolicy at line 103 but does not pass it through at the line 279 call site)
src/products/chat/renderer/hooks/useComposerSubmit.ts                        (Chat hook: add/pass draftSessionPolicy only if Chat owns editable draft policy; otherwise pass an explicit null/default and test that fallback)
src/products/shared/renderer/composerParallelDispatch.ts                     (accept draftSessionPolicy arg and populate group-level runtimeSessionPolicy on the CreateParallelChatGroupInput it builds)
src/products/chat/renderer/composerParallelDispatch.ts                       (same, for the Chat-product copy)

# Product-owned parallel-group create path (NOT src/app/server/**)
src/products/chat/api/resources/parallelChatGroupCrudRoutes.ts               (route handler passes BOTH group-level runtimeSessionPolicy AND per-target overrides through)
src/products/chat/state/model/index.ts                                       (resolve target.cwd ?? group.repoPath, target.runtimeSessionPolicy ?? group.runtimeSessionPolicy ?? server default; flatten resolved policy into per-channel RuntimeSessionCreateContractInput)

# Runtime dispatch
src/products/chat/state/runtime-dispatch/**                                  (consume ResolvedBranch at submit time)

# Tests
tests/** (draft-dispatch, parallel-chat, carousel render, resolver unit tests,
          CreateParallelChatGroupInput contract fixtures, parallelChatGroup create-route tests,
          state-model group-create tests)

# Docs
docs/specs/SPEC-078-per-branch-draft-state-schema.md                         (landed-fields annotation)
docs/plans/PLAN-070-programmable-per-branch-draft-rollout.md                 (progress log)
```

ADR-067 reminder: the parallel-group create path lives in the Chat
product, not in `src/app/server/**`. A previous revision of this
plan pointed at the wrong boundary; the correct entry points are
the route handler in `src/products/chat/api/resources/` and the
state model in `src/products/chat/state/model/`.

Contract-extension reminder: the create contract change is **two
coordinated edits**, not one. Both sides must land together:

1. New group-level `runtimeSessionPolicy?: RuntimeSessionPolicy | null`
   on `CreateParallelChatGroupInput` itself (mirroring the existing
   group-level `repoPath`).
2. New per-target `cwd?` and `runtimeSessionPolicy?` on the
   `targets[]` element.

Shipping only per-target overrides would leave every un-overridden
branch falling back to server default instead of lead draft policy.
See SPEC-078 § Dispatch Contract › "Why `runtimeSessionPolicy` is
nested" for the rationale behind the nested shape (vs the flattened
`RuntimeSessionCreateContractInput` used by
`CreateChatChannelInput`).

Phase 2 / Phase 3 surfaces will be listed when they're scheduled.

## Verification

### Phase 1 exit criteria

- `npx tsc --noEmit` clean across every file that references
  `parallelBranchAudienceKeys` or `parallelBranchWorkflowShapes`
  (they should no longer exist).
- Manual parity pass: run the same flows as PLAN-069 Phase 1
  verification (+Peer code, +Parallel chat, +Group chat, +New
  code advanced-controls) and confirm behaviour is unchanged —
  "Follows lead" chip remains everywhere, per-branch audience /
  workflow continues to work, dispatch succeeds.
- A new unit test suite for `draftBranchResolution` with at least:
  - null override → lead value (all fields).
  - concrete override → override value.
  - lead-branch (`index 0`) override equal-to-lead resolves to
    lead (regression guard so orchestrators who set lead overrides
    don't inadvertently change behaviour).
- Contract / server tests:
  - `CreateParallelChatGroupInput` with no per-target overrides
    and no group-level `runtimeSessionPolicy` produces the same
    per-channel inputs as today (server default applies).
  - `CreateParallelChatGroupInput` with a group-level
    `runtimeSessionPolicy` and no per-target overrides
    propagates the group policy to every child channel.
  - Per-target `cwd` overrides surface as the corresponding
    per-channel `repoPath`; missing per-target `cwd` falls back
    to the group's `repoPath`.
  - Per-target `runtimeSessionPolicy` overrides surface on the
    corresponding per-channel `RuntimeSessionCreateContractInput`
    mix-in; missing per-target `runtimeSessionPolicy` falls back
    to the group-level `runtimeSessionPolicy`, then to server
    default. ADR-071 rejection on a single target rejects the
    whole group create with a per-target error message.
  - Renderer submit populates group-level
    `runtimeSessionPolicy` from the lead draft policy
    (`draftSessionPolicy` at the hook boundary /
    `draftRuntimeSessionPolicy` at the component boundary) when
    the lead draft has a concrete policy, and explicitly covers
    Chat's documented default/null path if Chat does not own
    editable draft policy.

### Phase 2 exit criteria

- Detaching branch-2's cwd via the carousel's detach UX shows the
  concrete branch cwd in the chip and dispatches that cwd on
  submit.
- Re-link flow returns the chip to "Follows lead" and resolved
  cwd equals lead cwd.
- ADR-071 validation rejects invalid detached session policies
  with per-branch error messaging.

### Phase 3 exit criteria

- Synthetic orchestrator-authored draft fixture renders cleanly
  (all per-branch fields displayed; no React/TS warnings).
- Prompt detach and re-link work without data loss ("re-link"
  preserves any text the user typed into the detached textarea
  in case re-linking was accidental — revisit if UX research says
  otherwise).
- `attachmentsOverride` remains null in every draft produced by
  the UI; dispatch rejects any non-null value with the documented
  error.

## Risks and Open Questions

- **Phase 1 grew once: contract + submit chain + state-model
  work is in scope.** Initial draft underestimated this. Per-
  branch cwd and session policy require:
  1. Extending `CreateParallelChatGroupInput` with BOTH a new
     group-level `runtimeSessionPolicy` field (mirroring
     `repoPath`) AND per-target `cwd` / `runtimeSessionPolicy`
     overrides on `targets[]`.
  2. Threading `draftSessionPolicy` end-to-end through the
     submit-hook chain (Workspace / Chat hook → dispatcher →
     group-level wire field). Changing only the dispatcher
     helper leaves the hook never handing it a policy, and the
     new group-level field stays empty. That reintroduces the
     server-default-fallback bug the group-level field was
     added to fix.
  3. Updating the product-owned parallel-group create path
     (route handler + state model) to resolve per-target
     overrides against the new group-level defaults and flatten
     into `RuntimeSessionCreateContractInput` on each child
     `CreateChatChannelInput`.
  Without all three, Phase 2's UI ships against fields that
  don't round-trip to runtime. Treat this as load-bearing — do
  not slice any piece out of Phase 1.
- **Scope of Phase 1 touch**. Absorbing parallel arrays means
  touching every reader. Today the list is small (lead-branch
  audience, shadow rows, dispatch). As the codebase grows this
  becomes harder, so Phase 1 should not slip.
- **Orchestrator work is blocked on Phase 1**. If orchestrator
  integration becomes urgent before Phase 2 / 3 are scheduled, we
  accept that orchestrators emit schemas with null per-branch
  fields (== "Follows lead" for those dimensions). That's fine —
  orchestrator authors use the degree of freedom that's wired,
  humans tweak the rest manually.
- **`TaskRef` shape**. Deferred from Phase 1 schema entirely;
  added in Phase 3 once the upstream task model spec defines
  `TaskRef`. If the task model lands late, Phase 3 ships
  prompt-detach work first and slots `taskRef` in when ready.
- **Detach UX discoverability**. "Click the Follows-lead chip to
  detach" is not self-evident. Phase 2 will need at least a
  tooltip; may also need a settings-level onboarding hint the
  first time advanced controls expose the affordance.
- **Migration error tolerance**. Because we have no shipped
  users, migration can be a hard cutover. If that premise ever
  changes (the project ships), we revisit with a two-phase
  dual-write migration.

## Progress Log

| Date | Phase | Note |
|------|-------|------|
| 2026-04-21 | Phase 1 | Landed the target-owned branch schema, resolver module, wrapper removal, parallel-group create contract extension, product-owned create materialization, attachment override rejection, and focused renderer / dispatcher / state-model tests. Per-channel runtime dispatch wire remains unchanged by design; renderer submit now resolves effective branch audience/workflow before the first parallel message. |
| 2026-04-21 | — | Plan drafted off ADR-077 / SPEC-078 / PLAN-069 hand-off. |

---

*Last updated: 2026-04-21*

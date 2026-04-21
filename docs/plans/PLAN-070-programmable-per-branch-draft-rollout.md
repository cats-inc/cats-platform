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

- [ ] Task 1.1: Extend `DraftParallelTarget` in
      `src/products/shared/renderer/components/ExecutionTarget.ts`
      with the fields defined in SPEC-078 § Schema.
      All new fields are optional / nullable; no existing code
      path should break on a target where every new field is
      undefined.
- [ ] Task 1.2: Add the resolution module
      `src/products/shared/renderer/draftBranchResolution.ts`
      exporting `resolveBranchCwd`, `resolveBranchSessionPolicy`,
      `resolveBranchPrompt`, `resolveBranchAudienceKeys`,
      `resolveBranchWorkflowShape`, `resolveBranchTaskRef`,
      `resolveBranchAttachments`, and the aggregate
      `resolveBranch(target, leadContext) → ResolvedBranch` per
      SPEC-078 § Resolution Helpers.
- [ ] Task 1.3: Absorb the two existing parallel arrays into the
      target:
      - Remove `parallelBranchAudienceKeys` and
        `parallelBranchWorkflowShapes` from `NewChatDraftProps`,
        the draft state store, reducers, and all callers.
      - Initializers that used to push to the parallel arrays
        now write `target.audienceKeys` / `target.workflowShape`
        instead.
      - Reducers that update a branch's audience keys / workflow
        shape update the target in place. `parallelTargets[i].audienceKeys`
        is the new source of truth.
- [ ] Task 1.4: Update `ChatNewChatDraft` render path to consume
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
      values. Runtime wire format unchanged.
- [ ] Task 1.6: Dispatch rejects a target whose
      `attachmentsOverride` is non-null — Phase 1 does not
      implement per-branch attachments. Clear error message
      ("attachments are not yet per-branch; remove the override").
- [ ] Task 1.7: Tests — update existing parallel-chat tests to
      construct per-branch state via target fields rather than
      parallel arrays. Add a small resolution-helper test suite:
      null → inherit, concrete → use-as-is, lead-target override
      equals-lead-default.
- [ ] Task 1.8: Document in SPEC-078 which fields have landed; move
      Phase 1 items from § Migration into "landed".

### Phase 2: Detach cwd and session policy

- [ ] Task 2.1: UX for per-branch cwd detach.
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
- [ ] Task 2.2: Session policy detach. Mirror the cwd flow for
      `runtimeSessionPolicy`. ADR-071 validation runs against the
      resolved per-branch policy at submit time (already wired by
      Phase 1 Task 1.5); Phase 2 just exposes the editing UI.
- [ ] Task 2.3: Verify the carousel animation still works when a
      card's header chips change shape (chip→cwd chip) during an
      active carousel transition — edge case when detaching a
      peek card. If janky, debounce chip swap until transition
      settles.
- [ ] Task 2.4: Tests — add coverage for "detach cwd on branch 2,
      submit, assert dispatch sees branch-2's cwd" and the re-link
      flow.
- [ ] Task 2.5: Update SPEC-078 § Migration and § Surfaces Affected
      to reflect the new UI touch points.

### Phase 3: Detach prompt, wire `taskRef`, reserve `attachmentsOverride`

- [ ] Task 3.1: Prompt detach UX. Non-lead textarea in carousel
      becomes click-to-detach; detached state enables editing
      that branch's textarea; re-link clears `promptOverride`.
      Guard against accidental detach: require an explicit "Detach
      prompt" confirm (textarea is small enough that a stray
      keystroke could otherwise trigger unwanted editing).
- [ ] Task 3.2: Task chip wiring. Once an upstream spec defines
      `TaskRef`, consume it via the task-chip slot reserved by
      SPEC-077. Phase-3 ships the renderer read path; authoring
      path (how a `TaskRef` gets written into a branch) depends
      on the task model spec.
- [ ] Task 3.3: Keep `attachmentsOverride` schema-reserved. Phase
      3 does not implement per-branch attachments; a dedicated
      future SPEC will. Dispatch continues to reject
      `attachmentsOverride != null`.
- [ ] Task 3.4: Orchestrator handoff sanity: produce a synthetic
      orchestrator-authored draft (test fixture with all
      per-branch fields populated) and assert the renderer
      renders it cleanly without UI regressions. Confirms the
      schema is orchestrator-ready even though the orchestrator
      itself isn't wired.
- [ ] Task 3.5: Close out SPEC-078 open questions that resolved
      during implementation; carry any remaining forward into
      orchestrator-ingestion spec (TBD).

## Files Touched (Phase 1 expected)

```
src/products/shared/renderer/components/ExecutionTarget.ts              (DraftParallelTarget extension)
src/products/shared/renderer/draftBranchResolution.ts                   (new — resolution helpers)
src/products/shared/renderer/components/ChatNewChatDraft.tsx            (consume resolved branches)
src/products/shared/renderer/draftChatUtils.tsx                         (absorb parallel-array constructors)
src/products/shared/renderer/state/** (draft reducers, per repo layout) (target-based state)
src/products/chat/state/runtime-dispatch/**                             (resolved-branch dispatch)
tests/** (draft-dispatch, parallel-chat, carousel render tests)         (update fixtures)
docs/specs/SPEC-078-per-branch-draft-state-schema.md                    (landed-fields annotation)
docs/plans/PLAN-070-programmable-per-branch-draft-rollout.md            (progress log)
```

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
- **`TaskRef` shape**. Phase 3 depends on an upstream task model
  spec. If the task model lands late, Phase 3 ships without task
  chip wiring; `taskRef` remains schema-reserved like
  `attachmentsOverride`.
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
| 2026-04-21 | — | Plan drafted off ADR-077 / SPEC-078 / PLAN-069 hand-off. |

---

*Last updated: 2026-04-21*

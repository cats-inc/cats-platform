# PLAN-069: Compare Draft Carousel Rollout

> Promote the horizontal 3D compare carousel from `/code/mock-stack`
> exploration into the shared `ChatNewChatDraft`, deliver per-branch
> chrome consistently across Cats Chat / Code / Work, and stage the
> follow-on per-branch enrichments (per-branch cwd, task chip,
> orchestrator ingestion) the new layout unlocks.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | In Progress (First Slice Landed) |
| **Owner** | Shared renderer (Claude during this rollout, transitioning to whichever specialist owns the next slice) |
| **Reviewer** | User |

## Related Spec / Dependencies

- [SPEC-077: Compare Draft Carousel and Per-Card Chrome Contract](../specs/SPEC-077-compare-draft-carousel-and-per-card-chrome.md)
- [ADR-076: Lay Parallel-Draft Branches in a 3D Compare Carousel](../decisions/076-lay-parallel-draft-branches-in-a-3d-compare-carousel.md)
- [SPEC-052: Current-Turn Recipients, Dispatch Policy, and Parallel Chat Terminology](../specs/SPEC-052-current-turn-recipients-dispatch-policy-and-parallel-chat-terminology.md)
- [SPEC-061: Concurrent vs Parallel Semantics and Code Entry Presets](../specs/SPEC-061-concurrent-parallel-semantics-and-code-entry-presets.md)
- [ADR-067: Use shared draft primitives with product-owned code-entry drafts](../decisions/067-use-shared-draft-primitives-with-product-owned-code-entry-drafts.md)
- [ADR-055: Retire lead semantics and separate composer recipients from dispatch policy](../decisions/055-retire-lead-and-separate-composer-recipients-from-dispatch-policy.md) — preset-gated accent rules carried forward
- Memory record: `project_cats_draft_orchestrator.md` — design north star for orchestrator-composed drafts (Phase 3 informant)

## Overview

The rollout has three phases:

1. **Phase 1 (Done)**: ship the carousel layout for the read-only-mirror
   case — every non-lead branch displays a "Follows lead" chip,
   shares lead's prompt / attachments / cwd, and exposes only its own
   per-branch audience / collaborate / compare / remove controls.
2. **Phase 2 (Open)**: per-branch task chip and per-branch cwd /
   workspace overrides — once spec'd, replace the "Follows lead" chip
   on a card-by-card basis when the user explicitly detaches a
   branch.
3. **Phase 3 (Future)**: orchestrator ingestion — accept
   orchestrator-composed multi-branch drafts where every card lands
   pre-populated with its own cwd / agents / prompt. Carousel UI
   should render those drafts without renderer-side composition logic.

Phase 1 is the only phase shipped. Phases 2 and 3 are tracked here so
the carousel doesn't get re-litigated each time a new per-branch
field is added.

## Implementation Phases

### Phase 1: Carousel layout into shared draft (Done)

- [x] Task 1.1: Build `DraftCompareCarousel` shared component
      (`src/products/shared/renderer/components/DraftCompareCarousel.tsx`).
      Bounded navigation, ←/→ keyboard support, dots only when
      `cards.length > 1`, click-peek-to-promote.
- [x] Task 1.2: Add `draft-compare-carousel.css`
      (`src/products/shared/renderer/styles/draft-compare-carousel.css`).
      Grid + perspective layout, peek transforms, nav button styling
      mirroring `compareCardsNavButton`, dot styling mirroring
      `compareCardsPaginationDot`, and the new
      `.composerFollowsLeadChip` token. Wire into `chat-composer.css`
      import chain.
- [x] Task 1.3: Swap `CompareIcon` to plain `+` in
      `DraftBuilderIcons.tsx` so every consumer (lead footer, shadow
      footers, all surfaces) updates in lock-step.
- [x] Task 1.4: Hoist lead-side JSX in `ChatNewChatDraft` —
      `draftHeaderJsx`, `composerHeaderRowJsx`, `leadFormJsx`,
      `draftComposerFooterJsx`, `helperRegionJsx`, `sidePanelJsx` —
      so the carousel-mode early return can stitch them into the
      lead card without forking logic.
- [x] Task 1.5: Implement `buildShadowCardContent(branchIndex, target)`
      inline in `ChatNewChatDraft`. Renders the shadow card's
      header (surface chip + `composerFollowsLeadChip`), read-only
      mirrored form, per-branch `BranchAudienceRoster` +
      `+collaborate` + `AudienceChip` + workflow toggle, and
      footer (`-remove` + `+compare` with preset-gated accent +
      hint).
- [x] Task 1.6: Add `activeBranchIndex` `useState` + clamp `useEffect`
      to `ChatNewChatDraft`. Reset to 0 when `isParallelMode` flips
      false; clamp on branch removal.
- [x] Task 1.7: Conditional return path: when
      `parallelTargets.length >= 2`, render
      `DraftCompareCarousel` with hoisted lead card + mapped shadow
      cards; otherwise render the existing
      `DraftComposerStack`-based path unchanged.
- [x] Task 1.8: Retire `/code/mock-stack` prototype route, sidebar
      entry, path constants, view component, and CSS (commit
      `6ff976a2`).
- [x] Task 1.9: Verify type-clean across touched files. Pre-existing
      drift in `src/products/chat/renderer/App.tsx` is unrelated.
- [x] Task 1.10: Author ADR-076, SPEC-077, PLAN-069 and update
      `docs/decisions/README.md`, `docs/specs/README.md`,
      `docs/plans/README.md` indexes.

### Phase 2: Per-branch task chip and per-branch cwd unlocks (Open)

- [ ] Task 2.1: Spec the per-branch task chip (label, lifecycle,
      where the branch task identity comes from). Likely a new SPEC
      branched off SPEC-077 once orchestrator-composed drafts have a
      task model to anchor on.
- [ ] Task 2.2: Reserve the per-card `composerFooterRow` left slot
      for the task chip. Currently empty on shadow cards; lead card
      uses `DraftComposerFooter` which exposes its `accessory` slot
      for this purpose.
- [ ] Task 2.3: Spec the per-branch cwd / workspace override
      semantics. Options to evaluate:
      - "Follows lead" chip becomes interactive — click to detach
        and pick a per-branch cwd.
      - Detached cards swap the chip for a `composerCwdChip` that
        owns its own value.
      - Per-branch cwd persists into `DraftParallelTarget`
        (extension to the data model; coordinate with shared draft
        primitives ownership in ADR-067).
- [ ] Task 2.4: Implement per-branch cwd UI on the carousel once
      the spec lands. Confirm peek cards continue to display the
      override (cwd chip rotates with the card, same as the
      "Follows lead" chip does today).
- [ ] Task 2.5: Update SPEC-077's "Non-Goals" section as items move
      out of non-goal status.

### Phase 3: Orchestrator-composed multi-branch drafts (Future)

- [ ] Task 3.1: Specify the orchestrator → draft hand-off shape:
      what arrives over the wire, how it maps onto
      `parallelTargets[]` and per-branch audience keys, where
      per-branch prompts (if any) come from.
- [ ] Task 3.2: Confirm the carousel renders an orchestrator-composed
      draft cleanly without renderer-side composition logic — it
      should be a pure projection of the supplied state.
- [ ] Task 3.3: Re-evaluate "active card on mount" heuristic. With
      orchestrator-composed drafts, the carousel may want to land
      on a non-lead branch the orchestrator marked as primary
      focus.
- [ ] Task 3.4: Evaluate whether the bounded-no-wrap rule survives
      once branch ordering becomes orchestrator-driven (it
      probably should — lead-as-anchor remains useful).

## Files Touched (Phase 1)

```
src/products/shared/renderer/components/DraftCompareCarousel.tsx        (new)
src/products/shared/renderer/components/ChatNewChatDraft.tsx            (refactored: hoist lead JSX, add carousel branch)
src/products/shared/renderer/components/DraftBuilderIcons.tsx           (CompareIcon glyph swap)
src/products/shared/renderer/styles/draft-compare-carousel.css          (new)
src/products/shared/renderer/styles/chat-composer.css                   (import draft-compare-carousel.css)
src/products/code/renderer/App.tsx                                      (retire mock-stack wiring)
src/products/code/renderer/AppRoutes.tsx                                (retire mock-stack route)
src/products/code/renderer/codePaths.ts                                 (retire mock-stack constants)
src/products/code/renderer/components/Sidebar.tsx                       (retire mock-stack entry)
src/products/code/renderer/styles.css                                   (retire mock-stack CSS import)
src/products/code/renderer/components/MockComposerStackView.tsx         (deleted)
src/products/code/renderer/styles/mock-composer-stack.css               (deleted)
docs/decisions/076-lay-parallel-draft-branches-in-a-3d-compare-carousel.md  (new)
docs/specs/SPEC-077-compare-draft-carousel-and-per-card-chrome.md       (new)
docs/plans/PLAN-069-compare-draft-carousel-rollout.md                   (new)
docs/decisions/README.md                                                (index update)
docs/specs/README.md                                                    (index update)
docs/plans/README.md                                                    (index update)
```

`ParallelDraftShadowBranchRow.tsx` is no longer imported by
`ChatNewChatDraft` but is left on disk for one release cycle in case
a stray consumer surfaces.

## Verification

Phase 1 verification done at landing time:

- `npx tsc --noEmit` produces zero errors in any touched file. The
  only remaining type errors are the pre-existing
  `chat.channels` / `SelectedChannelView` drift in
  `src/products/chat/renderer/App.tsx`, unchanged by this rollout.
- Manual UI walkthroughs of:
  - Cats Code `+Peer code` → confirm carousel layout, blue accent
    on `+compare`, hint text shown, `-remove` pushed left.
  - Cats Code `+New code` with advanced controls → confirm
    `+compare` visible without blue accent and without hint.
  - Cats Chat `+Group chat` → confirm lead `+collaborate` blue +
    hint, shadow `+collaborate` plain.
  - Cats Work equivalents → confirm shared component flows through.
  - Single-branch / direct-lane / cat-led drafts → confirm
    pre-carousel behaviour preserved.

(Subsequent phases will define their own verification steps when
spec'd.)

## Risks and Open Questions

- **Type drift in `chat/renderer/App.tsx`**: pre-existing,
  unrelated, but the file is in the chat product tree and will be
  noticed by anyone running `tsc`. Track separately; not blocking
  this rollout.
- **Peek visibility on narrow viewports**: `overflow-x: hidden` on
  the outer view clips the deepest peek's far edge under ~1280px
  viewports. Acceptable for `maxParallelChats = 3` default; revisit
  if the cap goes up.
- **Future "Detach" UX**: the "Follows lead" chip currently has no
  click target. Phase 2 will retrofit it to support detachment;
  that retrofit must not regress today's read-only signal.

---

*Last updated: 2026-04-21*

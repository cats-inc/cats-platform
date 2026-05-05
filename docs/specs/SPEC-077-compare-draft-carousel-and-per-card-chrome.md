# SPEC-077: Compare Draft Carousel and Per-Card Chrome Contract

> Renderer-layer contract for the horizontal 3D compare carousel that
> lays out multi-branch (`parallelTargets.length >= 2`) drafts across
> all three product surfaces. Defines the `DraftCompareCarousel`
> component surface, the per-branch card shape (header + form +
> footer), the "Follows lead" chip semantics, preset-gated accent
> behaviour carried through the carousel, and the bounded navigation
> model.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | In Progress (First Slice Landed) |
| **Related ADR** | [ADR-076](../decisions/076-lay-parallel-draft-branches-in-a-3d-compare-carousel.md) |
| **Related Plan** | [PLAN-069](../plans/PLAN-069-compare-draft-carousel-rollout.md) |
| **Owner** | Shared renderer (Cats Chat / Code / Work consume the same component) |
| **Reviewer** | User |

## Goals

1. Lay multi-branch drafts out as equal-sibling cards on a horizontal
   3D carousel rather than "lead form + compact shadow rows".
2. Give every branch its own header row and footer row so chrome
   rotates with the card during carousel transitions.
3. Preserve all preset-gated teaching affordances introduced by
   SPEC-052 (blue `+collaborate` / `+compare` + hint text bound to
   `entryPreset === 'group'` / `'parallel'` respectively).
4. Keep the single-branch / non-parallel render path untouched.
5. Land one shared component change that benefits Cats Chat, Cats
   Code, and Cats Work simultaneously.

## Non-Goals

- **Per-branch cwd**. Only the lead branch owns `draftCwd`. Non-lead
  branches display a passive "Follows lead" chip in the cwd slot.
  Per-branch cwd is deferred to a future ADR/SPEC once per-branch
  worktree semantics are designed.
- **Per-branch prompt / attachments**. Shared across the draft, as
  today. Non-lead textareas are read-only and mirror `composerDraft`.
- **Task chip**. The mock prototype's `task 1` / `task 2` chip is out
  of scope — its spec is not finalised and it does not ship in this
  slice.
- **Orchestrator-composed drafts**. Carousel supports the shape
  programmatic composers would produce (multiple cards each with
  their own target), but the orchestrator ingestion path is not in
  this spec (see PLAN-069 Phase 3 for the stub).
- **New per-branch data model fields**. `DraftParallelTarget` is
  unchanged; per-branch audience keys and workflow shapes use the
  existing keyed-by-index arrays.

## Component Surface

### `DraftCompareCarousel`

Location: `src/products/shared/renderer/components/DraftCompareCarousel.tsx`

```ts
interface DraftCompareCarouselCard {
  id: string;            // Stable key for React + CSS transitions.
  content: ReactNode;    // Rendered card body (header + form + footer).
}

interface DraftCompareCarouselProps {
  cards: ReadonlyArray<DraftCompareCarouselCard>;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  disabled?: boolean;
  ariaLabel?: string;
}
```

Behaviour:

- Renders nothing when `cards.length === 0`.
- Renders a single card without nav / dots chrome when `cards.length === 1`
  (for graceful handling, even though callers normally skip the
  carousel in that case).
- Bounded navigation:
  - Prev disabled at `activeIndex === 0`.
  - Next disabled at `activeIndex >= cards.length - 1`.
  - Keyboard `←` / `→` mapped to prev / next; ignored when focus is
    inside a `textarea` or `input`.
- 3D layout rules:
  - Active card sits at identity transform, drives container height.
  - Peek `relative = index - activeIndex`; cards offset by
    `translate(X%) rotateY(deg) scale(s)` where magnitude grows with
    `|relative|`.
  - Peek cards remain clickable to promote themselves to active
    (unless `disabled`).
  - `pointer-events: none` on deeply-faded peeks is not required;
    opacity floor keeps them reachable if visible.

### `.composerFollowsLeadChip`

Location: `src/products/shared/renderer/styles/draft-compare-carousel.css`

```css
.composerFollowsLeadChip {
  /* Dashed-border neutral chip, non-interactive */
}
```

- Appears in the `composerHeaderLeft` slot of non-lead cards, where
  the lead card's `composerCwdChip` would appear.
- Shows an inbound-arrow icon + the literal label "Follows lead".
- Carries no click handler and no keyboard affordance. Purely
  informational.

## Per-Branch Card Contract

Every branch in the carousel renders a three-part card:

```
<div .draftCompareCarouselCard>
  <div .composerHeaderRow>          ← per-branch chrome
    <div .composerHeaderLeft>
      surfaceTag
      {lead: composerCwdChip | composerHeaderChooseButton}
      {non-lead: composerFollowsLeadChip}
    </div>
    {lead && composerHeaderAccessory ? <div .composerHeaderRight>}
  </div>

  <form .composerCard.composerCardFresh>    ← composer body
    ... attachments / textarea / composerBottomRow / file input ...
  </form>

  <div .composerFooterRow>          ← per-branch chrome
    {per-branch .parallelAddRow.parallelAddRowInline}
  </div>
</div>
```

### Lead card (index 0)

- **Header**: full `composerHeaderRow` (surface chip + cwd chip +
  branch chip + `composerHeaderWhereExtras` + optional
  `composerHeaderAccessory`).
- **Form**: the full shared `leadFormJsx` — editable textarea,
  attachments with add/remove, plus button, per-branch roster +
  `+collaborate` row (group preset) or the shared audience chip
  (other presets), send button.
- **Footer**: the existing `DraftComposerFooter` component, which
  still renders the `+compare` button (now with plain `+` glyph) and
  the teaching hint when `entryPreset === 'parallel'`. No `-remove`
  button — lead cannot be removed without collapsing the draft.

### Non-lead card (index >= 1)

- **Header**: surface chip + `.composerFollowsLeadChip`. No cwd
  controls. No `composerHeaderAccessory` (that remains a lead-only
  slot).
- **Form**: same DOM shape as lead (preserves consistent card feel)
  but:
  - `<textarea>` is `disabled readOnly` and reflects `composerDraft`.
  - Plus button is `disabled`.
  - No attachments strip is rendered for non-lead (attachments are
    shared and driven from lead).
  - Per-branch `BranchAudienceRoster` + per-branch `+collaborate`
    button + `AudienceChip` + workflow shape toggle remain
    interactive.
  - Send button is not rendered — all branches ship together from
    lead's send.
- **Footer**: an inline `.composerFooterRow` containing:
  - `-remove` button (`parallelStubRemove`, with
    `parallelStubRemoveDanger` when `entryPreset === 'parallel'`),
    visible iff `parallelTargets.length > minParallelTargetCount`.
  - `+compare` button (`parallelAddButton` with `parallelAddButtonAccent`
    when `entryPreset === 'parallel'`), visible iff
    `onAddParallelTarget` is provided and
    `parallelTargets.length < maxParallelChats`.
  - Teaching hint `"Add another model to compare"` with
    `parallelAddHintAccent` when `accentParallelAddButton` is true
    and `hideDraftParallelHint` is false.

## Preset-Gated Accent Rules (Preserved)

These rules existed before this spec and remain untouched by the
carousel layout. Restated here because they now fire on every card's
footer rather than on a single draft-shell-level footer:

| Surface / preset                               | `+collaborate` accent | `+compare` accent |
|------------------------------------------------|-----------------------|-------------------|
| +New chat (default preset)                     | no                    | no (when visible) |
| +Group chat / +Team code (`preset = 'group'`)  | **lead only, blue + hint** | no (when visible) |
| +Parallel chat / +Peer code (`preset = 'parallel'`) | no                | **every card, blue + hint** |
| +New chat / +New code with advanced controls   | no                    | no (when visible) |

The lead's `+collaborate` accent continues to be driven by
`accentGroupAddButton = entryPreset === 'group'`; the per-card
`+compare` accent continues to be driven by
`accentParallelAddButton = entryPreset === 'parallel'`. Both are
controlled in `ChatNewChatDraft` and forwarded to the relevant chrome
elements.

## `ChatNewChatDraft` Integration Contract

The shared `ChatNewChatDraft` component chooses between two return
paths based on branch count:

```
if (parallelTargets && parallelTargets.length >= 2) {
  return <CarouselLayout />;   // new path
}
return <SingleCardLayout />;   // existing path
```

The single-card layout is structurally identical to the pre-carousel
path (draft header → section-level `composerHeaderRow` →
`DraftComposerStack card + footer + helperRegion`). No behaviour
regression is expected for +New chat / +New code / direct-lane /
cat-led drafts.

The carousel layout:

- Omits the section-level `composerHeaderRow` (it now lives inside
  each card).
- Omits the `DraftComposerStack` outer frame (its card / shadowStack
  / footer slots are replaced by per-card JSX).
- Places the helper-region (draft prompt suggestions) at section
  level, below the carousel.
- Keeps the side panel rendering unchanged.

### Active-index state

`ChatNewChatDraft` owns a local `activeBranchIndex` state:

- Initial value `0` (lead).
- Clamped into range on branch removal via a `useEffect` on
  `parallelTargets?.length`.
- Reset to `0` when `isParallelMode` flips back to false (e.g. the
  last parallel target was removed).
- Not persisted — re-entering a draft starts the carousel on lead.

### `CompareIcon` contract change

`CompareIcon` in `DraftBuilderIcons.tsx` now renders a plain `+`
(same SVG paths as `composerPlusButton`). No bubble silhouette. The
icon continues to ship from `DraftBuilderIcons` so any other consumer
inherits the shape automatically.

## Behavioural Contracts

### Keyboard

- `ArrowLeft` / `ArrowRight` when focus is outside a `textarea` /
  `input` navigates the active card. Inside those elements, arrows
  retain their native caret-movement meaning.
- `Tab` order is natural DOM order: prev nav → active card contents
  → next nav → dots. Peek cards are `aria-hidden` so screen readers
  do not re-announce duplicated content.

### Animation

- Card transition: `transform 460ms cubic-bezier(0.25, 0.85, 0.25, 1)`
  for position, `opacity 380ms ease` for fade, `filter 320ms ease`
  for saturation.
- No chrome-specific fade sequence is needed because chrome travels
  with the card via the single `transform` transition on the card
  wrapper.

### Clipping and overflow

- `mockStackView` (prototype) and the host surfaces in production set
  `overflow-x: hidden` on the outermost draft container so peek
  cards that extend past the page's horizontal bound are clipped
  rather than triggering page scroll.
- Peek card depth is unbounded in math but practically limited by
  `maxParallelChats` (default 3 in capability set).

### Removing the active card

- Removing a non-lead branch via its `-remove` button calls
  `onRemoveParallelTarget(branchIndex)`; the `useEffect` in
  `ChatNewChatDraft` clamps `activeBranchIndex` if it referred to the
  removed index.
- Lead (index 0) is not removable through the carousel. Dismantling
  a parallel draft back to default happens by removing branches until
  `length < 2`, at which point the carousel unmounts and the single-
  card layout takes over.

## First Slice Status

Landed in commit `5dca6938`:

- [x] `DraftCompareCarousel` component
- [x] `draft-compare-carousel.css` with grid / perspective / nav / dots / follows-lead chip
- [x] `CompareIcon` plain-plus glyph
- [x] `ChatNewChatDraft` carousel-mode early return with lead card using hoisted `leadFormJsx`
- [x] Non-lead card shape with `.composerFollowsLeadChip` + read-only mirror textarea + per-branch interactive controls
- [x] Preset-gated `+collaborate` / `+compare` accent preserved and carried per-card for shadows
- [x] Bounded `activeBranchIndex` navigation + keyboard ← / →
- [x] `/code/mock-stack` prototype retired (commit `6ff976a2`)

Remaining work is tracked in [PLAN-069](../plans/PLAN-069-compare-draft-carousel-rollout.md).

## Open Questions

1. **Task chip**. The mock prototype explored a per-card "task N"
   chip in the footer. Spec not yet written. If adopted, the chip
   would go in the `.composerFooterRow`'s left slot (leaving the
   right slot for the existing `-remove` / `+compare` cluster).
2. **Detach semantics**. Once per-branch cwd (and eventually
   per-branch prompt) becomes real, we need a UX token for
   transitioning a card from "Follows lead" to "Detached". The
   current chip design leaves room for that (the arrow icon can
   flip to a break-link icon; "Follows lead" becomes "Detached:
   <branch name>").
3. **Orchestrator-composed drafts**. When an orchestrator produces a
   multi-branch draft with per-branch cwd / prompt already filled
   in, should the carousel start active on the lead, or on the
   branch the orchestrator marked as "primary focus"? Deferred
   until the orchestrator ingestion path exists.

## References

- [ADR-076: 3D Compare Carousel for multi-branch drafts](../decisions/076-lay-parallel-draft-branches-in-a-3d-compare-carousel.md)
- [PLAN-069: Compare Draft Carousel Rollout](../plans/PLAN-069-compare-draft-carousel-rollout.md)
- [SPEC-052: Current-Turn Recipients, Dispatch Policy, and Parallel Chat Terminology](./SPEC-052-current-turn-recipients-dispatch-policy-and-parallel-chat-terminology.md)
- [SPEC-061: Concurrent vs Parallel Semantics and Code Entry Presets](./SPEC-061-concurrent-parallel-semantics-and-code-entry-presets.md)
- [SPEC-068: New Code Draft Canvas and Renderer Ownership](./SPEC-068-new-code-draft-canvas-and-renderer-ownership.md)
- Implementation files:
  `src/products/shared/renderer/components/DraftCompareCarousel.tsx`,
  `src/products/shared/renderer/components/ChatNewChatDraft.tsx`,
  `src/products/shared/renderer/components/DraftBuilderIcons.tsx`,
  `src/products/shared/renderer/styles/draft-compare-carousel.css`.

---

*Last updated: 2026-04-21*

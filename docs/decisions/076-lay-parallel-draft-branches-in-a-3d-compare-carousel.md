# ADR-076: Lay Parallel-Draft Branches Out as a Bounded 3D Compare Carousel With Per-Card Chrome

> Replace the lead-form-plus-compact-shadow-rows layout for multi-branch
> drafts with a horizontal 3D carousel where every branch is a full
> composer card that travels with its own header/footer chrome. Bounded
> (no wrap): card 0 is always the lead branch; the last card has
> nothing on its right.

## Status

Proposed

## Context

Before this ADR, the shared `ChatNewChatDraft` rendered a +Parallel /
+Peer / advanced-controls-unlocked draft as:

- one lead `<form>` carrying the full composer surface (attachments,
  textarea, +collaborate row, audience chip, send)
- a `composerHeaderRow` *above* the form (surface chip, lead cwd chip,
  branch chip)
- a `DraftComposerFooter` *below* the form carrying the +compare
  button and its teaching hint
- a vertically stacked `shadowStack` of compact
  `ParallelDraftShadowBranchRow` rows, one per non-lead parallel
  target, holding only per-branch audience + collaborate + remove
  controls (no textarea, no attachments, no own chrome)

Pain points this shape created:

1. **Doesn't feel like real-world objects.** The shadow rows read as a
   list of collapsed affordances, not as peer branches of the same
   compose action. Users described the layout as "a big composer and
   some extra rows stuck underneath".
2. **Chrome is not bound to its branch.** The cwd chip lives above the
   lead form, the +compare button and hint live below it. When the
   user's mental model is "branches are siblings", chrome sits at the
   wrong scope — it looks global even though per-branch variation is
   the whole reason the feature exists.
3. **Adding per-branch detail later fights the shadow-row shape.** Any
   future non-lead enrichment — per-branch cwd, per-branch workflow
   hint, per-branch task label, etc. — would have to extend a compact
   row that was specifically designed to stay compact. Each addition
   re-opens the "is this a sibling of lead or not?" argument.
4. **The +compare button imagery clashes with the meaning.** The old
   `CompareIcon` drew a chat-bubble silhouette with a small plus.
   Against a row of audience chips and profile pills the bubble read
   as "teaching button for chat" rather than "add another branch to
   this compare group". The common `+` glyph on the attach button
   reads as "add" far more directly.

We ran a UI exploration under `/code/mock-stack` that iterated through
several card-stack metaphors (vertical deck, peek-on-one-side stack,
horizontal coverflow) and landed on a horizontal 3D carousel. The mock
validated four observations:

- **Active card belongs in the centre, not at the top.** Centreing
  signals "this is the one you're editing" without implying hierarchy
  between lead and shadows.
- **Peeks should read as "behind", not "below".** Rotation on the Y
  axis plus perspective gives an unambiguous "behind / further away"
  signal. Translation alone ambiguously reads as "this card is just
  clipped".
- **Every card must carry its own chrome.** If header / footer rows
  are global, switching active cards feels like "contents swapping
  under the frame" rather than "the wheel rotated". Putting
  `composerHeaderRow` and `composerFooterRow` inside each card makes
  per-branch variation self-evident: the user sees a different chrome
  rotate in from the side as they scroll.
- **Bounded, not wrapping.** Wrap-around is disorienting when the
  first card carries lead-branch semantics (cwd ownership, primary
  send target). Lead is the anchor; the wheel should stop there.

The underlying data model (`DraftParallelTarget`, per-branch audience
keys, per-branch workflow shapes) already supports per-branch
rendering — this change is renderer-layer only. No runtime, no core
contract, no API shape moves.

## Decision

### 1. Render multi-branch drafts as a horizontal 3D compare carousel

When `parallelTargets.length >= 2`, the shared `ChatNewChatDraft`
lays out every branch — lead and shadows alike — as a sibling card in
a new `DraftCompareCarousel` component. Each card is a full composer
card wrapper holding its own header row, form body, and footer row.
For `parallelTargets.length <= 1`, the existing single-card layout
(with header above and `DraftComposerFooter` below) is preserved
unchanged — the carousel is pure additive UI for the multi-branch case.

### 2. Pin every chrome row to its branch

`composerHeaderRow` (surface chip + cwd chip + branch chip) and the
per-branch `composerFooterRow` (teaching +compare button, optional
−remove button) live **inside** each card wrapper, not at the draft
shell level. When the carousel rotates, chrome rotates with its
branch; switching cards swaps chrome in the same gesture as the card
body.

### 3. Lead-only cwd, follower chip for everyone else

Only the lead card's header shows the full cwd affordance (cwd chip or
"choose folder" button). Non-lead cards render a passive
`.composerFollowsLeadChip` token in the same slot, labelled
"Follows lead", signalling that prompt / attachments / cwd all come
from lead. The chip is informational — it cannot be clicked to
override. Per-branch cwd is a deliberate non-goal of this ADR (see
PLAN-069 for the future unlock path).

### 4. Bounded navigation, lead anchored at index 0

The carousel is bounded, not circular:

- Prev / keyboard `←` at `activeIndex === 0` is disabled.
- Next / keyboard `→` at `activeIndex === parallelTargets.length - 1`
  is disabled.
- Dots pagination renders only when `parallelTargets.length > 1`.
- `activeIndex` clamps into range when branches are removed.

Lead (`parallelTargets[0]`) is always leftmost, reflecting its
privileged role as the prompt / attachments / cwd owner.

### 5. Preserve the preset-gated teaching chrome

All preset-scoped styling stays exactly where ADR-055 and SPEC-052
left it:

- `+collaborate` button gains the blue
  `parallelAddButtonAccent` class + "Add another model to collaborate"
  hint **only** when `entryPreset === 'group'` (+Group chat / +Team
  code lead card).
- `+compare` button gains the blue accent + "Add another model to
  compare" hint **only** when `entryPreset === 'parallel'` (+Parallel
  chat / +Peer code on every card's footer).
- Every other surface that exposes +compare via advanced draft
  controls (+New chat, +Group chat, +New code, +Team code with
  "Enable advanced draft controls" on) keeps the default non-accent
  chrome.

The preset-gated blue is orthogonal to the carousel layout; neither
removes the other.

### 6. Return the +compare glyph to a plain `+`

The chat-bubble silhouette in `CompareIcon` is removed. The icon
becomes the same two-stroke plus glyph used by `composerPlusButton`,
so the +compare button reads as "add another" across every surface
without the teaching bubble imagery fighting the meaning.

### 7. Shared component, one change site

The carousel lives in `src/products/shared/renderer/components/DraftCompareCarousel.tsx`
and is consumed by `ChatNewChatDraft`. Because every product surface
(Chat, Code, Work) delegates to `ChatNewChatDraft` for its Group and
Parallel presets, the layout change lands in one place and flows to
all three products without per-product duplication.

## Consequences

### Positive

- Branches read as siblings, not as "lead + footnotes", matching the
  mental model of "multiple variants of one draft".
- Per-branch chrome finally has an obvious home, unblocking future
  per-branch enrichments (per-branch cwd, per-branch task label,
  per-branch workflow hint) without renegotiating the layout.
- Header / footer rotating with the card gives an unambiguous "the
  wheel turned, you're now looking at a different branch" signal
  instead of "frame stayed, contents swapped".
- The +compare glyph stops competing with chat-bubble imagery; the
  teaching-button role is carried by hint text + accent colour, not
  the glyph itself.
- Audience chip, +collaborate hint gating, and cwd semantics are all
  untouched — the carousel is layout, not policy.
- Carousel infrastructure (`DraftCompareCarousel` + CSS) is reusable
  for any future compare-style shared UI.

### Negative

- Non-lead cards render a full-form shape but are read-only. Users may
  expect to edit a non-lead textarea on sight; the "Follows lead"
  chip mitigates but does not eliminate the surprise.
- Peek cards extend horizontally past the draft shell's 760px width.
  We clip at `mockStackView` / `viewShell` with `overflow-x: hidden`
  to avoid page-level horizontal scroll. On narrow viewports, the
  outermost peek's far edge is cropped.
- Animation cost: each carousel transition drives `transform`,
  `opacity`, and `filter` on every card. Modern browsers composite
  these on the GPU, but many-branch drafts (4+) may show mild jank on
  low-end hardware. We accept this given the user-visible cap of
  `maxParallelChats = 3` in the default capability set.
- `ParallelDraftShadowBranchRow` is no longer imported by the only
  consumer. We keep the file on disk for one release cycle in case
  callers surface later.

### Neutral

- Data model is unchanged. `parallelTargets[0]` is still the lead,
  `parallelTargets.slice(1)` is still the shadows, per-branch audience
  and workflow shapes remain keyed by branch index.
- Non-parallel drafts (`parallelTargets.length <= 1`) render
  identically to before.
- `DraftComposerFooter` still renders the +compare button for the
  non-parallel case; in the carousel case the lead card uses the same
  `DraftComposerFooter` inside its card wrapper, and shadow cards
  inline a similar footer that also uses `CompareIcon` + preset-gated
  accent.

## Alternatives Considered

### Alternative 1: Vertical deck (active on top, peeks stacked below)

- **Pros**: Matches iOS app switcher metaphor; simple to implement
  with `position: absolute` + `translateY`.
- **Cons**: Peek count appears to shrink as the user scrolls toward
  the middle of the list because neighbour cards on both sides
  collide at the same depth. "How many branches do I have?" becomes
  unanswerable from the stack alone. Vertical stacking also forces
  the dots / nav into an awkward position relative to the footer.
- **Why rejected**: The mock at `/code/mock-stack` demonstrated the
  ambiguous-depth problem. User feedback: "the deck shrinks as I
  move through it and I can't tell why".

### Alternative 2: Apple Safari coverflow-style horizontal stack without wrap

- **Pros**: Same 3D feel as the decision, but without the explicit
  bounded-lead constraint.
- **Cons**: Ambiguity about whether the first card is "just the
  leftmost" or "the lead". In our data model the first index carries
  privileged semantics (owns cwd, owns prompt), so treating all
  cards as equal siblings misleads.
- **Why rejected**: We need the lead-anchored semantics to be
  visually enforced. The bounded-at-index-0 rule in the adopted
  carousel says that out loud.

### Alternative 3: Tabs across the top + one full composer below

- **Pros**: Classic, familiar, tiny code surface.
- **Cons**: Tabs suggest full content switching; users would expect
  per-tab editable textareas, per-tab attachments, per-tab
  everything. That conflicts with the current data model where
  prompt and attachments are shared across the draft, not per
  branch. Tabs would have to ship mirroring rules the user can't
  observe, or ship per-branch prompt first — either way a bigger
  scope change.
- **Why rejected**: Wrong affordance for the current data model.
  Deferred as a possible future shape once per-branch prompt /
  attachments become real.

### Alternative 4: Keep compact `ParallelDraftShadowBranchRow`, only polish chrome

- **Pros**: Lowest-effort option. No new component, no layout risk.
- **Cons**: Does not solve the "branches feel like footnotes"
  problem. Does not unblock per-branch chrome work. Shadow rows are
  already cramped; any further enrichment would force a second
  redesign.
- **Why rejected**: The whole point of this ADR is that polish on
  the shadow row shape hits a ceiling.

## References

- [SPEC-077: Compare Draft Carousel and Per-Card Chrome Contract](../specs/SPEC-077-compare-draft-carousel-and-per-card-chrome.md)
- [PLAN-069: Compare Draft Carousel Rollout](../plans/PLAN-069-compare-draft-carousel-rollout.md)
- [SPEC-052: Current-Turn Recipients, Dispatch Policy, and Parallel Chat Terminology](../specs/SPEC-052-current-turn-recipients-dispatch-policy-and-parallel-chat-terminology.md)
- [SPEC-061: Concurrent vs Parallel Semantics and Code Entry Presets](../specs/SPEC-061-concurrent-parallel-semantics-and-code-entry-presets.md)
- [ADR-055: Retire lead semantics and separate composer recipients from dispatch policy](./055-retire-lead-and-separate-composer-recipients-from-dispatch-policy.md)
- [ADR-062: Separate concurrent turn fan-out from parallel container composition](./062-separate-concurrent-turn-fan-out-from-parallel-container-composition.md)
- [ADR-067: Shared draft primitives with product-owned code-entry drafts](./067-use-shared-draft-primitives-with-product-owned-code-entry-drafts.md)
- Commits: `58745d9a` (initial `/code/mock-stack` prototype), `0065ed2a`
  (mock reworked to 3D carousel), `5dca6938` (carousel promoted into
  shared `ChatNewChatDraft`), `6ff976a2` (mock-stack route retired)

---

*Decision made: 2026-04-21*
*Decision makers: User (product direction), Claude (implementation)*

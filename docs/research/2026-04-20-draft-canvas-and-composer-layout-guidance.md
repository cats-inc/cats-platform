# Draft Canvas and Composer Layout Guidance

## Metadata

- **Date**: 2026-04-20
- **Author**: Codex
- **Status**: Exploratory, non-binding guidance
- **Context**: Ongoing shared draft-canvas refactor across `Cats Chat`, `Cats Code`,
  and `Cats Work`, with the expectation that the first MVP implementation will
  likely change some of these layout hypotheses.

## Purpose

Capture a temporary layout vocabulary and UI-placement guidance for draft
surfaces without turning it into a spec, ADR, or rollout plan.

This note is intentionally lightweight:

- It should guide current UI decisions.
- It should not freeze the final MVP shape.
- It should not override later spec/plan work once the real product behavior is
  validated in code.

## Core Framing

The old mental model of `+New chat`, `+Group chat`, and `+Parallel chat` as
separate layout families is too narrow for the intended `Cats Code` workflow.

The more durable model is:

- **Mode**: `chat | code | work`
- **Lanes**: `1..n`
- **Participants per lane**: `1..n`

This means:

- a draft can be `code` and still be multi-lane
- a lane can still be group-based
- `group` and `parallel` are not mutually exclusive

Layout guidance should therefore optimize for:

- shared draft primitives across products
- draft-global context vs lane-local context vs message-local context
- future transitions from draft to active without jarring re-layouts

## Working Layout Vocabulary

This note uses the following draft-canvas vocabulary:

- **DraftHeader**
  - top identity / greeting / profile-style header region
- **DraftCustomRegion**
  - optional region between `DraftHeader` and `ComposerHeaderRow`
  - intentionally generic, not locked to "setup"
- **ComposerHeaderRow**
  - row above the composer, primarily for `WHERE`
- **ComposerCard**
  - the main compose surface for `WHO / WHOM / WHAT`
- **ComposerFooterRow**
  - secondary state row beneath the composer
- **PostComposerAccessory**
  - lower-priority helper chips or assist content
- **Parallel Shadows**
  - compact draft representations for additional lanes

## Draft Scope Axes

The main placement rule is not only `5W1H`; it is also about scope.

- **Draft-global**
  - affects the whole draft or the future conversation by default
- **Lane-local**
  - applies to one lane only
- **Message-local**
  - applies only to the current send

This split matters more than the old product-specific entry presets.

## 5W1H Mapping

`5W1H` is useful as a semantic checklist, but not enough by itself to determine
layout. The current mapping is:

- **Who**
  - who participates in the draft or in a given lane
- **Whom**
  - who this send is addressed to
- **What**
  - the message payload, attachments, and immediate intent
- **Where**
  - cwd, repo, branch, worktree, and similar workspace context
- **Why**
  - task framing, intent, and "what this conversation is for"
- **How**
  - execution target, permission mode, workflow shape, concurrency posture
- **When**
  - currently weak in draft, but may later include schedule/background/approval timing

Two additional axes still matter in practice:

- **Which**
  - which lane, which audience subset, which mode
- **State**
  - draft, running, blocked, approval-needed, dirty, and similar states

## Current Guidance

### 1. Composer Header Row = `WHERE`

The current working guidance is to treat `ComposerHeaderRow` as the draft's
primary `WHERE` row.

Recommended contents:

- cwd chooser or cwd chip
- branch chip
- worktree chip
- permission mode, likely aligned right

Why:

- this matches the user's direct comparison point with Codex Desktop / Claude
  Code Desktop
- these are not message payload details
- these are important enough to stay visible before send
- `Cats Code` can later animate this row upward into the active top bar

Tentative placement rule:

- left side = workspace location (`WHERE`)
- right side = execution safety / permission posture

### 2. Composer Card = `WHO / WHOM / WHAT`

The composer itself should remain focused on the current send.

Recommended contents:

- message input
- attachment previews
- mode tag
- participant roster
- audience chip
- send / stop / cancel

This means the composer remains the place where users understand:

- who is involved
- who will receive this send
- what is being sent

This also leaves room for future linkage between:

- `@mentions`
- audience selection
- lane-local participants

### 3. `+` Should Not Own Workspace Selection

The current guidance is to stop treating `Choose workspace` / `Choose cwd` as a
hidden action inside `+`.

Preferred direction:

- `+` only owns attachment/file actions
- workspace selection becomes a first-class control in `ComposerHeaderRow`
- once selected, the same area becomes the visible cwd chip / workspace chip

This avoids the mismatch where:

- the chooser is inside the composer menu
- but the resulting state is shown elsewhere

### 4. Participant Roster Belongs in the Composer, Not the Footer

The participant roster is treated as part of `WHO`, not as a global status row.

That is especially important for future `code` drafts that may combine:

- multiple lanes
- multiple participants per lane

The composer can therefore carry:

- lane-local participant roster
- lane-local audience chip
- lane-local message input

without assuming that "group" and "parallel" are separate layout families.

### 5. Parallel Shadows Can Represent Additional Lanes

The compact shadow surfaces used by parallel draft should be understood as:

- additional lane summaries

not as:

- separate ad-hoc chats

A good compact shadow can include:

- participant roster
- audience chip
- perhaps lane mode hints later if needed

This makes the lane model clearer and scales better for `Cats Code`.

### 6. Composer Footer Row Should Stay Secondary

The current guidance is to avoid making `ComposerFooterRow` the main `WHERE`
surface.

More suitable footer candidates:

- task hint or materialization hint
- warnings
- secondary state
- temporary MVP-only status text

If permission mode does not work well in the header during MVP, it may remain in
the footer temporarily, but the long-term direction still points toward header-level
`WHERE / HOW` framing.

### 7. Mode Tag Should Be First-Class Draft State

A visible mode tag is recommended near the lower-left compose controls, likely
to the right of `+`.

Examples:

- `Chat`
- `Code`
- `Work`

This is useful because a helper chip in `+New chat` could later:

- set a prompt
- switch the mode tag to `Code`
- thereby signal that the result should become a `code conversation`

That gives products a shared draft frame without assuming separate entry
surfaces must stay forever isolated.

### 8. Draft Custom Region Should Stay Generic

The region between `DraftHeader` and `ComposerHeaderRow` should remain generic
for now.

Do not freeze it to a name like `SetupStrip`.

Possible future uses:

- task framing
- direct-lane custom UI
- compare/lane setup summary
- guided onboarding content
- product-specific context cards

## Draft-to-Active Direction

This note does not freeze the active layout, but it does assume one likely
motion path:

- draft `ComposerHeaderRow` remains above the composer
- active `Chat` may keep more of `WHERE` near the composer
- active `Code` may promote `WHERE` upward into `Top Bar`

That direction is attractive because it allows:

- continuity between draft and active
- a possible motion/transition where the row lifts upward while the transcript
  takes over the central space

## Watch-Outs

The following points remain unresolved and should be validated by the MVP rather
than over-designed in docs:

- how crowded a multi-lane multi-participant composer becomes in practice
- whether permission mode belongs in `ComposerHeaderRow` from day 1
- how much of the participant roster should stay inline vs collapse into compact chips
- how `@mentions` should affect lane-local audience state
- whether `DraftCustomRegion` becomes essential or stays mostly empty
- how much `Chat`, `Code`, and `Work` truly share once real active-mode transitions exist

## Non-Goals

This note does not:

- define final product copy
- define exact spacing, CSS, or animation timings
- force a final MVP composer structure
- replace `SPEC-061`, `SPEC-068`, or `PLAN-064`

## Related Documents

- [SPEC-061](../specs/SPEC-061-concurrent-parallel-semantics-and-code-entry-presets.md)
- [SPEC-068](../specs/SPEC-068-new-code-draft-canvas-and-renderer-ownership.md)
- [PLAN-064](../plans/PLAN-064-new-code-mvp-task-run-artifact-materialization.md)
- [2026-03-26 Cats Chat Spatial Layout Guidelines](./2026-03-26-cats-chat-spatial-layout-guidelines.md)

---

*Last updated: 2026-04-20*

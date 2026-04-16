# SPEC-066: Concurrent ChatView Presentation Modes and Policy-Aware Cluster Projection

> Define multiple ChatView-local presentation modes for concurrent response
> clusters without changing lane identity, parallel semantics, or sidebar/recent
> surfaces.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Summary

`SPEC-057` established that concurrent group turns should materialize as one
stable response cluster with one lane per target. That solved the data-model and
delivery side, but the current Chat renderer still exposes only one transcript
style: inline bubbles growing in place. This spec defines a product-local
presentation layer for concurrent clusters inside the current `ChatView` so the
same lane-native cluster can render as inline transcript bubbles, compare
cards, or a focus-oriented projection. The spec also clarifies that
presentation mode is not the same thing as `convergencePolicy`: workflow policy
may recommend a mode, but it must not erase or redefine concurrent lane
identity.

## Goals

- Let concurrent Chat turns render in multiple intentional presentation modes
  without forking the underlying cluster/lane model.
- Keep `concurrent` distinct from `parallel` by scoping this work to one
  `ChatView` transcript, not child-thread containers.
- Separate Chat-local presentation preferences from shared workflow
  `convergencePolicy`.
- Preserve all concurrent lane results even when a later workflow adopts,
  synthesizes, or promotes one outcome.

## Non-Goals

- Redesigning sidebar, recents, or channel-list summaries in the first slice.
- Replacing `parallel` chat groups with concurrent lane cards or reusing
  compare-container visuals for one-turn fan-out.
- Changing lane identity, SSE delivery, or durable transcript ordering beyond
  additive metadata needed for presentation.
- Defining the final Chat/Work/Code convergence automation contract beyond the
  presentation seam needed by Chat.

## User Stories

- As a Chat user, I want a concurrent turn to switch between inline bubbles and
  side-by-side compare cards so I can read it in the form that matches the
  task.
- As an operator, I want workflow policy to recommend a good compare surface
  for the current turn without removing my ability to inspect every lane.
- As a reviewer, I want an adopted or synthesized result to appear as an extra
  projection on top of the cluster rather than pretending the non-adopted lanes
  never existed.

## Requirements

### Functional Requirements

1. The Chat product shall define a product-local
   `ConcurrentChatPresentationMode` with these values:
   - `inline_stack`
   - `compare_cards`
   - `focus_rail`
   - `adaptive`
2. `adaptive` shall be a resolver strategy, not a fourth independent transcript
   data model.
3. Presentation mode shall apply only when the current selected channel has a
   visible concurrent response cluster in `ChatView`.
4. Non-concurrent surfaces, including solo, direct, and sequential chats, shall
   continue to render with the current transcript presentation unless a later
   spec explicitly changes them.
5. `inline_stack` shall preserve the current "grow in place inside the
   transcript" baseline for concurrent lanes.
6. `compare_cards` shall render concurrent lanes as responsive cards inside the
   current ChatView transcript region rather than as separate child
   conversations.
7. `focus_rail` shall render one emphasized lane plus a visible secondary lane
   rail or stack without deleting other lane results.
8. Every presentation mode shall consume the same concurrent cluster inputs:
   - fixed dispatch-time lane order
   - stable lane identity
   - lane-local segment timeline
   - lane status (`pending`, `connecting`, `streaming`, `sealed`, `failed`,
     `cancelled`)
9. Switching presentation modes shall not restart stream attachment, remap lane
   identity, or reset local segment progress.
10. The Chat product shall expose a user-level default preference for
    concurrent presentation mode.
11. The product may derive a recommended presentation mode from workflow preset
    or `convergencePolicy`, but recommendation shall remain distinct from the
    user preference field.
12. First-slice precedence shall be:
    - explicit active-view override
    - workflow/preset recommendation
    - persisted user default
    - `adaptive` viewport fallback
13. If a workflow uses `keep_all`, `pick_one`, `synthesize_one`, or
    `promote_one_continue`, the adopted outcome shall render as an additive
    overlay, badge, summary block, or focus state above the cluster instead of
    deleting the non-adopted lanes.
14. First-slice implementation shall remain scoped to the current selected
    `ChatView` transcript surface. It shall not require sidebar, recents, or
    other active-chat chrome changes.
15. First-slice implementation may add additive Chat preference metadata, but
    it shall not require a new shared engine concept beyond the
    `convergencePolicy` work already planned in `SPEC-061`.

### Non-Functional Requirements

- **Predictability**: lane order and identity must stay stable across all modes.
- **Comparability**: compare-card mode must improve scanability without
  requiring time-interleaved transcript reading.
- **Responsiveness**: narrow viewports must degrade gracefully without
  inventing new lane order or hiding active lane status.
- **Isolation**: first-slice mode work must not couple ChatView renderer changes
  to sidebar/recent-entry rendering.
- **Recoverability**: if a mode is persisted as a user preference, reload should
  reproduce the same selected default.

## Design Overview

### Architectural Scope

This feature sits between the existing concurrent cluster projection and the
final transcript DOM:

```
live cluster + durable cluster
  -> concurrent presentation resolver
  -> ChatView concurrent cluster renderer
      -> inline_stack
      -> compare_cards
      -> focus_rail
```

The cluster and lane model from `SPEC-057` remains authoritative. This feature
only changes how the current selected `ChatView` renders that model.

### Mode Semantics

- `inline_stack`
  - current transcript-native bubble list
  - best default for conversation-like reading
- `compare_cards`
  - side-by-side or grid cards per lane
  - best for direct answer comparison and simultaneous reading
- `focus_rail`
  - one primary adopted/focused lane plus visible secondary lanes
  - best when policy or operator intent starts converging on one outcome
- `adaptive`
  - resolver chooses one of the above from viewport, lane count, and
    recommendation inputs

### Policy vs Presentation

This spec makes two seams explicit:

1. **Shared workflow policy seam**
   - `convergencePolicy`
   - examples: `keep_all`, `pick_one`, `synthesize_one`,
     `promote_one_continue`
2. **Chat-local presentation seam**
   - `ConcurrentChatPresentationMode`
   - renderer-only concern for the current selected `ChatView`

Workflow policy may recommend presentation, but it must not redefine what the
cluster is.

### Resolver Inputs

The first-slice presentation resolver should accept:

- visible concurrent cluster or live concurrent cluster
- current viewport width / layout metrics
- persisted user default mode
- optional active-view override
- optional workflow or preset recommendation derived from convergence policy

### First-Slice Boundary

The first slice should only affect:

- `ChatView`
- transcript panel / live concurrent cluster renderer
- Chat preference settings needed to choose a default mode

The first slice should not affect:

- sidebar or recents entry rendering
- parallel child conversation UI
- non-concurrent transcript rows

## Dependencies

- [SPEC-057](./SPEC-057-concurrent-group-lane-native-live-transcript.md)
- [PLAN-048](../plans/PLAN-048-concurrent-group-lane-native-live-transcript.md)
- [SPEC-061](./SPEC-061-concurrent-parallel-semantics-and-code-entry-presets.md)
- [PLAN-053](../plans/PLAN-053-concurrent-parallel-semantics-and-code-entry-presets.md)
- [ADR-058](../decisions/058-adopt-lane-native-concurrent-group-transcript-delivery.md)
- [ADR-062](../decisions/062-separate-concurrent-turn-fan-out-from-parallel-container-composition.md)

## Open Questions

- [ ] Should first-slice explicit mode override stay view-local only, or should
      the product persist a per-room override in channel state later?
- [ ] Should `focus_rail` ship in the same slice as `compare_cards`, or follow
      once policy-aware adopted/synthesized overlays are real?
- [ ] Where should the active mode switcher live in the first slice:
      transcript chrome, top bar, or settings-only?
- [ ] On narrow layouts, should `compare_cards` collapse into stacked cards,
      horizontal snap cards, or delegate to `inline_stack` via `adaptive`?

## References

- [docs/architecture.md](../architecture.md)
- [docs/terminology.md](../terminology.md)
- [src/products/chat/renderer/components/ChatView.tsx](../../src/products/chat/renderer/components/ChatView.tsx)
- [src/products/chat/renderer/components/chat-view/ChatTranscriptPanel.tsx](../../src/products/chat/renderer/components/chat-view/ChatTranscriptPanel.tsx)
- [src/products/chat/renderer/components/chat-view/LiveTranscriptIndicator.tsx](../../src/products/chat/renderer/components/chat-view/LiveTranscriptIndicator.tsx)

---

*Created: 2026-04-16*
*Author: Codex*
*Related Plan: [PLAN-058](../plans/PLAN-058-concurrent-chatview-presentation-modes-and-policy-aware-cluster-projection.md)*

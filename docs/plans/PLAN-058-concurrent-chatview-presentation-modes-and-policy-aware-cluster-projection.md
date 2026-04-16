# PLAN-058: Concurrent ChatView Presentation Modes and Policy-Aware Cluster Projection

> Roll out multiple concurrent cluster presentation modes inside the selected
> `ChatView` without changing sidebar/recent surfaces or collapsing concurrent
> semantics into parallel container UI.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Spec

- [SPEC-066: Concurrent ChatView Presentation Modes and Policy-Aware Cluster Projection](../specs/SPEC-066-concurrent-chatview-presentation-modes-and-policy-aware-cluster-projection.md)
- [SPEC-057: Concurrent Group Lane-Native Live Transcript](../specs/SPEC-057-concurrent-group-lane-native-live-transcript.md)
- [SPEC-061: Concurrent vs Parallel Semantics and Code Entry Presets](../specs/SPEC-061-concurrent-parallel-semantics-and-code-entry-presets.md)

## Overview

This plan keeps the concurrent cluster/lane model intact and adds a
Chat-product presentation layer on top of it. The work is intentionally scoped
to the currently selected `ChatView` transcript surface:

- product-local presentation mode contract
- Chat preference seam for the default mode
- mode resolver for active view / recommendation / viewport
- mode-specific renderers for the same concurrent cluster
- policy-aware adopted/synthesized overlays that do not erase lanes

Sidebar, recents, and parallel child-thread surfaces stay out of scope for the
first slice.

## Implementation Phases

### Phase 1: Define the Product-Local Presentation Contract

- [ ] Task 1.1: Add a Chat-local `ConcurrentChatPresentationMode` contract with:
      - `inline_stack`
      - `compare_cards`
      - `focus_rail`
      - `adaptive`
- [ ] Task 1.2: Thread a persisted Chat preference for the default concurrent
      presentation mode through:
      - chat state defaults
      - snapshot normalization
      - app-shell payload shaping
      - preference routes
- [ ] Task 1.3: Define a resolver contract that combines:
      - explicit active-view override
      - workflow/preset recommendation
      - persisted user default
      - viewport fallback
- [ ] Task 1.4: Keep the presentation contract product-local and avoid turning
      it into a new shared engine abstraction.

**Deliverables**: one explicit Chat-local presentation-mode contract and
resolver seam.

### Phase 2: Extract a Concurrent Cluster Renderer Host

- [ ] Task 2.1: Refactor the current `LiveTranscriptIndicator` usage so
      concurrent cluster rendering is routed through one host component instead
      of one implicit transcript-only path.
- [ ] Task 2.2: Keep the current bubble-in-transcript behavior as the
      `inline_stack` implementation rather than rewriting it during extraction.
- [ ] Task 2.3: Ensure the host component consumes the existing lane-native
      cluster state from `useLiveIndicator` / `liveIndicator` helpers without
      recomputing lane identity.
- [ ] Task 2.4: Preserve stable React keys, lane order, and stream continuity
      across mode switches.
- [ ] Task 2.5: Explicitly keep sidebar, recents, and parallel-child surfaces
      on their existing rendering path.

**Deliverables**: one concurrent-cluster renderer host with a safe extracted
`inline_stack` mode.

### Phase 3: Implement Compare Cards and Adaptive Fallback

- [ ] Task 3.1: Implement `compare_cards` as a responsive card/grid projection
      inside the current transcript area.
- [ ] Task 3.2: Keep lane-local phases visible inside cards:
      - waiting / connecting
      - streaming
      - sealed
      - failed / cancelled
- [ ] Task 3.3: Add an `adaptive` resolver that selects a compare-friendly or
      transcript-friendly mode from viewport width and lane count.
- [ ] Task 3.4: Ensure `compare_cards` degrades gracefully on narrow widths
      without changing lane order or hiding active lanes.

**Deliverables**: a usable compare-card projection plus adaptive mode
selection.

### Phase 4: Add Focus Mode and Policy-Aware Outcome Overlays

- [ ] Task 4.1: Implement `focus_rail` for "one adopted/focused lane plus other
      lanes still visible" reading.
- [ ] Task 4.2: Define a Chat-local mapping from `convergencePolicy` to
      presentation recommendation and overlay semantics.
- [ ] Task 4.3: Add additive overlay states for:
      - adopted lane
      - synthesized outcome
      - promoted lane
      - secondary/reference lanes
- [ ] Task 4.4: Ensure policy-aware projection never deletes the underlying lane
      results from the visible cluster.

**Deliverables**: one focus-oriented mode plus policy-aware outcome overlays.

### Phase 5: Verification

- [ ] Task 5.1: Add unit coverage for:
      - presentation resolver precedence
      - policy-to-recommendation mapping
      - adaptive viewport fallback
- [ ] Task 5.2: Add renderer tests for:
      - `inline_stack`
      - `compare_cards`
      - `focus_rail`
      - mode switching without lane reset
- [ ] Task 5.3: Add regression coverage proving:
      - sidebar/recent rendering is unchanged
      - non-concurrent chats stay on the existing transcript path
      - concurrent lanes keep stable keys and order across modes
- [ ] Task 5.4: Manual smoke-check:
      - three-target concurrent turn in `inline_stack`
      - switch to `compare_cards` while lanes are live
      - one lane seals while another still streams
      - adopted/synthesized overlay does not hide other lanes
      - narrow viewport fallback

**Deliverables**: regression coverage for the new presentation seam without
scope creep into unrelated surfaces.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/products/chat/api/contracts.ts` | Modify | Add Chat preference contract for concurrent presentation mode if needed |
| `src/products/shared/api/workspaceContracts.ts` | Modify | Expose the default concurrent presentation preference in app-shell payloads |
| `src/products/chat/api/resources/preferenceRoutes.ts` | Modify | Persist and update the Chat preference |
| `src/products/chat/state/defaults.ts` | Modify | Add default presentation preference |
| `src/products/chat/state/chat-snapshot/index.ts` | Modify | Normalize persisted preference data |
| `src/products/chat/state/shell.ts` | Modify | Project preference into app-shell payloads |
| `src/products/shared/renderer/api/normalization.ts` | Modify | Normalize the new preference in the renderer payload |
| `src/products/chat/renderer/api/appShell.ts` | Modify | Read/write concurrent presentation preference |
| `src/products/shared/renderer/components/SettingsGeneral.tsx` | Modify | Add a user-visible default-mode preference control |
| `src/products/chat/renderer/components/ChatView.tsx` | Modify | Resolve active mode and pass it into transcript rendering |
| `src/products/chat/renderer/components/chat-view/ChatTranscriptPanel.tsx` | Modify | Route concurrent live cluster rendering through a mode-aware host |
| `src/products/chat/renderer/components/chat-view/LiveTranscriptIndicator.tsx` | Modify | Preserve / narrow current inline mode implementation |
| `src/products/chat/renderer/components/chat-view/ConcurrentClusterRenderer.tsx` | Create | Host component for mode-based concurrent cluster rendering |
| `src/products/chat/renderer/components/chat-view/ConcurrentCompareCards.tsx` | Create | Compare-card projection for concurrent lanes |
| `src/products/chat/renderer/components/chat-view/ConcurrentFocusRail.tsx` | Create | Focus-oriented projection for adopted/focused lane reading |
| `tests/live-indicator.test.tsx` | Modify | Add projection-stability assertions where shared helpers are involved |
| `tests/chat-view-support.test.tsx` | Modify | Cover mode resolver and concurrent-vs-non-concurrent routing rules |
| `tests/chat-view-participants.test.tsx` | Modify | Cover stable lane order and participant identity across modes |
| `tests/*.test.tsx` | Modify/Create | Renderer tests for cards, focus mode, overlays, and no-reset mode switching |

## Technical Decisions

- Presentation mode is a Chat-product renderer concern, not a new shared engine
  abstraction.
- `convergencePolicy` remains the shared workflow contract; presentation may
  derive a recommendation from it but must not become the same field.
- First-slice implementation is intentionally scoped to the selected
  `ChatView`; sidebar, recents, and parallel child-thread UI are not part of
  this rollout.
- All modes must consume one canonical concurrent cluster/lane projection so
  stream identity and key stability do not fork by renderer.
- Adopted/synthesized outcomes must render as additive overlays rather than
  deleting non-adopted lanes.

## Testing Strategy

- **Unit Tests**:
  presentation resolver precedence, adaptive fallback, and
  policy-to-recommendation mapping
- **Renderer Tests**:
  concurrent cluster host selection, compare-card rendering, focus-rail
  overlays, and mode switching during a live turn
- **Integration Tests**:
  preference round-trip through `/api/preferences`, ChatView consumption of the
  new preference, and non-concurrent surfaces staying unchanged
- **Manual Testing**:
  - send a three-target concurrent turn
  - switch modes while lanes are active
  - verify one sealed lane and one live lane stay in place
  - verify adopted/synthesized indicators do not remove lane content
  - verify sidebar and recents remain unchanged

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Renderer work accidentally forks concurrent live state into mode-specific logic | High | Keep one canonical cluster projection and make modes pure view layers |
| `compare_cards` regresses narrow layouts or composer/transcript spacing | High | Use explicit responsive breakpoints plus manual smoke checks on narrow widths |
| Presentation mode and `convergencePolicy` get conflated in contracts or UI copy | High | Keep separate fields, resolver tests, and docs wording |
| Scope leaks into sidebar or parallel container surfaces | Medium | Keep first-slice boundary explicit in spec/plan and add regression coverage |
| Mode switches remount lanes and recreate ghost bubbles | High | Preserve lane keys and test active live-mode switching explicitly |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-16 | Plan created for ChatView-scoped concurrent presentation modes and policy-aware cluster projection |

---

*Created: 2026-04-16*
*Author: Codex*

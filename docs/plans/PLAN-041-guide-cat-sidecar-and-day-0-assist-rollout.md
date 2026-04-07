# PLAN-041: Guide Cat Sidecar and Day-0 Assist Rollout

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Spec

[SPEC-051: Guide Cat Sidecar and Day-0 Assist Surfaces](../specs/SPEC-051-guide-cat-sidecar-and-day-0-assist-surfaces.md)

## Overview

Implement a platform-shell Guide Cat sidecar that becomes the first visible
day-0 assist surface after setup completes with Guide Cat enabled.

This rollout should start with a shell-owned UI surface, host-owned view
state, and runtime-backed Guide Cat replies when the existing dispatch
pipeline is available, then add richer cross-surface continuity and explicit
handoff into product-native conversations.

## Implementation Phases

### Phase 1: Lock the Host-Owned Surface Contract

- [ ] Task 1.1: Add host-owned docs and shell-state vocabulary for Guide
      sidecar visibility, dismissal, and first-run behavior.
- [ ] Task 1.2: Add platform-level preference or shell-state fields for Guide
      sidecar view state.
- [ ] Task 1.3: Define the boundary between sidecar-local help and explicit
      product-native promotion.

**Deliverables**: stable contract for a platform-owned assistant surface
without collapsing it into Chat direct-lane semantics

### Phase 2: Lobby-First UI Slice

- [ ] Task 2.1: Create a platform-shell Guide sidecar component and left-docked
      tab/peek/open UI states.
- [ ] Task 2.2: Mount the sidecar from the platform shell so it can render on
      `/lobby` without being owned by `PlatformLobby.tsx`.
- [ ] Task 2.3: Show welcome-peek/open state on first Lobby entry after setup
      when `guideCat` exists.
- [ ] Task 2.4: Wire the first slice to runtime-backed Guide Cat replies while
      still rendering initial greeting plus day-0 quick actions.
- [ ] Task 2.5: Persist dismissal/collapse state so the first-run presentation
      does not repeat aggressively.

**Deliverables**: setup-created Guide Cat becomes visible from Lobby on day 0
through a host-owned sidecar

### Phase 3: Cross-Product Placement and Continuity

- [ ] Task 3.1: Keep the sidecar mounted across `Lobby`, `Chat`, `Work`, and
      `Code` route transitions.
- [ ] Task 3.2: Ensure the left-docked placement does not collide with product
      navigation or right-side inspector/detail panels.
- [ ] Task 3.3: Add narrow-width fallback behavior such as overlay or
      bottom-sheet presentation.
- [ ] Task 3.4: Thread current route/surface context into the sidecar model so
      surface-aware quick actions become possible.

**Deliverables**: one cross-product assistant surface with stable placement and
safe responsive behavior

### Phase 4: Explicit Product Handoff

- [ ] Task 4.1: Add an explicit `Open in Cats Chat` handoff path from the
      sidecar.
- [ ] Task 4.2: Decide whether the first product-native promotion becomes a
      guide thread, direct lane, or seeded normal thread, and implement the
      minimal handoff contract.
- [ ] Task 4.3: Add later hooks for `Work` and `Code` follow-through actions
      without forcing them into the first implementation slice.

**Deliverables**: clear boundary between host-owned assist and product-native
conversation/workflow continuation

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `docs/decisions/054-use-a-platform-level-guide-sidecar-for-day-0-assist.md` | Create | Architecture decision for the host-owned Guide sidecar |
| `docs/specs/SPEC-051-guide-cat-sidecar-and-day-0-assist-surfaces.md` | Create | Requirements for the Guide sidecar and post-setup assist flow |
| `docs/README.md` | Modify | Index the new Guide sidecar docs |
| `docs/decisions/README.md` | Modify | Add ADR-054 to the ADR index |
| `docs/specs/README.md` | Modify | Add SPEC-051 to the specs index |
| `docs/plans/README.md` | Modify | Add PLAN-041 to the plans index |
| `docs/specs/SPEC-049-guide-cat-setup-and-generalized-participant-entry.md` | Modify | Link the new post-setup sidecar follow-on docs |
| `docs/plans/PLAN-038-guide-cat-setup-and-participant-generalization.md` | Modify | Link the new execution follow-on for day-0 assist surfaces |
| `src/shared/platform-contract.ts` | Modify | Add host-visible Guide sidecar state if the shell contract owns it |
| `src/shared/platformPreferences.ts` | Modify | Persist Guide sidecar UI state where appropriate |
| `src/app/server/platformSetupRoutes.ts` | Modify | Seed first-run Guide sidecar state after setup completion when Guide Cat exists |
| `src/app/renderer/App.tsx` | Modify | Mount the Guide sidecar at the platform-shell level |
| `src/app/renderer/PlatformLobby.tsx` | Modify | Keep Lobby compatible with shell-owned sidecar placement |
| `src/app/renderer/guide/GuideSidecar.tsx` | Create | Main platform-owned Guide sidecar UI |
| `src/app/renderer/guide/guideSidecarModel.ts` | Create | View-state and quick-action model |
| `src/design/components/guide-sidecar.css` | Create | Shared styling for docked left-side sidecar |
| `src/design/index.css` | Modify | Include the Guide sidecar styles |
| `tests/*` | Modify/Create | Add coverage for first-run visibility, dismissal persistence, route continuity, and handoff |

## Technical Decisions

- Decision 1: Mount the sidecar at the platform shell instead of inside Lobby
  so the same surface can survive route changes and appear in Chat/Work/Code.
- Decision 2: Reserve the right side for product-owned inspector/detail panels;
  Guide Cat docks left instead.
- Decision 3: Treat the first slice as a host-owned assist surface, not an
  automatic Chat direct lane.
- Decision 4: Use runtime-backed Guide Cat replies in the first slice when the
  existing dispatch pipeline is available; deterministic greeting and quick
  actions remain the degraded fallback when runtime dispatch is unavailable.

## Testing Strategy

- **Unit Tests**: sidecar state transitions, dismissal persistence, quick-action
  model resolution by route/surface
- **Integration Tests**: setup with Guide Cat enters Lobby and shows the sidecar
  in first-run state; setup without Guide Cat does not
- **UI/Renderer Tests**: sidecar remains visible across Lobby -> Chat route
  changes; right-side inspector toggles continue to function
- **Manual Testing**:
  - complete setup with Guide Cat and verify Lobby shows the sidecar on first entry
  - collapse the sidecar, switch to Chat/Work/Code, and verify state behaves as expected
  - open a product inspector and verify Guide sidecar placement does not overlap
  - verify narrow-width fallback behavior still keeps the assistant usable

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Guide sidecar collapses back into Chat-only semantics | High | Keep handoff explicit and host-owned state separate from direct-lane state |
| Left-side dock conflicts with existing navigation or responsive layouts | High | Prototype with shell-level anchors and define narrow-width overlay fallback early |
| Runtime-backed sidecar wiring adds avoidable complexity to the first slice | Medium | Reuse the existing dispatch pipeline boundary and keep deterministic greeting plus quick actions as degraded fallback |
| Right-side inspectors become harder to use because shell overlays leak into product space | Medium | Preserve right-side ownership and validate with Chat/Work/Code inspector toggles |
| First-run visibility becomes annoying on every visit | Medium | Persist dismissal/collapse state in host-owned preferences |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-07 | Plan created for a host-owned Guide Cat sidecar as the post-setup day-0 assist surface |

---

*Created: 2026-04-07*
*Author: Codex*

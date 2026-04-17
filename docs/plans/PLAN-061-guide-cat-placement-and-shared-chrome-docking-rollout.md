# PLAN-061: Guide Cat Placement and Shared-Chrome Docking Rollout

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Spec

[SPEC-071: Guide Cat Placement and Shared-Chrome Docking](../specs/SPEC-071-guide-cat-placement-and-shared-chrome-docking.md)

Additional context:

- [ADR-070: Use a Surface-Safe Floating and Shared-Chrome-Docked Guide Cat Placement Model](../decisions/070-use-a-surface-safe-floating-and-shared-chrome-docked-guide-cat-placement-model.md)
- [SPEC-060: Guide Cat Optional Surface-Assist Capability](../specs/SPEC-060-guide-cat-optional-surface-assist-capability.md)
- [SPEC-067: Guide Cat Assist Content Cache and Offline Refresh](../specs/SPEC-067-guide-cat-assist-content-cache-and-offline-refresh.md)

## Overview

Replace the current fixed-left Guide Cat sidecar assumption with a host-owned
placement system that supports:

- floating Guide Cat anchors in safe canvas regions
- shared chrome docking across Lobby and workspace surfaces
- dock persistence across route changes
- Settings and narrow-layout safety overrides

This rollout should preserve the broader Guide Cat assist-capability seam while
moving placement logic into an explicit host-owned contract.

## Implementation Phases

### Phase 1: Freeze Placement Vocabulary and Supersession

- [ ] Task 1.1: Land the new ADR/SPEC/PLAN chain for Guide Cat floating and
      shared-chrome docking.
- [ ] Task 1.2: Mark the older fixed-left-sidecar doc chain as historical or
      superseded.
- [ ] Task 1.3: Freeze the distinction between placement state and presentation
      state in platform-owned terminology.

**Deliverables**: one active documentation chain for Guide Cat placement
without conflicting fixed-left-dock guidance

### Phase 2: Shared Placement State and Persistence

- [ ] Task 2.1: Add platform-owned preference/state fields for placement mode,
      dock target, and per-surface-family floating positions.
- [ ] Task 2.2: Store floating positions in normalized form rather than global
      cross-surface pixel coordinates.
- [ ] Task 2.3: Define clamp/reflow rules for stale or unsafe remembered
      positions.
- [ ] Task 2.4: Keep placement state separate from Guide Cat assist content,
      transcript state, and route-local UI state.

**Deliverables**: stable host-owned placement state model and persistence seam

### Phase 3: Host Placement Engine

- [ ] Task 3.1: Extract Guide Cat placement logic into a host-owned placement
      module rather than hard-coded `.canvas` offsets.
- [ ] Task 3.2: Define safe-area and blocked-area inputs per surface family.
- [ ] Task 3.3: Implement drag handling for floating anchors inside safe areas.
- [ ] Task 3.4: Implement dock-target detection and explicit drop-target
      feedback.

**Deliverables**: one reusable placement engine with drag, clamp, and dock
behavior

### Phase 4: Lobby and Workspace Dock Slots

- [ ] Task 4.1: Add a dedicated Lobby assist slot in the top chrome between the
      cat roster and account/user chrome.
- [ ] Task 4.2: Add a dedicated workspace assist slot in sidebar chrome above
      the account/user footer.
- [ ] Task 4.3: Map one shared dock target intent into those surface-specific
      slots.
- [ ] Task 4.4: Ensure docked Guide Cat remains visually distinct from normal
      sidebar navigation items.

**Deliverables**: shared dock intent renders cleanly on both Lobby and
workspace surfaces

### Phase 5: Presentation Integration and Surface Overrides

- [ ] Task 5.1: Rework `GuideCatSidecar` so floating anchors and docked anchors
      can both launch Guide Cat presentation states.
- [ ] Task 5.2: Ensure expanded Guide Cat content opens toward the canvas rather
      than inside sidebar navigation chrome.
- [ ] Task 5.3: Add Settings parked/docked override behavior that preserves the
      user's remembered floating positions elsewhere.
- [ ] Task 5.4: Add narrow-layout fallback behavior for compact dock badges,
      collapsed anchors, or bottom-sheet presentation.

**Deliverables**: Guide Cat presentation follows the new placement contract
across Lobby, workspace, and Settings

### Phase 6: Cross-Surface Continuity and Validation

- [ ] Task 6.1: Preserve docked intent across Lobby <-> Chat / Work / Code
      route changes.
- [ ] Task 6.2: Ensure undocking restores the current surface family's last
      valid floating position.
- [ ] Task 6.3: Add tests for clamp, dock, undock, Settings override, and
      cross-surface continuity.
- [ ] Task 6.4: Run manual smoke checks for Lobby top chrome, workspace
      sidebar, Settings, and narrow layouts.

**Deliverables**: Guide Cat placement remains predictable and safe across
surface transitions

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `docs/decisions/070-use-a-surface-safe-floating-and-shared-chrome-docked-guide-cat-placement-model.md` | Create | Placement architecture decision |
| `docs/specs/SPEC-071-guide-cat-placement-and-shared-chrome-docking.md` | Create | Placement and docking requirements |
| `docs/plans/PLAN-061-guide-cat-placement-and-shared-chrome-docking-rollout.md` | Create | Rollout plan for the new placement model |
| `docs/decisions/054-use-a-platform-level-guide-sidecar-for-day-0-assist.md` | Modify | Mark earlier fixed-left-sidecar direction as superseded |
| `docs/specs/SPEC-051-guide-cat-sidecar-and-day-0-assist-surfaces.md` | Modify | Mark older sidecar-only requirement set as historical/superseded |
| `docs/plans/PLAN-041-guide-cat-sidecar-and-day-0-assist-rollout.md` | Modify | Mark older rollout as superseded |
| `src/shared/platform-contract.ts` | Modify | Add placement/dock state fields |
| `src/shared/platformPreferences.ts` | Modify | Persist placement mode, dock target, and normalized floating positions |
| `src/app/renderer/useGuideCatSidecarState.ts` | Modify | Separate placement state from presentation state |
| `src/design/components/GuideCatSidecar.tsx` | Modify | Rework anchor logic for floating and docked projections |
| `src/app/renderer/PlatformLobby.tsx` | Modify | Expose Lobby chrome dock slot |
| `src/app/renderer/productShell/**` | Modify | Expose workspace sidebar dock slot and safe sidebar integration |
| `src/app/renderer/App.tsx` | Modify | Mount host-owned placement engine and cross-surface continuity logic |
| `tests/**` | Modify/Create | Cover drag, dock, undock, override, and continuity behavior |

## Technical Decisions

- Decision 1: placement state and presentation state must stay separate so
  Guide Cat content/panel logic does not own drag or dock policy.
- Decision 2: docking uses one shared semantic target and per-surface render
  slots rather than separate feature flags for Lobby and workspace.
- Decision 3: floating state persists per surface family using normalized
  coordinates so layout changes do not invalidate persistence.
- Decision 4: Settings is a host override surface and may park Guide Cat for
  layout safety without deleting the user's broader placement preference.
- Decision 5: docked Guide Cat opens toward the canvas to preserve clear
  navigation ownership in the sidebar.

## Testing Strategy

- **Unit Tests**: placement-state transitions, normalized-position restore,
  clamp logic, dock-target resolution, Settings override behavior
- **Integration Tests**: Lobby dock -> workspace dock continuity, workspace
  undock restore, Settings parked override, no-Guide-Cat fallback
- **Manual Testing**:
  - drag Guide Cat in Lobby and verify the floating position is clamped safely
  - dock Guide Cat in Lobby and verify Chat / Work / Code render it docked in
    the sidebar slot
  - undock from a product surface and verify the workspace floating position is
    restored instead of the Lobby geometry
  - enter Settings from a floating workspace and verify Guide Cat is safely
    parked without losing the remembered workspace position
  - verify narrow layouts use compact dock or bottom-sheet fallback safely

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Guide Cat placement logic stays tied to current `.canvas` geometry and breaks on new layouts | High | Extract a host-owned placement engine with explicit safe-area and dock-slot inputs |
| Docked Guide Cat becomes indistinguishable from normal sidebar navigation | High | Use a dedicated assist slot and require docked-open states to expand toward canvas |
| Remembered floating positions feel unstable across surfaces | Medium | Persist per-surface-family normalized coordinates and clamp aggressively on restore |
| Settings becomes cluttered by inherited floating behavior | Medium | Apply a temporary parked override for Settings and preserve the prior floating intent separately |
| Narrow layouts regress into overlapping UI | Medium | Define compact-dock and bottom-sheet fallbacks early, then validate them manually |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-17 | Plan created for Guide Cat floating placement and shared-chrome docking rollout |

---

*Created: 2026-04-17*
*Author: Codex*

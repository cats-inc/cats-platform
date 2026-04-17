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

- one shared normalized floating anchor in safe canvas regions
- shared chrome docking across Lobby and workspace surfaces
- dock persistence across route changes
- Settings-hidden and narrow-layout safety overrides

This rollout should preserve the broader Guide Cat assist-capability seam while
moving placement logic into an explicit host-owned contract.

## Implementation Phases

### Phase 1: Freeze Placement Vocabulary and MVP Scope

- [ ] Task 1.1: Land the new ADR/SPEC/PLAN chain for Guide Cat floating and
      shared-chrome docking.
- [ ] Task 1.2: Mark the older fixed-left-sidecar doc chain as historical or
      superseded.
- [ ] Task 1.3: Freeze the distinction between placement state and presentation
      state in platform-owned terminology.
- [ ] Task 1.4: Freeze the MVP scope as:
      - shared floating anchor
      - explicit drag-to-dock
      - Lobby dock slot
      - workspace dock slot
      - Settings-hidden override
      - proactive avoidance on live layout changes

**Deliverables**: one active documentation chain for Guide Cat placement
without conflicting fixed-left-dock guidance

### Phase 2: Shared Floating Anchor and Avoidance Inputs

- [ ] Task 2.1: Add platform-owned preference/state fields for placement mode,
      one shared normalized floating anchor, and placement override reason.
- [ ] Task 2.2: Store the floating anchor in normalized viewport-relative form
      rather than per-surface remembered positions.
- [ ] Task 2.3: Define safe-area and exclusion-zone inputs per surface class.
- [ ] Task 2.4: Define clamp/reflow rules for stale or unsafe rendered
      positions and for first-run default anchor selection.
- [ ] Task 2.5: Keep placement state separate from Guide Cat assist content,
      transcript state, and route-local UI state.

**Deliverables**: stable host-owned placement state model and persistence seam

### Phase 3: Host Placement Engine and Drag-to-Dock Semantics

- [ ] Task 3.1: Extract Guide Cat placement logic into a host-owned placement
      module rather than hard-coded `.canvas` offsets.
- [ ] Task 3.2: Implement drag handling for floating anchors inside safe areas
      plus explicit dock approach corridors.
- [ ] Task 3.3: Define dock activation threshold, preview behavior, and
      drag-away escape threshold for undocking.
- [ ] Task 3.4: Implement dock-target detection and explicit drop-target
      feedback.
- [ ] Task 3.5: Re-evaluate placement during live layout changes such as
      viewport resize, sidebar collapse/expansion, and blocked-region changes.

**Deliverables**: one reusable placement engine with drag, clamp, and dock
behavior

### Phase 4: Lobby and Workspace MVP Chrome Slots

- [ ] Task 4.1: Add a dedicated Lobby assist slot in the top chrome between the
      cat roster and account/user chrome.
- [ ] Task 4.2: Add a dedicated workspace assist slot in sidebar chrome above
      the account/user footer.
- [ ] Task 4.3: Map one shared docked intent into those surface-specific slots.
- [ ] Task 4.4: Ensure docked Guide Cat remains visually distinct from normal
      sidebar navigation items.
- [ ] Task 4.5: Ensure undocking restores the shared floating anchor and then
      clamps it for the active surface.

**Deliverables**: shared dock intent renders cleanly on both Lobby and
workspace surfaces

### MVP Exit Criteria

- [ ] Guide Cat can float from one shared normalized anchor on Lobby and
      workspace surfaces.
- [ ] Guide Cat can dock from Lobby into the shared chrome model and remain
      docked on workspace surfaces.
- [ ] Guide Cat proactively avoids collisions during live layout changes.
- [ ] Settings hides Guide Cat without mutating remembered floating/docked
      preference.

**Deliverables**: first implementation slice complete without adding
settings-specific assist chrome or richer narrow-layout variants

### Phase 5: Follow-On Responsive and Presentation Polish

- [ ] Task 5.1: Rework `GuideCatSidecar` so floating anchors and docked anchors
      can both launch Guide Cat presentation states.
- [ ] Task 5.2: Ensure expanded Guide Cat content opens toward the canvas rather
      than inside sidebar navigation chrome.
- [ ] Task 5.3: Add narrow-layout polish beyond the MVP hidden/collapsed
      fallback only if the simpler MVP fallback proves insufficient.
- [ ] Task 5.4: Evaluate whether compact dock badges or richer responsive
      variants deserve a separate follow-on spec.

**Deliverables**: Guide Cat presentation follows the new placement contract
across Lobby and workspace surfaces after the MVP is stable

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
| `src/shared/platformPreferences.ts` | Modify | Persist placement mode, shared normalized floating anchor, and override reason |
| `src/app/renderer/useGuideCatSidecarState.ts` | Modify | Separate placement state from presentation state |
| `src/design/components/GuideCatSidecar.tsx` | Modify | Rework anchor logic for floating and docked projections |
| `src/app/renderer/PlatformLobby.tsx` | Modify | Expose Lobby chrome dock slot |
| `src/app/renderer/productShell/**` | Modify | Expose workspace sidebar dock slot and safe sidebar integration |
| `src/app/renderer/App.tsx` | Modify | Mount host-owned placement engine, continuity logic, and Settings-hidden override |
| `tests/**` | Modify/Create | Cover drag, dock, undock, override, and continuity behavior |

## Technical Decisions

- Decision 1: placement state and presentation state must stay separate so
  Guide Cat content/panel logic does not own drag or dock policy.
- Decision 2: docking uses one shared semantic target and per-surface render
  slots rather than separate feature flags for Lobby and workspace.
- Decision 3: floating state persists as one shared normalized anchor, while
  each surface supplies safe-area and exclusion-zone rules that clamp it.
- Decision 4: Settings is a host override surface and stays hidden in the MVP
  rather than introducing new parked assist chrome.
- Decision 5: docked Guide Cat opens toward the canvas to preserve clear
  navigation ownership in the sidebar.

## Testing Strategy

- **Unit Tests**: placement-state transitions, shared-anchor restore, clamp
  logic, dock activation threshold logic, undock escape threshold logic, and
  Settings-hidden override behavior
- **Integration Tests**: Lobby dock -> workspace dock continuity, workspace
  undock restore, proactive avoidance on live layout changes, Settings-hidden
  override, no-Guide-Cat fallback
- **Manual Testing**:
  - drag Guide Cat in Lobby and verify the floating position is clamped safely
  - dock Guide Cat in Lobby and verify Chat / Work / Code render it docked in
    the sidebar slot
  - undock from a product surface and verify the shared floating anchor is
    restored and reclamped for the workspace layout
  - resize the viewport, collapse/expand the sidebar, and open a blocked region
    such as a detail panel to verify Guide Cat moves out of the way
  - enter Settings from floating and docked states and verify Guide Cat hides
    without losing the remembered placement preference

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Guide Cat placement logic stays tied to current `.canvas` geometry and breaks on new layouts | High | Extract a host-owned placement engine with explicit safe-area and dock-slot inputs |
| Docked Guide Cat becomes indistinguishable from normal sidebar navigation | High | Use a dedicated assist slot and require docked-open states to expand toward canvas |
| Shared floating anchor still collides with surface-specific chrome | Medium | Require explicit exclusion zones plus proactive reflow during live layout changes |
| Settings becomes cluttered by inherited floating behavior | Medium | Keep Settings hidden in the MVP and revisit richer Settings-specific chrome later only if needed |
| Narrow layouts regress into overlapping UI | Medium | Keep MVP fallback narrow and conservative, then add richer variants only with separate validation |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-17 | Plan created for Guide Cat floating placement and shared-chrome docking rollout |

---

*Created: 2026-04-17*
*Author: Codex*

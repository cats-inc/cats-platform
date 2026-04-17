# SPEC-071: Guide Cat Placement and Shared-Chrome Docking

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Summary

Guide Cat should no longer be defined only as a fixed left-docked sidecar.

The platform now needs a host-owned placement model that lets Guide Cat:

- float inside safe canvas regions on eligible surfaces
- dock into explicit host-chrome slots on Lobby and product pages
- preserve a shared dock intent across route changes
- temporarily park or clamp itself on Settings and narrow layouts without
  losing the user's broader preference

This spec defines that placement model.
Guide Cat content, runtime-backed assist, and cached suggestion bundles remain
governed by the broader Guide Cat capability docs; this spec focuses on where
Guide Cat lives and how it moves.

## Goals

- let Guide Cat feel movable and alive in eligible work surfaces
- preserve one clear cross-surface dock model instead of one-off per-page rules
- keep chrome ownership clear on Lobby and in product sidebars
- make placement resilient to differing canvas shapes across Lobby, workspaces,
  and Settings
- preserve layout safety by storing intent and normalized positions instead of
  fragile global pixel coordinates

## Non-Goals

- redefining Guide Cat content generation, runtime prompts, or cache rules
- turning Guide Cat into a normal sidebar navigation item
- allowing unrestricted free-floating behavior in Settings
- deciding the complete long-form transcript model for Guide Cat follow-through
- requiring every surface to ship the same visual treatment in the first slice

## User Stories

- As a user, I want to drag Guide Cat around the canvas when I am working so it
  feels like a live assistant rather than a permanently bolted panel.
- As a user, I want to dock Guide Cat into chrome when I want a tidier layout.
- As a user, if I dock Guide Cat on Lobby, I want it to stay docked when I move
  into Chat, Work, or Code.
- As a user, I want Settings to stay readable and not inherit clutter from my
  workspace layout.
- As a product developer, I want one host-owned placement contract that each
  surface can project safely rather than re-implementing drag and dock logic.

## Requirements

### Functional Requirements

1. The platform shall model Guide Cat placement separately from Guide Cat
   assist content and separately from Guide Cat presentation states such as
   `collapsed`, `welcome-peek`, or `open`.
2. The platform shall support at least these placement modes:
   - `hidden`
   - `floating`
   - `docked`
3. Eligible surfaces shall expose host-owned placement policy rather than rely
   on one global hard-coded anchor.
4. The first supported surface families shall be:
   - `lobby`
   - `workspace` for Chat / Work / Code
   - `settings` as a restricted/override family
5. When Guide Cat is `floating`, the floating anchor shall be draggable only
   inside the current surface family's safe area.
6. Floating position persistence shall be stored per surface family, not as one
   global absolute pixel coordinate.
7. Persisted floating positions shall use normalized coordinates or another
   layout-resilient representation rather than raw cross-surface pixel values.
8. The platform shall be allowed to clamp, offset, or override a remembered
   floating position when the remembered position is no longer safe or visible.
9. The platform shall define an explicit Lobby dock slot in primary chrome.
10. The Lobby dock slot shall be rendered as a dedicated assist slot located
    between the cat-roster chrome and the account/user chrome rather than as an
    accidental gap between unrelated elements.
11. The platform shall define an explicit workspace dock slot in the product
    sidebar chrome above the user/account footer.
12. Docking shall be modeled as one shared dock target intent, not as unrelated
    per-surface booleans.
13. If the user docks Guide Cat on Lobby, then navigates to Chat, Work, or
    Code, the platform shall keep Guide Cat in `docked` placement mode and
    render it into the workspace dock slot.
14. If the user returns to Lobby while Guide Cat remains docked, the platform
    shall render it back into the Lobby dock slot.
15. When the user undocks Guide Cat, the platform shall restore the last valid
    floating position for the current surface family rather than reuse another
    surface family's raw geometry.
16. Guide Cat open-state affordances launched from a dock slot shall open
    toward the canvas or another host-owned assist surface rather than expand
    inside the sidebar navigation stack itself.
17. Settings shall not expose unrestricted floating Guide Cat placement.
18. When the user enters Settings while Guide Cat is floating elsewhere, the
    platform shall be allowed to apply a temporary parked presentation such as:
    - docked in a Settings-safe assist slot
    - collapsed in a host-safe anchor
    - hidden when the current layout cannot safely host it
19. A temporary Settings override shall not delete the user's remembered
    floating position for Lobby or workspace surfaces.
20. On narrow or crowded layouts, the platform shall be allowed to replace the
    usual floating or docked projection with a safer fallback such as:
    - collapsed badge
    - compact dock badge
    - bottom sheet
    - safe overlay
21. When a dock slot is a valid drop target, the UI shall provide a visible
    dock affordance such as highlight, ghost preview, or other explicit target
    feedback.
22. If a dock slot cannot render at full size because chrome is too narrow, the
    host shall preserve dock intent and render the safest compact dock
    projection available.
23. The placement system shall not require Guide Cat to occupy the right-side
    inspector/detail region used by product-native panels.
24. The placement system shall preserve the distinction between platform-owned
    Guide Cat chrome and product-native navigation chrome.
25. This placement system shall remain compatible with Guide Cat being absent;
    when `guideCat == null`, no floating or docked projection shall appear.

### Non-Functional Requirements

- **Clarity**: the user should understand the difference between a floating
  assistant, a docked assistant, and product navigation
- **Layout Safety**: remembered positions must never override visibility or
  critical interaction safety
- **Continuity**: docking should feel like one cross-surface preference, not a
  separate per-page trick
- **Predictability**: undocking should restore the current surface family's
  remembered floating position in a stable way
- **Responsiveness**: the placement model must degrade safely on narrow or
  crowded layouts

## Design Overview

```text
Guide Cat placement
    |
    +--> hidden
    |
    +--> floating
    |      |
    |      +--> drag anchor inside surface safe area
    |      +--> remember normalized position per surface family
    |      +--> clamp/reflow when layout changes
    |
    +--> docked
           |
           +--> dockTarget = primary_chrome
           +--> Lobby slot: top chrome assist slot
           +--> Workspace slot: sidebar assist slot
           +--> Settings may temporarily park here
```

## Surface Model

### Lobby

- Guide Cat may float inside Lobby's safe content region.
- Lobby exposes a dedicated top-chrome assist dock slot.
- The slot should sit visually between the cat-roster chrome and the
  account/user chrome.
- Docking on Lobby should persist as the same shared dock intent used by later
  product surfaces.

### Workspace

- Chat, Work, and Code share the first workspace-family placement policy.
- Guide Cat may float inside the workspace canvas safe area.
- Workspace exposes a dedicated sidebar assist dock slot above the account/user
  footer.
- Docked Guide Cat is stored in chrome, but expanded Guide Cat content must
  still open toward the canvas.

### Settings

- Settings should prefer tidy, low-interference Guide Cat behavior.
- Settings may show Guide Cat only through a parked/docked/collapsed override.
- Entering Settings should not destroy remembered floating positions for Lobby
  or workspace.

## Suggested State Additions

The first implementation slice should introduce host-owned state such as:

- `guideCatPlacementMode: 'hidden' | 'floating' | 'docked'`
- `guideCatDockTarget: 'primary_chrome' | null`
- `guideCatFloatingPositions: { lobby?: { x: number; y: number }; workspace?: { x: number; y: number } }`
- `guideCatPresentationState: 'collapsed' | 'welcome-peek' | 'open'`
- `guideCatPlacementOverrideReason?: 'settings_parked' | 'narrow_layout' | 'collision_reflow' | null`

This state should remain platform-owned rather than being embedded inside one
product's route-local transcript state.

## Dependencies

- [ADR-061](../decisions/061-treat-guide-cat-as-an-optional-surface-assist-capability.md)
- [ADR-066](../decisions/066-persist-guide-cat-assist-content-as-platform-owned-local-state.md)
- [ADR-070](../decisions/070-use-a-surface-safe-floating-and-shared-chrome-docked-guide-cat-placement-model.md)
- [SPEC-060](./SPEC-060-guide-cat-optional-surface-assist-capability.md)
- [SPEC-067](./SPEC-067-guide-cat-assist-content-cache-and-offline-refresh.md)

## Open Questions

- [ ] Should the workspace dock slot look identical across Chat, Work, and
      Code, or allow light product tinting while preserving one interaction
      contract?
- [ ] On very narrow sidebar widths, should the compact dock projection show
      name text, avatar only, or avatar plus badge?
- [ ] Should entering Settings always force a docked projection first, or may
      some layouts choose a collapsed parked anchor instead?

## References

- [ADR-054](../decisions/054-use-a-platform-level-guide-sidecar-for-day-0-assist.md)
- [ADR-061](../decisions/061-treat-guide-cat-as-an-optional-surface-assist-capability.md)
- [ADR-070](../decisions/070-use-a-surface-safe-floating-and-shared-chrome-docked-guide-cat-placement-model.md)
- [SPEC-051](./SPEC-051-guide-cat-sidecar-and-day-0-assist-surfaces.md)
- [SPEC-060](./SPEC-060-guide-cat-optional-surface-assist-capability.md)
- [PLAN-061](../plans/PLAN-061-guide-cat-placement-and-shared-chrome-docking-rollout.md)

---

*Created: 2026-04-17*
*Author: Codex*
*Related Plan: [PLAN-061](../plans/PLAN-061-guide-cat-placement-and-shared-chrome-docking-rollout.md)*

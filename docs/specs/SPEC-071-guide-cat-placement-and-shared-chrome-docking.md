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

- float from one normalized viewport-relative anchor through safe canvas
  regions on eligible surfaces
- dock into explicit host-chrome slots on Lobby and product pages
- preserve a shared dock intent across route changes
- hide on Settings without losing the user's broader placement preference
- proactively reflow or clamp itself when live layout changes make the current
  projection unsafe

This spec defines that placement model.
Guide Cat content, runtime-backed assist, and cached suggestion bundles remain
governed by the broader Guide Cat capability docs; this spec focuses on where
Guide Cat lives and how it moves.

This spec also freezes the persistence ownership boundary for Guide Cat chrome
preferences: placement semantics remain host-owned, but durable UI preference
persistence for Guide Cat chrome is renderer-owned.

## Goals

- let Guide Cat feel movable and alive in eligible work surfaces
- preserve one clear cross-surface dock model instead of one-off per-page rules
- keep chrome ownership clear on Lobby and in product sidebars
- make placement resilient to differing canvas shapes across Lobby, workspaces,
  and Settings
- preserve layout safety by storing one normalized viewport anchor plus
  surface-specific avoidance rules instead of fragile global pixels or
  per-surface remembered positions
- remove unnecessary server round-trips and read/merge/write races for Guide
  Cat chrome preferences

## Non-Goals

- redefining Guide Cat content generation, runtime prompts, or cache rules
- turning Guide Cat into a normal sidebar navigation item
- allowing unrestricted free-floating behavior in Settings
- deciding the complete long-form transcript model for Guide Cat follow-through
- requiring every surface to ship the same visual treatment in the first slice
- making the server the long-term owner of Guide Cat chrome/UI preferences

## User Stories

- As a user, I want to drag Guide Cat around the canvas when I am working so it
  feels like a live assistant rather than a permanently bolted panel.
- As a user, I want to dock Guide Cat into chrome when I want a tidier layout.
- As a user, if I dock Guide Cat on Lobby, I want it to stay docked when I move
  into Chat, Work, or Code.
- As a user, I want Settings to stay readable and not inherit clutter from my
  workspace layout.
- As a user, if the layout changes around me, I want Guide Cat to move out of
  the way rather than cover important controls.
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
4. The first supported surface classes shall be:
   - `lobby`
   - `workspace` for Chat / Work / Code
   - `settings` as a hidden override surface
5. When Guide Cat is `floating`, the floating anchor shall be draggable only
   inside the active surface's safe area, except for explicit dock approach
   corridors that lead into a valid dock slot.
6. Floating position persistence shall use one normalized viewport-relative
   floating anchor rather than per-surface remembered floating positions.
7. Surfaces shall project that shared floating anchor through host-defined safe
   areas and exclusion zones.
8. Persisted floating anchors shall use normalized coordinates or another
   layout-resilient representation rather than raw cross-surface pixel values.
9. The durable persistence owner for these four Guide Cat UI fields shall be a
   renderer-owned Guide Cat UI preference store rather than
   server-managed `PlatformPreferences`:
   - `guideCatSidecarSeen`
   - `guideCatSidecarMode`
   - `guideCatPlacement`
   - `guideCatFloatingAnchor`
10. The renderer-owned Guide Cat UI preference store shall expose one
    in-memory source of truth and one local persistence backend.
11. The first implementation slice should use `localStorage` as that local
    persistence backend unless a later ADR changes the storage substrate.
12. Guide Cat UI preference consumers shall not each read/write raw
    `localStorage`; they shall read/write through the shared renderer-owned
    store.
13. If no floating anchor has yet been persisted, the host shall choose one
    deterministic default floating anchor and use that same anchor across Lobby
    and workspace surfaces until the user moves it.
14. The platform shall be allowed to clamp, offset, or override the rendered
    floating projection when the current projection is no longer safe or
    visible.
15. The platform shall proactively re-evaluate Guide Cat placement during live
    layout changes such as viewport resize, sidebar collapse/expansion,
    top-chrome reflow, or blocked-region changes.
16. During proactive re-evaluation, the host shall be allowed to reflow,
    clamp, collapse, or temporarily hide the current Guide Cat projection while
    preserving the underlying floating-vs-docked intent.
17. The platform shall define an explicit Lobby dock slot in primary chrome.
18. The Lobby dock slot shall be rendered as a dedicated assist slot located
    between the cat-roster chrome and the account/user chrome rather than as an
    accidental gap between unrelated elements.
19. The platform shall define an explicit workspace dock slot in the product
    sidebar chrome above the user/account footer.
20. A dock slot shall define:
    - a visible drop target
    - an activation/snap threshold
    - a preview state before drop is committed
21. Releasing the dragged Guide Cat anchor while a valid dock target is active
    shall commit docking into that dock slot.
22. Docking shall be modeled as one shared dock intent, not as unrelated
    per-surface booleans.
23. If the user docks Guide Cat on Lobby, then navigates to Chat, Work, or
    Code, the platform shall keep Guide Cat in `docked` placement mode and
    render it into the workspace dock slot.
24. If the user returns to Lobby while Guide Cat remains docked, the platform
    shall render it back into the Lobby dock slot.
25. When the user undocks Guide Cat, the platform shall restore the shared
    normalized floating anchor and reclamp it against the active surface's
    current safe area and exclusion zones.
26. When undocking commits a durable preference update, `guideCatPlacement`
    and `guideCatFloatingAnchor` shall land atomically as one logical store
    update rather than as split persistence writes.
27. Undocking shall require either:
    - an explicit undock affordance
    - a drag-away gesture that crosses a defined escape threshold before release
28. Guide Cat open-state affordances launched from a dock slot shall open
    toward the canvas or another host-owned assist surface rather than expand
    inside the sidebar navigation stack itself.
29. Settings shall render Guide Cat hidden for now rather than expose
    unrestricted floating or parked assist behavior.
30. Entering Settings shall not delete the user's remembered floating anchor or
    docked preference.
31. Leaving Settings shall restore the underlying floating or docked placement
    mode that was active before Settings hid Guide Cat.
32. If a migration from legacy server-backed Guide Cat UI preference values is
    needed, that migration shall be one-time, renderer-initiated, and read-only
    from the server side.
33. In steady state, the app-shell envelope shall not remain the durable owner
    of the four Guide Cat UI preference fields.
34. On narrow or crowded layouts, the platform shall be allowed to replace the
    usual floating or docked projection with a safer fallback such as:
    - collapsed badge
    - hidden projection
35. The placement system shall preserve the distinction between platform-owned
    Guide Cat chrome and product-native navigation chrome.
36. This placement system shall remain compatible with Guide Cat being absent;
    when `guideCat == null`, no floating or docked projection shall appear.

### Non-Functional Requirements

- **Clarity**: the user should understand the difference between a floating
  assistant, a docked assistant, and product navigation
- **Layout Safety**: remembered positions must never override visibility or
  critical interaction safety, and live layout changes must trigger proactive
  avoidance
- **Continuity**: docking should feel like one cross-surface preference, not a
  separate per-page trick
- **Predictability**: undocking should restore the shared floating anchor, then
  clamp it consistently for the active surface
- **Responsiveness**: the placement model must degrade safely on narrow or
  crowded layouts without inventing alternate product ownership rules

## Design Overview

```text
Guide Cat placement
    |
    +--> hidden
    |
    +--> floating
    |      |
    |      +--> one normalized viewport anchor
    |      +--> drag anchor inside surface safe area
    |      +--> allow dock approach through dock corridor
    |      +--> clamp/reflow when layout changes
    |
    +--> docked
           |
           +--> Lobby slot: top chrome assist slot
           +--> Workspace slot: sidebar assist slot
           +--> Settings: hidden override, preserve docked intent
```

## Surface Model

### Lobby

- Guide Cat may float inside Lobby's safe content region.
- The same shared normalized floating anchor should be reused on Lobby and then
  clamped against Lobby's current safe area and exclusion zones.
- Lobby exposes a dedicated top-chrome assist dock slot.
- The slot should sit visually between the cat-roster chrome and the
  account/user chrome.
- Docking on Lobby should persist as the same shared dock intent used by later
  product surfaces.

### Workspace

- Chat, Work, and Code share the first workspace-family placement policy.
- Guide Cat may float inside the workspace canvas safe area.
- The same shared normalized floating anchor used on Lobby should be projected
  here and reclamped against workspace-safe regions rather than replaced with a
  separate workspace-only remembered position.
- Starting a Guide Cat click/drag may dismiss transient workspace chrome that
  relies on outside-click semantics, such as menus or non-pinned side panels.
- Workspace exposes a dedicated sidebar assist dock slot above the account/user
  footer.
- Docked Guide Cat is stored in chrome, but expanded Guide Cat content must
  still open toward the canvas.

### Settings

- Settings should prefer tidy, low-interference Guide Cat behavior.
- Settings should hide Guide Cat for now.
- Entering Settings should not destroy the remembered shared floating anchor or
  docked preference.

## Suggested State Additions

The first implementation slice should introduce Guide Cat placement state such
as:

- `guideCatPlacementMode: 'hidden' | 'floating' | 'docked'`
- `guideCatFloatingAnchor: { x: number; y: number } | null`
- `guideCatPresentationState: 'collapsed' | 'welcome-peek' | 'open'`
  `welcome-peek` means a system-initiated compact intro bubble anchored to the
  current floating or docked Guide Cat entrypoint.
- `guideCatPlacementOverrideReason?: 'settings_hidden' | 'narrow_layout' | 'collision_reflow' | null`

Placement semantics should remain platform/host-owned rather than being
embedded inside one product's route-local transcript state.

Durable persistence for these Guide Cat UI fields should be renderer-owned
rather than server-owned:

- `guideCatSidecarSeen`
- `guideCatSidecarMode`
- `guideCatPlacement`
- `guideCatFloatingAnchor`

The renderer should expose them through one shared Guide Cat UI preference
store with one local persistence backend.

## Dependencies

- [ADR-061](../decisions/061-treat-guide-cat-as-an-optional-surface-assist-capability.md)
- [ADR-066](../decisions/066-persist-guide-cat-assist-content-as-platform-owned-local-state.md)
- [ADR-070](../decisions/070-use-a-surface-safe-floating-and-shared-chrome-docked-guide-cat-placement-model.md)
- [SPEC-060](./SPEC-060-guide-cat-optional-surface-assist-capability.md)
- [SPEC-067](./SPEC-067-guide-cat-assist-content-cache-and-offline-refresh.md)
- [PLAN-063](../plans/PLAN-063-guide-cat-renderer-owned-ui-preferences-migration.md)

## Open Questions

- [ ] Should the workspace dock slot look identical across Chat, Work, and
      Code, or allow light product tinting while preserving one interaction
      contract?
- [ ] On very narrow layouts, should the first fallback be a collapsed badge or
      a fully hidden projection?
- [ ] Should first-run `welcome-peek` be allowed from both floating and docked
      entrypoints, or only from the floating projection?

## References

- [ADR-054](../decisions/054-use-a-platform-level-guide-sidecar-for-day-0-assist.md)
- [ADR-061](../decisions/061-treat-guide-cat-as-an-optional-surface-assist-capability.md)
- [ADR-070](../decisions/070-use-a-surface-safe-floating-and-shared-chrome-docked-guide-cat-placement-model.md)
- [SPEC-051](./SPEC-051-guide-cat-sidecar-and-day-0-assist-surfaces.md)
- [SPEC-060](./SPEC-060-guide-cat-optional-surface-assist-capability.md)
- [PLAN-061](../plans/PLAN-061-guide-cat-placement-and-shared-chrome-docking-rollout.md)
- [PLAN-063](../plans/PLAN-063-guide-cat-renderer-owned-ui-preferences-migration.md)

---

*Created: 2026-04-17*
*Author: Codex*
*Related Plans: [PLAN-061](../plans/PLAN-061-guide-cat-placement-and-shared-chrome-docking-rollout.md), [PLAN-063](../plans/PLAN-063-guide-cat-renderer-owned-ui-preferences-migration.md)*

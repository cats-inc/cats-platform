# ADR-070: Use a Surface-Safe Floating and Shared-Chrome-Docked Guide Cat Placement Model

> Replace the fixed left-side Guide sidecar assumption with a host-owned
> placement model where Guide Cat can float from one normalized viewport anchor
> inside safe canvas regions, dock into shared chrome slots, and preserve one
> cross-surface dock intent.

## Status

Proposed

## Context

`ADR-054` and `SPEC-051` established the first post-setup Guide Cat surface as
one persistent left-docked sidecar.

That direction solved an earlier problem: it made Guide Cat visible on day 0
without collapsing the experience into a Chat-only direct lane.

But the more detailed product discussion now exposes real interaction needs that
the fixed-left-dock model does not handle cleanly:

- Lobby, product workspaces, and Settings do not share one stable canvas shape
  or one stable chrome layout.
- The user wants Guide Cat to feel more alive and movable in work areas rather
  than permanently bolted to one edge.
- The product still needs a tidy "put it away here" behavior when the user
  wants Guide Cat stored inside host chrome.
- Lobby needs a natural dock location near its top chrome, while Chat/Work/Code
  need a different dock location in the sidebar shell.
- Settings is form-dense and should not inherit unrestricted floating behavior
  from workspace surfaces.
- Persisting one absolute pixel position across all surfaces is brittle and
  would create collision and clipping bugs whenever layout changes.
- Persisting separate remembered floating positions per surface family would
  also create avoidable "teleport" behavior during surface transitions.
- Persisting renderer chrome preferences through server-managed
  `PlatformPreferences` has also proven brittle because partial preference
  writes can race each other and restore stale Guide Cat UI values such as
  `auto` sidecar mode or an outdated dock/floating placement.

At the same time, Guide Cat should remain:

- a platform-owned assist capability
- low-privilege
- distinct from product-native navigation
- distinct from a generic support FAB or permanently embedded sidebar item

The platform therefore needs a richer placement model than "always dock left."

## Decision

### 1. Guide Cat placement is a host-owned placement system, not one fixed sidecar edge

The host should model Guide Cat placement independently from Guide Cat content.

At minimum, placement should distinguish:

- `hidden`
- `floating`
- `docked`

Guide Cat presentation state such as `collapsed`, `welcome-peek`, and `open`
should remain a separate concern layered on top of placement.

### Addendum: Renderer-Owned Guide Cat UI Preference Persistence

The host should continue to own placement semantics, safe-area policy, dock
intent, and projection rules.

However, the durable persistence for Guide Cat chrome/UI preferences should be
renderer-owned rather than server-owned.

The steady-state renderer-owned preference set is:

- `guideCatSidecarSeen`
- `guideCatSidecarMode`
- `guideCatPlacement`
- `guideCatFloatingAnchor`

Those values should live in one renderer-owned Guide Cat UI preference store
with one in-memory source of truth and a local persistence backend such as
`localStorage`.

In steady state, those four values should not remain part of
server-managed `PlatformPreferences` or `PlatformHostEnvelope`.

If a migration needs to import legacy file-backed values once, that migration
may temporarily read the old server-backed source, but that legacy source
should not remain the steady-state owner.

### 2. Floating uses one host-owned normalized anchor plus surface-defined avoidance rules

When Guide Cat is `floating`, the user may drag its floating anchor inside the
current surface's safe area.

The host should persist one normalized viewport-relative floating anchor rather
than separate per-surface remembered floating positions.

Each surface should then project that one anchor through its own safe area and
exclusion zones.

The system must clamp, reflow, or temporarily override the floating projection
when needed to preserve:

- visibility
- non-overlap with critical controls
- route/layout safety

This avoids cross-surface teleport behavior while still letting Lobby and
workspace surfaces enforce different layout safety rules.

### 3. Drag-to-dock uses explicit dock corridors and snap rules

Floating drag should be constrained to the active safe area except for explicit
host-defined dock approach corridors that let the user drag toward a valid dock
slot.

Docking should require:

- a visible dock target
- a defined activation/snap threshold
- a visible preview state before drop

Undocking should require either an explicit undock action or a drag-away
gesture that crosses a defined escape threshold before release.

### 4. Docking uses one shared dock intent with surface-specific slots

The product should treat docking as one shared semantic target, for example
`primary chrome docking`, rather than as unrelated per-surface hacks.

That shared dock intent should render into different host-owned slots depending
on the active surface:

- `Lobby`: a dedicated assist slot in the top chrome between the cat roster and
  the account/user chrome
- `Chat` / `Work` / `Code`: a dedicated assist slot in the product sidebar
  above the user/account footer

The dock slot must be explicit host chrome, not an accidental gap between
unrelated elements and not a normal sidebar navigation item.

### 5. Docked state persists across surface changes as intent, not geometry

If the user docks Guide Cat on Lobby, the platform should preserve the docked
intent when the user navigates into Chat, Work, or Code.

The host should then render Guide Cat in that surface's corresponding dock
slot.

Likewise, when the user returns to Lobby while still docked, Guide Cat should
return to the Lobby chrome slot.

### 6. Undocking restores the shared floating anchor, then reclamps it for the active surface

When the user undocks Guide Cat, the platform should restore the shared
normalized floating anchor and clamp it against the active surface's current
safe area and exclusion zones.

Any renderer-owned multi-field Guide Cat UI preference update, including
undocking when both placement and anchor change, should persist atomically
rather than as split writes.

This keeps Lobby and workspace behavior predictable without introducing
per-surface teleport behavior.

### 7. The host must proactively avoid new collisions during live layout changes

Guide Cat placement must react not only during restore, but also during live
layout changes such as:

- viewport resize
- sidebar collapse or expansion
- top-chrome reflow
- product detail or inspector panels appearing

When such changes would make the current floating or docked projection unsafe,
the host may reflow, clamp, collapse, or temporarily hide Guide Cat while
preserving the underlying floating-vs-docked intent.

### 8. Open Guide Cat content opens toward the canvas, not inside navigation chrome

Docking stores Guide Cat in chrome.
It does not turn Guide Cat into a sidebar navigation primitive.

When Guide Cat opens from a docked slot, its bubble/panel should expand toward
the canvas or another host-owned assist surface, not grow inside the navigation
stack itself.

### 9. Settings stays hidden for now and should not mutate remembered placement

Settings should not allow unrestricted floating placement.

When the user enters Settings, the host should hide Guide Cat for that route
family while preserving the user's underlying floating-vs-docked intent and
remembered floating anchor.

If the product later wants a Settings-specific assist slot, that should be a
follow-on design slice rather than being implied by this placement decision.

### 10. Constrained layouts may temporarily collapse or hide Guide Cat while preserving intent

Narrow or crowded layouts may temporarily collapse or hide Guide Cat while
preserving the underlying placement intent.

## Consequences

### Positive

- Guide Cat can feel more alive and movable in active work surfaces without
  losing a tidy stow/dock model.
- The platform gets one consistent cross-surface dock intent instead of
  separate ad hoc Lobby and sidebar behavior.
- Lobby, workspace, and Settings can each enforce different layout safety
  policies without forking Guide Cat into unrelated features.
- Persistent placement becomes more robust because the product stores one
  normalized anchor plus surface-specific avoidance rules rather than one
  fragile absolute coordinate or multiple per-surface remembered positions.
- Renderer-owned persistence removes unnecessary network round-trips and avoids
  server-side read/merge/write races for Guide Cat UI chrome preferences.
- Sidebar ownership remains clear because Guide Cat docks into dedicated assist
  chrome instead of masquerading as a normal nav item.

### Negative

- The host must now own drag, clamp, dock-target, and override policies rather
  than one static placement rule.
- Rendering and persistence become more complex because placement state and
  presentation state are separate, and the renderer now owns a dedicated Guide
  Cat UI preference store plus migration from the old server-backed values.
- Surface teams must expose explicit safe areas, exclusion zones, and dock
  slots instead of relying on incidental geometry.

### Neutral

- This ADR does not decide the exact Guide Cat runtime/content contract.
- This ADR does not require every surface to ship floating behavior in the
  first slice; some surfaces may start with dock-first projections while the
  host placement model is established.

## Alternatives Considered

### Alternative 1: Keep the fixed left-docked sidecar from ADR-054

- **Pros**: simpler model, already familiar from the first slice
- **Cons**: brittle across Lobby/Settings/workspace layout changes and does not
  support the desired drag-and-dock behavior
- **Why rejected**: the product now needs a cross-surface placement model, not
  one fixed-edge attachment rule

### Alternative 2: Allow completely free floating everywhere, including Settings and sidebar

- **Pros**: maximal freedom and playful behavior
- **Cons**: weak layout safety, unclear chrome ownership, and high collision
  risk in dense forms and navigation surfaces
- **Why rejected**: the product wants controlled freedom inside safe areas plus
  an explicit dock model

### Alternative 3: Treat sidebar insertion as just another floating position

- **Pros**: fewer separate concepts
- **Cons**: turns Guide Cat into a geometry accident, blurs navigation
  ownership, and makes Lobby/product mapping inconsistent
- **Why rejected**: docking should be an explicit chrome contract, not just a
  coordinate that happens to overlap the sidebar

## References

- [ADR-054](./054-use-a-platform-level-guide-sidecar-for-day-0-assist.md)
- [ADR-061](./061-treat-guide-cat-as-an-optional-surface-assist-capability.md)
- [SPEC-051](../specs/SPEC-051-guide-cat-sidecar-and-day-0-assist-surfaces.md)
- [SPEC-060](../specs/SPEC-060-guide-cat-optional-surface-assist-capability.md)
- [SPEC-071](../specs/SPEC-071-guide-cat-placement-and-shared-chrome-docking.md)
- [PLAN-061](../plans/PLAN-061-guide-cat-placement-and-shared-chrome-docking-rollout.md)
- [PLAN-063](../plans/PLAN-063-guide-cat-renderer-owned-ui-preferences-migration.md)

---

*Decision made: 2026-04-17*
*Decision makers: User, Codex*

# ADR-070: Use a Surface-Safe Floating and Shared-Chrome-Docked Guide Cat Placement Model

> Replace the fixed left-side Guide sidecar assumption with a host-owned
> placement model where Guide Cat can float inside safe canvas regions, dock
> into shared chrome slots, and preserve one cross-surface dock intent.

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

### 2. Floating is allowed only inside surface-defined safe areas

When Guide Cat is `floating`, the user may drag its floating anchor inside the
current surface's safe area.

The system must clamp, reflow, or override the remembered floating position when
needed to preserve:

- visibility
- non-overlap with critical controls
- route/layout safety

Guide Cat should therefore remember normalized per-surface-family positions
rather than one global absolute pixel coordinate.

### 3. Docking uses one shared dock intent with surface-specific slots

The product should treat docking as one shared semantic target, for example
`primary_chrome`, rather than as unrelated per-surface hacks.

That shared dock intent should render into different host-owned slots depending
on the active surface:

- `Lobby`: a dedicated assist slot in the top chrome between the cat roster and
  the account/user chrome
- `Chat` / `Work` / `Code`: a dedicated assist slot in the product sidebar
  above the user/account footer

The dock slot must be explicit host chrome, not an accidental gap between
unrelated elements and not a normal sidebar navigation item.

### 4. Docked state persists across surface changes as intent, not geometry

If the user docks Guide Cat on Lobby, the platform should preserve the docked
intent when the user navigates into Chat, Work, or Code.

The host should then render Guide Cat in that surface's corresponding dock
slot.

Likewise, when the user returns to Lobby while still docked, Guide Cat should
return to the Lobby chrome slot.

### 5. Undocking restores floating behavior per surface family

When the user undocks Guide Cat, the platform should restore Guide Cat to the
last valid floating position for the current surface family, not reuse another
surface's raw pixel coordinates.

This keeps Lobby and workspace behavior predictable even though their geometry
differs.

### 6. Open Guide Cat content opens toward the canvas, not inside navigation chrome

Docking stores Guide Cat in chrome.
It does not turn Guide Cat into a sidebar navigation primitive.

When Guide Cat opens from a docked slot, its bubble/panel should expand toward
the canvas or another host-owned assist surface, not grow inside the navigation
stack itself.

### 7. Settings and constrained layouts may temporarily override placement rendering

Settings should not allow unrestricted floating placement.

When the user enters Settings, the host may temporarily park Guide Cat into a
docked or collapsed assist slot while preserving the user's underlying
floating-vs-docked intent and remembered floating positions for other surface
families.

Likewise, narrow or crowded layouts may temporarily collapse, park, or
bottom-sheet Guide Cat while preserving the underlying placement intent.

## Consequences

### Positive

- Guide Cat can feel more alive and movable in active work surfaces without
  losing a tidy stow/dock model.
- The platform gets one consistent cross-surface dock intent instead of
  separate ad hoc Lobby and sidebar behavior.
- Lobby, workspace, and Settings can each enforce different layout safety
  policies without forking Guide Cat into unrelated features.
- Persistent placement becomes more robust because the product stores intent
  and normalized position rather than one fragile absolute coordinate.
- Sidebar ownership remains clear because Guide Cat docks into dedicated assist
  chrome instead of masquerading as a normal nav item.

### Negative

- The host must now own drag, clamp, dock-target, and override policies rather
  than one static placement rule.
- Rendering and persistence become more complex because placement state and
  presentation state are separate.
- Surface teams must expose explicit safe areas and dock slots instead of
  relying on incidental geometry.

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

---

*Decision made: 2026-04-17*
*Decision makers: User, Codex*

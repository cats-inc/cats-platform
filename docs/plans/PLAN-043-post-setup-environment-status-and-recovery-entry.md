# PLAN-043: Post-Setup Environment Status and Recovery Entry

> Add a lightweight post-setup environment awareness and recovery flow without
> turning `cats-platform` into a second runtime or desktop diagnostics console.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | User |
| **Reviewer** | Codex |

## Related Spec / Dependencies

- [SPEC-053: Post-Setup Environment Status and Recovery Entry](../specs/SPEC-053-post-setup-environment-status-and-recovery-entry.md)
- [SPEC-023: Packaged Setup Wizard and Provider Installation](../specs/SPEC-023-packaged-setup-wizard-and-provider-installation.md)
- [SPEC-045: Cross-Layer Bootstrap and Onboarding Diagnostics](../specs/SPEC-045-cross-layer-bootstrap-and-onboarding-diagnostics.md)
- [PLAN-040: Simplify Setup Wizard and Decouple Runtime Bootstrap](./PLAN-040-simplify-setup-wizard-and-decouple-runtime-bootstrap.md)
- [ADR-021](../decisions/021-keep-packaged-setup-and-provider-installation-in-the-host.md)
- [ADR-046](../decisions/046-drive-packaged-setup-through-runtime-bootstrap-apis.md)
- [ADR-047](../decisions/047-separate-bootstrap-diagnostics-by-layer-and-aggregate-in-the-host.md)

## Overview

The current product already has part of the needed surface:

- Lobby shows a runtime-adjacent lamp beside the owner avatar
- product sidebars already show a runtime lamp beside the owner avatar
- the shared account menu already has a `Cats Runtime` entry

What is still missing is a calm post-setup recovery entry that:

- does not require `Settings > Runtime`
- does not force users to relaunch the app into the bootstrap page
- does not reimplement the full runtime or desktop-host dashboards

This plan keeps the first slice intentionally thin:

1. unify the runtime lamp semantics and tooltip copy
2. add one always-visible neutral `Environment` item to the shared account menu
3. add one canonical `/environment` resolver surface inside `cats-platform`
4. let that resolver route users into:
   - `Cats Runtime` for deep runtime repair
   - desktop packaged setup only when desktop host state says it matters

The resolver will be route-backed for consistency and testability, but it
should render as a lightweight sheet or panel rather than a full settings page.

This plan intentionally avoids `PLAN-042` and uses `PLAN-043`.

## Implementation Phases

### Phase 1: Freeze the Shared IA and Copy

- [ ] Task 1.1: Define one shared post-setup runtime status model for Lobby and
      product sidebars.
- [ ] Task 1.2: Replace technical status wording with plain-language tooltip and
      resolver copy.
- [ ] Task 1.3: Freeze the account-menu IA:
      `Settings`, `Cats Runtime`, and `Environment`.
- [ ] Task 1.4: Freeze the rule that the `Environment` entry is always visible
      in post-setup account menus.
- [ ] Task 1.5: Freeze the rule that `cats-platform` stays a thin resolver and
      does not become a second diagnostics dashboard.
- [ ] Task 1.6: Freeze the rule that `/environment` is canonical and is
      presented as a route-backed sheet/panel instead of a settings page.

**Deliverables**: one approved IA/copy baseline for post-setup environment
status and recovery

### Phase 2: Unify Visible Runtime Status

- [ ] Task 2.1: Extract or centralize the runtime lamp state mapping now copied
      across Lobby, Chat, Work, and Code.
- [ ] Task 2.2: Apply one shared tooltip copy model to the sidebar avatar lamps
      and Lobby avatar lamp.
- [ ] Task 2.3: Ensure the shared account-avatar component can consume that
      shared runtime presentation model.
- [ ] Task 2.4: Add targeted tests for status mapping and tooltip copy.

**Deliverables**: one consistent runtime lamp behavior across post-setup
surfaces

### Phase 3: Add the Lightweight Environment Entry

- [ ] Task 3.1: Extend the shared `AccountIdentityMenu` with a new neutral
      always-visible `Environment` item while keeping the existing
      `Cats Runtime` item.
- [ ] Task 3.2: Add one canonical environment resolver surface in the platform
      host renderer through the dedicated host-level route `/environment`.
- [ ] Task 3.3: Keep the resolver intentionally thin:
      status summary, impact, recommended action, and optional secondary links.
- [ ] Task 3.4: Present `/environment` as a route-backed sheet or lightweight
      panel rather than a settings page.
- [ ] Task 3.5: Ensure the resolver is reachable from Lobby and all product
      sidebars through the shared menu.

**Deliverables**: a shallow in-product recovery entry no longer buried in
settings

### Phase 4: Connect Desktop Repair Only When Relevant

- [ ] Task 4.1: Reuse the existing desktop host bridge only for the minimum
      resolver needs:
      current desktop host/setup state and packaged-setup entry/resume actions.
- [ ] Task 4.2: Keep packaged setup conditional on relevant desktop host state
      instead of showing desktop repair controls all the time.
- [ ] Task 4.3: Preserve graceful degradation when the desktop host bridge is
      unavailable.
- [ ] Task 4.4: Add targeted tests for desktop vs non-desktop resolver
      behavior.

**Deliverables**: desktop packaged setup becomes an available repair lane,
without dominating the product-owned resolver

### Phase 5: Tighten Docs and Verification

- [ ] Task 5.1: Update user-facing docs that currently imply runtime recovery is
      mainly a bootstrap-page or settings-only story.
- [ ] Task 5.2: Update tests covering account menu contents, Lobby avatar
      status, and product sidebar status surfaces.
- [ ] Task 5.3: Validate that post-setup runtime problems still do not route the
      user back through onboarding.

**Deliverables**: implementation-ready docs plus bounded verification coverage

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/design/components/AccountIdentityMenu.tsx` | Modify | Add the new `Environment` menu item and preserve the existing `Cats Runtime` entry |
| `src/app/renderer/App.tsx` | Modify | Register the lightweight environment resolver route/surface |
| `src/app/renderer/PlatformLobby.tsx` | Modify | Consume the shared runtime presentation model for the lobby avatar status |
| `src/products/chat/renderer/components/Sidebar.tsx` | Modify | Replace local runtime-footer copy logic with the shared model |
| `src/products/work/renderer/components/Sidebar.tsx` | Modify | Replace local runtime-footer copy logic with the shared model |
| `src/products/code/renderer/components/Sidebar.tsx` | Modify | Replace local runtime-footer copy logic with the shared model |
| `src/app/renderer/environment/PlatformEnvironmentResolver.tsx` | Create | Lightweight product-owned resolver surface |
| `src/shared/runtimeStatusPresentation.ts` | Create | Shared state + tooltip/copy mapping for runtime lamps and resolver summary |
| `src/app/renderer/routeMap.ts` | Modify | Register canonical route ownership for the resolver surface if needed |
| `tests/platform-lobby-account-menu.test.tsx` | Modify | Cover the new account-menu entry and status copy |
| `tests/platform-routing.test.js` or dedicated resolver tests | Modify/Create | Verify route-level resolver behavior |
| `tests/desktop-setup-bridge.test.js` or targeted desktop tests | Modify | Verify desktop-host fallback and packaged-setup gating |

## Technical Decisions

- Decision 1: No new ADR is required for the first slice because accepted
  runtime/host/platform ownership boundaries remain unchanged.
- Decision 2: `Cats Runtime` remains the primary deep runtime repair surface;
  `cats-platform` only adds a shallow resolver.
- Decision 3: Desktop packaged setup remains supplementary and should appear
  only when host-owned repair state makes it relevant.
- Decision 4: The first slice should prefer one canonical environment surface
  over multiple per-product recovery widgets.
- Decision 5: The `Environment` entry is always visible after setup so the IA
  does not change based on current health.
- Decision 6: The canonical surface is `/environment`, presented as a
  route-backed sheet/panel instead of a settings page.

## Testing Strategy

- **Unit Tests**: shared runtime status mapping, tooltip copy selection, account
  menu state, resolver action selection
- **Integration Tests**: route-level resolver behavior, desktop-host bridge
  presence/absence handling, post-setup recovery navigation
- **Manual Testing**:
  - verify Lobby and sidebar avatar lamps show the same copy
  - verify the account menu shows `Settings`, `Cats Runtime`, and `Environment`
  - verify `Environment` routes to calm recovery guidance
  - verify runtime-only and desktop-packaged actions appear in the right cases

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Resolver scope expands into a second diagnostics dashboard | High | Keep the resolver bounded to status, impact, and routing actions only |
| Menu clutter or alarming wording increases user anxiety | Medium | Freeze neutral copy and keep the menu limited to one additional item |
| Desktop-specific repair logic leaks into non-desktop product behavior | Medium | Gate packaged-setup affordances behind desktop-host bridge availability and state |
| Status copy diverges again across Lobby and product sidebars | Medium | Centralize runtime presentation mapping in one shared helper and test it |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-08 | Plan created as `PLAN-043` to avoid collision with the separately active `PLAN-042` workstream |

---

*Created: 2026-04-08*
*Author: Codex*

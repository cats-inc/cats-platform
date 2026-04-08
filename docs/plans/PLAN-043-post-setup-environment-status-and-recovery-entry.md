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
2. add one always-visible neutral recovery item to the shared account menu
3. route that item into existing repair surfaces first:
   - `Cats Runtime` remains the deep runtime repair surface
   - desktop packaged setup only appears when desktop host state says it matters
4. only add a lightweight resolver if direct routing proves insufficient

This plan intentionally avoids `PLAN-042` and uses `PLAN-043`.

## Implementation Phases

### Phase 1: Unify Visible Runtime Status

- [ ] Task 2.1: Extract or centralize the runtime lamp state mapping now copied
      across Lobby, Chat, Work, and Code.
- [ ] Task 2.2: Apply one shared tooltip copy model to the sidebar avatar lamps
      and Lobby avatar lamp.
- [ ] Task 2.3: Ensure the shared account-avatar component can consume that
      shared runtime presentation model.
- [ ] Task 2.4: Add targeted tests for status mapping and tooltip copy.

**Deliverables**: one consistent runtime lamp behavior across post-setup
surfaces

### Phase 2: Add the Recovery Menu Entry

- [ ] Task 3.1: Extend the shared `AccountIdentityMenu` with one new neutral,
      always-visible recovery item while keeping the existing `Cats Runtime`
      item.
- [ ] Task 3.2: Freeze the new entry label as a working copy only. `Environment`
      is acceptable for the first slice, but should not be treated as
      permanently ratified product wording yet.
- [ ] Task 3.3: Route the new recovery item into the most relevant existing
      repair surface rather than a new dedicated page.
- [ ] Task 3.4: Ensure the new entry is reachable from Lobby and all product
      sidebars through the shared menu.
- [ ] Task 3.5: Add targeted tests for menu contents and recovery-entry
      behavior.

**Deliverables**: a shallow in-product recovery entry no longer buried in
settings and no mandatory new recovery surface in the first slice

### Phase 3: Connect Desktop Repair Only When Relevant

- [ ] Task 4.1: Reuse the existing desktop host bridge only for the minimum
      recovery-entry needs:
      current desktop host/setup state and packaged-setup entry/resume actions.
- [ ] Task 4.2: Keep packaged setup conditional on relevant desktop host state
      instead of showing desktop repair controls all the time.
- [ ] Task 4.3: Preserve graceful degradation when the desktop host bridge is
      unavailable.
- [ ] Task 4.4: Add targeted tests for desktop vs non-desktop recovery-entry
      behavior.

**Deliverables**: desktop packaged setup becomes an available repair lane,
without dominating the product-owned recovery entry

### Phase 4: Optional Lightweight Resolver Follow-Up

- [ ] Task 5.1: Only if direct routing proves insufficient, add one lightweight
      resolver surface that stays bounded to status, impact, and next-step
      routing.
- [ ] Task 5.2: If this optional resolver lands, keep it lighter than Settings
      and lighter than the desktop bootstrap page.
- [ ] Task 5.3: If this optional resolver lands, ensure it still routes users
      into existing repair surfaces rather than becoming a second dashboard.

**Deliverables**: optional follow-up only; no new recovery surface unless
phase-2 usability shows it is actually needed

### Phase 5: Tighten Docs and Verification

- [ ] Task 6.1: Update user-facing docs that currently imply runtime recovery is
      mainly a bootstrap-page or settings-only story.
- [ ] Task 6.2: Update tests covering account menu contents, Lobby avatar
      status, and product sidebar status surfaces.
- [ ] Task 6.3: Validate that post-setup runtime problems still do not route the
      user back through onboarding.

**Deliverables**: implementation-ready docs plus bounded verification coverage

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/design/components/AccountIdentityMenu.tsx` | Modify | Add the new `Environment` menu item and preserve the existing `Cats Runtime` entry |
| `src/app/renderer/PlatformLobby.tsx` | Modify | Consume the shared runtime presentation model for the lobby avatar status |
| `src/products/chat/renderer/components/Sidebar.tsx` | Modify | Replace local runtime-footer copy logic with the shared model |
| `src/products/work/renderer/components/Sidebar.tsx` | Modify | Replace local runtime-footer copy logic with the shared model |
| `src/products/code/renderer/components/Sidebar.tsx` | Modify | Replace local runtime-footer copy logic with the shared model |
| `src/shared/runtimeStatusPresentation.ts` | Create | Shared state + tooltip/copy mapping for runtime lamps and recovery-entry routing hints |
| `tests/platform-lobby-account-menu.test.tsx` | Modify | Cover the new account-menu entry and status copy |
| `src/app/renderer/App.tsx` | Modify (Optional) | Only if an optional lightweight resolver surface is later added |
| `src/app/renderer/environment/PlatformEnvironmentResolver.tsx` | Create (Optional) | Lightweight product-owned resolver surface if direct routing proves insufficient |
| `src/app/renderer/routeMap.ts` | Modify (Optional) | Only if a dedicated resolver route or surface is later added |
| `tests/platform-routing.test.js` or dedicated resolver tests | Modify/Create (Optional) | Only if an optional resolver surface is later added |
| `tests/desktop-setup-bridge.test.js` or targeted desktop tests | Modify | Verify desktop-host fallback and packaged-setup gating |

## Technical Decisions

- Decision 1: No new ADR is required for the first slice because accepted
  runtime/host/platform ownership boundaries remain unchanged.
- Decision 2: `Cats Runtime` remains the primary deep runtime repair surface;
  `cats-platform` only adds a shallow recovery entry in the first slice.
- Decision 3: Desktop packaged setup remains supplementary and should appear
  only when host-owned repair state makes it relevant.
- Decision 4: The first slice prefers direct routing into existing repair
  surfaces over creating a new dedicated recovery page.
- Decision 5: The `Environment` entry is always visible after setup so the IA
  does not change based on current health.
- Decision 6: `Environment` is a working label for now, not a permanently
  frozen product term.

## Testing Strategy

- **Unit Tests**: shared runtime status mapping, tooltip copy selection, account
  menu state, recovery-entry action selection
- **Integration Tests**: post-setup recovery navigation, desktop-host bridge
  presence/absence handling, and optional resolver routing if phase 4 lands
- **Manual Testing**:
  - verify Lobby and sidebar avatar lamps show the same copy
  - verify the account menu shows `Settings`, `Cats Runtime`, and `Environment`
  - verify `Environment` routes to the appropriate existing repair surface
  - if phase 4 lands, verify the lightweight resolver stays calm and bounded
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

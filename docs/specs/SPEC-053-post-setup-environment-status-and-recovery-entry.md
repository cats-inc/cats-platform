# SPEC-053: Post-Setup Environment Status and Recovery Entry

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | User |
| **Reviewer** | Codex |

## Summary

Once platform setup is complete, users should not need to quit and relaunch Cats
just to understand or start recovering from environment problems.

This spec defines a narrow post-setup IA for environment awareness and recovery:

- keep current runtime state visible from the account-avatar surfaces that users
  already see in Lobby and product sidebars
- keep the existing `Cats Runtime` menu entry as the deep runtime dashboard and
  setup surface
- add one neutral `Environment` entry in the account menu so recovery is not
  buried under `Settings > Runtime`
- keep `cats-platform` thin by using that new surface as a lightweight resolver,
  not as a second full diagnostics dashboard
- surface desktop packaged setup only as an additional repair lane when host
  state says it is relevant

The goal is to reduce friction and panic at the same time:
users can always see whether Cats Runtime is healthy, can always find a recovery
entry from the avatar menu, and are still routed to the correct deep repair
surface instead of being forced through onboarding again.

## Goals

- make Cats Runtime status visible from the account-avatar affordances users
  already use
- give post-setup users a shallow recovery entry that does not require
  `Settings > Runtime`
- preserve `Cats Runtime` dashboard/setup as the primary deep runtime repair
  surface
- preserve Electron packaged setup as the desktop-only repair lane for
  host-owned issues
- keep `cats-platform` from turning into a second host/runtime operations
  console

## Non-Goals

- rebuilding the full Cats Runtime dashboard inside `cats-platform`
- moving service supervision, provider scan/apply ownership, or packaged helper
  execution into `cats-platform`
- making the desktop bootstrap page the default post-setup recovery surface
- exposing raw host logs, chronology, or three-layer diagnostics by default in
  the first user-facing resolver slice
- forcing users back into onboarding when runtime health changes after setup

## User Stories

- As a returning user, I want to notice runtime trouble from the same avatar
  area I already use, so I do not need to hunt through settings.
- As a user, I want a calm `Environment` entry that tells me what to do next,
  so I am not dropped into a scary diagnostics page first.
- As a desktop user, I want host-owned packaged setup to stay available when it
  is actually the right repair tool, so I can fix desktop-specific issues
  without guessing.
- As a product team, I want `cats-platform` to stay lightweight and avoid
  duplicating Cats Runtime or desktop-host dashboards.

## Requirements

### Functional Requirements

1. After setup completes, Cats shall expose current Cats Runtime status from:
   - the product sidebar account-avatar area
   - the Lobby account-avatar area
2. Those account-avatar runtime indicators shall use one shared state model and
   one shared user-facing copy model across Lobby, Chat, Work, and Code.
3. The default user-facing status model shall stay human and low-drama.
   The first slice shall collapse technical runtime states into calm categories
   such as:
   - ready
   - needs attention
   - offline
   - unknown
4. The default tooltip copy for those avatar-adjacent indicators shall be
   plain-language copy, not host/runtime jargon such as `bootstrap`,
   `diagnostics`, or `degraded`.
5. The account-avatar popup menu shall keep the existing `Cats Runtime` entry.
6. The account-avatar popup menu shall add one new neutral recovery entry:
   `Environment`.
7. The `Environment` entry shall always be visible in post-setup account menus.
   It shall not appear only when the system already knows something is wrong.
8. The new `Environment` entry shall open a product-owned lightweight resolver
   surface that is reachable without going through `Settings > Runtime`.
9. The first slice shall use one canonical host-level resolver route:
   `/environment`.
10. The `/environment` surface shall be presented as a route-backed sheet or
    route-backed lightweight panel, not as a full settings page.
11. The lightweight resolver shall show only bounded recovery information:
   - current plain-language status
   - short impact statement
   - one recommended next step
   - optional secondary links
12. The lightweight resolver shall direct users to `Cats Runtime` for deep
    runtime remediation, including the existing runtime dashboard and setup
    surfaces.
13. The lightweight resolver may surface a desktop packaged setup action only
    when the current host state indicates a relevant desktop repair or resumable
    packaged-setup path.
14. Desktop packaged setup shall remain supplementary in the resolver. It shall
    not replace `Cats Runtime` as the primary deep runtime repair surface.
15. Post-setup environment problems shall stay inside product/runtime/desktop
    recovery flows. They shall not route the user back through onboarding as the
    normal recovery story.
16. `Settings > Runtime` may remain as a secondary detail page, but it shall no
    longer be the primary or only post-setup entry point for environment
    recovery.
17. In non-desktop environments where the desktop host bridge is unavailable,
    the resolver shall degrade gracefully and keep only product/runtime-owned
    actions.

### UX Requirements

1. The runtime lamp and tooltip should feel informative, not alarming.
2. The account menu should stay short and familiar.
3. The new `Environment` label should remain neutral; it should not read like a
   crash screen or an admin tool.
4. The lightweight resolver should behave like a receptionist:
   it should route the user to the right place, not become the mechanic.
5. When Cats Runtime is healthy, the resolver should still feel calm and useful,
   not like a page that only exists for failure.
6. The first slice should prefer one primary action at a time instead of
   presenting many competing repair choices.
7. The `/environment` surface should feel lighter than Settings and lighter
   than the desktop bootstrap page, even though it is still route-backed.

## Design Overview

### Information Architecture

```text
Avatar lamp + tooltip
        |
        v
Account menu
  - Settings
  - Cats Runtime
  - Environment
        |
        v
Canonical `/environment` route
  rendered as a route-backed sheet/panel
        |
        v
Lightweight Environment resolver
  - status summary
  - impact
  - recommended next step
  - optional secondary links
        |
        +--> Cats Runtime dashboard/setup
        |
        +--> Desktop packaged setup (only when relevant)
```

### Surface Roles

- Avatar lamp:
  passive awareness only
- Tooltip:
  one-sentence status explanation
- `Cats Runtime` menu item:
  direct deep runtime entry
- `Environment` menu item:
  always-visible calm product-owned resolver entry
- `/environment` route:
  canonical lightweight recovery surface, presented as a sheet/panel instead of
  a settings page
- Desktop packaged setup action:
  desktop-only repair lane for host-owned or resumable packaged setup issues

### Example Status Copy Direction

- Ready:
  `Cats Runtime is ready.`
- Needs attention:
  `Cats Runtime needs attention. Open Environment for next steps.`
- Offline:
  `Cats Runtime is offline. Open Environment for recovery options.`
- Unknown:
  `Cats Runtime status is still loading.`

## Dependencies

- existing Cats Runtime dashboard and setup surfaces
- existing account-avatar menu affordance shared by Lobby and product sidebars
- existing desktop host bridge for packaged setup and desktop-only actions
- current post-setup routing rule from [PLAN-040](../plans/PLAN-040-simplify-setup-wizard-and-decouple-runtime-bootstrap.md)

## Resolved Decisions

- The first slice uses one canonical `/environment` route.
- The `/environment` route is presented as a route-backed sheet or lightweight
  panel, not as a settings page.
- The `Environment` entry is always visible in post-setup account menus so the
  IA remains stable and discoverable even when runtime state is healthy.

## References

- [SPEC-023](./SPEC-023-packaged-setup-wizard-and-provider-installation.md)
- [SPEC-045](./SPEC-045-cross-layer-bootstrap-and-onboarding-diagnostics.md)
- [SPEC-046](./SPEC-046-platform-product-landing-and-installed-apps.md)
- [PLAN-040](../plans/PLAN-040-simplify-setup-wizard-and-decouple-runtime-bootstrap.md)
- [ADR-021](../decisions/021-keep-packaged-setup-and-provider-installation-in-the-host.md)
- [ADR-046](../decisions/046-drive-packaged-setup-through-runtime-bootstrap-apis.md)
- [ADR-047](../decisions/047-separate-bootstrap-diagnostics-by-layer-and-aggregate-in-the-host.md)
- [ADR-052](../decisions/052-use-canonical-platform-settings-routes-inside-product-shells.md)

---

*Created: 2026-04-08*
*Author: Codex*
*Related Plan: [PLAN-043](../plans/PLAN-043-post-setup-environment-status-and-recovery-entry.md)*

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
- add one neutral recovery entry in the account menu so recovery is not buried
  under `Settings > Runtime`
- keep `cats-platform` thin by routing users into existing repair surfaces first
- allow a lightweight product-owned resolver only if direct routing later proves
  insufficient
- surface desktop packaged setup only as an additional repair lane when host
  state says it is relevant

The goal is to reduce friction and panic at the same time:
users can always see whether Cats Runtime is healthy, can always find a recovery
entry from the avatar menu, and are still routed to the correct existing repair
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
- prefer menu-level recovery routing before creating any new recovery surface
- keep `cats-platform` from turning into a second host/runtime operations
  console

## Non-Goals

- rebuilding the full Cats Runtime dashboard inside `cats-platform`
- moving service supervision, provider scan/apply ownership, or packaged helper
  execution into `cats-platform`
- making the desktop bootstrap page the default post-setup recovery surface
- exposing raw host logs, chronology, or three-layer diagnostics by default in
  the first user-facing resolver slice
- requiring a new dedicated recovery page in the first implementation slice
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
6. The account-avatar popup menu shall add one new neutral recovery entry.
   `Environment` is the current working label, not yet frozen public copy.
7. That recovery entry shall always be visible in post-setup account menus.
   It shall not appear only when the system already knows something is wrong.
8. The new recovery entry shall be reachable without going through
   `Settings > Runtime`.
9. The first implementation slice shall prefer direct routing into existing
   repair surfaces over creating a new dedicated recovery surface.
10. The first-slice recovery-entry routing rule shall be:
    - if desktop host state says packaged setup or packaged setup resume is
      currently relevant and recommended, open that packaged setup surface
    - else if the current runtime state indicates setup or remediation is
      needed, open Cats Runtime setup
    - else open Cats Runtime dashboard/root as the default safe destination
11. In environments where the desktop host bridge is unavailable, the recovery
    entry shall omit desktop packaged-setup routing and keep only runtime-owned
    actions.
12. Cats Runtime shall remain the primary deep runtime repair surface.
13. Desktop packaged setup shall remain supplementary. It shall not replace
    Cats Runtime as the primary deep runtime repair surface.
14. Post-setup environment problems shall stay inside product/runtime/desktop
    recovery flows. They shall not route the user back through onboarding as the
    normal recovery story.
15. `Settings > Runtime` may remain as a secondary detail page, but it shall no
    longer be the primary or only post-setup entry point for environment
    recovery.

### UX Requirements

1. The runtime lamp and tooltip should feel informative, not alarming.
2. The account menu should stay short and familiar.
3. The new `Environment` label should remain neutral; it should not read like a
   crash screen or an admin tool.
4. The first slice should prefer one primary action at a time instead of
   presenting many competing repair choices.

## Design Overview

### Information Architecture

```text
Avatar lamp + tooltip
        |
        v
Account menu
  - Settings
  - Cats Runtime
  - Environment (working label)
        |
        v
Preferred first slice:
  direct route to an existing repair surface
        |
        +--> Desktop packaged setup/resume
        |      only when host says it is relevant
        |
        +--> Cats Runtime setup
        |      when runtime needs setup/remediation
        |
        +--> Cats Runtime dashboard/root
               default safe destination
        |
        v
Optional follow-up only if needed:
  lightweight resolver
    - status summary
    - impact
    - recommended next step
    - optional secondary links
```

### Surface Roles

- Avatar lamp:
  passive awareness only
- Tooltip:
  one-sentence status explanation
- `Cats Runtime` menu item:
  direct deep runtime entry
- new recovery menu item:
  always-visible calm product-owned recovery entry
- Desktop packaged setup action:
  desktop-only repair lane for host-owned or resumable packaged setup issues
- lightweight resolver:
  optional follow-up only if direct routing proves insufficient

### Recovery Entry Routing Rules

- Use desktop packaged setup or packaged setup resume only when current desktop
  host state explicitly marks it as the relevant next step.
- Otherwise, use Cats Runtime setup when current runtime state says setup or
  remediation is needed.
- Otherwise, use Cats Runtime dashboard/root as the default safe destination.
- In non-desktop contexts, skip desktop packaged-setup routing entirely.

### Example Status Copy Direction

- Ready:
  `Cats Runtime is ready.`
- Needs attention:
  `Cats Runtime needs attention. Open Environment for next steps.`
- Offline:
  `Cats Runtime is offline. Open Environment for recovery options.`
- Unknown:
  `Cats Runtime status is still loading.`

## Optional Follow-Up Guardrails

- If direct routing later proves insufficient, the product may add one
  lightweight resolver surface.
- Any lightweight resolver added later should stay bounded to:
  - current plain-language status
  - short impact statement
  - one recommended next step
  - optional secondary links
- Any lightweight resolver added later should behave like a receptionist:
  it routes the user to the right place, rather than becoming the mechanic.
- Any lightweight resolver added later should still feel calm and useful when
  Cats Runtime is healthy, not like a page that only exists for failure.
- Any lightweight resolver added later should feel lighter than Settings and
  lighter than the desktop bootstrap page.
- Any lightweight resolver added later shall not become a second full
  diagnostics dashboard or operations console.

## Dependencies

- existing Cats Runtime dashboard and setup surfaces
- existing account-avatar menu affordance shared by Lobby and product sidebars
- existing desktop host bridge for packaged setup and desktop-only actions
- current post-setup routing rule from [PLAN-040](../plans/PLAN-040-simplify-setup-wizard-and-decouple-runtime-bootstrap.md)

## Resolved Decisions

- The post-setup recovery entry stays in the account menu and remains always
  visible so the IA stays stable and discoverable even when runtime state is
  healthy.
- The first slice prefers direct routing into existing repair surfaces instead
  of requiring a new dedicated recovery page.
- `Environment` is a working label for now, not yet frozen copy.
- A lightweight resolver is allowed as a later bounded follow-up if direct
  routing proves insufficient.

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

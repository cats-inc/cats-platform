# SPEC-093: Settings Runtime CLI Provider Lifecycle

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | User / Settings Runtime workstream |
| **Reviewer** | User |

## Summary

`Settings > Runtime` already shows a CLI/provider list, but the list is mostly
diagnostic today. The next slice should make that existing list useful by
turning it into the provider lifecycle control surface for desktop users:
check, install, upgrade, repair, uninstall, and rescan local CLI providers from
the existing Electron packaged setup bridge.

The feature remains a Runtime settings feature. The Electron desktop host is
only the privileged execution boundary for allowlisted packaged helpers.
Non-Electron clients keep the current read-only provider/runtime status list and
runtime setup links.

This spec intentionally does not change the pre-`/setup` bootstrap flow. One
practical goal is to make it easy to create a zero-CLI environment from the app
so bootstrap behavior can be retested honestly.

## Current Baseline

- `Settings > Runtime` shows runtime status and CLI/provider readiness, but the
  list does not expose meaningful lifecycle actions.
- The Electron host already exposes a bounded packaged setup bridge through
  `window.catsDesktopHost.getSetupSnapshot()` and
  `window.catsDesktopHost.runSetupHelper(helperId, mode)`.
- Packaged setup helper modes currently cover `check`, `apply`, `upgrade`, and
  `force`.
- The host already owns helper allowlisting, script path resolution,
  structured JSON result parsing, action history, resumable setup state, and
  bootstrap-page recovery.
- There is no uninstall mode or uninstall helper contract today.

## Goals

1. Reuse the current `Settings > Runtime` CLI/provider list as the primary
   provider lifecycle UI.
2. Add Electron-only lifecycle buttons for packaged setup helpers:
   `Check`, `Install`, `Upgrade`, `Repair`, `Uninstall`, and `Rescan`.
3. Keep non-Electron/browser clients read-only, preserving the current list and
   runtime setup links without shell execution controls.
4. Keep all process execution in the desktop host through allowlisted packaged
   helpers; the renderer must never run arbitrary commands or scripts.
5. Add uninstall helper support so developers can create a zero-CLI environment
   for bootstrap/onboarding regression testing.
6. Refresh runtime/provider diagnostics immediately after lifecycle actions so
   Settings and bootstrap see the same provider truth.

## Non-Goals

- Moving provider lifecycle controls into `Settings > Desktop` as the primary
  entry point.
- Reintroducing provider install into first-run `/setup` in this slice.
- Changing the pre-`/setup` Electron bootstrap navigation policy.
- Letting web/non-Electron clients install or uninstall local CLIs.
- Exposing a generic script runner or accepting arbitrary script paths from the
  renderer.
- Making `cats-runtime` the owner of OS-level package installation or removal.
- Guaranteeing removal of every externally installed CLI on the first pass.

## User Stories

- As a desktop user, I want the runtime provider list to show what I can do next
  for each provider, not only whether it is currently usable.
- As a desktop user, I want to install or upgrade a local CLI provider from
  Settings without reading setup docs.
- As a developer, I want to uninstall recognized CLI providers from Settings so
  I can retest the first-run zero-CLI bootstrap path.
- As a browser user, I want Settings to remain safe and informative even though
  my client cannot run local setup helpers.

## Requirements

### Functional Requirements

1. `Settings > Runtime` shall continue to render the existing provider/CLI list
   for all clients.
2. Electron clients shall enrich each provider row/card with desktop-host setup
   capability when `window.catsDesktopHost` is available.
3. Non-Electron clients shall not show install, upgrade, repair, or uninstall
   buttons. They may show runtime setup links and read-only status text.
4. Provider lifecycle buttons shall be derived from host-reported helper
   metadata, not hard-coded renderer assumptions.
5. The renderer shall call only `runSetupHelper(helperId, mode)` with helper IDs
   returned by the host setup snapshot.
6. The setup helper contract shall add an `uninstall` mode.
7. Helper summaries shall expose `supportsUninstall` so the renderer can hide
   uninstall where no helper supports it.
8. Uninstall helpers shall use the same structured JSON result contract as
   check/apply/upgrade helpers.
9. After any install, upgrade, repair, force, or uninstall action, Settings
   shall force-refresh provider registry and model catalog state.
10. Runtime diagnostics shall be reloaded after lifecycle actions so provider
    cards do not keep stale "ready" state after uninstall.
11. Lifecycle action feedback shall use Settings toast behavior, not inline
    success/error strings.
12. The last packaged setup action shall remain visible through the existing
    desktop host setup state/history path.

### Uninstall Requirements

1. Uninstall shall be explicit and gated behind confirmation.
2. Confirmation copy shall list the provider/helper being removed and state that
   active sessions using that provider may fail until another provider is
   configured.
3. The first implementation may support "recognized local CLI removal" rather
   than only "Cats-managed install removal", because the development need is to
   create a zero-CLI machine state.
4. When a helper can distinguish Cats-managed installs from external installs,
   the UI shall label that distinction.
5. When ownership is ambiguous, uninstall shall be presented as an advanced
   action, not as the primary row action.
6. Uninstall shall not remove user authentication files, shell profiles, global
   package manager configuration, or unrelated dependencies unless the helper
   explicitly reports those removals and the confirmation copy names them.
7. Uninstall shall be idempotent: running it when the CLI is absent shall return
   a successful `not_installed` or equivalent no-op status.

### Host Contract Requirements

1. `DESKTOP_SETUP_HELPER_MODES` shall include `uninstall`.
2. `DesktopSetupHelperSummary` shall include `supportsUninstall`.
3. `runDesktopSetupHelper` shall reject `uninstall` unless the helper advertises
   support for it.
4. Windows helpers shall receive an uninstall flag such as `-Uninstall`.
5. macOS/Linux helpers shall receive an uninstall flag such as `--uninstall`.
6. The bridge shall keep the same allowlisted asset lookup, packaging path
   resolution, JSON parsing, and action persistence behavior for uninstall.
7. `resume_setup` should not automatically resume uninstall unless the helper
   reports a resumable interruption and the UI is explicit about continuing a
   removal action.

### Script Contract Requirements

Uninstall-capable scripts shall emit JSON compatible with
`DesktopSetupActionRecord` parsing. Recommended fields:

```json
{
  "status": "uninstalled",
  "summary": "Claude Code CLI was removed.",
  "plannedActions": ["claude_code:uninstall"],
  "appliedChanges": ["removed npm package @anthropic-ai/claude-code"],
  "manualSteps": [],
  "warnings": []
}
```

Accepted uninstall-oriented statuses should include:

- `uninstalled`
- `not_installed`
- `changes_required`
- `auth_required`
- `restart_required`
- `failed`

Scripts should avoid silent broad cleanup. If a helper removes PATH entries,
package manager shims, model data, background services, or config files, those
changes must be present in `plannedActions`, `appliedChanges`, `warnings`, or
`manualSteps`.

### UI Requirements

1. The existing Runtime provider/CLI list shall become actionable on Electron.
2. Primary row action should be the safest next step:
   - `Install` when no recognized CLI is present and helper supports apply.
   - `Upgrade` when installed but outdated and helper supports upgrade.
   - `Repair` when diagnostics report fixable degraded state.
   - `Check` or `Rescan` when no direct mutation is needed.
3. `Uninstall` shall appear as a secondary or advanced/danger action.
4. Rows shall show enough context to explain why a button is present:
   current availability, helper availability, last action status, and whether
   the action is desktop-only.
5. Settings shall not duplicate the desktop bootstrap recovery UI. It may link
   to Desktop diagnostics/history for logs.
6. Settings shall not put provider lifecycle controls in `Settings > Desktop`
   as the main path. `Settings > Desktop` may link back to Runtime.

## Design Overview

The feature is an enrichment of the existing Settings Runtime list:

```text
Settings > Runtime
  Provider/CLI row
    runtime diagnostics from cats-runtime
    helper capabilities from Electron host setup snapshot
    actions:
      check/apply/upgrade/force/uninstall through desktop host only
    after action:
      refresh host setup snapshot
      force-refresh /api/providers
      refresh runtime setup summary
      refresh model catalogs where applicable
```

Ownership stays split:

- Renderer: display state, pick allowed action, request host action, show toast.
- Desktop host: allowlist helper, resolve packaged script, execute process,
  parse structured result, persist action state.
- `cats-runtime`: provider diagnostics, provider config, model catalogs, runtime
  setup state.
- Scripts: OS-specific install/upgrade/uninstall logic.

## Dependencies

- [SPEC-023: Packaged Setup Wizard and Provider Installation](./SPEC-023-packaged-setup-wizard-and-provider-installation.md)
- [SPEC-053: Post-Setup Environment Status and Recovery Entry](./SPEC-053-post-setup-environment-status-and-recovery-entry.md)
- [SPEC-073: Settings UI Composition Layer](./SPEC-073-settings-composition-layer.md)
- [ADR-021: Keep Packaged Setup and Provider Installation in the Host](../decisions/021-keep-packaged-setup-and-provider-installation-in-the-host.md)
- Existing Electron host setup bridge in `desktop/host/setupBridge.ts`
- Existing runtime/provider APIs under `/api/providers` and `/runtime/api`

## Acceptance Criteria

- In Electron, at least one provider row in `Settings > Runtime` can run a
  packaged helper action through `window.catsDesktopHost`.
- In Electron, uninstall-capable helpers show an advanced uninstall affordance
  and require confirmation.
- In a browser/non-Electron session, Settings Runtime remains read-only and does
  not expose local mutation buttons.
- After uninstalling all supported local CLI providers, forced provider refresh
  reports zero usable CLI targets when no API/local model fallback is
  configured.
- Restarting Electron after that zero-CLI state still reaches the expected
  pre-`/setup` bootstrap phase for first-run setup instead of a fatal startup
  failure.

## Open Questions

- [ ] Should the first uninstall helpers remove only CLI binaries/packages, or
      also remove provider-specific Cats config entries?
- [ ] Which providers must support uninstall in the first implementation slice:
      Claude, Codex/OpenAI CLI, Gemini, Goose, Junie, Kiro, Cursor, Ollama?
- [ ] Should there be one bulk "Remove local CLI providers for testing" action,
      or only per-provider uninstall buttons in the first slice?
- [ ] Should helper install receipts be added before broad external uninstall
      support, or can receipt support follow after the zero-CLI testing need?

## References

- [Related Plan: PLAN-082](../plans/PLAN-082-settings-runtime-cli-provider-lifecycle-rollout.md)
- [PLAN-030: Packaged Setup Wizard and Provider Installation](../plans/PLAN-030-packaged-setup-wizard-and-provider-installation.md)
- [PLAN-043: Post-Setup Environment Status and Recovery Entry](../plans/PLAN-043-post-setup-environment-status-and-recovery-entry.md)
- [PLAN-065: Settings Composition Layer Rollout](../plans/PLAN-065-settings-composition-layer-rollout.md)

---

*Created: 2026-04-29*
*Author: Codex*

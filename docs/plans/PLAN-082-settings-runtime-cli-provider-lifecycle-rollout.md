# PLAN-082: Settings Runtime CLI Provider Lifecycle Rollout

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | User / Settings Runtime workstream |
| **Assigned To** | Unassigned |
| **Reviewer** | User |

## Related Spec

[SPEC-093: Settings Runtime CLI Provider Lifecycle](../specs/SPEC-093-settings-runtime-cli-provider-lifecycle.md)

## Overview

This plan turns the current `Settings > Runtime` CLI/provider list into the
desktop provider lifecycle surface. The implementation should reuse the current
list and progressively enrich it when the Electron desktop host bridge is
available.

The high-level rule is:

- Runtime settings owns provider lifecycle UI.
- Desktop host owns packaged helper execution.
- `cats-runtime` owns provider diagnostics and model catalog truth.
- Non-Electron clients stay read-only.
- Normal uninstall may remove recognized local CLI installs regardless of
  whether Cats installed them, as long as the confirmation dialog names the
  target.

## Implementation Phases

### Phase 1: Map Runtime Providers to Desktop Helpers

- [ ] Inventory current Runtime settings data sources:
      runtime setup summary, provider registry, provider diagnostics, model
      catalog refresh, and desktop setup snapshot.
- [ ] Add a small renderer-side mapping layer that joins provider rows to
      host helper summaries by provider/helper metadata.
- [ ] Keep the current provider list rendering for non-Electron clients.
- [ ] Add an Electron capability gate based on `window.catsDesktopHost`.
- [ ] Show helper availability and last action state without adding mutation
      buttons yet.

**Deliverables**: Runtime settings can tell which provider rows have desktop
helper support and can render desktop-only capability metadata.

### Phase 2: Add Install, Upgrade, Repair, Check, and Rescan Actions

- [ ] Add row-level actions derived from helper capabilities and map user labels
      to concrete behavior:
      - `Check` -> helper mode `check`
      - `Install` -> helper mode `apply`
      - `Upgrade` -> helper mode `upgrade`
      - `Repair` -> helper mode `force`
      - `Rescan` -> no helper; refresh desktop setup snapshot, runtime setup
        summary, provider registry, and affected catalogs
- [ ] Ensure the renderer only sends helper IDs returned by
      `getSetupSnapshot()`.
- [ ] Use Settings toast feedback for action success and failure.
- [ ] Disable row actions while an action for that helper is running.
- [ ] After each action, refresh:
      - desktop setup snapshot
      - runtime setup summary
      - provider registry with force
      - affected provider model catalogs
- [ ] Keep Desktop settings limited to host status/history and an optional link
      back to Runtime provider management.

**Deliverables**: Electron users can check/install/upgrade/repair providers and
rescan provider state from Settings Runtime. Browser users still see read-only
runtime status.

### Phase 3: Extend the Desktop Setup Contract for Uninstall

- [ ] Add `uninstall` to `DESKTOP_SETUP_HELPER_MODES`.
- [ ] Add `supportsUninstall` to `DesktopSetupHelperSummary`.
- [ ] Update setup asset metadata for helpers that can support uninstall.
- [ ] Update mode flag translation in `desktop/host/setupBridge.ts` `modeFlag()`:
      - Windows: `-Uninstall`
      - macOS/Linux: `--uninstall`
- [ ] Update `supportsMode` and bridge validation so unsupported uninstall
      requests are rejected before process launch.
- [ ] Confirm action persistence, bootstrap event recording, and setup snapshot
      serialization handle uninstall mode without special casing.
- [ ] Implement the resume policy from the spec: `resume_setup` does not
      automatically resume uninstall or bulk uninstall; continuing a removal
      action requires explicit Settings Runtime copy.

**Deliverables**: The desktop host can safely invoke allowlisted uninstall
helpers with the same structured result path as existing setup actions.

### Phase 4: Make Cross-Platform Setup Assets Explicit

- [ ] Confirm the current packaged setup-assets baseline and document which
      platforms are actually staged today.
- [ ] Create or wire `desktop/setup-assets/macos/` and
      `desktop/setup-assets/linux/` before listing them as implementation
      targets.
- [ ] Extend `desktop/host/setupAssets.ts` so macOS/Linux helpers are enumerated
      as first-class packaged setup assets, not implied filesystem paths.
- [ ] Update the desktop packaging/staging script that writes
      `shared/setup-assets/manifest.json` so macOS/Linux helper assets are
      copied and manifest entries are emitted.
- [ ] Add packaging validation that fails when a helper summary references a
      missing packaged asset.

**Deliverables**: Windows, macOS, and Linux setup helper asset paths are real
packaging inputs with manifest coverage.

### Phase 5: Add Uninstall Scripts

- [ ] Add uninstall support to Windows helpers for the first target providers.
- [ ] Add uninstall support to macOS/Linux helpers for the first target
      providers.
- [ ] Make uninstall idempotent: absent CLI returns success with
      `status: "not_installed"`.
- [ ] Ensure scripts report planned and applied changes in JSON.
- [ ] Support removing recognized local CLI installs regardless of origin:
      Cats-managed, package-manager detected, PATH detected, or unknown.
- [ ] Return a structured preview/planned action list that names the package,
      executable, shim, or Cats-owned config entry before the UI asks for
      confirmation.
- [ ] Do not remove auth files, shell profiles, external user config, API keys,
      or model data in normal uninstall.
- [ ] Use uninstall statuses `uninstalled`, `not_installed`,
      `changes_required`, `blocked`, and `failed`; do not use install-only
      statuses such as `auth_required`.
- [ ] Add script-level tests or confirmation-preview checks where each helper
      already has test coverage.

**Suggested first provider order**:

1. Claude Code / npm-style CLI helper
2. Codex/OpenAI CLI or Node CLI pack helper, if present in the packaged assets
3. Goose
4. Cursor Agent
5. Junie / Kiro
6. Ollama as a separate local model/runtime case

**Deliverables**: Supported providers can be removed from an Electron desktop
install through packaged helper scripts.

### Phase 6: Add Runtime Settings Uninstall and Bulk Uninstall UX

- [ ] Add an advanced/danger affordance for uninstall on supported provider rows.
- [ ] Require confirmation before uninstall.
- [ ] Confirmation copy must name the provider and explain active sessions may
      fail until another provider is configured.
- [ ] Show `Cats-managed`, `Package-manager detected`, `PATH detected`, or
      `Unknown install source` when helper metadata can identify the source.
- [ ] Add a required bulk "Uninstall local CLI providers" action for
      zero-provider regression work.
- [ ] The confirmation dialog for per-provider uninstall and bulk uninstall
      must list concrete package names, executable paths, shim paths,
      Cats-owned config keys, and blockers returned by the helper.
- [ ] Require explicit confirmation against that listed target set before
      uninstall or bulk uninstall executes.
- [ ] After uninstall, force-refresh runtime/provider state and show a toast
      summarizing the resulting provider count.

**Deliverables**: Electron users can remove supported local CLI providers from
Settings Runtime. Developers can create a zero-provider test state from a
test machine through confirmation-gated bulk uninstall.

### Phase 7: Verify Zero-Provider Bootstrap and Degradation Behavior

- [ ] Use Settings Runtime bulk uninstall to remove supported local provider
      paths from a test machine after reviewing the confirmation target list.
- [ ] Force-refresh provider registry and confirm no usable provider targets
      remain, or record blockers for unmanaged API/local-model fallbacks.
- [ ] Add or update a state-machine test for setup-incomplete plus zero-provider
      diagnostics: the expected phase is `ready_for_setup`, with provider-path
      setup copy.
- [ ] Add or update a state-machine test for setup-complete plus zero-provider
      diagnostics: the expected phase is `needs_prerequisites`, with `Open Cats`
      still offered as the forward path.
- [ ] Complete product setup without Guide Cat and confirm Cats can still open.
- [ ] Optionally enable Guide Cat and confirm the product points the user to
      Runtime setup when no usable provider exists.
- [ ] Record findings in the relevant bootstrap/onboarding plan if behavior
      differs from the expected path.

**Deliverables**: The zero-provider test state is reproducible from the app, and
the tests cover the bootstrap states that can actually change.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/app/renderer/settings/PlatformSettingsRuntime.tsx` | Modify | Reuse provider list and add Electron-only lifecycle actions |
| `src/app/renderer/settings/*` | Modify/Create | Add small helper-to-provider mapping and action state helpers as needed |
| `desktop/host/contracts.ts` | Modify | Add `uninstall` mode and `supportsUninstall` metadata |
| `desktop/host/setupBridge.ts` | Modify | Validate uninstall mode and add `modeFlag()` translation |
| `desktop/host/setupAssets.ts` | Modify | Mark uninstall-capable helper assets and enumerate macOS/Linux assets explicitly |
| `desktop/setup-assets/windows/*.ps1` | Modify | Add provider uninstall support |
| `desktop/setup-assets/macos/*.sh` | Create/Modify | Add packaged macOS helper assets and provider uninstall support |
| `desktop/setup-assets/linux/*.sh` | Create/Modify | Add packaged Linux helper assets and provider uninstall support |
| `scripts/*desktop*` / packaging manifest generator | Modify | Stage macOS/Linux setup assets and validate manifest coverage |
| `tests/*settings-runtime*.test.*` | Create/Modify | Renderer/action mapping and non-Electron gating tests |
| `tests/*setupBridge*.test.*` | Create/Modify | Host uninstall mode and unsupported-mode rejection tests |
| `tests/*packaging*.test.*` | Create/Modify | Missing setup asset / manifest validation tests |
| `docs/setup-guide.md` | Modify | Document Settings Runtime provider lifecycle controls after implementation |
| `docs/deployment.md` | Modify | Document desktop helper ownership and zero-provider regression path after implementation |

## Technical Decisions

- Provider lifecycle controls belong in `Settings > Runtime` because the user is
  managing provider capability, not the Electron host itself.
- `Settings > Desktop` should not duplicate provider lifecycle controls. It may
  expose host diagnostics, packaged helper history, logs, and a link to Runtime.
- The renderer must never construct script paths or arbitrary commands.
- Uninstall support belongs in the same setup helper contract as install and
  upgrade so action history, resumability, and bootstrap diagnostics stay
  coherent.
- Normal uninstall can remove recognized local CLI provider paths regardless of
  install origin after a confirmation dialog names the target.

## Testing Strategy

- **Unit Tests**
  - Helper mode validation accepts `uninstall` only when supported.
  - Provider rows hide mutation actions without `window.catsDesktopHost`.
  - Provider rows expose the correct primary action from runtime/helper state.
  - Uninstall confirmation blocks accidental action execution.
  - `buildDesktopBootstrapSnapshot` covers setup-incomplete zero providers as
    `ready_for_setup`.
  - `buildDesktopBootstrapSnapshot` covers setup-complete zero providers as
    `needs_prerequisites`.

- **Integration Tests**
  - Host setup bridge runs a fake uninstall helper and parses structured JSON.
  - Unsupported uninstall helper requests fail before process launch.
  - Settings action refresh path forces provider registry reload after mutation.
  - Packaging validation fails when a setup asset summary points at a missing
    macOS/Linux helper path.
  - Uninstall confirmation-preview JSON enumerates every path/config key touched
    by per-provider and bulk uninstall execution.

- **Manual Testing**
  - Electron desktop with at least one installed CLI:
    check, upgrade/install if available, uninstall, rescan.
  - Browser/non-Electron session:
    verify no install/upgrade/uninstall buttons appear.
  - Zero-provider regression:
    run bulk uninstall on a test machine, verify provider registry has no usable
    targets or reports unmanaged blockers, then verify the fresh-setup and
    setup-complete state-machine cases.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Uninstall removes user-managed CLI unexpectedly | High | Confirmation names concrete targets before removal |
| Provider list stays stale after uninstall | Medium | Force-refresh registry, setup summary, and affected catalogs after actions |
| Renderer becomes a script runner | High | Only accept helper IDs from host snapshot and keep path resolution in host |
| Desktop and Runtime settings duplicate controls | Medium | Runtime owns lifecycle; Desktop links to Runtime and shows host diagnostics only |
| Zero-provider test accidentally removes unrelated tools | High | Bulk uninstall reports exact targets before confirmation |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-29 | Plan created for handoff to implementation owner. |
| 2026-04-29 | Review follow-up broadened uninstall and clarified mapping, packaging, and zero-provider criteria. |

---

*Created: 2026-04-29*
*Author: Codex*

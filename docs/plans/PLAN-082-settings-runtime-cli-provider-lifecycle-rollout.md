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

### Phase 2: Add Install, Upgrade, Repair, and Check Actions

- [ ] Add row-level actions derived from helper capabilities:
      `check`, `apply`, `upgrade`, and `force`.
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

**Deliverables**: Electron users can check/install/upgrade/repair providers
from Settings Runtime. Browser users still see read-only runtime status.

### Phase 3: Extend the Desktop Setup Contract for Uninstall

- [ ] Add `uninstall` to `DESKTOP_SETUP_HELPER_MODES`.
- [ ] Add `supportsUninstall` to `DesktopSetupHelperSummary`.
- [ ] Update setup asset metadata for helpers that can support uninstall.
- [ ] Update mode flag translation:
      - Windows: `-Uninstall`
      - macOS/Linux: `--uninstall`
- [ ] Update `supportsMode` and bridge validation so unsupported uninstall
      requests are rejected before process launch.
- [ ] Confirm action persistence, bootstrap event recording, and setup snapshot
      serialization handle uninstall mode without special casing.
- [ ] Decide whether `resume_setup` may resume uninstall interruptions or must
      require an explicit Settings action.

**Deliverables**: The desktop host can safely invoke allowlisted uninstall
helpers with the same structured result path as existing setup actions.

### Phase 4: Add Uninstall Scripts

- [ ] Add uninstall support to Windows helpers for the first target providers.
- [ ] Add uninstall support to macOS/Linux helpers for the first target
      providers.
- [ ] Make uninstall idempotent: absent CLI returns success with
      `status: "not_installed"`.
- [ ] Ensure scripts report planned and applied changes in JSON.
- [ ] Avoid removing auth/config/model data unless explicitly planned,
      reported, and confirmed by UI copy.
- [ ] Add script-level tests or dry-run checks where each helper already has
      test coverage.

**Suggested first provider order**:

1. Claude Code / npm-style CLI helper
2. Codex/OpenAI CLI or Node CLI pack helper, if present in the packaged assets
3. Goose
4. Cursor Agent
5. Junie / Kiro
6. Ollama as a separate local model/runtime case

**Deliverables**: Supported providers can be removed from an Electron desktop
install through packaged helper scripts.

### Phase 5: Add Runtime Settings Uninstall UX

- [ ] Add an advanced/danger affordance for uninstall on supported provider rows.
- [ ] Require confirmation before uninstall.
- [ ] Confirmation copy must name the provider and explain active sessions may
      fail until another provider is configured.
- [ ] If helper metadata can distinguish Cats-managed installs from external
      installs, surface that distinction in the row.
- [ ] Add an optional bulk "Remove local CLI providers for testing" action only
      if per-provider uninstall is too slow for bootstrap regression work.
- [ ] After uninstall, force-refresh runtime/provider state and show a toast
      summarizing the resulting provider count.

**Deliverables**: Electron users can remove supported local CLI providers from
Settings Runtime and immediately see updated provider readiness.

### Phase 6: Verify Zero-CLI Bootstrap Behavior

- [ ] Use Settings Runtime uninstall actions to remove all supported local CLI
      providers from a test machine.
- [ ] Force-refresh provider registry and confirm no usable CLI targets remain.
- [ ] Restart Electron with product setup incomplete and confirm bootstrap
      reaches `ready_for_setup`, not `needs_prerequisites` or `failed`.
- [ ] Complete product setup without Guide Cat and confirm Cats can still open.
- [ ] Optionally enable Guide Cat and confirm the product points the user to
      Runtime setup when no usable provider exists.
- [ ] Record findings in the relevant bootstrap/onboarding plan if behavior
      differs from the expected path.

**Deliverables**: The zero-CLI state is reproducible from the app and can be
used for bootstrap regression testing.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/app/renderer/settings/PlatformSettingsRuntime.tsx` | Modify | Reuse provider list and add Electron-only lifecycle actions |
| `src/app/renderer/settings/*` | Modify/Create | Add small helper-to-provider mapping and action state helpers as needed |
| `desktop/host/contracts.ts` | Modify | Add `uninstall` mode and `supportsUninstall` metadata |
| `desktop/host/setupBridge.ts` | Modify | Validate and execute uninstall mode through allowlisted helpers |
| `desktop/host/setupAssets.ts` | Modify | Mark uninstall-capable helper assets |
| `desktop/setup-assets/windows/*.ps1` | Modify | Add provider uninstall support |
| `desktop/setup-assets/macos/*.sh` | Modify | Add provider uninstall support |
| `desktop/setup-assets/linux/*.sh` | Modify | Add provider uninstall support |
| `tests/*settings-runtime*.test.*` | Create/Modify | Renderer/action mapping and non-Electron gating tests |
| `tests/*setupBridge*.test.*` | Create/Modify | Host uninstall mode and unsupported-mode rejection tests |
| `docs/setup-guide.md` | Modify | Document Settings Runtime provider lifecycle controls after implementation |
| `docs/deployment.md` | Modify | Document desktop helper ownership and zero-CLI regression path after implementation |

## Technical Decisions

- Provider lifecycle controls belong in `Settings > Runtime` because the user is
  managing provider capability, not the Electron host itself.
- `Settings > Desktop` should not duplicate provider lifecycle controls. It may
  expose host diagnostics, packaged helper history, logs, and a link to Runtime.
- The renderer must never construct script paths or arbitrary commands.
- Uninstall support belongs in the same setup helper contract as install and
  upgrade so action history, resumability, and bootstrap diagnostics stay
  coherent.
- Uninstall should start as an advanced action because ownership can be
  ambiguous when a CLI was installed outside Cats.

## Testing Strategy

- **Unit Tests**
  - Helper mode validation accepts `uninstall` only when supported.
  - Provider rows hide mutation actions without `window.catsDesktopHost`.
  - Provider rows expose the correct primary action from runtime/helper state.
  - Uninstall confirmation blocks accidental action execution.

- **Integration Tests**
  - Host setup bridge runs a fake uninstall helper and parses structured JSON.
  - Unsupported uninstall helper requests fail before process launch.
  - Settings action refresh path forces provider registry reload after mutation.

- **Manual Testing**
  - Electron desktop with at least one installed CLI:
    check, upgrade/install if available, uninstall, rescan.
  - Browser/non-Electron session:
    verify no install/upgrade/uninstall buttons appear.
  - Zero-CLI regression:
    uninstall all supported local CLIs, restart Electron with setup incomplete,
    verify bootstrap reaches `ready_for_setup`.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Uninstall removes user-managed CLI unexpectedly | High | Gate as advanced, require confirmation, report exact planned changes |
| Provider list stays stale after uninstall | Medium | Force-refresh registry, setup summary, and affected catalogs after actions |
| Renderer becomes a script runner | High | Only accept helper IDs from host snapshot and keep path resolution in host |
| Desktop and Runtime settings duplicate controls | Medium | Runtime owns lifecycle; Desktop links to Runtime and shows host diagnostics only |
| Zero-CLI test accidentally removes unrelated tools | High | Keep helpers provider-scoped and require script JSON to report planned removals |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-29 | Plan created for handoff to implementation owner. |

---

*Created: 2026-04-29*
*Author: Codex*

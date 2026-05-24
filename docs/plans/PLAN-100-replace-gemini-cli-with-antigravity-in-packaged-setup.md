# PLAN-100: Replace Gemini CLI with Antigravity CLI in packaged setup

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | User |
| **Assigned To** | Unassigned |
| **Reviewer** | User |

## Related Spec

[SPEC-110: Antigravity CLI in packaged setup and provider catalog](../specs/SPEC-110-antigravity-cli-in-packaged-setup-and-provider-catalog.md)

## Overview

This plan executes the platform side of the Gemini-to-Antigravity provider swap. It pairs with cats-runtime PLAN-033 and shares one cross-repo handoff point: the shared provider catalog (`src/shared/providerCatalogData.ts`) must land before cats-runtime UI changes mirror the same sentinel or later probe-backed values.

The work moves from the shared catalog outward through installer wrappers, desktop host wiring, readiness/smoke tests, skills sync, shell helpers, and finally docs.

## Coordination With cats-runtime

This plan and cats-runtime PLAN-033 land together as a single coordinated change. The split:

- **Platform owns**: shared provider catalog data, packaged installer scripts (`Install-Antigravity.{ps1,sh}`), desktop host code (`cliInventoryProbe`, `bootstrapPage`, `packaging`, `setupAssets`, `contracts`), Windows readiness check, three-OS packaged-setup smoke tests, skills sync tooling, shell helpers, platform docs.
- **Runtime owns**: provider knowledge, compatibility profiles, ACP profile, session scanner, HTTP routes, dashboard / playground / provider-setup UIs, runtime test fixtures, runtime docs.

Cross-repo blocking points:

- **Platform Phase 1 must land before runtime Phase 4** (runtime UI currently duplicates provider/model data and must mirror the updated catalog values).
- **Probe phase mapping**: PLAN-100 Phase 0 and cats-runtime PLAN-033 Phase 1 are the same shared `agy` probe. Only one team needs to do the probe; the research note lands in `cats-runtime/docs/research/2026-05-24-antigravity-cli-probe.md` and is referenced here.

## Architecture Guardrails

1. Do not retain `gemini` as a provider id, family, or installer-script name anywhere in platform packaging, host wiring, shared catalog, or skills tooling.
2. Do not add an Antigravity API HTTP path — Google API completion is a separate concern owned by runtime.
3. Do not invent `.antigravity/skills/` behavior. If `agy` does not implement a skills directory, drop the Gemini row from skills sync without adding an Antigravity row.
4. Do not extend `_NpmCliInstaller.ps1` / `node-cli-common.sh` with Antigravity-specific paths — Antigravity uses the native-installer flow, not the shared npm-helper flow.
5. Do not edit `cats-runtime/src/http/ui/pages/playground.html` from this plan — runtime PLAN-033 owns that file and must mirror the shared catalog values from here.
6. Preserve the `Claude Code → Antigravity → Cursor Agent` ordering across bootstrap, cliInventoryProbe, packaging, and onboarding lists, matching environment-bootstrap commit `5725e637`.

## Implementation Phases

### Phase 0: Probe `agy` Reality

Goal: replace guesses with facts before touching code. This phase is the same work as cats-runtime PLAN-033 Phase 1; only one team performs the probe.

- [ ] Install `agy` locally via environment-bootstrap `Install-AntigravityCLI.ps1` (Windows) or `install-antigravity-cli.sh` (macOS/Linux).
- [ ] Confirm install paths: PATH, `LOCALAPPDATA`, `~/.local/bin`.
- [ ] Capture `agy --version` and `agy --help` output.
- [x] Identify whether `agy` creates a `.antigravity/skills/` directory or any equivalent skills mechanism. Official docs show plugin-backed skills under `~/.gemini/antigravity-cli/plugins`, but no terminal-managed `gemini skills` equivalent; Cats skills sync therefore drops Gemini without adding an Antigravity row in this migration.
- [x] Identify whether Antigravity exposes the same Gemini-3.x model identifiers (`gemini-3.1-pro-preview`, `gemini-3-flash-preview`, etc.) or renames them. The shared research note records official product documentation for selectable reasoning-model display names, but no live CLI/config/smoke evidence for raw `agy` model ids. Do not treat `agy --help` as sufficient model-id evidence.
- [x] Record the host-facing wrapper flags and the environment-bootstrap installer semantics separately. Cats Desktop emits `-CheckOnly`, `-Apply`, `-Upgrade`, `-Force`, `-Uninstall`, `-Json`, and `-DryRun` on every platform; environment-bootstrap implements refresh by removing the existing `agy` binary before invoking the official Google installer. The shared research note records the split, and the Cats Desktop wrappers port that behavior instead of delegating host action flags verbatim.
- [x] Define default uninstall scope: binary-only and user-scoped removal of `agy` executable/path target, with no auth-token/session/config purge unless a separate explicit purge design is approved.
- [x] Confirm packaged helper metadata values for Antigravity: `requiresElevation` is `false` because the installer remains user-scoped on all supported OSes; `resumable` is `true` because wrapper-level retry re-checks command/path presence and refresh modes remove the binary before invoking the official installer. The evidence is recorded in `cats-runtime/docs/research/2026-05-24-antigravity-cli-probe.md`.
- [x] Document findings in `cats-runtime/docs/research/2026-05-24-antigravity-cli-probe.md` (single shared note across both repos).

**Deliverables**: Research note answering SPEC-110's Open Questions about skills directory, model identifiers, and installer flag translation.

### Phase 1: Shared Provider Catalog

**Cross-repo unblock point**: completing this phase gives cats-runtime PLAN-033 Phase 4 the canonical platform values to mirror.

- [x] In `src/shared/providerCatalogData.ts:4`, replace `'gemini'` in the provider-id array with `'antigravity'`, preserving the same array position.
- [x] In `src/shared/providerCatalogData.ts:37-43`, replace the `gemini:` model-list key with `antigravity:` and use `antigravity-default` as the provider-default sentinel until Phase 0 records executable model-id evidence. If the evidence is official product documentation rather than a live CLI/config/smoke result, keep those values as docs-only display names and do not use them as catalog `value:` strings.
- [x] In `src/shared/providerCatalogData.ts:89`, update the trailing single-entry block that references `gemini 3.1 pro`.
- [x] In `src/shared/providerCatalogData.ts:48,60,72,76,77`, audit the `copilot` / `cursor` / `junie` / `kilo` submodel lists that reference `gemini-*` identifiers or Gemini display names. These are vendor-routed submodels, not the local CLI provider. They remain in their vendor-owned rows and do not move under `antigravity`; the Antigravity row exposes only `antigravity-default` until executable `agy` model values are proven.
- [x] In `src/shared/providerCatalogInstances.ts:16`, replace the `gemini:` default-instance template with `antigravity:` using the new family id and any new default config keys.
- [x] Decide the new `antigravity` badge color. Apply downstream in Phase 3 (desktop bootstrap) and signal to runtime PLAN-033 Phase 4 via the shared catalog if a color field is exposed there.

**Deliverables**: Shared catalog ships `antigravity` as a first-class provider with a working model list; no `gemini` family key remains as a primary provider.

### Phase 2: Installer Wrappers

- [x] Create `scripts/windows/Install-Antigravity.ps1`. Implementation: preserve the packaged helper action surface (`-CheckOnly`, `-Apply`, `-Upgrade`, `-Force`, `-Uninstall`, `-DryRun`, `-Json`, state hints) and use `-HelperId 'windows-antigravity-native-installer' -CommandName 'agy' -DisplayName 'Antigravity CLI'`.
- [x] Apply the same wrapper-to-upstream mapping on all OSes:
  - `-CheckOnly`: wrapper-only probe of `agy` / expected install path; do not invoke the installer.
  - `-Apply`: invoke the official Google installer with no install-mode flag.
  - `-Upgrade`: remove the expected `agy` binary first, then invoke the official installer with no install-mode flag.
  - `-Force`: remove the expected `agy` binary first, then invoke the official installer with no install-mode flag.
  - `-DryRun`: wrapper-only planned-action output; do not mutate the host.
  - `-Uninstall`: wrapper-owned binary-only uninstall; do not invoke the installer.
  - `-Json`: wrapper-owned output shaping; normalize upstream output into the packaged helper JSON contract.
- [x] Create `scripts/macos/install-antigravity.sh`. Implementation: preserve the same canonical host-facing flag surface emitted by `setupBridge.ts` (`-CheckOnly`, `-Apply`, `-Upgrade`, `-Force`, `-Uninstall`, `-DryRun`, `-Json`) and do not publish a separate bash-style lifecycle contract. Parse flags with a custom `while [ $# -gt 0 ]; do case "$1" in ... esac; shift; done` loop, matching the existing `run_npm_cli_provider` style; do not use `getopts`, because it does not handle this single-dash long-flag contract cleanly. Invoke the official Google installer for install / refresh actions and port environment-bootstrap's refresh behavior by deleting `~/.local/bin/agy` before upgrade / force.
- [x] Create `scripts/linux/install-antigravity.sh`. Implementation: mirror macOS with the same official-installer invocation and refresh behavior.
- [x] Implement `-Uninstall` inside the Cats wrappers. Default scope is binary-only: remove `%LOCALAPPDATA%\agy\bin\agy.exe` on Windows and `~/.local/bin/agy` on Unix, clean empty wrapper-owned directories where safe, emit structured warnings for residual auth/session/config data, and do not delete auth tokens or sessions.
- [x] Verify each wrapper's exit-code surface matches the desktop host's expected `runSetupHelper(...)` result shape (structured JSON or stdout convention, per the existing Gemini wrapper).
- [x] Delete `scripts/windows/Install-Gemini.ps1`, `scripts/macos/install-gemini.sh`, `scripts/linux/install-gemini.sh`.

**Deliverables**: Three Antigravity installer wrappers exist; three Gemini installer wrappers are gone.

### Phase 3: Desktop Host

- [x] In `desktop/host/cliInventoryProbe.ts:29,48,67`, replace `gemini` with `antigravity`. Binary name `agy`. Display label `Antigravity`. Native-installer suffix matches the renamed wrapper.
- [x] In `desktop/host/contracts.ts:95`, replace `gemini` with `antigravity` in the provider-id list.
- [x] In `desktop/host/packaging.ts:540-548`:
  - Replace `id: 'gemini'` with `id: 'antigravity'`.
  - Replace `label: 'Gemini CLI'` with `label: 'Antigravity CLI'`.
  - Replace the three asset ids (`windows-gemini-native-installer` → `windows-antigravity-native-installer`, etc.).
  - Replace `currentHome` paths with the new wrapper paths.
- [x] In `desktop/host/setupAssets.ts`, do not insert Antigravity into the shared npm-provider tuples:
  - Remove `['gemini', 'gemini.sh', 'Gemini CLI']` from the macOS/Linux tuple around line 121.
  - Remove `['gemini', 'Install-Gemini.ps1', 'Gemini CLI']` from the Windows npm tuple around line 326.
  - Add explicit standalone Antigravity `provider_installer` registrations for Windows, macOS, and Linux with `sourceRelativePath` / `stageRelativePath` / `packagedRelativePath` pointing at the new wrapper scripts.
  - Use Antigravity-specific notes such as "Installs or upgrades Antigravity CLI as a user-scoped native binary"; do not inherit the tuple notes that mention repo-owned Unix npm helpers or Windows npm-global installs.
  - Set `requiresElevation` and `resumable` from the Phase 0 evidence instead of inheriting tuple defaults.
  - Update the helper-description string at line 543 to remove the Gemini mention. Antigravity does not flow through the shared npm-helper, so it does not belong in that comment list.
- [x] In `desktop/host/bootstrapPage.ts:1651,1665,1837`:
  - Replace `'gemini'` in the provider list with `'antigravity'`. Position it between `claude_code` and `cursor_agent` per the upstream ordering.
  - Replace `gemini: 'Gemini'` with `antigravity: 'Antigravity'` in the display-label map.
  - Replace `'gemini'` in `ONBOARDING_COLLAPSED_PROVIDER_IDS` with `'antigravity'`.

**Deliverables**: Desktop host probes, packages, registers, and bootstraps Antigravity instead of Gemini.

### Phase 4: Readiness Check and Smoke Tests

- [x] In `scripts/windows/Check-WindowsSetupReadiness.ps1:356`, replace the npm-only `gemini` entry with a native `antigravity` entry. Extend the readiness entry schema instead of inventing an npm package value: add `InstallSource = 'npm' | 'native'` (or split npm/native rows), make `PackageName` optional, and add `CommandName` / binary path candidates for native CLIs. Antigravity should probe `agy` and `%LOCALAPPDATA%\agy\bin\agy.exe`; npm installed/outdated checks must not run for it.
- [x] In `scripts/windows/Test-WindowsInstallerSmoke.ps1:147`, replace the `Install-Gemini.ps1` assertion with an `Install-Antigravity.ps1` assertion.
- [x] In `scripts/windows/Test-WindowsInstallerSmoke.ps1:184`, replace the `windows-gemini-native-installer-script` artifact id with `windows-antigravity-native-installer-script`.
- [x] In `scripts/macos/test-macos-package-smoke.sh:52`, replace the `install-gemini.sh` assertion with `install-antigravity.sh`.
- [x] In `scripts/linux/test-linux-package-smoke.sh:52`, replace the `install-gemini.sh` assertion with `install-antigravity.sh`.
- [ ] Run all three smoke tests against a freshly packaged build to confirm they pass.
  - [x] Windows package build passed with `CATS_SKIP_MOBILE=1 npm run desktop:package:windows`.
  - [x] Windows unpacked-package smoke passed with `Test-WindowsInstallerSmoke.ps1 -InstallRoot release\win-unpacked -SkipLaunch`, including bundled `Install-Antigravity.ps1` and `windows-antigravity-native-installer-script` checks.
  - [ ] macOS packaged smoke remains pending on a macOS host.
  - [ ] Linux packaged smoke remains pending on a Linux host.

**Deliverables**: Readiness check and three packaged-setup smoke tests verify Antigravity bundling.

### Phase 5: Skills Sync and Shell Helpers

- [x] In `scripts/windows/Sync-AgentSkills.ps1:16,35,67`:
  - Remove `gemini` from the `--agent` `ValidateSet`.
  - Remove the `gemini` entry from the agent-target map.
  - If Phase 0 confirmed `agy` discovers a `.antigravity/skills/` directory, add an `antigravity` entry. Otherwise leave the agent list without an Antigravity row.
  - Update the function's docstring at line 7 to remove the `.gemini/skills/` mention.
- [x] In `scripts/macos/sync-agent-skills.sh:9,26,69,74`, mirror the Windows changes.
- [x] In `scripts/linux/sync-agent-skills.sh:9,26,69,74`, mirror the Windows changes.
- [x] In `scripts/macos/node-cli-common.sh:322`, remove the `gemini|gemini|@google/gemini-cli|Gemini CLI` catalog row.
- [x] In `scripts/macos/node-cli-common.sh:337`, update the help-text line that enumerates `Codex, Gemini, Copilot, OpenCode, Kilo, Auggie, and Pi` — drop `Gemini`.
- [x] In `scripts/macos/node-cli-common.sh:1080`, update the wrapper-pattern comment to remove `install-gemini.sh`.
- [x] In `scripts/linux/node-cli-common.sh:322,337,1080`, mirror macOS.
- [x] In `scripts/macos/upgrade-cli-tools.sh:43`, remove `install-gemini.sh` from the upgrade-loop script list.
- [x] In `scripts/linux/upgrade-cli-tools.sh:43`, mirror macOS.
- [x] In `scripts/windows/_NpmCliInstaller.ps1:7`, update the comment that enumerates `Codex, Gemini, Copilot, OpenCode, Kilo, Auggie, Pi` — drop `Gemini`.
- [x] In `scripts/windows/_NpmCliInstaller.ps1:526`, update the comment line that mentions `gemini, copilot` as pure-JS CLIs — drop `gemini` (Antigravity is native, not pure-JS).

**Deliverables**: Skills sync and shell helpers no longer reference Gemini; Antigravity is wired only where Phase 0 evidence supports it.

### Phase 6: Docs and Repo Hygiene

- [x] Update `scripts/README.md:147,150,183,213,247,264,285`: replace each Gemini reference with Antigravity equivalent. Add a one-paragraph note in the appropriate section explaining the upstream swap (link to environment-bootstrap commits `b273f63a` and `5725e637`).
- [x] Leave repo-root and subproject `GEMINI.md` files untouched. They are agent-specific instruction files, not Gemini CLI setup files.
- [x] Do not edit `AGENTS.md` / `CODEX.md` for this CLI swap; Gemini mentions in agent-governance sections are justified unless they also describe packaged CLI setup.
- [x] Final grep sweep: `git grep -i gemini` across `cats-platform/` — remaining hits are justified as agent-governance files (`AGENTS.md`, `CODEX.md`, `GEMINI.md` ownership text), historical migration docs/ADRs/specs, vendor-routed submodel labels in `providerCatalogData.ts`, research notes about other providers, or tests that assert `.gemini/skills` no longer appears in skills-sync scripts.

**Deliverables**: No accidental Gemini references; docs reflect the swap.

## Files to Create / Modify

### Create

- `scripts/windows/Install-Antigravity.ps1`
- `scripts/macos/install-antigravity.sh`
- `scripts/linux/install-antigravity.sh`

### Modify

- `src/shared/providerCatalogData.ts`
- `src/shared/providerCatalogInstances.ts`
- `desktop/host/cliInventoryProbe.ts`
- `desktop/host/contracts.ts`
- `desktop/host/packaging.ts`
- `desktop/host/setupAssets.ts`
- `desktop/host/bootstrapPage.ts`
- `scripts/windows/Check-WindowsSetupReadiness.ps1`
- `scripts/windows/Test-WindowsInstallerSmoke.ps1`
- `scripts/windows/Sync-AgentSkills.ps1`
- `scripts/windows/_NpmCliInstaller.ps1`
- `scripts/macos/test-macos-package-smoke.sh`
- `scripts/macos/sync-agent-skills.sh`
- `scripts/macos/node-cli-common.sh`
- `scripts/macos/upgrade-cli-tools.sh`
- `scripts/linux/test-linux-package-smoke.sh`
- `scripts/linux/sync-agent-skills.sh`
- `scripts/linux/node-cli-common.sh`
- `scripts/linux/upgrade-cli-tools.sh`
- `scripts/README.md`

### Delete

- `scripts/windows/Install-Gemini.ps1`
- `scripts/macos/install-gemini.sh`
- `scripts/linux/install-gemini.sh`

## Technical Decisions

- **New provider id is `antigravity` (lowercase) and display label is `Antigravity`**: matches environment-bootstrap installer naming and cats-runtime ADR-032.
- **Wrappers port install knowledge from environment-bootstrap**: Cats Desktop wrappers own the packaged helper lifecycle and JSON/check/dry-run/uninstall surface, invoke Google's official installer directly, and copy environment-bootstrap's refresh semantics. `-Apply` maps to default official install; `-Upgrade` and `-Force` remove the expected `agy` binary before running the official installer.
- **Antigravity does not flow through `_NpmCliInstaller.ps1` / `node-cli-common.sh`**: it is a native installer, not npm-based. Helpers stay in place for other npm CLIs; only the Gemini-specific rows and comments come out.
- **Phase 0 probe gates Phases 1-5**: skills directory, model catalog evidence, and installer flag translation must be known before code lands. Official docs are enough for platform display-name catalog values; raw `agy` model-id claims require later live CLI/config/smoke evidence.
- **Shared catalog is the cross-repo handoff**: runtime PLAN-033 Phase 4 mirrors the finalized values after Phase 1 lands here.

## Testing Strategy

- **Unit tests**: rerun `npm test` for shared catalog consumers after Phase 1.
- **Packaged-setup smoke tests**: run all three OS smoke tests after Phase 4. Windows uses `Test-WindowsInstallerSmoke.ps1`; macOS and Linux use their respective `test-*-package-smoke.sh` scripts.
- **Manual testing**: Build the Electron desktop app, run a fresh setup, confirm:
  - Bootstrap onboarding shows Antigravity in the slot between Claude Code and Cursor Agent.
  - Settings Runtime CLI list shows Antigravity with install / upgrade / repair actions wired.
  - Clicking Install runs the new wrapper and installs `agy`.
  - After install, `agy` is on PATH (Windows) or `~/.local/bin` (macOS/Linux) and the dashboard / playground (after cats-runtime PLAN-033 lands) shows it as available.
- **Cross-repo verification**: After both PLAN-100 and PLAN-033 land, end-to-end smoke from packaged Desktop app to runtime playground.

## Risks & Mitigations

- **Wrapper flag mismatch**: environment-bootstrap installers accept a narrower flag surface than Cats Desktop packaged helpers, and the host emits PowerShell-style flags even for shell helpers. Mitigation: Phase 0 records the real flags and Phase 2 wrappers translate the host lifecycle instead of passing unsupported flags through.
- **Readiness schema mismatch**: `Check-WindowsSetupReadiness.ps1` is currently npm-package oriented. Mitigation: Phase 4 extends the row schema with install source/native command fields instead of hiding Antigravity behind a fake package name.
- **Asset id rename breaks bundled-app build pipeline**: packaging metadata is consumed by the Electron builder. Mitigation: smoke tests catch missing assets immediately after Phase 4.
- **Shared catalog mid-flip drifts from runtime UI**: if cats-runtime UI mirrors values before the platform catalog lands, runtime playground can keep a stale `gemini` list. Mitigation: cross-repo coordination point is called out explicitly in both plans; runtime PLAN-033 Phase 4 has a precondition check.
- **`.antigravity/skills/` assumption is wrong**: if PLAN-100 Phase 5 adds an `antigravity` row to Sync-AgentSkills based on a misread of Phase 0, skills sync writes to a non-existent directory. Mitigation: default to dropping the Gemini row without adding Antigravity unless Phase 0 explicitly confirms a skills directory.
- **Agent-governance files are misclassified as CLI files**: deleting or rewriting `GEMINI.md` / `AGENTS.md` would violate the project file-ownership rules and conflate Gemini-the-agent with Gemini CLI. Mitigation: keep those files out of the migration and justify their remaining Gemini references during the final grep sweep.

## Progress Log

| Date | Update |
|------|--------|
| 2026-05-24 | Plan created alongside ADR-107 and SPEC-110. |
| 2026-05-24 | Implementation progress synced: shared catalog, packaged wrappers, desktop host wiring, readiness/smoke assertions, skills sync, native helper loops, and script docs now use Antigravity. Live `agy --help` / `agy --version` and freshly packaged three-OS smoke runs remain open. |
| 2026-05-24 | Windows package verification passed on this host: `CATS_SKIP_MOBILE=1 npm run desktop:package:windows` produced the NSIS/unpacked package, and `Test-WindowsInstallerSmoke.ps1 -InstallRoot release\win-unpacked -SkipLaunch` validated the bundled Antigravity helper asset and package manifest. macOS/Linux package smokes remain platform-pending. |

---

*Created: 2026-05-24*
*Author: User, with Claude support*

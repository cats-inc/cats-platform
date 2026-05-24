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

This plan executes the platform side of the Gemini-to-Antigravity provider swap. It pairs with cats-runtime PLAN-033 and shares one cross-repo handoff point: the shared provider catalog (`src/shared/providerCatalogData.ts`) must land before cats-runtime UI changes mirror those values or add an explicit generated import.

The work moves from the shared catalog outward through installer wrappers, desktop host wiring, readiness/smoke tests, skills sync, shell helpers, and finally docs.

## Coordination With cats-runtime

This plan and cats-runtime PLAN-033 land together as a single coordinated change. The split:

- **Platform owns**: shared provider catalog data, packaged installer scripts (`Install-Antigravity.{ps1,sh}`), desktop host code (`cliInventoryProbe`, `bootstrapPage`, `packaging`, `setupAssets`, `contracts`), Windows readiness check, three-OS packaged-setup smoke tests, skills sync tooling, shell helpers, platform docs.
- **Runtime owns**: provider knowledge, compatibility profiles, ACP profile, session scanner, HTTP routes, dashboard / playground / provider-setup UIs, runtime test fixtures, runtime docs.

Cross-repo blocking points:

- **Platform Phase 1 must land before runtime Phase 4** (runtime UI currently duplicates provider/model data and must mirror the updated catalog values or wire an explicit import).
- **Probe phase (Phase 0) is shared**: both plans depend on the same probe of `agy` behavior. Only one team needs to do the probe; the research note lands in `cats-runtime/docs/research/2026-05-24-antigravity-cli-probe.md` and is referenced here.

## Architecture Guardrails

1. Do not retain `gemini` as a provider id, family, or installer-script name anywhere in platform packaging, host wiring, shared catalog, or skills tooling.
2. Do not add an Antigravity API HTTP path — Google API completion is a separate concern owned by runtime.
3. Do not invent `.antigravity/skills/` behavior. If `agy` does not implement a skills directory, drop the Gemini row from skills sync without adding an Antigravity row.
4. Do not extend `_NpmCliInstaller.ps1` / `node-cli-common.sh` with Antigravity-specific paths — Antigravity uses the native-installer flow, not the shared npm-helper flow.
5. Do not edit `cats-runtime/src/http/ui/pages/playground.html` from this plan — runtime PLAN-033 owns that file and must either mirror the shared catalog values from here or add an explicit generated import.
6. Preserve the `Claude Code → Antigravity → Cursor Agent` ordering across bootstrap, cliInventoryProbe, packaging, and onboarding lists, matching environment-bootstrap commit `5725e637`.

## Implementation Phases

### Phase 0: Probe `agy` Reality

Goal: replace guesses with facts before touching code. This phase is shared with cats-runtime PLAN-033 Phase 1; only one team performs the probe.

- [ ] Install `agy` locally via environment-bootstrap `Install-AntigravityCLI.ps1` (Windows) or `install-antigravity-cli.sh` (macOS/Linux).
- [ ] Confirm install paths: PATH, `LOCALAPPDATA`, `~/.local/bin`.
- [ ] Capture `agy --version` and `agy --help` output.
- [ ] Identify whether `agy` creates a `.antigravity/skills/` directory or any equivalent skills mechanism.
- [ ] Identify whether Antigravity exposes the same Gemini-3.x model identifiers (`gemini-3.1-pro-preview`, `gemini-3-flash-preview`, etc.) or renames them.
- [ ] Record the environment-bootstrap installer flags: Windows accepts `-Upgrade`, `-Force`, `-NonInteractive`; shell installers accept `-upgrade`, `-force`. Confirm the Cats Desktop wrappers will translate the broader packaged helper contract instead of delegating host action flags verbatim.
- [ ] Document findings in `cats-runtime/docs/research/2026-05-24-antigravity-cli-probe.md` (single shared note across both repos).

**Deliverables**: Research note answering SPEC-110's Open Questions about skills directory, model identifiers, and installer flag translation.

### Phase 1: Shared Provider Catalog

**Cross-repo unblock point**: completing this phase gives cats-runtime PLAN-033 Phase 4 the canonical platform values to mirror or import.

- [ ] In `src/shared/providerCatalogData.ts:4`, replace `'gemini'` in the provider-id array with `'antigravity'`, preserving the same array position.
- [ ] In `src/shared/providerCatalogData.ts:37-43`, replace the `gemini:` model-list key with `antigravity:`. If Phase 0 confirmed Antigravity reuses the same Gemini-3.x model identifiers, keep the `value:` strings unchanged and only update labels if Phase 0 surfaced new ones; if Antigravity uses different ids, replace the value strings per the probe.
- [ ] In `src/shared/providerCatalogData.ts:89`, update the trailing single-entry block that references `gemini 3.1 pro`.
- [ ] In `src/shared/providerCatalogData.ts:48,60,72,76,77`, audit the `copilot` / `cursor` / `openrouter` submodel lists that reference `gemini-*` identifiers. These are vendor-routed submodels (e.g. Copilot's `gemini-3-pro-preview` is Copilot's own routing label, not the CLI provider). Keep entries that the vendor still routes; remove entries the vendor has dropped per latest vendor docs.
- [ ] In `src/shared/providerCatalogInstances.ts:16`, replace the `gemini:` default-instance template with `antigravity:` using the new family id and any new default config keys.
- [ ] Decide the new `antigravity` badge color. Apply downstream in Phase 3 (desktop bootstrap) and signal to runtime PLAN-033 Phase 4 via the shared catalog if a color field is exposed there.

**Deliverables**: Shared catalog ships `antigravity` as a first-class provider with a working model list; no `gemini` family key remains as a primary provider.

### Phase 2: Installer Wrappers

- [ ] Create `scripts/windows/Install-Antigravity.ps1`. Implementation: preserve the packaged helper action surface (`-CheckOnly`, `-Apply`, `-Upgrade`, `-Force`, `-Uninstall`, `-DryRun`, `-Json`, state hints) and call `environment-bootstrap/platform/windows/Install-AntigravityCLI.ps1` only for install / refresh actions. Use `-HelperId 'windows-antigravity-native-installer' -CommandName 'agy' -DisplayName 'Antigravity CLI'`.
- [ ] Create `scripts/macos/install-antigravity.sh`. Implementation: preserve the packaged helper action surface (`--check` / `-CheckOnly`, `-Apply`, `-upgrade`, `-force`, `--uninstall`, `--dry-run`, `--json`) and call `environment-bootstrap/platform/macos/install-antigravity-cli.sh` only for install / refresh actions, translating to its supported `-upgrade` / `-force` flags.
- [ ] Create `scripts/linux/install-antigravity.sh`. Implementation: mirror macOS but call `environment-bootstrap/platform/linux/install-antigravity-cli.sh`.
- [ ] Verify each wrapper's exit-code surface matches the desktop host's expected `runSetupHelper(...)` result shape (structured JSON or stdout convention, per the existing Gemini wrapper).
- [ ] Delete `scripts/windows/Install-Gemini.ps1`, `scripts/macos/install-gemini.sh`, `scripts/linux/install-gemini.sh`.

**Deliverables**: Three Antigravity installer wrappers exist; three Gemini installer wrappers are gone.

### Phase 3: Desktop Host

- [ ] In `desktop/host/cliInventoryProbe.ts:29,48,67`, replace `gemini` with `antigravity`. Binary name `agy`. Display label `Antigravity`. Native-installer suffix matches the renamed wrapper.
- [ ] In `desktop/host/contracts.ts:95`, replace `gemini` with `antigravity` in the provider-id list.
- [ ] In `desktop/host/packaging.ts:540-548`:
  - Replace `id: 'gemini'` with `id: 'antigravity'`.
  - Replace `label: 'Gemini CLI'` with `label: 'Antigravity CLI'`.
  - Replace the three asset ids (`windows-gemini-native-installer` → `windows-antigravity-native-installer`, etc.).
  - Replace `currentHome` paths with the new wrapper paths.
- [ ] In `desktop/host/setupAssets.ts:121,326,543`:
  - Replace `['gemini', 'gemini.sh', 'Gemini CLI']` with `['antigravity', 'antigravity.sh', 'Antigravity CLI']`.
  - Replace `['gemini', 'Install-Gemini.ps1', 'Gemini CLI']` with `['antigravity', 'Install-Antigravity.ps1', 'Antigravity CLI']`.
  - Update the helper-description string at line 543 to remove the Gemini mention. Antigravity does not flow through the shared npm-helper, so it does not belong in that comment list.
- [ ] In `desktop/host/bootstrapPage.ts:1651,1665,1837`:
  - Replace `'gemini'` in the provider list with `'antigravity'`. Position it between `claude_code` and `cursor_agent` per the upstream ordering.
  - Replace `gemini: 'Gemini'` with `antigravity: 'Antigravity'` in the display-label map.
  - Replace `'gemini'` in `ONBOARDING_COLLAPSED_PROVIDER_IDS` with `'antigravity'`.

**Deliverables**: Desktop host probes, packages, registers, and bootstraps Antigravity instead of Gemini.

### Phase 4: Readiness Check and Smoke Tests

- [ ] In `scripts/windows/Check-WindowsSetupReadiness.ps1:356`, replace the `gemini` entry with an `antigravity` entry. Package name is no longer `@google/gemini-cli` (Antigravity is a native binary); use a placeholder string that indicates native-installer source per Phase 0 findings.
- [ ] In `scripts/windows/Test-WindowsInstallerSmoke.ps1:147`, replace the `Install-Gemini.ps1` assertion with an `Install-Antigravity.ps1` assertion.
- [ ] In `scripts/windows/Test-WindowsInstallerSmoke.ps1:184`, replace the `windows-gemini-native-installer-script` artifact id with `windows-antigravity-native-installer-script`.
- [ ] In `scripts/macos/test-macos-package-smoke.sh:52`, replace the `install-gemini.sh` assertion with `install-antigravity.sh`.
- [ ] In `scripts/linux/test-linux-package-smoke.sh:52`, replace the `install-gemini.sh` assertion with `install-antigravity.sh`.
- [ ] Run all three smoke tests against a freshly packaged build to confirm they pass.

**Deliverables**: Readiness check and three packaged-setup smoke tests verify Antigravity bundling.

### Phase 5: Skills Sync and Shell Helpers

- [ ] In `scripts/windows/Sync-AgentSkills.ps1:16,35,67`:
  - Remove `gemini` from the `--agent` `ValidateSet`.
  - Remove the `gemini` entry from the agent-target map.
  - If Phase 0 confirmed `agy` discovers a `.antigravity/skills/` directory, add an `antigravity` entry. Otherwise leave the agent list without an Antigravity row.
  - Update the function's docstring at line 7 to remove the `.gemini/skills/` mention.
- [ ] In `scripts/macos/sync-agent-skills.sh:9,26,69,74`, mirror the Windows changes.
- [ ] In `scripts/linux/sync-agent-skills.sh:9,26,69,74`, mirror the Windows changes.
- [ ] In `scripts/macos/node-cli-common.sh:322`, remove the `gemini|gemini|@google/gemini-cli|Gemini CLI` catalog row.
- [ ] In `scripts/macos/node-cli-common.sh:337`, update the help-text line that enumerates `Codex, Gemini, Copilot, OpenCode, Kilo, Auggie, and Pi` — drop `Gemini`.
- [ ] In `scripts/macos/node-cli-common.sh:1080`, update the wrapper-pattern comment to remove `install-gemini.sh`.
- [ ] In `scripts/linux/node-cli-common.sh:322,337,1080`, mirror macOS.
- [ ] In `scripts/macos/upgrade-cli-tools.sh:43`, remove `install-gemini.sh` from the upgrade-loop script list.
- [ ] In `scripts/linux/upgrade-cli-tools.sh:43`, mirror macOS.
- [ ] In `scripts/windows/_NpmCliInstaller.ps1:7`, update the comment that enumerates `Codex, Gemini, Copilot, OpenCode, Kilo, Auggie, Pi` — drop `Gemini`.
- [ ] In `scripts/windows/_NpmCliInstaller.ps1:526`, update the comment line that mentions `gemini, copilot` as pure-JS CLIs — drop `gemini` (Antigravity is native, not pure-JS).

**Deliverables**: Skills sync and shell helpers no longer reference Gemini; Antigravity is wired only where Phase 0 evidence supports it.

### Phase 6: Docs and Repo Hygiene

- [ ] Update `scripts/README.md:147,150,183,213,247,264,285`: replace each Gemini reference with Antigravity equivalent. Add a one-paragraph note in the appropriate section explaining the upstream swap (link to environment-bootstrap commits `b273f63a` and `5725e637`).
- [ ] Leave repo-root and subproject `GEMINI.md` files untouched. They are agent-specific instruction files, not Gemini CLI setup files.
- [ ] Do not edit `AGENTS.md` / `CODEX.md` for this CLI swap; Gemini mentions in agent-governance sections are justified unless they also describe packaged CLI setup.
- [ ] Final grep sweep: `git grep -i gemini` across `cats-platform/` — every remaining hit must be justified (e.g. vendor-routed submodel labels in `providerCatalogData.ts`, `.gemini/skills` references removed from skills sync, or agent-governance references outside setup code) or removed.

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
- **Wrappers delegate install work to environment-bootstrap**: Cats Desktop wrappers still own the packaged helper lifecycle and JSON/check/dry-run/uninstall surface; environment-bootstrap remains the source of truth for the actual `agy` install / refresh flow.
- **Antigravity does not flow through `_NpmCliInstaller.ps1` / `node-cli-common.sh`**: it is a native installer, not npm-based. Helpers stay in place for other npm CLIs; only the Gemini-specific rows and comments come out.
- **Phase 0 probe blocks Phases 1-5**: skills directory, model identifiers, and installer flag translation must be known before code lands.
- **Shared catalog is the cross-repo handoff**: runtime PLAN-033 Phase 4 starts after Phase 1 lands here.

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

- **Wrapper flag mismatch**: environment-bootstrap installers accept a narrower flag surface than Cats Desktop packaged helpers. Mitigation: Phase 0 records the real flags and Phase 2 wrappers translate the host lifecycle instead of passing unsupported flags through.
- **Asset id rename breaks bundled-app build pipeline**: packaging metadata is consumed by the Electron builder. Mitigation: smoke tests catch missing assets immediately after Phase 4.
- **Shared catalog mid-flip drifts from runtime UI**: if cats-runtime UI mirrors values before the platform catalog lands, runtime playground can keep a stale `gemini` list. Mitigation: cross-repo coordination point is called out explicitly in both plans; runtime PLAN-033 Phase 4 has a precondition check.
- **`.antigravity/skills/` assumption is wrong**: if PLAN-100 Phase 5 adds an `antigravity` row to Sync-AgentSkills based on a misread of Phase 0, skills sync writes to a non-existent directory. Mitigation: default to dropping the Gemini row without adding Antigravity unless Phase 0 explicitly confirms a skills directory.
- **Agent-governance files are misclassified as CLI files**: deleting or rewriting `GEMINI.md` / `AGENTS.md` would violate the project file-ownership rules and conflate Gemini-the-agent with Gemini CLI. Mitigation: keep those files out of the migration and justify their remaining Gemini references during the final grep sweep.

## Progress Log

| Date | Update |
|------|--------|
| 2026-05-24 | Plan created alongside ADR-107 and SPEC-110. |

---

*Created: 2026-05-24*
*Author: User, with Claude support*

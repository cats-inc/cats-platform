# SPEC-110: Antigravity CLI in packaged setup and provider catalog

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | User |
| **Reviewer** | User |

## Summary

The `environment-bootstrap` installer suite has retired `@google/gemini-cli` and replaced it with a native Antigravity CLI (`agy` binary) across Windows, macOS, and Linux. `cats-platform` currently treats `gemini` as a first-class provider id across the packaged Desktop installer scripts, the Electron desktop host wiring, the shared provider catalog data that feeds both platform UI and runtime playground, the cross-OS skills sync tooling, and three smoke-test suites.

This spec defines how `cats-platform` performs the full swap: installer scripts, desktop host CLI inventory and onboarding metadata, packaging asset registration, shared catalog data, skills sync, smoke tests, and supporting shell helpers. It is the platform counterpart to cats-runtime SPEC-026. ADR-107 captures the underlying decision.

The shared provider catalog (`src/shared/providerCatalogData.ts`) is consumed by platform UI. `cats-runtime` currently keeps its own hardcoded dashboard/playground provider and model lists, so this spec defines the platform catalog as the product-side source of truth and requires runtime PLAN-033 to mirror those values deliberately. Automated cross-package catalog handoff is a separate design problem and is not part of this slice.

## Current Baseline

- Three native installer wrappers exist: `scripts/windows/Install-Gemini.ps1`, `scripts/macos/install-gemini.sh`, `scripts/linux/install-gemini.sh`. Each calls the npm-CLI helper to install `@google/gemini-cli` from npm and verify the `gemini` binary on PATH.
- The desktop host CLI inventory probe (`desktop/host/cliInventoryProbe.ts`) lists `gemini` with display label `Gemini`, native-installer suffix, and binary name `gemini`.
- The desktop host packaging metadata (`desktop/host/packaging.ts`) registers three native-installer assets (`windows-gemini-native-installer`, `linux-gemini-native-installer`, `macos-gemini-native-installer`) that point at the `Install-Gemini.{ps1,sh}` paths.
- The desktop host setup-asset registry (`desktop/host/setupAssets.ts`) bundles `Install-Gemini.ps1` / `install-gemini.sh` into the packaged app via npm-provider tuple registrations whose notes describe npm-global / repo-owned npm helper behavior.
- The desktop bootstrap onboarding page (`desktop/host/bootstrapPage.ts`) lists `gemini` in the provider list, in the display-label map, and in `ONBOARDING_COLLAPSED_PROVIDER_IDS`.
- The Windows setup readiness check (`scripts/windows/Check-WindowsSetupReadiness.ps1`) lists `gemini` with package name `@google/gemini-cli`.
- Three packaged-setup smoke tests (`Test-WindowsInstallerSmoke.ps1`, `test-macos-package-smoke.sh`, `test-linux-package-smoke.sh`) assert the Gemini installer assets are present in the packaged app.
- Skills sync tooling on all three OSes (`Sync-AgentSkills.ps1`, `sync-agent-skills.sh`) treats `gemini` as a valid `--agent` value and writes to `.gemini/skills/`.
- The shared provider catalog (`src/shared/providerCatalogData.ts`) lists `gemini` as a provider with Gemini-3.x model entries; `src/shared/providerCatalogInstances.ts` registers a default Gemini instance template.
- Shell helpers (`scripts/{macos,linux}/node-cli-common.sh`, `scripts/windows/_NpmCliInstaller.ps1`, `scripts/{macos,linux}/upgrade-cli-tools.sh`) include Gemini in their CLI catalogs, help text, and upgrade loops.
- `scripts/README.md` documents the Gemini installer story across multiple sections.
- Repo-root and subproject `GEMINI.md` files exist as cross-agent instruction files. They are not packaged setup assets and are out of scope for this CLI migration.

`cats-platform` has no existing references to `antigravity` or `agy`.

## Goals

1. Replace the three Gemini native installer wrappers with Antigravity wrappers that preserve the desktop host's allowlisted-helper contract, invoke Google's official installer for install / refresh actions, and port environment-bootstrap's refresh semantics.
2. Replace the `gemini` entry in `desktop/host/cliInventoryProbe.ts` with `antigravity` across binary name, display label, and native-installer suffix.
3. Replace `windows/linux/macos-gemini-native-installer` asset registrations in `desktop/host/packaging.ts` and `desktop/host/setupAssets.ts` with Antigravity equivalents, using standalone setup-asset registrations rather than the existing npm-provider tuples.
4. Replace `gemini` in `desktop/host/bootstrapPage.ts` provider list, label map, and `ONBOARDING_COLLAPSED_PROVIDER_IDS` with `antigravity`, positioned per the upstream `Claude Code → Antigravity → Cursor Agent` ordering.
5. Replace `gemini` in `desktop/host/contracts.ts` provider-id list with `antigravity`.
6. Replace `gemini` in `scripts/windows/Check-WindowsSetupReadiness.ps1` with `antigravity`.
7. Update all three packaged-setup smoke tests to assert Antigravity installer assets instead of Gemini.
8. Replace the `gemini` provider family in `src/shared/providerCatalogData.ts` and `src/shared/providerCatalogInstances.ts` with `antigravity`; expose only `antigravity-default` as a provider-default sentinel until explicit Phase 0 evidence proves raw `agy` model ids. `agy --help` is not sufficient by itself. Official product documentation may be recorded as display-name evidence, but display names must not become executable model values without a real CLI model-list command, a documented config surface, or a smoke run proving the id is accepted.
9. Update skills sync tooling: drop `gemini` from the `--agent` validation list; add `antigravity` only if `agy` actually discovers a `.antigravity/skills/` directory (probed before flipping).
10. Update shell helpers and READMEs to drop Gemini references and add Antigravity equivalents where structurally needed.
11. Define the shared provider catalog as the canonical platform-side source; explicitly call out the duplicate model list in `cats-runtime/src/http/ui/pages/playground.html` as something cats-runtime PLAN-033 Phase 4 must mirror in this slice.
12. Leave repo-root and subproject `GEMINI.md` files untouched because they are agent-governance files, not Gemini CLI setup files.

## Non-Goals

- Implementing the runtime-side provider knowledge, ACP profile, session scanner, or HTTP routes — owned by cats-runtime SPEC-026.
- Adding an Antigravity API HTTP backend (Google API completion path is owned by `cats-runtime`'s `api` backend family separately).
- Designing automated codegen or cross-package handoff from `cats-platform` provider catalog data into `cats-runtime`; this slice uses an explicit runtime mirror.
- Designing first-time onboarding UX changes beyond the provider-id rename.
- Renaming or restructuring the `_NpmCliInstaller.ps1` / `node-cli-common.sh` helpers — they remain in use for other npm CLIs (Codex, Copilot, OpenCode, Kilo, Auggie, Pi); only their Gemini-specific catalog rows and comments are changed.
- Solving the `.antigravity/skills/` directory question if `agy` does not implement one — that becomes a follow-up if Antigravity adds skills support later.

## User Stories

- As a desktop user, I want the packaged Cats Desktop to install Antigravity CLI via the same one-click flow that previously installed Gemini CLI.
- As a developer running `Settings > Runtime`, I want Antigravity to appear in the provider list with install / upgrade / repair actions wired to the bundled installer, matching the SPEC-093 lifecycle.
- As a playground user, I want the provider dropdown to show `antigravity` with the correct model list, kept aligned by the explicit runtime mirror in this slice.
- As a packager running smoke tests, I want assertions to check Antigravity asset presence so a missing installer is caught in CI.
- As a developer running skills sync, I do not want `gemini` to be a valid `--agent` value after the swap, because the corresponding `.gemini/skills/` target is no longer wired to a usable agent.

## Problem Statement

`cats-platform` currently says "Gemini CLI is a packaged provider" in many places:

- Installer wrappers point at `@google/gemini-cli`, which is being abandoned upstream.
- Desktop host enumerates `gemini` in onboarding cards, packaging assets, and CLI inventory probes; these claims power the bootstrap UI and the Settings Runtime list.
- Smoke tests assert that the Gemini installer scripts are bundled — these would falsely pass after the upstream removal because the local copies still exist.
- The shared provider catalog declares Gemini-3.x models under family `gemini`, and runtime playground duplicates this list in its own hardcoded array. The Antigravity replacement uses a provider-default sentinel until model ids are proven.
- Skills sync writes to `.gemini/skills/` for an `--agent gemini` value.

If left in place, every Desktop surface lies about installable providers: bootstrap shows a Gemini card that installs a non-functional npm package, Settings shows a Gemini row with no working repair path, the catalog ships Gemini models that no local CLI can drive, and smoke tests pass on the wrong artifact.

The fix is not additive. The Gemini-named seams must be replaced, not extended.

## Requirements

### Functional Requirements

1. `scripts/windows/Install-Gemini.ps1` shall be replaced by `scripts/windows/Install-Antigravity.ps1`. The new wrapper shall keep the packaged helper action surface (`-CheckOnly`, `-Apply`, `-Upgrade`, `-Force`, `-Uninstall`, `-DryRun`, `-Json`, state hints). `-Apply` invokes the official Google installer with no install-mode flag; `-Upgrade` and `-Force` remove `%LOCALAPPDATA%\agy\bin\agy.exe` before invoking that installer; `-CheckOnly`, `-DryRun`, `-Json`, and `-Uninstall` are wrapper-owned and shall not be delegated.
2. `scripts/macos/install-gemini.sh` shall be replaced by `scripts/macos/install-antigravity.sh`. The published shell contract is bash-style: `--check`, `--apply`, `--upgrade`, `--force`, `--uninstall`, `--dry-run`, `--json`. The shell wrapper shall also accept the PowerShell-style bridge aliases (`-CheckOnly`, `-Apply`, `-Upgrade`, `-Force`, `-Uninstall`, `-DryRun`, `-Json`) for packaged setup compatibility and shall parse flags with an explicit `case "$1" in ...)` loop rather than `getopts`. `--apply` invokes the official Google installer with no install-mode flag; `--upgrade` and `--force` remove `~/.local/bin/agy` before invoking that installer; wrapper-owned check / dry-run / JSON / uninstall actions shall not invoke the installer.
3. `scripts/linux/install-gemini.sh` shall be replaced by `scripts/linux/install-antigravity.sh`, with the same canonical host-facing contract and refresh semantics as macOS.
4. `desktop/host/cliInventoryProbe.ts:29,48,67` shall list `antigravity` instead of `gemini`, with binary name `agy`, display label `Antigravity`, and the appropriate native-installer suffix.
5. `desktop/host/contracts.ts:95` shall include `antigravity` instead of `gemini` in the provider-id list.
6. `desktop/host/packaging.ts:540-548` shall register `antigravity` with asset ids `windows-antigravity-native-installer`, `linux-antigravity-native-installer`, `macos-antigravity-native-installer`, pointing at the new wrapper paths.
7. `desktop/host/setupAssets.ts` shall remove Gemini from the existing macOS/Linux and Windows npm-provider tuples and add Antigravity as explicit standalone `provider_installer` registrations. Antigravity entries shall point at `install-antigravity.sh` / `Install-Antigravity.ps1`, use notes that describe user-scoped native binary download, and shall not inherit tuple notes that mention repo-owned Unix npm helpers or Windows npm-global installs. `requiresElevation` shall be `false` only after Phase 0 confirms the installer is user-scoped; `resumable` shall be set from Phase 0 evidence and must not be inherited blindly from the npm tuple.
8. `desktop/host/bootstrapPage.ts:1651,1665,1837` shall list `antigravity` instead of `gemini` in the provider list, label map (`Antigravity`), and `ONBOARDING_COLLAPSED_PROVIDER_IDS`. The provider-list position shall match the upstream `Claude Code → Antigravity → Cursor Agent` ordering.
9. `scripts/windows/Check-WindowsSetupReadiness.ps1:356` shall replace the npm-only Gemini row with a native Antigravity row. The readiness schema shall stop treating `PackageName` as mandatory for every row: add an `InstallSource` discriminator (for example `npm` / `native`) plus optional `PackageName`, `CommandName`, and binary path candidates, or an equivalent split between npm and native rows. Antigravity uses `InstallSource = 'native'`, command `agy`, and `%LOCALAPPDATA%\agy\bin\agy.exe`; do not use a placeholder npm package string.
10. `scripts/windows/Test-WindowsInstallerSmoke.ps1:147,184` shall assert the bundled Antigravity installer helper and the `windows-antigravity-native-installer-script` artifact.
11. `scripts/macos/test-macos-package-smoke.sh:52` shall assert the bundled macOS Antigravity installer helper.
12. `scripts/linux/test-linux-package-smoke.sh:52` shall assert the bundled Linux Antigravity installer helper.
13. `src/shared/providerCatalogData.ts:4,37-43,89` shall replace the `gemini` family with `antigravity`. The bundled Antigravity model list shall use `antigravity-default` as a provider-default sentinel until PLAN-100 Phase 0 evidence proves executable `agy` model values. If the evidence is official product documentation rather than a live CLI/config/smoke result, those values are display names only and must not be treated as raw `agy` model ids.
14. `src/shared/providerCatalogData.ts:48,60,72,76,77` — submodel references to `gemini-*` or Gemini display names inside the `copilot` / `cursor` / `junie` / `kilo` model lists are vendor-named submodels and shall be reviewed individually. They remain vendor-owned entries and must not be treated as Antigravity CLI model-id evidence.
15. `src/shared/providerCatalogInstances.ts:16` shall replace the `gemini` default-instance template with an `antigravity` template.
16. `scripts/windows/Sync-AgentSkills.ps1:16,35,67` shall remove `gemini` from the `--agent` `ValidateSet` and the agent-target map. `antigravity` shall be added only if PLAN-100 Phase 0 confirms `agy` discovers a `.antigravity/skills/` directory.
17. `scripts/macos/sync-agent-skills.sh:9,26,69,74` and `scripts/linux/sync-agent-skills.sh:9,26,69,74` shall mirror the Windows change.
18. `scripts/macos/node-cli-common.sh:322,337,1080` shall remove the `gemini|gemini|@google/gemini-cli|Gemini CLI` catalog row and update the helper-text and wrapper-comment lines.
19. `scripts/linux/node-cli-common.sh:322,337,1080` shall mirror macOS.
20. `scripts/macos/upgrade-cli-tools.sh:43` and `scripts/linux/upgrade-cli-tools.sh:43` shall drop `install-gemini.sh` from the upgrade-loop script list. Antigravity is not in this list because it uses a separate native installer (not the shared npm-helper flow).
21. `scripts/windows/_NpmCliInstaller.ps1:7,526` shall update its comments to remove Gemini. Antigravity shall not be added to npm-helper package lists or comments because it uses the standalone native-installer path.
22. `scripts/README.md:147,150,183,213,247,264,285` shall replace all Gemini references with Antigravity equivalents, and add a one-paragraph note in the appropriate section explaining the upstream swap.
23. Repo-root and subproject `GEMINI.md` files shall not be read, renamed, or deleted by this migration. Remaining references to Gemini in `AGENTS.md`, `CODEX.md`, or agent-specific instruction files are governance references, not stale CLI provider wiring.
24. `cats-runtime/src/http/ui/pages/playground.html` shall - as part of cats-runtime PLAN-033 Phase 4 - mirror the updated `src/shared/providerCatalogData.ts` sentinel or later probe-backed model values. This spec does not implement that runtime change but defines the platform catalog as the product-side contract.

### Non-Functional Requirements

- **Correctness over scope**: every removed Gemini reference must be either replaced by an Antigravity equivalent or intentionally removed. No silent drops.
- **Coordinated landing**: cross-repo handoff with cats-runtime PLAN-033 must be sequenced so the runtime UI never reads from a catalog mid-flip.
- **No fabricated capability**: if `agy` does not implement a skills directory, the skills sync tooling must drop Gemini without inventing an Antigravity equivalent.
- **Smoke test parity**: after the swap, packaged installer smoke tests on all three OSes must pass on the new assets.

## Design Overview

The migration moves through six layers that must land in order:

```
1. Shared catalog        → src/shared/providerCatalogData.ts
                           src/shared/providerCatalogInstances.ts
2. Installer wrappers    → scripts/{windows,macos,linux}/Install-Antigravity.*
3. Desktop host          → cliInventoryProbe, packaging, setupAssets,
                           bootstrapPage, contracts
4. Readiness + smoke     → Check-WindowsSetupReadiness, smoke tests (3 OS)
5. Skills + shell helpers → Sync-AgentSkills, sync-agent-skills, node-cli-common,
                           _NpmCliInstaller, upgrade-cli-tools
6. Docs + repo hygiene   → scripts/README.md and CLI/setup docs only
```

Layer 1 is the cross-repo handoff point — once the shared catalog is on `antigravity`, cats-runtime PLAN-033 Phase 4 is unblocked.

The desktop host wiring (layer 3) depends on layer 2 wrappers existing first because `setupAssets.ts` and `packaging.ts` register paths that must point at real files.

## Dependencies

- environment-bootstrap commits `b273f63a` and `5725e637` (already merged; pulled into this monorepo on 2026-05-24 via the submodule bump in commit `85540ced9`).
- A locally-available `agy` install (provided by running the new environment-bootstrap installer) to probe behavior during PLAN-100 Phase 0.
- cats-runtime SPEC-026 / PLAN-033 — coordinated migration on the runtime side; the runtime depends on Phase 1 of this plan (shared catalog) before its own Phase 4 (UI).

## Open Questions

- [x] What is the new asset-id naming convention if `Install-Antigravity.{ps1,sh}` wrappers delegate to environment-bootstrap helpers? Use the existing `native-installer` suffix (`windows-antigravity-native-installer`, `linux-antigravity-native-installer`, `macos-antigravity-native-installer`) for consistency with sibling assets.
- [x] Does `agy` expose a `.antigravity/skills/` directory or an equivalent skills mechanism? Official docs show plugin-backed skills under `~/.gemini/antigravity-cli/plugins`, but no terminal-managed `gemini skills` equivalent or `.antigravity/skills/` target. Sync-AgentSkills therefore drops `gemini` without adding an `antigravity` row in this migration.
- [x] What evidence source authoritatively lists or validates Antigravity model identifiers? The shared research note found official product documentation for selectable reasoning-model display names, but no live CLI/config/smoke evidence for raw `agy` model ids. Those display names remain docs-only evidence; the shared platform catalog must expose only `antigravity-default` until a live CLI model-list command, documented config surface, or smoke run proves executable values.
- [x] What are full-purge semantics beyond default uninstall? Default packaged uninstall is binary-only and user-scoped: remove the wrapper-installed `agy` executable/path target (`%LOCALAPPDATA%\agy\bin\agy.exe` on Windows, `~/.local/bin/agy` on Unix) and clean empty wrapper-owned directories/metadata where safe. It must not delete auth tokens, session history, or unrelated Antigravity config without a separate explicit purge design.
- [x] Is Antigravity's native binary download idempotently resumable from the packaged setup flow? Yes at the packaged-wrapper level: the wrappers re-check command/path presence before action and refresh modes remove the expected `agy` binary before invoking the official installer. `setupAssets.ts` should set `resumable: true` for the standalone Antigravity registrations.
- [x] Should the `--antigravity` provider badge color in the shared catalog (and downstream UIs) match Gemini's previous blue (`#60a5fa`) or pick a distinct Antigravity color? Use the previous Google-family blue (`#60a5fa`) for this swap so Antigravity keeps Gemini's dashboard slot and visual weight. A distinct brand color can land later only through a separate design-system change.

## References

- [ADR-107: Replace Gemini CLI with Antigravity CLI in packaged setup](../decisions/107-replace-gemini-cli-with-antigravity-in-packaged-setup.md)
- [PLAN-100: Replace Gemini CLI with Antigravity CLI in packaged setup](../plans/PLAN-100-replace-gemini-cli-with-antigravity-in-packaged-setup.md)
- [ADR-021: Keep packaged setup and provider installation in the host](../decisions/021-keep-packaged-setup-and-provider-installation-in-the-host.md)
- [ADR-044: Adopt Windows x64 Electron plus self-hosted npm as initial distribution strategy](../decisions/044-adopt-windows-x64-electron-plus-self-hosted-npm-as-initial-distribution-strategy.md)
- [ADR-046: Drive packaged setup through runtime bootstrap APIs](../decisions/046-drive-packaged-setup-through-runtime-bootstrap-apis.md)
- [SPEC-093: Settings Runtime CLI Provider Lifecycle](./SPEC-093-settings-runtime-cli-provider-lifecycle.md)
- cats-runtime SPEC-026 (runtime side of the same migration)
- environment-bootstrap commits `b273f63a` and `5725e637`

---

*Created: 2026-05-24*
*Author: User, with Claude support*
*Related Plan: [PLAN-100](../plans/PLAN-100-replace-gemini-cli-with-antigravity-in-packaged-setup.md)*

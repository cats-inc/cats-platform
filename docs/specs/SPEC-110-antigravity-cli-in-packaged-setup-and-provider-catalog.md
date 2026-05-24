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

The shared provider catalog (`src/shared/providerCatalogData.ts`) is consumed by both platform UI and `cats-runtime`'s playground page; this spec defines that catalog as the single source of truth that runtime UI reads, and explicitly resolves the current duplication between the platform catalog and the runtime playground's hardcoded model list.

## Current Baseline

- Three native installer wrappers exist: `scripts/windows/Install-Gemini.ps1`, `scripts/macos/install-gemini.sh`, `scripts/linux/install-gemini.sh`. Each calls the npm-CLI helper to install `@google/gemini-cli` from npm and verify the `gemini` binary on PATH.
- The desktop host CLI inventory probe (`desktop/host/cliInventoryProbe.ts`) lists `gemini` with display label `Gemini`, native-installer suffix, and binary name `gemini`.
- The desktop host packaging metadata (`desktop/host/packaging.ts`) registers three native-installer assets (`windows-gemini-native-installer`, `linux-gemini-native-installer`, `macos-gemini-native-installer`) that point at the `Install-Gemini.{ps1,sh}` paths.
- The desktop host setup-asset registry (`desktop/host/setupAssets.ts`) bundles `Install-Gemini.ps1` / `install-gemini.sh` into the packaged app and registers them in the helper allowlist.
- The desktop bootstrap onboarding page (`desktop/host/bootstrapPage.ts`) lists `gemini` in the provider list, in the display-label map, and in `ONBOARDING_COLLAPSED_PROVIDER_IDS`.
- The Windows setup readiness check (`scripts/windows/Check-WindowsSetupReadiness.ps1`) lists `gemini` with package name `@google/gemini-cli`.
- Three packaged-setup smoke tests (`Test-WindowsInstallerSmoke.ps1`, `test-macos-package-smoke.sh`, `test-linux-package-smoke.sh`) assert the Gemini installer assets are present in the packaged app.
- Skills sync tooling on all three OSes (`Sync-AgentSkills.ps1`, `sync-agent-skills.sh`) treats `gemini` as a valid `--agent` value and writes to `.gemini/skills/`.
- The shared provider catalog (`src/shared/providerCatalogData.ts`) lists `gemini` as a provider with Gemini-3.x model entries; `src/shared/providerCatalogInstances.ts` registers a default Gemini instance template.
- Shell helpers (`scripts/{macos,linux}/node-cli-common.sh`, `scripts/windows/_NpmCliInstaller.ps1`, `scripts/{macos,linux}/upgrade-cli-tools.sh`) include Gemini in their CLI catalogs, help text, and upgrade loops.
- `scripts/README.md` documents the Gemini installer story across multiple sections.
- A repo-root `GEMINI.md` exists as a cross-agent instruction file.

`cats-platform` has no existing references to `antigravity` or `agy`.

## Goals

1. Replace the three Gemini native installer wrappers with Antigravity wrappers that delegate to `environment-bootstrap`'s `Install-AntigravityCLI.{ps1,sh}` for the actual install, preserving the desktop host's allowlisted-helper contract.
2. Replace the `gemini` entry in `desktop/host/cliInventoryProbe.ts` with `antigravity` across binary name, display label, and native-installer suffix.
3. Replace `windows/linux/macos-gemini-native-installer` asset registrations in `desktop/host/packaging.ts` and `desktop/host/setupAssets.ts` with Antigravity equivalents.
4. Replace `gemini` in `desktop/host/bootstrapPage.ts` provider list, label map, and `ONBOARDING_COLLAPSED_PROVIDER_IDS` with `antigravity`, positioned per the upstream `Claude Code → Antigravity → Cursor Agent` ordering.
5. Replace `gemini` in `desktop/host/contracts.ts` provider-id list with `antigravity`.
6. Replace `gemini` in `scripts/windows/Check-WindowsSetupReadiness.ps1` with `antigravity`.
7. Update all three packaged-setup smoke tests to assert Antigravity installer assets instead of Gemini.
8. Replace the `gemini` provider family in `src/shared/providerCatalogData.ts` and `src/shared/providerCatalogInstances.ts` with `antigravity`; preserve the Gemini-3.x model list under the new family id (Antigravity CLI exposes the same underlying Gemini-3 models, per Google's product positioning, but as `antigravity-*` model labels if the CLI uses different identifiers).
9. Update skills sync tooling: drop `gemini` from the `--agent` validation list; add `antigravity` only if `agy` actually discovers a `.antigravity/skills/` directory (probed before flipping).
10. Update shell helpers and READMEs to drop Gemini references and add Antigravity equivalents where structurally needed.
11. Define the shared provider catalog as the canonical source for both platform UI and cats-runtime playground; explicitly call out the duplicate model list in `cats-runtime/src/http/ui/pages/playground.html` as something cats-runtime PLAN-033 Phase 4 must consume from the shared catalog.
12. Delete `GEMINI.md` from the repo root.

## Non-Goals

- Implementing the runtime-side provider knowledge, ACP profile, session scanner, or HTTP routes — owned by cats-runtime SPEC-026.
- Adding an Antigravity API HTTP backend (Google API completion path is owned by `cats-runtime`'s `api` backend family separately).
- Designing first-time onboarding UX changes beyond the provider-id rename.
- Renaming or restructuring the `_NpmCliInstaller.ps1` / `node-cli-common.sh` helpers — they remain in use for other npm CLIs (Codex, Copilot, OpenCode, Kilo, Auggie, Pi); only their Gemini-specific catalog rows and comments are changed.
- Solving the `.antigravity/skills/` directory question if `agy` does not implement one — that becomes a follow-up if Antigravity adds skills support later.

## User Stories

- As a desktop user, I want the packaged Cats Desktop to install Antigravity CLI via the same one-click flow that previously installed Gemini CLI.
- As a developer running `Settings > Runtime`, I want Antigravity to appear in the provider list with install / upgrade / repair actions wired to the bundled installer, matching the SPEC-093 lifecycle.
- As a playground user, I want the provider dropdown to show `antigravity` with the correct model list, sourced from the shared catalog rather than a duplicate hardcoded copy.
- As a packager running smoke tests, I want assertions to check Antigravity asset presence so a missing installer is caught in CI.
- As a developer running skills sync, I do not want `gemini` to be a valid `--agent` value after the swap, because the corresponding `.gemini/skills/` target is no longer wired to a usable agent.

## Problem Statement

`cats-platform` currently says "Gemini CLI is a packaged provider" in many places:

- Installer wrappers point at `@google/gemini-cli`, which is being abandoned upstream.
- Desktop host enumerates `gemini` in onboarding cards, packaging assets, and CLI inventory probes; these claims power the bootstrap UI and the Settings Runtime list.
- Smoke tests assert that the Gemini installer scripts are bundled — these would falsely pass after the upstream removal because the local copies still exist.
- The shared provider catalog declares Gemini-3.x models under family `gemini`, and runtime playground duplicates this list in its own hardcoded array.
- Skills sync writes to `.gemini/skills/` for an `--agent gemini` value.

If left in place, every Desktop surface lies about installable providers: bootstrap shows a Gemini card that installs a non-functional npm package, Settings shows a Gemini row with no working repair path, the catalog ships Gemini models that no local CLI can drive, and smoke tests pass on the wrong artifact.

The fix is not additive. The Gemini-named seams must be replaced, not extended.

## Requirements

### Functional Requirements

1. `scripts/windows/Install-Gemini.ps1` shall be replaced by `scripts/windows/Install-Antigravity.ps1`, calling environment-bootstrap's `Install-AntigravityCLI.ps1` with the same `-Upgrade` / `-Force` / `-NonInteractive` contract the previous wrapper exposed.
2. `scripts/macos/install-gemini.sh` shall be replaced by `scripts/macos/install-antigravity.sh`, delegating to environment-bootstrap's `install-antigravity-cli.sh` with `--upgrade` / `--force` / `--non-interactive` flag parity.
3. `scripts/linux/install-gemini.sh` shall be replaced by `scripts/linux/install-antigravity.sh`, with the same delegation contract as macOS.
4. `desktop/host/cliInventoryProbe.ts:29,48,67` shall list `antigravity` instead of `gemini`, with binary name `agy`, display label `Antigravity`, and the appropriate native-installer suffix.
5. `desktop/host/contracts.ts:95` shall include `antigravity` instead of `gemini` in the provider-id list.
6. `desktop/host/packaging.ts:540-548` shall register `antigravity` with asset ids `windows-antigravity-native-installer`, `linux-antigravity-native-installer`, `macos-antigravity-native-installer`, pointing at the new wrapper paths.
7. `desktop/host/setupAssets.ts:121,326,543` shall register the new wrapper scripts in the helper allowlist with appropriate per-OS metadata.
8. `desktop/host/bootstrapPage.ts:1651,1665,1837` shall list `antigravity` instead of `gemini` in the provider list, label map (`Antigravity`), and `ONBOARDING_COLLAPSED_PROVIDER_IDS`. The provider-list position shall match the upstream `Claude Code → Antigravity → Cursor Agent` ordering.
9. `scripts/windows/Check-WindowsSetupReadiness.ps1:356` shall reference `antigravity` with appropriate package name (no npm package; native installer source).
10. `scripts/windows/Test-WindowsInstallerSmoke.ps1:147,184` shall assert the bundled Antigravity installer helper and the `windows-antigravity-native-installer-script` artifact.
11. `scripts/macos/test-macos-package-smoke.sh:52` shall assert the bundled macOS Antigravity installer helper.
12. `scripts/linux/test-linux-package-smoke.sh:52` shall assert the bundled Linux Antigravity installer helper.
13. `src/shared/providerCatalogData.ts:4,37-43,89` shall replace the `gemini` family with `antigravity`. The Gemini-3.x model list shall be remapped to whatever model identifiers the `agy` CLI actually exposes (probed during PLAN-100 Phase 0; default-fallback if Antigravity reuses the same Gemini-3.x ids verbatim is to keep the value strings and rename only the family key).
14. `src/shared/providerCatalogData.ts:48,60,72,76,77` — submodel references to `gemini-*` inside the `copilot` / `cursor` / `openrouter` model lists are vendor-named submodels and shall be reviewed individually: kept if the vendor still routes them, removed if the vendor has dropped them.
15. `src/shared/providerCatalogInstances.ts:16` shall replace the `gemini` default-instance template with an `antigravity` template.
16. `scripts/windows/Sync-AgentSkills.ps1:16,35,67` shall remove `gemini` from the `--agent` `ValidateSet` and the agent-target map. `antigravity` shall be added only if PLAN-100 Phase 0 confirms `agy` discovers a `.antigravity/skills/` directory.
17. `scripts/macos/sync-agent-skills.sh:9,26,69,74` and `scripts/linux/sync-agent-skills.sh:9,26,69,74` shall mirror the Windows change.
18. `scripts/macos/node-cli-common.sh:322,337,1080` shall remove the `gemini|gemini|@google/gemini-cli|Gemini CLI` catalog row and update the helper-text and wrapper-comment lines.
19. `scripts/linux/node-cli-common.sh:322,337,1080` shall mirror macOS.
20. `scripts/macos/upgrade-cli-tools.sh:43` and `scripts/linux/upgrade-cli-tools.sh:43` shall drop `install-gemini.sh` from the upgrade-loop script list. Antigravity is not in this list because it uses a separate native installer (not the shared npm-helper flow).
21. `scripts/windows/_NpmCliInstaller.ps1:7,526` shall update its comments to remove Gemini and add Antigravity context where applicable.
22. `scripts/README.md:147,150,183,213,247,264,285` shall replace all Gemini references with Antigravity equivalents, and add a one-paragraph note in the appropriate section explaining the upstream swap.
23. `GEMINI.md` at the repo root shall be deleted.
24. `cats-runtime/src/http/ui/pages/playground.html` shall — as part of cats-runtime PLAN-033 Phase 4 — read its model list from the updated `src/shared/providerCatalogData.ts` rather than duplicating the model list inline. This spec does not implement that change but defines the platform catalog as the contract.

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
6. Docs + repo hygiene   → scripts/README.md, GEMINI.md, AGENTS.md if needed
```

Layer 1 is the cross-repo handoff point — once the shared catalog is on `antigravity`, cats-runtime PLAN-033 Phase 4 is unblocked.

The desktop host wiring (layer 3) depends on layer 2 wrappers existing first because `setupAssets.ts` and `packaging.ts` register paths that must point at real files.

## Dependencies

- environment-bootstrap commits `b273f63a` and `5725e637` (already merged; pulled into this monorepo on 2026-05-24 via the submodule bump in commit `85540ced9`).
- A locally-available `agy` install (provided by running the new environment-bootstrap installer) to probe behavior during PLAN-100 Phase 0.
- cats-runtime SPEC-026 / PLAN-033 — coordinated migration on the runtime side; the runtime depends on Phase 1 of this plan (shared catalog) before its own Phase 4 (UI).

## Open Questions

- [ ] What is the new asset-id naming convention if `Install-Antigravity.{ps1,sh}` wrappers delegate to environment-bootstrap helpers? Options: `windows-antigravity-native-installer` (mirrors current Gemini naming) or `windows-antigravity-bootstrap-installer` (signals the delegation). Default: keep the `native-installer` suffix for consistency with sibling assets.
- [ ] Does `agy` expose a `.antigravity/skills/` directory or an equivalent skills mechanism? Resolves whether Sync-AgentSkills gets an `antigravity` value or just drops `gemini`.
- [ ] Do Antigravity's CLI session storage and model identifiers reuse the Gemini-3.x names verbatim, or does the CLI rename them? Resolves whether the shared catalog model strings stay as-is.
- [ ] Should `Install-Antigravity.{ps1,sh}` wrappers be thin delegators (call environment-bootstrap directly) or full installers (download `agy` themselves)? Default: thin delegators, since environment-bootstrap is already a submodule of this monorepo and its installer code is the source of truth.
- [ ] Should the `--antigravity` provider badge color in the shared catalog (and downstream UIs) match Gemini's previous blue (`#60a5fa`) or pick a distinct Antigravity color? Decision: pre-work for PLAN-100 Phase 1.

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

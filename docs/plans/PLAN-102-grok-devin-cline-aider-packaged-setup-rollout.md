# PLAN-102: Grok, Devin, Cline, and Aider Packaged Setup Rollout

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | User |
| **Assigned To** | Unassigned |
| **Reviewer** | User |

## Related Spec

[SPEC-112: Grok, Devin, Cline, and Aider in Packaged Setup and the Provider Catalog](../specs/SPEC-112-grok-devin-cline-aider-in-packaged-setup-and-provider-catalog.md)

## Overview

This plan ports four upstream AI coding CLIs into packaged setup: Grok CLI, Devin CLI, Cline, and Aider. Work starts with the shared contracts the runtime mirrors, then lands the installer helpers, then the desktop host wiring, then smoke tests and docs.

Phase ordering:

- Phase 0 shares the runtime's upstream probe; no helper is written from memory.
- Phase 1 lands the shared product catalog and desktop contracts first, because `cats-runtime` PLAN-034 Phase 6 blocks on them.
- Phase 2 refactors `provider_install_dir` on its own, so the behavior-preserving change is verifiable before new providers depend on it.
- Phases 3–5 add helpers per install shape (Unix native, npm pack, Windows).
- Phases 6–8 wire desktop host, smoke tests, and docs.

## Coordination With cats-runtime

This plan and `cats-runtime` PLAN-034 land as one coordinated change.

- **Platform owns**: packaged installer helpers, desktop host wiring, shared product catalog, smoke tests, platform docs.
- **Runtime owns**: provider taxonomy, install/check knowledge, refusal adapters, `providers.yaml` bootstrap, dashboard/playground/provider-setup UI, runtime tests and docs.

Handoff order: runtime PLAN-034 Phase 2 (taxonomy) → **this plan's Phase 1** (shared catalog + desktop contracts) → runtime PLAN-034 Phase 6 (UI mirrors catalog values) → remaining phases of both plans in parallel.

## Architecture Guardrails

1. No helper may block on stdin. Every invocation runs under the non-interactive setup bridge.
2. Do not register Grok's `agent` alias as a binary candidate, alias target, or uninstall target.
3. Do not report a Devin install as ready. `devin setup` is always an outstanding manual step.
4. Do not remove the `uv` binary Aider's installer brings with it; warn instead.
5. Do not change JSON output shape for existing providers. Additions are additive.
6. Do not add real model ids to `PRODUCT_PROVIDER_MODELS`; default sentinels only.
7. Do not insert into `PRODUCT_PROVIDER_ORDER` or `DESKTOP_PROVIDER_SETUP_LOCAL_PROVIDERS` — append.
8. Do not edit `cats-runtime` sources from this plan.
9. `--check` performs no network calls.
10. Do not adopt upstream's Quick/Full mode split.

## Implementation Phases

### Phase 0: Shared Upstream Probe

Same probe as `cats-runtime` PLAN-034 Phase 1; do not duplicate the work, share the research note.

- [ ] Confirm install URLs, install directories, PATH entries, and uninstall semantics for all four against the `environment-bootstrap` scripts.
- [ ] Confirm the exact trailing line each Devin installer uses to invoke `setup`, on both Windows and Unix, so the strip can be precise.
- [ ] Confirm whether Aider's Windows installer places `aider.exe` in `%USERPROFILE%\.local\bin` and whether it also drops `uv.exe` there.
- [ ] Confirm whether Cline needs `--allow-scripts` handling under `npm 12+`, mirroring `Install-NodeCLITools.ps1`. Documentation only — `cats-runtime` SPEC-027 D5 applies it unconditionally either way.
- [ ] Record findings in the shared research note.

Windows helper file naming is no longer a probe item — SPEC-112 PD5 fixes it as `Install-Grok.ps1`, `Install-Devin.ps1`, `Install-Aider.ps1`, `Install-Cline.ps1`.

**Deliverables**: Facts, not recollections, behind every helper table entry.

### Phase 1: Shared Catalog and Desktop Contracts

**Unblocks `cats-runtime` PLAN-034 Phase 6.** Land this before the runtime touches UI.

- [ ] Append `grok`, `devin`, `cline`, `aider` to `PRODUCT_PROVIDER_ORDER` in `src/shared/providerCatalogData.ts`, after `kiro` and before `ollama`.
- [ ] Add one default sentinel each to `PRODUCT_PROVIDER_MODELS`: `grok-default`, `devin-default`, `cline-default`, `aider-default`.
- [ ] Add a single default `cli/native` instance each to `PRODUCT_PROVIDER_INSTANCES` in `src/shared/providerCatalogInstances.ts`.
- [ ] Append the four to `DESKTOP_PROVIDER_SETUP_LOCAL_PROVIDERS` in `desktop/host/contracts.ts`, after `pi`.
- [ ] Run the renderer test suite and update provider-list assertions that now expect eighteen providers.

**Deliverables**: Runtime can mirror final catalog values.

### Phase 2: Install-Directory Abstraction

Behavior-preserving refactor, landed separately so a regression is attributable.

- [ ] Add `provider_install_dir` to `scripts/{linux,macos}/provider-cli-common.sh`, defaulting to `$HOME/.local/bin`.
- [ ] Derive `provider_binary_candidates` from it for every existing provider, leaving Kiro's macOS app-bundle symlink path intact.
- [ ] Route PATH persistence through it.
- [ ] Run the macOS and Linux smoke tests and confirm no existing provider's check/apply/uninstall output changed.

**Deliverables**: Install directory is data; existing providers unaffected.

### Phase 3: Unix Native Helpers — Grok, Devin, Aider

- [ ] Add `grok`, `devin`, `aider` to `provider_display_name`, `provider_primary_command`, and `provider_install_url`.
- [ ] Return `$HOME/.grok/bin` from `provider_install_dir` for `grok`.
- [ ] Leave `provider_alias_name` / `provider_alias_target` empty for all three.
- [ ] Add a `grok` case to `run_remote_pipe_installer` (`curl -fsSL "$url" | bash`).
- [ ] Add an `aider` case (`curl -LsSf "$url" | sh`).
- [ ] Add a `devin` case that downloads to a temp file, strips the trailing `setup` invocation, executes with stdin from `/dev/null`, and warns if the expected line was absent.
- [ ] Extend `run_provider_install_action` so `upgrade` and `force` re-run the official installer for all three.
- [ ] Implement uninstall: Grok removes `$HOME/.grok/bin/grok`; Devin removes the `~/.local/bin/devin` shim and the version tree under `${XDG_DATA_HOME:-$HOME/.local/share}/devin/cli`; Aider runs `uv tool uninstall aider-chat` with a file-removal fallback and emits the `uv` provenance warning.
- [ ] Make Devin's result carry `devin setup` in `manualSteps` for `apply`, `upgrade`, and `force`.
- [ ] Add thin wrappers `scripts/{linux,macos}/install-{grok,devin,aider}.sh`.

**Deliverables**: Three native providers installable, checkable, upgradable, and removable on macOS and Linux.

### Phase 4: Unix npm Pack — Cline, plus the Pi rename

- [ ] Add `cline|cline|cline|Cline CLI` to `node_cli_package_rows` in `scripts/{linux,macos}/node-cli-common.sh`.
- [ ] Change the Pi row to `@earendil-works/pi-coding-agent` and uninstall `@mariozechner/pi-coding-agent` before installing.
- [ ] Update `scripts/{linux,macos}/install-pi.sh` to the new package name.
- [ ] Add `scripts/{linux,macos}/install-cline.sh`.
- [ ] Apply `--allow-scripts` handling for Cline if Phase 0 shows it is needed.

**Deliverables**: Cline in the npm pack; Pi upgrades work again on Unix.

### Phase 5: Windows Helpers

- [ ] Add `scripts/windows/Install-Grok.ps1` implementing the full JSON mode contract against `%USERPROFILE%\.grok\bin\grok.exe`, invoking the upstream installer as a scriptblock, and ensuring `%USERPROFILE%\.grok\bin` is on the User PATH.
- [ ] Add `scripts/windows/Install-Devin.ps1` against `%LOCALAPPDATA%\devin\cli\bin\devin.exe`, stripping the trailing `& $EntryExe setup` line and reporting `devin setup` in `manualSteps`. Document the PowerShell-only installer constraint in the help block.
- [ ] Add `scripts/windows/Install-Aider.ps1` against `%USERPROFILE%\.local\bin\aider.exe`, with `uv tool uninstall aider-chat` for uninstall and the `uv` provenance warning.
- [ ] Add `scripts/windows/Install-Cline.ps1` delegating to `_NpmCliInstaller.ps1`.
- [ ] Update `scripts/windows/Install-Pi.ps1` to `@earendil-works/pi-coding-agent`, uninstalling the old package first.
- [ ] Add all four to `scripts/windows/Check-WindowsSetupReadiness.ps1` and correct Pi's `PackageName` there.

**Deliverables**: Windows parity with the Unix helpers.

### Phase 6: Desktop Host Wiring

- [ ] Add the four to `DESKTOP_TO_RUNTIME_PROVIDER`, `PROVIDER_LABEL`, and `PROVIDER_TO_HELPER_SUFFIX` in `desktop/host/cliInventoryProbe.ts`, all using `-native-installer` suffixes.
- [ ] Register Unix and Windows setup assets in `desktop/host/setupAssets.ts`: Cline joins the generic Unix npm-provider list; Grok, Devin, and Aider follow the Antigravity descriptor shape. All four `requiresElevation: false`, `resumable: true`, five modes supported.
- [ ] Add packaging inventory entries in `desktop/host/packaging.ts` naming the three-platform helper ids and `currentHome` paths.
- [ ] Add the four to `desktop/host/bootstrapPage.ts` provider id and label maps. Per SPEC-112 PD1, `ONBOARDING_COLLAPSED_PROVIDER_IDS` stays `['claude_code', 'antigravity', 'codex']` — none of the four is featured in the collapsed first-run view while execution is refusal-tier.

**Deliverables**: Packaged Desktop can drive the new helpers end to end.

### Phase 7: Readiness Audits, Upgrades, and Smoke Tests

- [ ] Add the four to `scripts/{linux,macos}/check-installation.sh`.
- [ ] Add the four to `scripts/{linux,macos}/upgrade-cli-tools.sh` and the Windows upgrade flow.
- [ ] Extend `scripts/windows/Test-WindowsInstallerSmoke.ps1` and `scripts/{linux,macos}/test-*-package-smoke.sh` with `--check` and `--dry-run` coverage for the four, asserting JSON shape.
- [ ] Add a smoke assertion that Devin's result carries the `devin setup` manual step.
- [ ] Add a smoke assertion that an unrelated `agent` binary on PATH does not make Grok report installed.
- [ ] Run all three smoke suites.

**Deliverables**: Regressions in the new helpers fail CI rather than users.

### Phase 8: Docs and Hygiene

- [ ] Update `docs/setup-guide.md` with the four, calling out `devin setup` and Aider's env-key model.
- [ ] Update `docs/product-integration-guide.md` if it enumerates providers.
- [ ] Update `docs/decisions/README.md`, `docs/specs/README.md`, `docs/plans/README.md` indexes.
- [ ] Sweep for remaining `@mariozechner/pi-coding-agent` references and confirm none survive.

**Deliverables**: Docs and indexes match the shipped reality.

## Files to Create / Modify

### Create

- `scripts/linux/install-{grok,devin,aider,cline}.sh`
- `scripts/macos/install-{grok,devin,aider,cline}.sh`
- `scripts/windows/Install-Grok.ps1`, `Install-Devin.ps1`, `Install-Aider.ps1`, `Install-Cline.ps1`

### Modify

- `scripts/{linux,macos}/provider-cli-common.sh`
- `scripts/{linux,macos}/node-cli-common.sh`
- `scripts/{linux,macos}/install-pi.sh`
- `scripts/{linux,macos}/check-installation.sh`
- `scripts/{linux,macos}/upgrade-cli-tools.sh`
- `scripts/{linux,macos}/test-{linux,macos}-package-smoke.sh`
- `scripts/windows/Install-Pi.ps1`
- `scripts/windows/Check-WindowsSetupReadiness.ps1`
- `scripts/windows/Test-WindowsInstallerSmoke.ps1`
- `desktop/host/{contracts,cliInventoryProbe,setupAssets,packaging,bootstrapPage}.ts`
- `src/shared/{providerCatalogData,providerCatalogInstances}.ts`
- renderer tests asserting provider lists
- `docs/setup-guide.md`

## Technical Decisions

- **Catalog and contracts land first**: the runtime blocks on them, and they are the cheapest phase to review.
- **`provider_install_dir` refactor is its own phase**: a behavior-preserving change mixed with four new providers is unreviewable.
- **Devin's strip warns rather than fails**: an upstream shape change should surface as a visible warning on a working install, not as a hard error that blocks setup.
- **Aider's `uv` is left alone**: provenance cannot be determined, and a destructive false positive is worse than an untidy leftover.
- **Append-only ordering**: keeps indices stable across the renderer suite and the runtime's mirrored order.
- **Pi rename rides along**: same defect class, same tables; splitting it leaves a known-broken upgrade path.

## Testing Strategy

- **Unit**: desktop host tests for the inventory probe, setup assets, and packaging entries.
- **Renderer**: provider-list assertions updated in Phase 1 and re-run after Phase 6.
- **Smoke**: Windows, macOS, and Linux package smoke suites after Phase 7.
- **Manual, per OS**:
  - Install each of the four from packaged provider setup; confirm detection afterward.
  - Confirm Devin's install completes without hanging and surfaces the `devin setup` step.
  - Confirm Aider uninstall leaves `aider --version` failing.
  - Confirm Grok detection is driven by `~/.grok/bin/grok`, not by any `agent` binary.
  - Confirm Cline installs and upgrades through the npm pack.
  - Confirm `upgrade-cli-tools` now actually upgrades Pi.
- **Cross-repo**: after `cats-runtime` PLAN-034 lands, repackage Desktop and verify the setup screen shows eighteen providers with correct readiness states.

## Risks & Mitigations

- **Devin installer shape changes and the strip misses**: stdin is redirected regardless and a warning is emitted; a smoke assertion covers the manual step.
- **`provider_install_dir` refactor regresses an existing provider**: isolated phase plus full smoke run before new providers depend on it.
- **Aider's Windows layout differs from the Unix assumption**: Phase 0 confirms it before the helper is written.
- **Grok and Devin require accounts for end-to-end verification**: acceptance is defined on install/detect/uninstall, not on a successful session.
- **Eighteen providers widen renderer assertions**: append-only ordering plus a dedicated Phase 1 pass.
- **Runtime and platform land out of order**: Phase 1 is explicitly the unblocking phase; the runtime's UI phase names it as a blocking dependency.

## Progress Log

| Date | Update |
|------|--------|
| 2026-08-07 | Plan created alongside ADR-109 and SPEC-112, after auditing `environment-bootstrap` commits `cb5efc7`, `d131535`, `216ef96`, `54992d6`, `0d1831d`, `cfe7785`. Pi npm package drift found in four platform locations during the same audit and folded into Phases 4 and 5. |
| 2026-08-07 | SPEC-112 open questions resolved as Decisions PD1–PD5 (decided by Claude, pending human review). Phase 0 drops the naming probe; Phase 5 and the file list adopt the `Install-Grok.ps1` / `Install-Devin.ps1` naming from PD5; Phase 6 records that the onboarding collapsed set stays unchanged per PD1. |

---

*Created: 2026-08-07*
*Author: User, with Claude support*

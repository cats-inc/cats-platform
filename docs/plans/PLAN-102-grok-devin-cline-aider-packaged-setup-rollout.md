# PLAN-102: Grok, Devin, Cline, and Aider Packaged Setup Rollout

## Metadata

| Field | Value |
|-------|-------|
| **Status** | In Progress — Grok, Cline, Devin, and Aider packaged setup complete; Grok and Cline in the execution catalog. Remaining: docs sweep and a packaged smoke run on real installers |
| **Owner** | User |
| **Assigned To** | Codex |
| **Reviewer** | User |

## Related Spec

[SPEC-112: Grok, Devin, Cline, and Aider in Packaged Setup and the Setup Provider Inventory](../specs/SPEC-112-grok-devin-cline-aider-in-packaged-setup-and-provider-catalog.md)

## Overview

This plan ports four upstream AI coding CLIs into packaged setup on supported platforms: Grok CLI, Devin CLI, Cline, and Aider. Work starts with setup contracts, then lands installer helpers, desktop host wiring, smoke tests, and docs. Product execution entries remain evidence-gated: Grok now has a working adapter and joins; the remaining three stay out.

Phase ordering:

- Phase 0 shares the runtime's upstream probe; no helper is written from memory.
- Phase 1 lands the desktop setup contracts after the runtime taxonomy. It also locks the product execution catalog against accidental refusal-only entries while allowing verified Grok.
- Phase 2 refactors `provider_install_dir` on its own, so the behavior-preserving change is verifiable before new providers depend on it.
- Phases 3–5 add helpers per install shape (Unix native, npm pack, Windows).
- Phases 6–8 wire desktop host, smoke tests, and docs.

## Coordination With cats-runtime

This plan and `cats-runtime` PLAN-034 land as one coordinated change.

- **Platform owns**: packaged installer helpers, desktop host wiring, the setup-provider inventory, product execution catalog, smoke tests, and platform docs.
- **Runtime owns**: provider taxonomy, install/check knowledge, evidence-gated adapters, `providers.yaml` bootstrap, dashboard/playground/provider-setup UI, runtime tests and docs.

Handoff order: runtime PLAN-034 Phase 2 (taxonomy) → **this plan's Phase 1** (desktop setup contracts) → both repos' remaining phases in parallel. Runtime-owned UI tokens and refusal-tier setup visibility do not block on a platform execution-catalog change.

## Architecture Guardrails

1. No helper may block on stdin. Every invocation runs under the non-interactive setup bridge.
2. Do not register Grok's `agent` alias as a binary candidate or alias target. Uninstall must remove only the fixed installer-owned alias beside `grok`; it must never search PATH for `agent`.
3. Do not report a Devin install as ready or infer whether `devin setup` was later completed. The install result always documents that packaged setup skipped the manual step; authentication remains unverified until a real probe exists.
4. Do not remove the `uv` binary Aider's installer brings with it; warn instead.
5. Do not change JSON output shape for existing providers. Additions are additive.
6. Add providers to `PRODUCT_PROVIDER_ORDER`, `PRODUCT_PROVIDER_MODELS`, and `PRODUCT_PROVIDER_INSTANCES` only when their runtime adapters work. Grok is promoted; Devin, Cline, and Aider remain excluded.
7. Append the four to the CLI setup segment of `DESKTOP_PROVIDER_SETUP_LOCAL_PROVIDERS` before `ollama`; preserve existing relative order and expect `ollama` to shift four absolute positions.
8. Do not edit `cats-runtime` sources from this plan.
9. `--check` performs no network calls.
10. Do not adopt upstream's Quick/Full mode split.
11. Do not ship or package a Windows Cline helper until upstream support or a reviewed live Windows execution probe establishes a supported contract.
12. Do not execute a downloaded Devin installer unless the expected interactive setup invocation was matched exactly once and removed.

## Implementation Phases

### Phase 0: Shared Upstream Probe

Same probe as `cats-runtime` PLAN-034 Phase 1; do not duplicate the work, share the research note.

- [ ] Confirm install URLs, install directories, PATH entries, and uninstall semantics for all four against the `environment-bootstrap` scripts.
- [ ] Confirm the exact trailing line each Devin installer uses to invoke `setup`, on both Windows and Unix, so the strip can be precise.
- [ ] Confirm whether Aider's Windows installer places `aider.exe` in `%USERPROFILE%\.local\bin` and whether it also drops `uv.exe` there.
- [ ] Capture the exact upstream Cline global-install `--allow-scripts` package allowlist and the npm feature-detection boundary. Per `cats-runtime` SPEC-027 D5, helpers apply that exact list only when the installed npm exposes the policy; older npm behavior is unchanged.
- [ ] Record the official macOS/Linux-only Cline support boundary. A Windows helper remains out of scope unless a later reviewed live execution probe supersedes it.
- [ ] Record findings in the shared research note.

Windows helper file naming is no longer a technical probe item: SPEC-112 PD5 proposes `Install-Grok.ps1`, `Install-Devin.ps1`, and `Install-Aider.ps1`. The User approved `Install-Grok.ps1` with the Grok-only slice on 2026-08-08; the remaining helper names stay approval-gated, and no `Install-Cline.ps1` is proposed.

**Deliverables**: Facts, not recollections, behind every helper table entry.

### Phase 1: Setup Inventory and Desktop Contracts

Land this after `cats-runtime` widens its provider taxonomy; the runtime ids must exist before desktop setup maps to them.

- [ ] Append `grok`, `devin`, `cline`, `aider` to the CLI setup segment of `DESKTOP_PROVIDER_SETUP_LOCAL_PROVIDERS` in `desktop/host/contracts.ts`, after `pi` and before `ollama`.
- [x] ~~Add the platform-support metadata needed to represent Cline as macOS/Linux-only and explicitly unsupported on Windows.~~ **Superseded 2026-08-09.** Guardrail 11 allowed this to lift on "a reviewed live Windows execution probe", and `cats-runtime` 03f01a1 recorded one: `cline@3.0.51` installs from npm and runs `--version`, `--help`, `--json` execution, tool calls, and `history --json` on Windows 11. Cline therefore ships on all three platforms like every other npm-pack provider, with no platform-support carve-out.
- [x] Add Grok to `PRODUCT_PROVIDER_ORDER`, `PRODUCT_PROVIDER_MODELS`, and `PRODUCT_PROVIDER_INSTANCES` with `grok-4.5` and `cli/native`; assert the remaining refusal-only providers stay absent.
- [ ] Run setup renderer tests and update setup-list assertions while preserving existing relative order. Grok took the count to fourteen and Cline to fifteen; Devin and Aider remain.

**Deliverables**: Desktop setup can name all four; product execution selects only verified Grok from this group.

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
- [x] Add an `aider` case (`curl -LsSf "$url" | sh`), matching upstream's shell and flags rather than reusing the bash pipe.
- [x] Add a `devin` case that downloads to a temp file, requires exactly one expected trailing `setup` invocation, strips it, and executes with stdin from `/dev/null`. Return a structured failure without execution when the marker is absent or ambiguous. **Verified against the live installers on 2026-08-09**: `https://cli.devin.ai/install.sh` is 286 lines whose final line is `"$VERSION_DIR/bin/$COMPILED_BIN_NAME" setup`, and `https://static.devin.ai/cli/setup.ps1` is 234 lines whose final line is `& $EntryExe setup`. Each is the only such line in its file, and the patched output still parses on both platforms.
- [ ] Extend `run_provider_install_action` so `upgrade` and `force` re-run the official installer for all three.
- [ ] Implement uninstall: Grok removes `$HOME/.grok/bin/grok` and the adjacent installer-owned `agent` alias without searching PATH; Devin removes the `~/.local/bin/devin` shim and the version tree under `${XDG_DATA_HOME:-$HOME/.local/share}/devin/cli`; Aider runs `uv tool uninstall aider-chat` with a file-removal fallback and emits the `uv` provenance warning.
- [ ] Make Devin's result carry `devin setup` in `manualSteps` for `apply`, `upgrade`, and `force`.
- [ ] Add thin wrappers `scripts/{linux,macos}/install-{grok,devin,aider}.sh`.

**Deliverables**: Three native providers installable, checkable, upgradable, and removable on macOS and Linux.

### Phase 4: Unix npm Pack — Cline, plus the Pi rename

- [ ] Add `cline|cline|cline|Cline CLI` to `node_cli_package_rows` in `scripts/{linux,macos}/node-cli-common.sh`.
- [x] Change the Pi row to `@earendil-works/pi-coding-agent` and uninstall `@mariozechner/pi-coding-agent` before installing. Expressed as a superseded-package lookup on both platforms rather than a Pi special case.
- [ ] Update `scripts/{linux,macos}/install-pi.sh` to the new package name.
- [ ] Add `scripts/{linux,macos}/install-cline.sh`.
- [ ] Feature-detect npm's global-install `--allow-scripts` policy and apply the exact upstream Cline allowlist when available; preserve existing lifecycle-script behavior on older npm versions.

**Deliverables**: Cline in the npm pack; Pi upgrades work again on Unix.

### Phase 5: Windows Helpers

- [ ] Add `scripts/windows/Install-Grok.ps1` implementing the full JSON mode contract against `%USERPROFILE%\.grok\bin\grok.exe`, invoking the upstream installer as a scriptblock, ensuring `%USERPROFILE%\.grok\bin` is on the User PATH, and removing both fixed adjacent `grok.exe` and installer-owned `agent.exe` paths on uninstall without searching PATH.
- [ ] Add `scripts/windows/Install-Devin.ps1` against `%LOCALAPPDATA%\devin\cli\bin\devin.exe`, requiring and stripping exactly one trailing `& $EntryExe setup` line and reporting `devin setup` in `manualSteps`. Return a structured failure without execution if the expected line is absent or ambiguous. Document the PowerShell-only installer constraint in the help block.
- [ ] Add `scripts/windows/Install-Aider.ps1` against `%USERPROFILE%\.local\bin\aider.exe`, with `uv tool uninstall aider-chat` for uninstall and the `uv` provenance warning.
- [ ] Update `scripts/windows/Install-Pi.ps1` to `@earendil-works/pi-coding-agent`, uninstalling the old package first.
- [ ] Add Grok, Devin, and Aider to `scripts/windows/Check-WindowsSetupReadiness.ps1`, represent Cline as unsupported rather than installable, and correct Pi's `PackageName` there.

**Deliverables**: Supported Windows helpers plus an honest Cline-unsupported state.

### Phase 6: Desktop Host Wiring

- [ ] Add the four to `DESKTOP_TO_RUNTIME_PROVIDER` and `PROVIDER_LABEL` in `desktop/host/cliInventoryProbe.ts`; map Grok, Devin, and Aider to native installers on all three OSes and Cline to the generic npm helper on macOS/Linux only.
- [ ] Register setup assets in `desktop/host/setupAssets.ts`: Cline joins the generic Unix npm-provider list only; Grok, Devin, and Aider follow the Antigravity descriptor shape on all three OSes. Supported pairs use `requiresElevation: false`, `resumable: true`, and all five modes.
- [ ] Add packaging inventory entries in `desktop/host/packaging.ts` for supported helper ids and `currentHome` paths only; assert no Windows Cline asset is packaged.
- [ ] Add the four to `desktop/host/bootstrapPage.ts` setup provider id and label maps, including the Windows unsupported message for Cline. `ONBOARDING_COLLAPSED_PROVIDER_IDS` stays `['claude_code', 'antigravity', 'codex']`; Grok catalog promotion does not automatically change this separately curated recommendation set.

**Deliverables**: Packaged Desktop can drive the new helpers end to end.

### Phase 7: Readiness Audits, Upgrades, and Smoke Tests

- [ ] Add the four to `scripts/{linux,macos}/check-installation.sh`.
- [ ] Add the four to `scripts/{linux,macos}/upgrade-cli-tools.sh`; add Grok, Devin, and Aider to the Windows upgrade flow.
- [ ] Extend `scripts/{linux,macos}/test-*-package-smoke.sh` with `--check` and `--dry-run` coverage for all four. Extend `scripts/windows/Test-WindowsInstallerSmoke.ps1` for Grok, Devin, and Aider and assert Cline is unsupported.
- [ ] Add smoke assertions that Devin's result carries the `devin setup` manual step and that a missing or duplicated strip marker fails before the downloaded installer executes.
- [ ] Add a smoke assertion that an unrelated `agent` binary on PATH does not make Grok report installed.
- [ ] Add an uninstall assertion that Grok removes its fixed adjacent `agent` alias without touching an unrelated PATH binary.
- [ ] Run all three smoke suites.

**Deliverables**: Regressions in the new helpers fail CI rather than users.

### Phase 8: Docs and Hygiene

- [x] ~~Update `docs/setup-guide.md`~~ **Redirected.** The platform `docs/setup-guide.md` and `docs/product-integration-guide.md` do not enumerate CLI providers, so there was nothing to extend there. The equivalent content now lives in `scripts/README.md`: all four helpers, the Devin installer strip and its outstanding `devin auth login`, Aider's uv-shim uninstall and left-in-place uv, the superseded-package mechanism, and why Devin and Aider stay out of the product execution catalog. Provider-facing user docs are in `cats-runtime/docs/setup-guide.md`, updated with each runtime slice. Cline's macOS/Linux-only note is obsolete — see the Phase 1 entry.
- [x] Checked `docs/product-integration-guide.md`; it does not enumerate providers, so no change was needed.
- [ ] Update `docs/decisions/README.md`, `docs/specs/README.md`, `docs/plans/README.md` indexes.
- [x] Sweep for remaining `@mariozechner/pi-coding-agent` references. The surviving hits are all intentional: the migration ADR/SPEC/PLAN prose, tests asserting the old name is absent and the mapping present, and the superseded-package tables themselves. No install path names it.

**Deliverables**: Docs and indexes match the shipped reality.

## Files to Create / Modify

### Create

- `scripts/linux/install-{grok,devin,aider,cline}.sh`
- `scripts/macos/install-{grok,devin,aider,cline}.sh`
- `scripts/windows/Install-Grok.ps1`, `Install-Devin.ps1`, `Install-Aider.ps1`

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
- setup and product-catalog tests asserting their separate provider lists
- `docs/setup-guide.md`

## Technical Decisions

- **Setup contracts follow runtime taxonomy**: desktop setup ids map to runtime ids; product execution additionally requires a working runtime adapter.
- **`provider_install_dir` refactor is its own phase**: a behavior-preserving change mixed with four new providers is unreviewable.
- **Devin's strip fails closed**: an upstream shape change must stop before executing a downloaded script whose interactive behavior has not been reviewed.
- **Aider's `uv` is left alone**: provenance cannot be determined, and a destructive false positive is worse than an untidy leftover.
- **Relative ordering is preserved**: the four append to the CLI setup segment before `ollama`; existing providers keep relative order even though `ollama` shifts four absolute positions.
- **Setup inventory is not the execution catalog**: Grok is present in both because it works; refusal-only providers remain absent from product selectors.
- **Cline Windows support is evidence-gated**: no Windows helper or asset ships while upstream lists only macOS and Linux support.
- **Pi rename rides along**: same defect class, same tables; splitting it leaves a known-broken upgrade path.

## Testing Strategy

- **Unit**: desktop host tests for the inventory probe, setup assets, and packaging entries.
- **Renderer**: setup-list assertions remain independent; product catalog assertions cover fifteen providers with Grok as the only promoted provider from this group.
- **Smoke**: Windows, macOS, and Linux package smoke suites after Phase 7.
- **Manual, per OS**:
  - Install all four on macOS and Linux; on Windows, install Grok, Devin, and Aider and confirm Cline is shown as unsupported.
  - Confirm Devin's install completes without hanging and surfaces the `devin setup` step.
  - Confirm Aider uninstall leaves `aider --version` failing.
  - Confirm Grok detection is driven by `~/.grok/bin/grok`, not by any `agent` binary, and uninstall removes only its fixed adjacent alias.
  - Confirm Cline installs and upgrades through the npm pack on macOS and Linux.
  - Confirm `upgrade-cli-tools` now actually upgrades Pi.
- **Cross-repo**: verify the setup screen and product selectors independently; product execution exposes Grok with `grok-4.5` while Devin, Cline, and Aider remain setup-only.

## Risks & Mitigations

- **Devin installer shape changes and the strip misses**: fail before execution; smoke fixtures cover missing and duplicated markers as well as the manual step.
- **`provider_install_dir` refactor regresses an existing provider**: isolated phase plus full smoke run before new providers depend on it.
- **Aider's Windows layout differs from the Unix assumption**: Phase 0 confirms it before the helper is written.
- **Devin requires an account for end-to-end verification**: its acceptance remains install/detect/uninstall. Grok session execution has authenticated isolated evidence.
- **Setup and execution counts diverge**: keep separate assertions and prove the fifteen-provider execution catalog includes Grok but excludes the remaining three.
- **Runtime and platform land out of order**: runtime taxonomy lands before platform setup mapping; neither repo depends on refusal-only product catalog entries.

## Progress Log

| Date | Update |
|------|--------|
| 2026-08-07 | Plan created alongside ADR-109 and SPEC-112, after auditing `environment-bootstrap` commits `cb5efc7`, `d131535`, `216ef96`, `54992d6`, `0d1831d`, `cfe7785`. Pi npm package drift found in four platform locations during the same audit and folded into Phases 4 and 5. |
| 2026-08-07 | SPEC-112 open questions rewritten as Proposed Decisions PD1–PD6 pending User approval, so implementation remains blocked. Review corrections keep refusal-only providers out of the product execution catalog, limit Cline to official macOS/Linux support, make Devin installer stripping fail closed, remove Grok's known alias during uninstall, and align npm `--allow-scripts` behavior with the exact upstream allowlist when supported. |
| 2026-08-08 | User approved implementation starting with Grok. Cross-platform Grok helpers, fixed-path alias-safe uninstall, install-directory abstraction, readiness and upgrade wiring, setup inventory/assets, packaging metadata, product-catalog guardrails, smoke coverage, and docs landed as the first slice. Devin, Cline, Aider, and the Pi rename remain pending. |
| 2026-08-08 | Runtime completed the authenticated Grok 1.0.0 adapter. Promoted Grok into the product execution order with verified default `grok-4.5` and `cli/native`; refusal-only Devin, Cline, and Aider remain excluded. |

---

*Created: 2026-08-07*
*Author: Claude draft for User review*

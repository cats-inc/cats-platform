# SPEC-112: Grok, Devin, Cline, and Aider in Packaged Setup and the Provider Catalog

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | User |
| **Reviewer** | User |

## Summary

This spec defines the packaged-setup side of adopting four upstream AI coding CLIs — Grok CLI (xAI), Devin CLI (Cognition), Cline, and Aider — as Cats provider families. It covers repo-owned installer helpers on Windows, macOS, and Linux; desktop host wiring; the shared product provider catalog; and the smoke-test surface.

It is the counterpart to `cats-runtime` SPEC-027, which owns the runtime provider taxonomy, install/check knowledge, and refusal-tier execution adapters. ADR-109 captures the underlying decision.

## Goals

- Ship repo-owned `check/apply/upgrade/force/uninstall` installer helpers for Grok, Devin, and Aider on all three OSes, and add Cline to the existing npm provider pack.
- Extend `provider-cli-common.sh` so a provider's install directory is data, not an assumption, so Grok's `~/.grok/bin` works without a special case.
- Strip the interactive `devin setup` call from both packaged Devin installers and surface it as a `manualSteps` entry instead.
- Register the four in `DESKTOP_PROVIDER_SETUP_LOCAL_PROVIDERS`, the runtime-id mapping, provider labels, and helper-suffix maps.
- Register setup assets and packaging inventory entries for the new helpers.
- Add the four to `PRODUCT_PROVIDER_ORDER`, `PRODUCT_PROVIDER_MODELS` (default sentinel only), and `PRODUCT_PROVIDER_INSTANCES` (`cli/native` only).
- Extend the Windows, macOS, and Linux smoke tests to cover the new helpers.
- Correct the Pi npm package name to `@earendil-works/pi-coding-agent` across all four platform locations.

## Non-Goals

- Runtime provider taxonomy, install knowledge, refusal adapters, or `providers.yaml` bootstrap — owned by `cats-runtime` SPEC-027.
- Any session-execution capability for the four. Packaged setup installs and reports them; it does not make them runnable.
- Real model ids in `PRODUCT_PROVIDER_MODELS`. Default sentinels only until runtime probes land.
- Managing the `uv` binary that Aider's installer brings with it.
- Registering Grok's `agent` alias anywhere.
- Adopting upstream's Quick/Full mode split.
- WSL-hosted variants of the four.

## User Stories

- As a Cats Desktop user on Windows, I want to install Grok from provider setup and see it detected afterward, the same as Claude or Cursor.
- As a Cats Desktop user who installed Devin, I want the setup screen to tell me I still need to run `devin setup`, rather than showing a green check I cannot act on.
- As a macOS user, I want Aider's uninstall to actually remove Aider, not just delete a shim that regenerates.
- As a Linux user, I want Cline to install through the same npm pack flow as Codex and Copilot.
- As a maintainer, I want the packaged smoke tests to fail if a new helper does not honor the JSON mode contract.
- As a Pi user on a packaged host, I want `upgrade-cli-tools` to actually upgrade Pi.

## Problem Statement

Packaged setup can only install what its helper tables know about. The four new CLIs are absent from every table, so Cats Desktop cannot install them, cannot detect them, and cannot report them in the bootstrap CLI gate — even on machines where the upstream suite already installed them.

Three of the four also violate assumptions currently baked into the helpers:

- `provider_binary_candidates` hardcodes `$HOME/.local/bin/<binary>` for every Unix native provider. Grok lives in `~/.grok/bin`.
- `run_remote_pipe_installer` supports only `curl … | bash` shapes. Aider needs `curl -LsSf … | sh`, and its uninstall is a `uv tool` operation.
- Nothing in the helper contract models "installed but authentication still owed". Devin needs exactly that, because the packaged installer must skip the interactive setup step to avoid hanging the non-interactive setup bridge.

Separately, four platform locations install Pi from a package name upstream abandoned; npm resolves the old name to its final version and reports it as current, so Pi upgrades silently no-op.

## Requirements

### Functional Requirements

#### Unix native installer helpers

1. `scripts/{linux,macos}/provider-cli-common.sh` shall gain a `provider_install_dir` lookup returning the provider's install directory, defaulting to `$HOME/.local/bin` and returning `$HOME/.grok/bin` for `grok`.
2. `provider_binary_candidates` shall derive its candidates from `provider_install_dir`, preserving current behavior for all existing providers.
3. The PATH-persistence path shall persist `provider_install_dir` for the provider being installed, so Grok's directory is added to the user's shell rc.
4. `provider_display_name` shall gain `grok` → "Grok CLI", `devin` → "Devin CLI", `aider` → "Aider".
5. `provider_primary_command` shall gain `grok` → `grok`, `devin` → `devin`, `aider` → `aider`.
6. `provider_install_url` shall gain `grok` → `https://x.ai/cli/install.sh`, `devin` → `https://cli.devin.ai/install.sh`, `aider` → `https://aider.chat/install.sh`.
7. `run_remote_pipe_installer` shall gain a `grok` case using `curl -fsSL "$url" | bash`, a `devin` case using the stripped-installer flow in §9, and an `aider` case using `curl -LsSf "$url" | sh`.
8. `provider_alias_name` / `provider_alias_target` shall return empty for all three. Grok's `agent` alias is intentionally unregistered.
9. The Devin case shall download the installer to a temp file, remove its trailing interactive `setup` invocation, execute the edited script with stdin redirected from `/dev/null`, and delete the temp file. If the trailing call cannot be located, the helper shall still redirect stdin and shall emit a warning that the installer shape changed.
10. `run_provider_install_action` shall handle `upgrade` and `force` for the three by re-running the official installer, which is idempotent for all of them.
11. Uninstall shall remove `$HOME/.grok/bin/grok` for Grok; the `~/.local/bin/devin` shim plus the version tree under `${XDG_DATA_HOME:-$HOME/.local/share}/devin/cli` for Devin; and shall run `uv tool uninstall aider-chat` for Aider, falling back to removing `~/.local/bin/aider` when `uv` is unavailable.
12. Aider's uninstall shall emit a warning that the `uv` binary installed alongside Aider is left in place because its provenance cannot be determined.
13. Thin wrappers `scripts/{linux,macos}/install-{grok,devin,aider}.sh` shall call `run_native_provider_installer '<platform>' '<provider>' "$@"`.

#### Unix npm pack

14. `scripts/{linux,macos}/node-cli-common.sh` `node_cli_package_rows` shall gain `cline|cline|cline|Cline CLI`.
15. The Pi row shall become `pi|pi|@earendil-works/pi-coding-agent|Pi CLI`, and the pack shall uninstall `@mariozechner/pi-coding-agent` before installing the new package.
16. `scripts/{linux,macos}/install-cline.sh` shall call `run_npm_cli_provider '<platform>' 'cline' 'cline' 'cline' 'Cline CLI' "$@"`.

#### Windows helpers

17. `scripts/windows/Install-GrokCli.ps1` shall implement the full JSON mode contract against `%USERPROFILE%\.grok\bin\grok.exe`, using `irm https://x.ai/cli/install.ps1 | iex` invoked as a scriptblock so the upstream script's `$ErrorActionPreference` does not leak, and shall ensure `%USERPROFILE%\.grok\bin` is on the User PATH.
18. `scripts/windows/Install-DevinCli.ps1` shall implement the same contract against `%LOCALAPPDATA%\devin\cli\bin\devin.exe`, fetch `https://static.devin.ai/cli/setup.ps1`, remove its trailing `& $EntryExe setup` line before execution, and report `devin setup` in `manualSteps`. It shall record in its help text that the upstream installer is PowerShell-only.
19. `scripts/windows/Install-Aider.ps1` shall implement the same contract against `%USERPROFILE%\.local\bin\aider.exe` using `irm https://aider.chat/install.ps1 | iex` as a scriptblock, and shall use `uv tool uninstall aider-chat` for uninstall with a file-removal fallback.
20. `scripts/windows/Install-Cline.ps1` shall delegate to `_NpmCliInstaller.ps1` with package `cline` and command `cline`.
21. `scripts/windows/Install-Pi.ps1` shall use `@earendil-works/pi-coding-agent` and uninstall `@mariozechner/pi-coding-agent` first.
22. `scripts/windows/Check-WindowsSetupReadiness.ps1` shall gain rows for all four and shall correct Pi's `PackageName`.

#### Readiness audits and upgrades

23. `scripts/{linux,macos}/check-installation.sh` shall report all four.
24. `scripts/{linux,macos}/upgrade-cli-tools.sh` and `scripts/windows/Upgrade-CliTools.ps1`-equivalent flows shall include all four.

#### Desktop host

25. `desktop/host/contracts.ts` `DESKTOP_PROVIDER_SETUP_LOCAL_PROVIDERS` shall gain `grok`, `devin`, `cline`, `aider`, appended after `pi`.
26. `desktop/host/cliInventoryProbe.ts` shall map each to the identical runtime id and shall add `PROVIDER_LABEL` and `PROVIDER_TO_HELPER_SUFFIX` entries using the `-native-installer` suffix for all four.
27. `desktop/host/setupAssets.ts` shall register Unix and Windows asset descriptors for the four, with `requiresElevation: false`, `resumable: true`, and all five modes supported. Cline joins the Unix generic npm-provider list; Grok, Devin, and Aider follow the Antigravity descriptor shape.
28. `desktop/host/packaging.ts` shall gain inventory entries naming the three-platform helper ids and `currentHome` paths.
29. `desktop/host/bootstrapPage.ts` shall list the four in its provider id and label maps. The onboarding collapsed set shall stay `['claude_code', 'antigravity', 'codex']` unless the owner asks otherwise.

#### Shared product catalog

30. `src/shared/providerCatalogData.ts` `PRODUCT_PROVIDER_ORDER` shall gain the four after `kiro`, before `ollama`.
31. `PRODUCT_PROVIDER_MODELS` shall gain one default-sentinel entry each: `grok-default`, `devin-default`, `cline-default`, `aider-default`.
32. `src/shared/providerCatalogInstances.ts` shall gain a single default `cli/native` instance for each.

#### Smoke tests

33. `scripts/windows/Test-WindowsInstallerSmoke.ps1` and `scripts/{linux,macos}/test-*-package-smoke.sh` shall cover the new helpers' `--check` and `--dry-run` paths, asserting the JSON shape and, for Devin, the presence of the `devin setup` manual step.

### Non-Functional Requirements

- No helper may block on stdin. Every installer invocation runs under the non-interactive setup bridge.
- Helper JSON output shape must be unchanged for existing providers; the additions are additive only.
- `--check` must not perform network calls.
- Uninstall must be idempotent and must not fail when the provider is already absent.

## Acceptance Criteria

- [ ] `install-grok.sh --check --json` on a host with Grok in `~/.grok/bin` reports `installed: true` with a version line.
- [ ] The same helper on a host with only an unrelated `agent` binary reports `installed: false`.
- [ ] `Install-DevinCli.ps1 -Apply -Json` completes without hanging under `_HiddenProcess.ps1` and returns `devin setup` in `manualSteps`.
- [ ] `install-aider.sh --uninstall` removes Aider such that `aider --version` fails afterward, and emits the `uv` provenance warning.
- [ ] Cline installs, upgrades, and uninstalls through the npm pack on all three OSes.
- [ ] `buildDesktopCliInventoryFromRuntime` reports all four when the runtime setup scan marks them available.
- [ ] Provider setup in packaged Desktop lists eighteen providers in the agreed order.
- [ ] Pi's package name is `@earendil-works/pi-coding-agent` in all four platform locations, and the old package is removed before install.
- [ ] Windows, macOS, and Linux smoke tests pass.

## Technical Design

### Install-directory abstraction

`provider_install_dir <provider>` becomes the single source for candidate paths and PATH persistence. Existing providers return `$HOME/.local/bin` unchanged, so the refactor is behavior-preserving; Grok is the first divergent value, and Kiro's existing Windows special case documents the pattern on the PowerShell side.

### Devin installer stripping

Both official Devin installers end with an invocation of the freshly installed binary's `setup` subcommand. The packaged helpers fetch the installer to a temp file, drop that trailing invocation, and execute the remainder. The strip is verified — if the expected line is absent, the helper still redirects stdin from the null device and warns that the upstream installer shape changed, so a silent regression surfaces as a warning rather than a hang.

### Aider uninstall

`~/.local/bin/aider` is a `uv` tool shim. Removing it leaves `aider-chat` installed in the `uv` tool environment and the shim regenerable by any `uv tool` command. The correct uninstall is `uv tool uninstall aider-chat`; the file-removal fallback exists only for hosts where `uv` has since been removed.

### Provider ordering

Both `DESKTOP_PROVIDER_SETUP_LOCAL_PROVIDERS` and `PRODUCT_PROVIDER_ORDER` append rather than insert, keeping existing indices stable across the renderer test suite and the runtime's mirrored `PROVIDER_ORDER`.

## Dependencies

- `cats-runtime` SPEC-027 must land its taxonomy first: `cliInventoryProbe` maps desktop ids onto runtime `KNOWN_PROVIDERS` ids, so a desktop entry with no runtime counterpart can never report installed.
- `environment-bootstrap` remains the upstream source of truth for install URLs, directories, and auth flows.

## Risks

- **Upstream Devin installer changes shape**, breaking the strip. Mitigation: warn-and-continue with stdin redirected, plus a smoke assertion on the manual step.
- **Aider's installer changes its shell or bundled-`uv` behavior.** Mitigation: the helper cites the upstream script it mirrors, so reconciliation is a diff.
- **`provider_install_dir` refactor regresses an existing provider.** Mitigation: the default preserves current behavior and smoke tests cover all providers.
- **Eighteen providers widen renderer test assertions.** Mitigation: append-only ordering.
- **Grok and Devin need accounts to verify end to end.** Mitigation: acceptance criteria are written against install/detect/uninstall, not against a successful session.

## Open Questions

- [ ] Should any of the four join the onboarding collapsed set in `bootstrapPage.ts`, given Grok is a Quick-mode CLI upstream?
- [ ] Should packaged setup expose upstream's Quick/Full distinction at all, or keep treating `native_cli_pack` as flat?
- [ ] Should Aider's readiness check inspect model API-key env vars, or stay presence-only and defer readiness to the runtime?
- [ ] Should the helper offer to remove Aider's bundled `uv` behind an explicit flag rather than only warning?
- [ ] Do Windows helper file names follow `Install-GrokCli.ps1` or `Install-GrokCLI.ps1`? Existing files are inconsistent (`Install-KiloCli.ps1` vs `Install-OpenCode.ps1`).

## Related

- [ADR-109: Port the Grok, Devin, Cline, and Aider installers into packaged setup](../decisions/109-port-grok-devin-cline-aider-installers-into-packaged-setup.md)
- [PLAN-102: Grok, Devin, Cline, and Aider Packaged Setup Rollout](../plans/PLAN-102-grok-devin-cline-aider-packaged-setup-rollout.md)
- [SPEC-110: Antigravity CLI in Packaged Setup and Provider Catalog](./SPEC-110-antigravity-cli-in-packaged-setup-and-provider-catalog.md)
- [SPEC-093: Settings runtime CLI provider lifecycle](./SPEC-093-settings-runtime-cli-provider-lifecycle.md)
- cats-runtime SPEC-027, ADR-033, PLAN-034

---

*Created: 2026-08-07*
*Author: User, with Claude support*

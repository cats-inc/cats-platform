# SPEC-112: Grok, Devin, Cline, and Aider in Packaged Setup and the Setup Provider Inventory

## Metadata

| Field | Value |
|-------|-------|
| **Status** | In Progress — Grok slice implemented; Devin, Cline, and Aider pending User approval |
| **Owner** | User |
| **Reviewer** | User |

## Summary

This spec defines the packaged-setup side of adopting four upstream AI coding CLIs — Grok CLI (xAI), Devin CLI (Cognition), Cline, and Aider — as Cats provider families. It covers repo-owned installer helpers on supported platforms, desktop host wiring, the setup-provider inventory, and the smoke-test surface. It intentionally leaves the product execution catalog unchanged while the corresponding runtime adapters are refusal-only.

It is the counterpart to `cats-runtime` SPEC-027, which owns the runtime provider taxonomy, install/check knowledge, and refusal-tier execution adapters. ADR-109 captures the underlying decision.

## Goals

- Ship repo-owned `check/apply/upgrade/force/uninstall` installer helpers for Grok, Devin, and Aider on Windows, macOS, and Linux, and add Cline to the existing npm provider pack on its officially supported macOS and Linux platforms.
- Extend `provider-cli-common.sh` so a provider's install directory is data, not an assumption, so Grok's `~/.grok/bin` works without a special case.
- Strip the interactive `devin setup` call from both packaged Devin installers and surface it as a `manualSteps` entry instead.
- Register the four in `DESKTOP_PROVIDER_SETUP_LOCAL_PROVIDERS`, the runtime-id mapping, provider labels, and helper-suffix maps.
- Register setup assets and packaging inventory entries for the new helpers.
- Keep `PRODUCT_PROVIDER_ORDER`, `PRODUCT_PROVIDER_MODELS`, and `PRODUCT_PROVIDER_INSTANCES` unchanged until working execution adapters land.
- Extend the Windows, macOS, and Linux smoke tests to cover supported helpers and Cline's explicit Windows-unsupported state.
- Correct the Pi npm package name to `@earendil-works/pi-coding-agent` across all four platform locations.

## Non-Goals

- Runtime provider taxonomy, install knowledge, refusal adapters, or `providers.yaml` bootstrap — owned by `cats-runtime` SPEC-027.
- Any session-execution capability for the four. Packaged setup installs and reports them; it does not make them runnable.
- Adding any of the four refusal-only providers, including default sentinels, to the product execution catalog.
- Managing the `uv` binary that Aider's installer brings with it.
- Registering Grok's generic `agent` alias as a detection candidate or alias target. Removing the known installer-owned alias path during uninstall remains in scope.
- Adopting upstream's Quick/Full mode split.
- WSL-hosted variants of the four.
- A Windows Cline helper before upstream support or a reviewed live Windows execution probe establishes a supported contract.

## User Stories

- As a Cats Desktop user on Windows, I want to install Grok from provider setup and see it detected afterward, the same as Claude or Cursor.
- As a Cats Desktop user who installed Devin, I want the setup screen to tell me that packaged install skipped `devin setup` and that authentication remains unverified, rather than showing a green check or guessing whether I later completed the step.
- As a macOS user, I want Aider's uninstall to actually remove Aider, not just delete a shim that regenerates.
- As a Linux user, I want Cline to install through the same npm pack flow as Codex and Copilot.
- As a Windows user, I want setup to say that Cline CLI is unsupported instead of offering an installer that has not been shown to work.
- As a maintainer, I want the packaged smoke tests to fail if a new helper does not honor the JSON mode contract.
- As a Pi user on a packaged host, I want `upgrade-cli-tools` to actually upgrade Pi.

## Problem Statement

Packaged setup can only install what its helper tables know about. The four new CLIs are absent from every table, so Cats Desktop cannot install them, cannot detect them, and cannot report them in the bootstrap CLI gate — even on machines where the upstream suite already installed them.

Three of the four also violate assumptions currently baked into the helpers:

- `provider_binary_candidates` hardcodes `$HOME/.local/bin/<binary>` for every Unix native provider. Grok lives in `~/.grok/bin`.
- `run_remote_pipe_installer` supports only `curl … | bash` shapes. Aider needs `curl -LsSf … | sh`, and its uninstall is a `uv tool` operation.
- Nothing in the helper contract models "installed, interactive setup skipped, authentication unverified". Devin needs exactly that, because the packaged installer must skip the interactive setup step to avoid hanging the non-interactive setup bridge and cannot later infer whether the user completed it elsewhere.

Cline's official CLI preview supports macOS and Linux, with Windows support still listed as forthcoming. In addition, the product execution catalog represents selectable session providers, not every tool setup can install. The four runtime adapters are deliberately refusal-only, so setup visibility and execution selection must remain separate.

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
9. The Devin case shall download the installer to a temp file, require exactly one expected trailing interactive `setup` invocation, remove it, execute the edited script with stdin redirected from `/dev/null`, and delete the temp file. If the expected invocation is absent or ambiguous, the helper shall fail with a structured error before executing any part of the downloaded installer.
10. `run_provider_install_action` shall handle `upgrade` and `force` for the three by re-running the official installer, which is idempotent for all of them.
11. Uninstall shall remove `$HOME/.grok/bin/grok` and the fixed installer-owned `$HOME/.grok/bin/agent` path for Grok; the `~/.local/bin/devin` shim plus the version tree under `${XDG_DATA_HOME:-$HOME/.local/share}/devin/cli` for Devin; and shall run `uv tool uninstall aider-chat` for Aider, falling back to removing `~/.local/bin/aider` when `uv` is unavailable. Grok uninstall shall never search PATH for a generic `agent` command.
12. Aider's uninstall shall emit a warning that the `uv` binary installed alongside Aider is left in place because its provenance cannot be determined.
13. Thin wrappers `scripts/{linux,macos}/install-{grok,devin,aider}.sh` shall call `run_native_provider_installer '<platform>' '<provider>' "$@"`.

#### Unix npm pack

14. `scripts/{linux,macos}/node-cli-common.sh` `node_cli_package_rows` shall gain `cline|cline|cline|Cline CLI`.
15. The Pi row shall become `pi|pi|@earendil-works/pi-coding-agent|Pi CLI`, and the pack shall uninstall `@mariozechner/pi-coding-agent` before installing the new package.
16. `scripts/{linux,macos}/install-cline.sh` shall call `run_npm_cli_provider '<platform>' 'cline' 'cline' 'cline' 'Cline CLI' "$@"`. When the installed npm version exposes the global-install `--allow-scripts` policy, the Cline install shall apply the exact upstream package allowlist captured by probe P4 in `cats-runtime` SPEC-027. npm versions without that feature shall retain their existing lifecycle-script behavior.

#### Windows helpers

17. `scripts/windows/Install-Grok.ps1` shall implement the full JSON mode contract against `%USERPROFILE%\.grok\bin\grok.exe`, using `irm https://x.ai/cli/install.ps1 | iex` invoked as a scriptblock so the upstream script's `$ErrorActionPreference` does not leak, and shall ensure `%USERPROFILE%\.grok\bin` is on the User PATH. Uninstall shall remove the fixed adjacent `grok.exe` and installer-owned `agent.exe` paths without resolving a generic `agent` from PATH.
18. `scripts/windows/Install-Devin.ps1` shall implement the same contract against `%LOCALAPPDATA%\devin\cli\bin\devin.exe`, fetch `https://static.devin.ai/cli/setup.ps1`, require and remove exactly one expected trailing `& $EntryExe setup` line before execution, and report `devin setup` in `manualSteps`. If the marker is absent or ambiguous, it shall return a structured failure without executing the downloaded script. Its help text shall record that the upstream installer is PowerShell-only.
19. `scripts/windows/Install-Aider.ps1` shall implement the same contract against `%USERPROFILE%\.local\bin\aider.exe` using `irm https://aider.chat/install.ps1 | iex` as a scriptblock, and shall use `uv tool uninstall aider-chat` for uninstall with a file-removal fallback.
20. No `scripts/windows/Install-Cline.ps1` shall ship at this tier. The Windows setup surface shall report Cline CLI as unsupported rather than exposing an install action.
21. `scripts/windows/Install-Pi.ps1` shall use `@earendil-works/pi-coding-agent` and uninstall `@mariozechner/pi-coding-agent` first.
22. `scripts/windows/Check-WindowsSetupReadiness.ps1` shall gain executable rows for Grok, Devin, and Aider and shall correct Pi's `PackageName`. Cline shall be absent from executable readiness rows or represented by explicit unsupported metadata; it shall not be reported as a supported Windows install.

#### Readiness audits and upgrades

23. `scripts/{linux,macos}/check-installation.sh` shall report all four.
24. `scripts/{linux,macos}/upgrade-cli-tools.sh` shall include all four; the Windows equivalent shall include Grok, Devin, and Aider but not Cline.

#### Desktop host

25. `desktop/host/contracts.ts` `DESKTOP_PROVIDER_SETUP_LOCAL_PROVIDERS` shall gain `grok`, `devin`, `cline`, `aider`, appended to the CLI setup segment after `pi` and before `ollama`. Existing providers shall retain relative order; `ollama` moves four absolute positions later.
26. `desktop/host/cliInventoryProbe.ts` shall map each to the identical runtime id and add labels, helper mappings, and platform-support metadata. Grok, Devin, and Aider use native-installer helpers on all three OSes. Cline uses the generic npm helper on macOS and Linux and exposes no executable helper on Windows.
27. `desktop/host/setupAssets.ts` shall register descriptors for supported provider/platform pairs with `requiresElevation: false`, `resumable: true`, and all five modes supported. Cline joins the Unix generic npm-provider list only; Grok, Devin, and Aider follow the Antigravity descriptor shape on all three OSes.
28. `desktop/host/packaging.ts` shall gain inventory entries naming only supported helper ids and `currentHome` paths: three platforms for Grok, Devin, and Aider, and macOS/Linux for Cline.
29. `desktop/host/bootstrapPage.ts` shall list the four in its setup provider id and label maps. If Proposed Decision PD1 is approved, the onboarding collapsed set shall stay `['claude_code', 'antigravity', 'codex']`.

#### Product execution catalog boundary

30. `src/shared/providerCatalogData.ts` `PRODUCT_PROVIDER_ORDER` shall remain unchanged while the four runtime adapters are refusal-only.
31. `PRODUCT_PROVIDER_MODELS` shall not gain default sentinels or model ids for the four at this tier.
32. `src/shared/providerCatalogInstances.ts` shall not gain executable instances for the four at this tier. Each provider may enter these three structures only in the same reviewed slice that lands a working runtime execution adapter.

#### Smoke tests

33. `scripts/{linux,macos}/test-*-package-smoke.sh` shall cover all four helpers' `--check` and `--dry-run` paths. `scripts/windows/Test-WindowsInstallerSmoke.ps1` shall cover Grok, Devin, and Aider and assert that Cline has no supported install action. Both Devin suites shall verify the manual step and the fail-closed result when the expected strip marker is missing.

### Non-Functional Requirements

- No helper may block on stdin. Every installer invocation runs under the non-interactive setup bridge.
- A downloaded Devin installer shall never execute unless its expected interactive setup line was matched exactly once and removed.
- Helper JSON output shape must be unchanged for existing providers; the additions are additive only.
- `--check` must not perform network calls.
- Uninstall must be idempotent and must not fail when the provider is already absent.

## Acceptance Criteria

- [ ] `install-grok.sh --check --json` on a host with Grok in `~/.grok/bin` reports `installed: true` with a version line.
- [ ] The same helper on a host with only an unrelated `agent` binary reports `installed: false`.
- [ ] Grok uninstall removes both fixed installer-owned paths (`grok` and its adjacent `agent` alias) without resolving or deleting any unrelated `agent` on PATH.
- [ ] `Install-Devin.ps1 -Apply -Json` completes without hanging under `_HiddenProcess.ps1` and returns `devin setup` in `manualSteps`.
- [ ] Both Devin helpers return a structured failure and do not execute the downloaded installer when the expected trailing setup marker is absent or appears more than once.
- [ ] `install-aider.sh --uninstall` removes Aider such that `aider --version` fails afterward, and emits the `uv` provenance warning.
- [ ] Cline installs, upgrades, and uninstalls through the npm pack on macOS and Linux; Windows setup reports it as unsupported and exposes no install action.
- [ ] `buildDesktopCliInventoryFromRuntime` reports all four when the runtime setup scan marks them available.
- [ ] Provider setup in packaged Desktop lists seventeen setup candidates in the agreed relative order, with the four new ids before `ollama`.
- [ ] The product execution catalog remains at its existing fourteen providers and contains no Grok, Devin, Cline, or Aider model or instance entries.
- [ ] Pi's package name is `@earendil-works/pi-coding-agent` in all four platform locations, and the old package is removed before install.
- [ ] Windows, macOS, and Linux smoke tests pass.

## Technical Design

### Install-directory abstraction

`provider_install_dir <provider>` becomes the single source for candidate paths and PATH persistence. Existing providers return `$HOME/.local/bin` unchanged, so the refactor is behavior-preserving; Grok is the first divergent value, and Kiro's existing Windows special case documents the pattern on the PowerShell side.

### Devin installer stripping

Both official Devin installers end with an invocation of the freshly installed binary's `setup` subcommand. The packaged helpers fetch the installer to a temp file, require the expected trailing invocation to occur exactly once, drop it, and execute the remainder with stdin redirected from the null device. If the expected shape is absent or ambiguous, the helper returns a structured error and deletes the temporary file without executing it. This makes upstream installer drift a review event rather than silently running a newly shaped remote script.

### Aider uninstall

`~/.local/bin/aider` is a `uv` tool shim. Removing it leaves `aider-chat` installed in the `uv` tool environment and the shim regenerable by any `uv tool` command. The correct uninstall is `uv tool uninstall aider-chat`; the file-removal fallback exists only for hosts where `uv` has since been removed.

### Setup-provider ordering

`DESKTOP_PROVIDER_SETUP_LOCAL_PROVIDERS` appends the four to its CLI setup segment immediately before `ollama`. Existing providers keep their relative order, while `ollama` moves four absolute positions later. The product execution catalog is deliberately unchanged.

## Dependencies

- `cats-runtime` SPEC-027 must land its taxonomy before the platform setup inventory: `cliInventoryProbe` maps desktop ids onto runtime `KNOWN_PROVIDERS` ids, so a desktop entry with no runtime counterpart can never report installed. This dependency does not authorize product execution catalog entries.
- `environment-bootstrap` remains the upstream source of truth for install URLs, directories, and auth flows.

## Risks

- **Upstream Devin installer changes shape**, breaking the strip. Mitigation: fail closed before execution and require the exact-match fixture to be reviewed and updated.
- **Aider's installer changes its shell or bundled-`uv` behavior.** Mitigation: the helper cites the upstream script it mirrors, so reconciliation is a diff.
- **`provider_install_dir` refactor regresses an existing provider.** Mitigation: the default preserves current behavior and smoke tests cover all providers.
- **Seventeen setup candidates widen setup renderer assertions.** Mitigation: preserve relative order and separately assert that the fourteen-provider execution catalog is unchanged.
- **Grok and Devin need accounts to verify end to end.** Mitigation: acceptance criteria are written against install/detect/uninstall, not against a successful session.

## Proposed Decisions

> These proposals turn the first draft's open questions into reviewable choices. The User approved the Grok-only implementation slice on 2026-08-08, including the Grok-specific effects of these proposals. Devin, Cline, and Aider remain approval-gated. PD1 is the most product-sensitive choice because it controls the first-run surface.

### PD1 — Onboarding collapsed set

**Proposal**: None of the four joins `ONBOARDING_COLLAPSED_PROVIDER_IDS`. It stays `['claude_code', 'antigravity', 'codex']`.

**Why**: Reading `bootstrapPage.ts` confirms the collapsed set is the list of providers that **stay visible** in the collapsed first-run view — a curated three-card recommendation, not a completeness list. Per `cats-runtime` ADR-033, all four ship at the install/check tier with refusal-stub execution, so featuring one in the very first surface a new user sees would recommend a provider that installs cleanly and then cannot run a session.

Grok's upstream **Quick** mode membership was the argument for including it, but Quick mode is about which batch a bootstrap script installs unattended, not about which provider a GUI should recommend first. The two surfaces answer different questions.

Revisit when Grok gains a working execution adapter — at that point it is a reasonable candidate for the featured set.

### PD2 — Quick/Full distinction in packaged setup

**Proposal**: No. `native_cli_pack` stays flat; upstream's Quick/Full split is not surfaced.

**Why**: The packaged pack taxonomy (`api_baseline`, `native_cli_pack`, `local_model_pack`, `wsl_power_user_pack`) is a *delivery* concept the platform owns. Quick/Full is a *bootstrap script batching* concept that exists because those scripts install unattended in one shot. Packaged setup installs per provider, on demand, from a UI — there is no batch for Quick/Full to describe. Adding the axis would give users a second taxonomy to learn that never changes what any button does.

### PD3 — Aider readiness in the platform helper

**Proposal**: Presence-only. The shell and PowerShell helpers detect the binary and report version; they do not inspect model API-key env vars. Optional non-secret credential evidence and the still-unknown auth state stay in the runtime, per `cats-runtime` SPEC-027 D3.

**Why**: Layering. Every other provider's auth state is owned by the runtime's `knowledge.ts` `auth` block and the setup-state scan; the packaged helper's contract is install and detect. Duplicating environment inspection across platform-specific helpers creates implementations that can disagree with the runtime's one, and a helper has no reliable view of the user's `.aider.conf.yml` or command-line model choice anyway — so its answer would be less correct, not just redundant.

### PD4 — Removing Aider's bundled `uv`

**Proposal**: No flag. Warn only, as ADR-109 specifies.

**Why**: Two reasons compound. Destructive operations need explicit opt-in *and* a well-understood blast radius; here the blast radius is exactly what cannot be determined — the helper has no way to tell whether the `uv` in `~/.local/bin` came from Aider's installer or from the user's own install, which is the whole reason the warning exists. A flag would let a user opt into a deletion neither they nor the helper can scope. Nobody has reported the shadowing actually biting; a warning is the proportionate response until someone does.

### PD5 — Windows helper file naming

**Proposal**: The supported Windows helper names are `Install-Grok.ps1`, `Install-Devin.ps1`, and `Install-Aider.ps1`. The rule is PowerShell approved verb followed by the provider id in PascalCase, with no `Cli` suffix. No `Install-Cline.ps1` ships while Cline CLI is unsupported on Windows.

**Why**: The existing directory looks inconsistent but resolves cleanly once the two conventions in it are separated. Acronym casing is settled — `Install-GitHubCli.ps1`, `Install-KiloCli.ps1`, `Install-KiroCli.ps1` all use `Cli`, never `CLI`, so `Install-GrokCLI.ps1` was never a live option. What actually varies is whether a `Cli` suffix appears at all, and the newest addition answers it: `Install-Antigravity.ps1` drops it even though the tool is named "Antigravity CLI". That is the closest precedent — a native CLI installer added by the most recent provider slice — and it matches the Unix wrappers, which are pure provider ids (`install-antigravity.sh`).

Keeping the filename stem equal to the provider id also keeps `setupAssets.ts` mechanical, since it derives asset and helper ids from that id.

**Not in scope**: this does not retroactively rename `Install-KiloCli.ps1` / `Install-KiroCli.ps1` (whose Unix counterparts are already inconsistent — `install-kilo.sh` vs `install-kiro-cli.sh`). Worth a separate tidy-up if a reviewer wants the convention applied uniformly.

### PD6 — Product execution catalog boundary

**Proposal**: Add the four to the desktop setup inventory but not to `PRODUCT_PROVIDER_ORDER`, `PRODUCT_PROVIDER_MODELS`, or `PRODUCT_PROVIDER_INSTANCES` until each has a working runtime execution adapter.

**Why**: Setup inventory answers whether Cats can install and inspect a tool. The product catalog answers what users can select to run a session. Refusal-only adapters satisfy the former contract but not the latter; combining them would advertise guaranteed failures in execution selectors.

## Related

- [ADR-109: Port the Grok, Devin, Cline, and Aider installers into packaged setup](../decisions/109-port-grok-devin-cline-aider-installers-into-packaged-setup.md)
- [PLAN-102: Grok, Devin, Cline, and Aider Packaged Setup Rollout](../plans/PLAN-102-grok-devin-cline-aider-packaged-setup-rollout.md)
- [SPEC-110: Antigravity CLI in Packaged Setup and Provider Catalog](./SPEC-110-antigravity-cli-in-packaged-setup-and-provider-catalog.md)
- [SPEC-093: Settings runtime CLI provider lifecycle](./SPEC-093-settings-runtime-cli-provider-lifecycle.md)
- [Cline CLI installation and supported platforms](https://docs.cline.bot/getting-started/installing-cline)
- [npm install and global `--allow-scripts`](https://docs.npmjs.com/cli/install/)
- cats-runtime SPEC-027, ADR-033, PLAN-034

---

*Created: 2026-08-07*
*Author: Claude draft for User review*

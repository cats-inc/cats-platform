# ADR-109: Port the Grok, Devin, Cline, and Aider installers into packaged setup

Date: 2026-08-07
Status: Proposed

## Context

`environment-bootstrap` added four AI coding CLIs to the upstream installer suite between 2026-08-04 and 2026-08-05: Grok CLI (xAI, `cb5efc7`), Cline (`d131535`), Devin CLI (`216ef96`), and Aider (`54992d6`). `cats-runtime` ADR-033 proposes adopting all four as CLI provider families at the install/check tier.

`cats-platform` owns the packaged half of that story. Today it ships repo-owned installer helpers for twelve providers across three OSes, exposed to Cats Desktop through a structured JSON contract:

- `scripts/{linux,macos}/provider-cli-common.sh` — a table-driven native-installer runtime (`provider_display_name`, `provider_primary_command`, `provider_install_url`, `provider_binary_candidates`, `run_remote_pipe_installer`, `run_provider_install_action`), with per-provider thin wrappers like `install-antigravity.sh`.
- `scripts/{linux,macos}/node-cli-common.sh` — a `node_cli_package_rows` table (`id|command|package|label`) driving the npm provider pack.
- `scripts/windows/Install-<Provider>.ps1` — per-provider wrappers implementing `-CheckOnly/-Apply/-Upgrade/-Force/-Uninstall/-DryRun/-Json`, with npm providers delegating to `_NpmCliInstaller.ps1`.
- `desktop/host/{contracts,cliInventoryProbe,setupAssets,packaging,bootstrapPage}.ts` — the desktop-side provider id list, runtime-id mapping, setup-asset descriptors, packaging inventory, and onboarding UI.
- `src/shared/providerCatalogData.ts` / `providerCatalogInstances.ts` — the product-facing execution-provider order, model lists, and instance descriptors. These are intentionally narrower than the setup inventory.

Four properties of the new CLIs do not fit the existing helper assumptions:

1. **Grok installs outside `~/.local/bin`.** It lands in `~/.grok/bin` (plus an `agent` alias). `provider_binary_candidates` and the PATH-hint logic currently assume `~/.local/bin` for every native provider except Kiro on Windows.
2. **Aider's installer is not a `bash` pipe.** Upstream is `curl -LsSf https://aider.chat/install.sh | sh`, and that script is the `uv` installer plus `uv tool install --force --python python3.12 --with pip aider-chat@latest`. It installs a second tool (`uv`) as a side effect, and its uninstall is `uv tool uninstall aider-chat`, not `rm ~/.local/bin/aider`.
3. **Devin's official installers end by invoking the interactive `devin setup`.** `environment-bootstrap` strips that final call precisely so unattended installs cannot hang. The packaged setup bridge runs helpers non-interactively through `_HiddenProcess.ps1` with no console a prompt could reach, so an unstripped installer does not merely inconvenience the user — it hangs the Desktop setup step until timeout.
4. **Devin's Windows installer is PowerShell-only.** Upstream documents that Git Bash and CMD fail, though the installed binary works from any shell.
5. **Cline CLI is not officially supported on Windows.** Upstream's CLI preview currently supports macOS and Linux and says Windows support is coming soon. A Windows npm package being installable is not enough evidence that the CLI executes correctly there.

A pre-existing drift also surfaced during this audit: `scripts/{linux,macos}/node-cli-common.sh`, `scripts/{linux,macos}/install-pi.sh`, `scripts/windows/Install-Pi.ps1`, and `scripts/windows/Check-WindowsSetupReadiness.ps1` all install Pi from `@mariozechner/pi-coding-agent`. Upstream `cfe7785` moved to `@earendil-works/pi-coding-agent`, removing the old package first because npm reports a renamed package as permanently up to date, so every upgrade path silently skips it.

## Decision

This ADR proposes that `cats-platform` port the four CLIs into packaged setup on their supported platforms as repo-owned installer helpers, extending the existing table-driven contracts rather than adding parallel ones. Specifically:

1. **`grok`, `devin`, `cline`, `aider` become `DESKTOP_PROVIDER_SETUP_LOCAL_PROVIDERS` entries**, mapped one-to-one onto the runtime ids ADR-033 introduces and appended to the CLI setup segment after `pi` and before `ollama`. Existing providers retain their relative order; `ollama` shifts four absolute positions later.
2. **Grok, Devin, and Aider ship as native-installer helpers on Windows, macOS, and Linux.** Cline joins the existing npm pack on macOS and Linux only. Packaged setup shall report Cline as unsupported on Windows and shall not ship a Windows helper or setup asset until upstream announces support or a reviewed live Windows execution probe establishes an explicit local contract.
3. **`provider_binary_candidates` gains a per-provider install directory** instead of assuming `~/.local/bin`. Grok resolves against `~/.grok/bin`; the PATH-persistence helper learns to persist that directory.
4. **`run_remote_pipe_installer` gains an Aider case using `sh` and `-LsSf`**, and Aider's uninstall path uses `uv tool uninstall aider-chat` with a `rm ~/.local/bin/aider` fallback. The helper does not remove the `uv` binary the Aider installer brings with it, because it cannot tell whether the user's `uv` came from Aider or from elsewhere; it reports the ambiguity as a warning instead.
5. **The packaged Devin installers strip exactly one expected trailing interactive `setup` call**, mirroring upstream, and report `devin setup` as a `manualSteps` entry in their JSON result. If the expected line is missing or ambiguous, the helper fails closed before executing the downloaded installer and returns a structured error. A successful packaged install proves binary presence only; authentication remains unverified, and later checks do not guess whether the user completed the manual step.
6. **Grok's `agent` alias is not registered** as a binary candidate or alias target, matching ADR-033. Uninstall does remove the fixed, installer-owned `agent` / `agent.exe` path next to `grok`, so packaged setup does not leave a known artifact behind; it never searches PATH for a generic `agent` command.
7. **Setup-asset metadata marks supported provider/platform pairs `requiresElevation: false` and `resumable: true`.** Grok, Devin, and Aider have assets on all three OSes; Cline has assets on macOS and Linux only.
8. **The shared product execution catalog does not gain these four while their runtime adapters are refusal-only.** `PRODUCT_PROVIDER_ORDER`, `PRODUCT_PROVIDER_MODELS`, and `PRODUCT_PROVIDER_INSTANCES` remain unchanged. Setup visibility is supplied by the desktop setup inventory and runtime setup-state mapping, without making an unusable provider selectable for execution.
9. **Cline follows npm's versioned `--allow-scripts` behavior.** When npm exposes the global-install policy, the helper applies the exact upstream package allowlist recorded by the shared probe. Older npm versions retain their existing lifecycle-script behavior rather than receiving an unsupported option.
10. **The Pi npm package rename is corrected in the same slice**, in all four platform locations, with the old package removed before the new one is installed.

## Rationale

### Why extend the table-driven helpers rather than write bespoke scripts

The existing contract already carries the hard part: JSON result shape, check/apply/upgrade/force/uninstall modes, dry-run, PATH persistence, and version detection. Three of the four new CLIs are ordinary user-scoped native installers; they differ only in install directory and pipe shell. Encoding those two differences as table entries keeps one code path under test instead of four.

### Why the Devin interactive-setup strip is a correctness requirement, not a convenience

The desktop setup bridge invokes helpers through `_HiddenProcess.ps1` — no visible console, no stdin a prompt can read. An installer that ends with an interactive `devin setup` therefore blocks forever rather than failing fast. Upstream already solved this by editing the fetched installer before execution; the packaged wrapper must do the same, and must additionally tell the user that the skipped step is still owed. Reporting `installed: true, ready: true` after skipping authentication would be a lie the product then acts on.

The strip itself is a safety boundary. Redirecting stdin does not make an unexpected upstream script safe: if the known interactive line cannot be identified exactly once, executing the unreviewed shape could hang, prompt through another channel, or perform newly added setup behavior. The helpers therefore fail before execution and require the strip fixture to be updated deliberately.

### Why Aider gets a separate installer case rather than being forced into the bash pipe

`curl -fsSL … | bash` and `curl -LsSf … | sh` are not interchangeable here: the upstream script is a `uv` installer whose behavior under a different shell is untested, and matching upstream exactly is the whole point of a porting exercise. Aider's uninstall is likewise genuinely different — the binary at `~/.local/bin/aider` is a `uv` tool shim, so deleting it leaves the tool installed and the shim regenerable.

### Why `uv` is not uninstalled with Aider

Aider's installer places its own `uv` (pinned older) in `~/.local/bin`, and users commonly have a newer `uv` from other sources. The helper has no reliable way to attribute the binary. Removing a `uv` the user installed separately is a destructive false positive; leaving it is at worst untidy. The helper warns and moves on.

### Why Grok needs an install-directory abstraction rather than a special case

Kiro on Windows already forced one non-`~/.local/bin` exception, handled inline. Grok makes it two, and the next upstream CLI will make it three. Turning the assumption into a lookup now is cheaper than the third special case later, and it is what the runtime's `pathHints` contract already models on the other side of the seam.

### Why setup visibility is separate from execution selection

An installer can be useful before an execution adapter exists, but a product catalog entry promises that selecting the provider can start a session. ADR-033 deliberately ships refusal stubs until live probes establish stream contracts. Adding these four to the execution catalog now would expose controls that can only fail, so the setup inventory expands independently and the product catalog waits for each adapter.

## Consequences

### Positive

- Cats Desktop can install, check, upgrade, force-reinstall, and uninstall Grok, Devin, and Aider on all three OSes, and Cline on macOS and Linux, through the same setup UI as existing providers.
- The desktop CLI inventory reflects the four, so the bootstrap gate and readiness audit stop under-reporting a provisioned machine.
- Encoding Grok's install directory as data removes a latent assumption that would have broken on the next non-standard installer.
- Devin's stripped-setup semantics become an explicit, surfaced product state instead of a silent hang.
- Pi upgrades start working again on packaged hosts.

### Negative

- Four providers appear in packaged provider setup that cannot yet run sessions (per ADR-033, execution is probe-gated). Onboarding copy must make "installed" versus "usable" legible, and Windows must make Cline's unsupported state explicit.
- `provider-cli-common.sh` grows a third and fourth install shape, increasing the surface the Unix smoke tests must cover.
- Windows gains three new per-provider `Install-*.ps1` wrappers, each of which must implement the full JSON mode contract.
- Setup inventory assertions grow from thirteen to seventeen entries, while product execution catalog assertions must prove the existing fourteen entries remain unchanged.

### Neutral

- Aider's bundled `uv` may shadow a user's newer `uv` depending on PATH order. Reported as a warning, not managed.
- Upstream's Quick/Full mode split is not adopted; all four join `native_cli_pack` alongside the existing providers.
- The product execution catalog carries no entries or model sentinels for the four until their runtime adapters can execute.

## Alternatives Considered

### 1. Ship only the runtime-side provider ids and let users install these CLIs by hand

- **Pros**: No new installer helpers, no smoke-test surface, no new failure modes.
- **Cons**: Packaged Cats Desktop is meant to provision its own providers; making supported provider/platform pairs manual-only breaks the setup promise and produces a setup screen that can detect but not fix.
- **Why rejected**: The install path is the deliverable being asked for.

### 2. Vendor `environment-bootstrap`'s scripts directly instead of porting them

- **Pros**: Zero translation risk; upstream fixes flow through verbatim.
- **Cons**: Upstream scripts are interactive, Chinese-language, human-facing console tools with `Wait-ForExit` prompts and no JSON contract. The desktop setup bridge needs structured `check/apply/upgrade/force/uninstall` results and a non-interactive process model.
- **Why rejected**: The two suites serve different consumers. Upstream stays the source of truth for *what* to install; the packaged helpers own *how* to report it.

### 3. Force Aider through the existing bash-pipe installer case

- **Pros**: One fewer branch in `run_remote_pipe_installer`.
- **Cons**: Diverges from the upstream invocation upstream actually tests, and leaves the uninstall path silently broken because a `uv` tool shim is not an ordinary binary.
- **Why rejected**: Trades a two-line branch for an untested install and a wrong uninstall.

### 4. Run `devin setup` automatically during packaged install

- **Pros**: Devin would be usable immediately after install.
- **Cons**: It is an interactive browser/account flow with no console available in the packaged setup process. It cannot succeed there.
- **Why rejected**: Impossible as specified; the manual-step surface is the honest alternative.

## Notes for Future Work

- If a third non-`~/.local/bin` provider appears, `provider_binary_candidates` should move from a `case` table to a single provider-metadata block shared with `provider_install_url` and `provider_primary_command`.
- The Pi rename revealed that nothing detects drift between `environment-bootstrap` and the packaged helper tables. A reconciliation check comparing package names, install URLs, and binary paths across the two repos would catch the next one.
- Once a runtime probe and implementation land a working execution adapter, that provider may join the product execution catalog with evidence-backed model ids or an explicitly justified default sentinel in the same slice.

## Related

- [SPEC-112: Grok, Devin, Cline, and Aider in Packaged Setup and the Setup Provider Inventory](../specs/SPEC-112-grok-devin-cline-aider-in-packaged-setup-and-provider-catalog.md)
- [PLAN-102: Grok, Devin, Cline, and Aider Packaged Setup Rollout](../plans/PLAN-102-grok-devin-cline-aider-packaged-setup-rollout.md)
- [ADR-107: Replace Gemini CLI with Antigravity in packaged setup](./107-replace-gemini-cli-with-antigravity-in-packaged-setup.md)
- [Cline CLI installation and supported platforms](https://docs.cline.bot/getting-started/installing-cline)
- [npm install and global `--allow-scripts`](https://docs.npmjs.com/cli/install/)
- cats-runtime ADR-033, SPEC-027, PLAN-034
- environment-bootstrap commits `cb5efc7` (Grok), `d131535` (Cline), `216ef96` (Devin), `54992d6` (Aider), `0d1831d` (honest install/check exit codes), `cfe7785` + `75bd6ca` (Pi npm package rename)

---

*Proposal prepared: 2026-08-07*
*Decision status: Pending User approval*

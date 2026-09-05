# ADR-113: Port the Meta Muse installer into packaged setup and retire Aider

Date: 2026-09-05
Status: Accepted

## Context

`environment-bootstrap` added Meta's Muse CLI and deleted Aider in one commit
(`6f59feb`, 2026-09-05). Muse ships a native installer for every platform, so it
joined Quick and Full mode on all three; Aider's three installers were deleted
outright.

`cats-runtime` made the matching call in its
[ADR-037](../../../cats-runtime/docs/decisions/037-adopt-meta-muse-as-an-executable-cli-provider-and-retire-aider.md):
`muse` becomes a fully executable CLI provider family, and Aider is removed. This
ADR is the packaged-setup half of that change.

Aider entered packaged setup through
[ADR-109](./109-port-grok-devin-cline-aider-installers-into-packaged-setup.md) as
a setup-only provider — installable and detectable, never executable. It cost
two carve-outs that existed for nothing else: `bootstrapPage.ts` kept its card
out of the onboarding grid so nobody could install a CLI that would never become
a usable target, and the uninstall path in `provider-cli-common.sh` carried a
`uv tool uninstall aider-chat` special case plus a warning about a bundled `uv`
of unknown provenance.

Muse brings its own two properties that the existing helper table does not model:

1. **The installed entry point is a launcher, not the tool.** The official
   installer writes `muse.cmd` plus `.muse-launcher.ps1` into
   `%LOCALAPPDATA%\Programs\muse` on Windows, or a launcher script to
   `~/.local/bin/muse` on POSIX. The launcher then downloads
   `muse-bin-<version>` beside itself and records the version in
   `.muse-version`. An install that fails between those two steps leaves an
   entry point with nothing behind it.
2. **The launcher forwards every argument straight through.** `provider_version_line`
   runs `<command> --version` for every provider, with no timeout. On muse a
   flag the agent binary does not recognise opens the interactive TUI instead of
   failing — in a packaged setup step with no console a prompt can reach, that is
   an unbounded hang rather than an error. Muse 1.0.3 does accept `--version`,
   but the launcher self-updates in the background, so the installed build moves
   on its own and this cannot be relied on.

Muse is also the first provider whose Windows and POSIX install directories
differ, which the existing `provider_install_dir` / `expectedPaths` tables
assumed away.

## Decision

Port muse into packaged setup on all three platforms, and delete Aider from it.

Detection, version, and uninstall each get muse-specific handling:

- **Installed** means the launcher *and* a matching `muse-bin-<version>` build.
  A launcher on its own is reported as not installed, so the repair reinstall
  runs instead of being skipped. The Windows helper additionally warns that it
  found a half-finished install.
- **Version** is read from `.muse-version`. The helpers never execute `muse` at
  all, on either platform. `cats-runtime`'s compatibility probe does run
  `--version`, because it runs every provider under an explicit timeout and
  reports the timeout; packaged setup has no such bound.
- **Uninstall** removes every `muse-bin-*` build and `.muse-*` state file in the
  install directory, not just the entry point. Those builds are ~300MB each, and
  removing only the launcher would leave them. They are named deterministically,
  so nothing else in the shared `~/.local/bin` is touched. Credentials in
  `~/.config/muse/auth.json` are left alone, as for every other provider.
- `MUSE_INSTALL_DIR` overrides the install directory on both platforms, matching
  the official installer, and the helpers honour it.

Two smaller consequences:

- The POSIX side gains `run_downloaded_shell_installer`, which stages the
  official script to a temp file before running it. `curl … | bash` exits 0 when
  the download itself fails, because bash reads empty input and succeeds — so a
  failed install would otherwise report as a success.
- The Windows installer runs under `powershell.exe` (5.1) rather than preferring
  `pwsh.exe`, because the muse launcher runs under 5.1 and a `PSModulePath`
  inherited from PowerShell 7 breaks its download step. That failure is exactly
  what produces a shim with no agent build.

`muse` also enters the product execution catalog (`PRODUCT_PROVIDER_ORDER`,
models, and a `cli/native` instance) and the onboarding native-CLI grid, which
Aider never did.

For Aider: `Install-Aider.ps1`, `install-aider.sh`, the `uv` uninstall special
case, the setup-asset descriptors, the packaging inventory entry, the desktop
provider id, and the onboarding carve-out are all deleted. ADR-109, SPEC-112,
and PLAN-102 stay as the record of why it was there.

## Consequences

### Positive

- One more installable provider that is also executable, so the onboarding grid
  no longer has to hide a card.
- The `uv`-shim uninstall special case and its "provenance unknown" warning are
  gone; the muse handling that replaces it removes only deterministically named
  files.
- `run_downloaded_shell_installer` is reusable: any future provider whose
  installer is a curl-piped script can stop misreporting download failures as
  successes.

### Negative

- `provider_version_line` now takes a provider argument, so a caller that
  forgets it silently falls back to executing the CLI. Both call sites were
  updated and the muse path is covered by a test whose fixture launcher writes a
  tripwire file if it is ever run.
- Anyone still using Aider through packaged setup loses it and must install it by
  hand.
- The Windows helper's install directory is no longer derivable from the POSIX
  one, so the two platform tables genuinely diverge for this provider.

### Neutral

- The launcher self-updates in the background, so the version packaged setup
  reports can change without any Cats action. `MUSE_NO_AUTO_UPDATE=1` stops it.

## Alternatives Considered

### Alternative 1: Run `muse --version` like every other provider

- **Pros**: no special case; the helper table stays uniform.
- **Cons**: correct only for as long as the agent binary happens to accept the
  flag, and the launcher updates that binary on its own schedule. The failure
  mode is a hang with no output, in an unattended step.
- **Why rejected**: `.muse-version` is maintained by the launcher itself, needs
  no network, and cannot hang. `environment-bootstrap` reached the same
  conclusion independently in `6f59feb`.

### Alternative 2: Treat the launcher's presence as "installed"

- **Pros**: matches every other provider's detection rule.
- **Cons**: reports a known-broken half-install as ready and skips the reinstall
  that would repair it. This state was observed in practice — a PowerShell 7
  `PSModulePath` leaking into 5.1 broke the launcher's download step.
- **Why rejected**: same lesson as "do not verify an install with
  `command -v <tool>` alone".

### Alternative 3: Keep Aider alongside muse

- **Pros**: no removal; no one loses anything.
- **Cons**: keeps a setup-only provider and its two carve-outs alive, and
  diverges from both the upstream installer suite and cats-runtime, which have
  each just removed it.
- **Why rejected**: the provider it installs no longer exists on the runtime
  side, so packaged setup would be installing a CLI Cats cannot use at all.

## References

- [cats-runtime ADR-037](../../../cats-runtime/docs/decisions/037-adopt-meta-muse-as-an-executable-cli-provider-and-retire-aider.md)
- [cats-runtime Meta Muse CLI probe (2026-09-05)](../../../cats-runtime/docs/research/2026-09-05-meta-muse-cli-probe.md)
- [ADR-109](./109-port-grok-devin-cline-aider-installers-into-packaged-setup.md)
- [SPEC-112](../specs/SPEC-112-grok-devin-cline-aider-in-packaged-setup-and-provider-catalog.md)
- `sammykenny2/environment-bootstrap` commit `6f59feb`

---

*Decision made: 2026-09-05*
*Decision makers: Kenny Chou, Claude*

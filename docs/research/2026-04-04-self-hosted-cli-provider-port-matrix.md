# Self-Hosted CLI Provider Port Matrix

> Date: 2026-04-04
> Topic: `environment-bootstrap` CLI provider install/check/upgrade knowledge
> Source: local `environment-bootstrap/` submodule plus current `cats-platform/`
> implementation

## Purpose

Freeze which self-hosted CLI-provider capabilities are now repo-owned inside
`cats-platform`, which source-knowledge lanes never existed in
`environment-bootstrap`, and which gaps are now product-integration gaps rather
than missing script surfaces.

## Coverage Summary

| Lane | `environment-bootstrap` source | `cats-platform` repo-owned surface | Status |
|------|-------------------------------|------------------------------------|--------|
| Windows native host providers | `platform/windows/*`, `shared/windows/Upgrade-CLITools.ps1` | `scripts/windows/Install-ClaudeCode.ps1`, `Install-CursorAgent.ps1`, `Install-Goose.ps1`, `Install-Junie.ps1`, `Install-NodeCliPack.ps1`, `Upgrade-CLITools.ps1`, `Check-CLITools.ps1` | Ported |
| Windows WSL substrate + first in-distro provider | `platform/windows/Install-WSL*`, `shared/windows/Install-WSLCLITools.ps1` | `scripts/windows/Install-WslUbuntuEnvironment.ps1`, `Install-KiroWslCli.ps1`, `Install-WSLCLITools.ps1`, `Check-CLITools.ps1` | Ported |
| Windows Docker prerequisite + Docker-target provider installs | `platform/windows/Install-Docker-Admin.ps1`, `shared/windows/Install-DockerCLITools.ps1` | `scripts/windows/Install-DockerDesktop.ps1`, `Install-DockerCLITools.ps1`, `Check-CLITools.ps1`, `Upgrade-CLITools.ps1` | Ported |
| Linux host provider install/check/upgrade | `platform/linux/install-*.sh`, `platform/linux/check-installation.sh`, `shared/linux/upgrade-cli-tools.sh` | `scripts/linux/setup-node-global-prefix.sh`, `install-node-cli-tools.sh`, `install-claude-code.sh`, `install-cursor-agent.sh`, `install-goose.sh`, `install-junie.sh`, `install-kiro-cli.sh`, `upgrade-cli-tools.sh`, `check-installation.sh` | Ported |
| macOS host provider install/check/upgrade | `platform/macos/install-*.sh`, `platform/macos/check-installation.sh`, `shared/macos/upgrade-cli-tools.sh` | `scripts/macos/setup-node-global-prefix.sh`, `install-node-cli-tools.sh`, `install-claude-code.sh`, `install-cursor-agent.sh`, `install-goose.sh`, `install-junie.sh`, `install-kiro-cli.sh`, `upgrade-cli-tools.sh`, `check-installation.sh` | Ported |
| Unix Docker-target provider installs | none in `environment-bootstrap` | none | Not a port gap |

## Provider Family Matrix

The 12-provider baseline from `environment-bootstrap` is now represented in
repo-owned `cats-platform` helper surfaces:

- native-first: `claude`, `cursor`, `goose`, `junie`, `kiro`
- npm-pack: `codex`, `gemini`, `copilot`, `opencode`, `kilo`, `auggie`, `pi`

Windows host/native scripts own the native-first baseline.
Windows WSL and Docker aggregate helpers own the same 12-provider matrix for
their target environments.
Linux and macOS host helpers own the same 12-provider matrix for self-hosted
host installs.

## What Is Explicitly Not Ported Here

- Packaged setup wizard consumption of the new self-hosted helper surfaces
- Renderer/bootstrap integration for the new WSL/Docker operational helpers
- Release-grade signed installer and update-trust-chain work
- Unix Docker-target provider installs, because `environment-bootstrap` did not
  define that lane in the first place

## Remaining Real Gaps

The remaining gaps after this port pass are productization gaps, not missing
repo-owned helper knowledge:

1. The packaged setup wizard still only consumes the packaged-host helper
   contract, not the broader self-hosted operational helper surfaces.
2. Windows aggregate WSL/Docker helper runtime behavior still needs a real
   Windows validation pass; the current repo only has deterministic helper
   contracts plus file-level coverage in non-Windows environments.
3. Release pipelines, signed installers, and polished remediation UX still sit
   above these helper surfaces.

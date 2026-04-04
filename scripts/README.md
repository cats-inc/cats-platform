# Scripts

> Project automation scripts live here.

## Layout

```
scripts/
├── shared/    # Shared Unix shell helpers
├── windows/   # PowerShell (.ps1)
├── linux/     # Bash (.sh)
├── macos/     # Bash (.sh)
└── testing/   # Test helpers (shared)
```

## Standards

Follow `docs/SCRIPT-STANDARDS.md` for naming and documentation rules.

## Public Ingress Helpers

`cats` now ships local/self-hosted startup helpers for both Tailscale Funnel
and ngrok:

- `scripts/windows/Setup-TailscaleFunnel.ps1`
- `scripts/windows/Setup-NgrokTunnel.ps1`
- `scripts/linux/setup-tailscale-funnel.sh`
- `scripts/linux/setup-ngrok-tunnel.sh`
- `scripts/macos/setup-tailscale-funnel.sh`
- `scripts/macos/setup-ngrok-tunnel.sh`

These scripts can build the project, create a login auto-start runner, start
the local built `cats` server, and ensure a public ingress provider is up.
They still do **not** register Telegram webhooks.

They are intended for webhook-mode/self-hosted ingress scenarios. They are not
the only future Telegram setup path: the current planning direction is
polling-first Telegram onboarding, with these helpers remaining optional for
operators who prefer or require webhook delivery.

The intended flow is:

1. Run the helper for your platform and chosen ingress provider
2. Let the helper keep local `cats` + ingress available at login
3. Use `Settings > Cats` inside the product to manage Telegram bot bindings
   and webhook registration

Tailscale remains the cheaper default for self-hosted webhook use. ngrok is
supported as an alternative when you prefer or already depend on it.

## Desktop Host Helpers

The first Electron host slice now has simple wrappers for local packaged-style
startup:

- `scripts/windows/Start-DesktopHost.ps1`
- `scripts/linux/start-desktop-host.sh`
- `scripts/macos/start-desktop-host.sh`

These wrappers call `npm run desktop:start`, which builds:

- `dist-server/`
- `dist/`
- `dist-electron/`

and then launches the Electron host that supervises local `cats-runtime` and
`cats` child processes.

## Collaboration Helpers

`cats` also keeps repo-owned cross-platform skill sync helpers so local agent
discovery paths do not depend on bootstrap submodules:

- `scripts/windows/Sync-AgentSkills.ps1`
- `scripts/linux/sync-agent-skills.sh`
- `scripts/macos/sync-agent-skills.sh`

These scripts sync `skills/` into `.claude/skills`, `.agents/skills`, and
`.gemini/skills`, and support:

- `--clean` / `-Clean`
- `--agent <claude|codex|gemini>` / `-Agent <...>`

## Self-Hosted npm Package Helpers

`cats-platform` now also ships repo-owned npm pack/install smoke helpers on
each desktop platform:

- `scripts/windows/Pack-Install.ps1`
- `scripts/linux/pack-install.sh`
- `scripts/macos/pack-install.sh`

These helpers build the app package, create a local `.tgz`, and optionally
install that tarball globally for the self-hosted npm app path.

Shared behavior:

- interactive mode prompts for global install with a default of yes; if install proceeds, tarball deletion also defaults to yes
- `--pack-only` creates the tarball and prints the later `npm install -g` command
- `--install` skips prompts, installs the tarball globally, and deletes it afterward
- `--clean` explicitly forces tarball deletion after a successful install
- `--skip-build` assumes `npm run build` has already been run

After a successful install, verify the executable contract with
`cats-platform --help`. This path is separate from the Electron desktop
packaging and installer flows.

`cats-platform` now also ships its first repo-owned packaged setup helper:

- `scripts/windows/Setup-NodeGlobalPrefix.ps1`
- `scripts/windows/Install-NodeCliPack.ps1`
- `scripts/windows/Install-CursorAgent.ps1`
- `scripts/windows/Check-WslPrerequisites.ps1`
- `scripts/windows/Install-WslUbuntuEnvironment.ps1`
- `scripts/windows/Install-KiroWslCli.ps1`
- `scripts/windows/Check-WindowsSetupReadiness.ps1`

These helpers rewrite the stable Windows npm-prefix/PATH preparation and
npm-global AI CLI pack installation knowledge that previously lived only in
`environment-bootstrap`. They are intended for packaged-host setup flows and
support:

- `-CheckOnly`
- `-Apply`
- `-Json`

`Install-NodeCliPack.ps1` also supports:

- `-Upgrade`
- `-Force`

`Install-CursorAgent.ps1` supports the same structured packaged-host contract:

- `-CheckOnly`
- `-Apply`
- `-Upgrade`
- `-Force`
- `-Json`

It keeps Cursor on the Windows-native install path for packaged setup instead
of treating Cursor as a WSL-first provider.

`Check-WslPrerequisites.ps1` adds the first repo-owned WSL prerequisite
preflight contract so the host can tell whether Windows build, WSL presence,
and the target distro are ready before it attempts feature enablement or distro
installation.

`Install-WslUbuntuEnvironment.ps1` adds the first repo-owned WSL mutation
contract for packaged setup:

- `-CheckOnly`
- `-Apply`
- `-Upgrade`
- `-Force`
- `-Json`

It enables the WSL substrate, sets WSL2 as the default version, and registers
the requested Ubuntu distro without treating `environment-bootstrap` as a
shipped dependency. When substrate changes are applied it intentionally returns
`restart_required` so the packaged host can resume distro install cleanly after
reboot.

`Install-KiroWslCli.ps1` adds the first repo-owned WSL-backed provider
installer contract:

- `-CheckOnly`
- `-Apply`
- `-Upgrade`
- `-Force`
- `-Json`

It keeps the Kiro-specific WSL knowledge inside `cats`, including dependency
checks, `.bashrc` PATH cleanup, `kc` alias repair, and the post-install
sign-in follow-through.

`Check-WindowsSetupReadiness.ps1` composes the repo-owned packaged setup
helpers into one host-readable audit for native CLI pack readiness and WSL
prerequisite readiness.

Together these let the host treat packaged setup helpers as structured assets
instead of raw bootstrap dependencies.

## Self-Hosted Provider Helpers

`cats-platform` now also ships repo-owned Unix self-hosted provider helpers so
macOS/Linux operators do not need to depend on `environment-bootstrap` at
runtime:

- `scripts/linux/setup-node-global-prefix.sh`
- `scripts/linux/install-node-cli-tools.sh`
- `scripts/linux/install-claude-code.sh`
- `scripts/linux/install-cursor-agent.sh`
- `scripts/linux/install-goose.sh`
- `scripts/linux/install-junie.sh`
- `scripts/linux/install-kiro-cli.sh`
- `scripts/linux/upgrade-cli-tools.sh`
- `scripts/linux/check-installation.sh`
- `scripts/macos/setup-node-global-prefix.sh`
- `scripts/macos/install-node-cli-tools.sh`
- `scripts/macos/install-claude-code.sh`
- `scripts/macos/install-cursor-agent.sh`
- `scripts/macos/install-goose.sh`
- `scripts/macos/install-junie.sh`
- `scripts/macos/install-kiro-cli.sh`
- `scripts/macos/upgrade-cli-tools.sh`
- `scripts/macos/check-installation.sh`

These helpers cover the same first-pass self-hosted provider baseline that
`environment-bootstrap` previously owned on Unix:

- native installers for Claude Code, Cursor Agent, Goose, Junie, and Kiro
- npm global-prefix setup for user-scoped installs
- npm CLI pack install/upgrade for Codex, Gemini, Copilot, OpenCode, Kilo,
  Auggie, and Pi
- one-shot audit and bulk-upgrade wrappers

Representative usage:

```bash
./scripts/linux/setup-node-global-prefix.sh
./scripts/linux/install-node-cli-tools.sh
./scripts/linux/install-claude-code.sh
./scripts/linux/upgrade-cli-tools.sh
./scripts/linux/check-installation.sh --strict
```

```bash
./scripts/macos/setup-node-global-prefix.sh
./scripts/macos/install-node-cli-tools.sh
./scripts/macos/install-cursor-agent.sh
./scripts/macos/upgrade-cli-tools.sh
./scripts/macos/check-installation.sh --json
```

These are self-hosted operational helpers only. They are intentionally not yet
wired into the packaged bootstrap/setup wizard flow.

## Windows Aggregate Helpers

`cats-platform` now also ships repo-owned Windows orchestration helpers for the
remaining non-wizard provider-install surfaces that previously lived only in
`environment-bootstrap`:

- `scripts/windows/Install-WSLCLITools.ps1`
- `scripts/windows/Install-DockerCLITools.ps1`
- `scripts/windows/Upgrade-CLITools.ps1`

These helpers cover:

- the 12-provider WSL install/upgrade/check surface
- the 12-provider Docker-container install/upgrade/check surface
- one-shot Windows host + WSL + Docker bulk-upgrade orchestration

Representative usage:

```powershell
.\scripts\windows\Install-WSLCLITools.ps1 -CheckOnly -Json
.\scripts\windows\Install-WSLCLITools.ps1 -Apply -Distro Ubuntu
.\scripts\windows\Install-DockerCLITools.ps1 -CheckOnly -Container cats-cli-test -Json
.\scripts\windows\Install-DockerCLITools.ps1 -Upgrade -Container cats-cli-test
.\scripts\windows\Upgrade-CLITools.ps1 -Distro Ubuntu -DockerContainer cats-cli-test
```

These are operational helper surfaces only. They are intentionally separate
from the packaged setup wizard/bootstrap flow for now.

# Scripts

> Project automation scripts live here.

## Layout

```
scripts/
├── shared/    # Shared cross-platform helpers and generators
├── windows/   # PowerShell (.ps1)
├── linux/     # Bash (.sh)
├── macos/     # Bash (.sh)
└── testing/   # Test and smoke helpers (shared)
```

## Standards

Follow `docs/SCRIPT-STANDARDS.md` for naming and documentation rules.

## Ingress Smoke Helper

`cats-platform` now also ships a small cross-platform ingress probe:

- `scripts/testing/check-platform-ingress.mjs`

It accepts a target Cats base URL and verifies the platform-owned browser
ingress seam:

- `/health`
- `/api/platform/ingress`
- `/runtime`
- `/runtime/setup`
- `/runtime/dashboard?bootstrap=1`
- `/runtime/api/health`

Representative usage:

```bash
node scripts/testing/check-platform-ingress.mjs
node scripts/testing/check-platform-ingress.mjs --base-url http://192.168.1.25:8181
node scripts/testing/check-platform-ingress.mjs --base-url https://example.ts.net
```

This is the recommended quick probe for trusted LAN and tunnel follow-through,
because it validates that browser-facing runtime routes still stay on the Cats
origin instead of leaking back to the runtime origin.

The Tailscale/ngrok `verify` helpers now print the matching `npm run ingress:smoke`
command for the detected local or public base URL, so operators do not need to
reconstruct that probe manually.

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

- `build/server/`
- `build/renderer/`
- `build/desktop/`

and then launches the Electron host that supervises local `cats-runtime` and
`cats` child processes.

Installer build and smoke wrappers now also exist for desktop packaging:

- `scripts/windows/Build-WindowsInstaller.ps1`
- `scripts/windows/Test-WindowsInstallerSmoke.ps1`
- `scripts/linux/build-linux-installer.sh`
- `scripts/linux/test-linux-package-smoke.sh`
- `scripts/macos/build-macos-installer.sh`
- `scripts/macos/test-macos-package-smoke.sh`

These cover:

- Windows NSIS installer builds plus installed-app smoke validation
- macOS unsigned/test package builds plus unpacked app-bundle smoke validation
- Linux unsigned/test package builds plus unpacked package smoke validation

Desktop icon generation is also repo-owned now:

- `scripts/shared/generate-electron-icons.mjs`
- `npm run desktop:icons`

That tool turns one source SVG into the Electron app/tray icon set needed for:

- Windows app, shortcut, and NSIS installer icons
- macOS app bundle icon (`.icns`)
- Linux desktop/package PNG icon sizes
- packaged tray icons, including a macOS template tray icon

It also supports shape-controlled outputs:

- default circular avatar clip: `npm run desktop:icons`
- explicit square output: `npm run desktop:icons -- --shape square`

Desktop packaging does not regenerate these icon assets. Prepare the files you
want first, then run the packaging scripts and let them consume the existing
files under `assets/build/` and `assets/tray-icon*.png`.

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

`cats-platform` now also ships its first repo-owned packaged setup helpers:

- `scripts/windows/Install-Node.ps1`
- `scripts/windows/Install-GitHubCli.ps1`
- `scripts/windows/Setup-NodeGlobalPrefix.ps1`
- `scripts/windows/_NpmCliInstaller.ps1`
- `scripts/windows/Install-Codex.ps1`
- `scripts/windows/Install-Antigravity.ps1`
- `scripts/windows/Install-Copilot.ps1`
- `scripts/windows/Install-OpenCode.ps1`
- `scripts/windows/Install-KiloCli.ps1`
- `scripts/windows/Install-Auggie.ps1`
- `scripts/windows/Install-Pi.ps1`
- `scripts/windows/Install-ClaudeCode.ps1`
- `scripts/windows/Install-CursorAgent.ps1`
- `scripts/windows/Install-Goose.ps1`
- `scripts/windows/Install-Junie.ps1`
- `scripts/windows/Install-KiroCli.ps1`
- `scripts/windows/Check-WindowsSetupReadiness.ps1`

These helpers rewrite the stable Windows host-prerequisite and npm-global AI
CLI installation knowledge that previously lived only in
`environment-bootstrap`. They are intended for packaged-host setup flows and
support a uniform structured-JSON contract:

- `-CheckOnly`
- `-Apply`
- `-Upgrade`
- `-Force`
- `-Json`

`Install-Node.ps1` and `Install-GitHubCli.ps1` self-elevate through UAC for
the actual install (Node and gh both land in Program Files) while keeping
`-CheckOnly` user-scoped so the renderer can probe state without prompting.
They intentionally omit `-Uninstall`: removing Node would break the bundled
`cats-runtime` sidecar and every npm-global CLI helper.

The per-CLI npm-global installers (`Install-Codex.ps1`, `Install-Copilot.ps1`,
`Install-OpenCode.ps1`, `Install-KiloCli.ps1`,
`Install-Auggie.ps1`, `Install-Pi.ps1`) are thin wrappers around the shared
`_NpmCliInstaller.ps1` helper that owns the install/upgrade/uninstall flow.
Each one accepts `-CheckOnly / -Apply / -Upgrade / -Force / -Uninstall /
-DryRun / -Json` so Settings>Runtime can drive a single CLI without touching
the others.

`Install-Antigravity.ps1` is a native-binary wrapper around Google's
Antigravity `agy` installer. It accepts the same Desktop setup bridge flags but
does not use the npm-global helper.

`Check-WindowsSetupReadiness.ps1` composes the repo-owned packaged setup
helpers into one host-readable audit for the npm prefix substrate, the
per-CLI npm-global helpers, the native Windows provider helpers including
Kiro, and the optional local-model/Ollama follow-up. Set
`CATS_DESKTOP_SETUP_AUDIT_PARALLEL=false` when you need the packaged host to
force that audit into serial collection for debugging. WSL and Docker
substrates were removed from the packaged path in earlier phases and are no
longer covered here.

OpenClaw is intentionally not part of this local readiness audit because the
provider catalog models it as an `agent/gateway` backend, not a repo-owned
host-local CLI or local-model install target.

Together these let the host treat packaged setup helpers as structured assets
instead of raw bootstrap dependencies.

## Self-Hosted Provider Helpers

`cats-platform` now also ships repo-owned Unix self-hosted provider helpers so
macOS/Linux operators do not need to depend on `environment-bootstrap` at
runtime:

- `scripts/linux/install-node.sh`
- `scripts/linux/install-github-cli.sh`
- `scripts/linux/setup-node-global-prefix.sh`
- `scripts/linux/install-codex.sh`
- `scripts/linux/install-antigravity.sh`
- `scripts/linux/install-copilot.sh`
- `scripts/linux/install-opencode.sh`
- `scripts/linux/install-kilo.sh`
- `scripts/linux/install-auggie.sh`
- `scripts/linux/install-pi.sh`
- `scripts/linux/install-claude-code.sh`
- `scripts/linux/install-cursor-agent.sh`
- `scripts/linux/install-goose.sh`
- `scripts/linux/install-junie.sh`
- `scripts/linux/install-kiro-cli.sh`
- `scripts/linux/upgrade-cli-tools.sh`
- `scripts/linux/check-installation.sh`
- `scripts/macos/install-node.sh`
- `scripts/macos/install-github-cli.sh`
- `scripts/macos/setup-node-global-prefix.sh`
- `scripts/macos/install-codex.sh`
- `scripts/macos/install-antigravity.sh`
- `scripts/macos/install-copilot.sh`
- `scripts/macos/install-opencode.sh`
- `scripts/macos/install-kilo.sh`
- `scripts/macos/install-auggie.sh`
- `scripts/macos/install-pi.sh`
- `scripts/macos/install-claude-code.sh`
- `scripts/macos/install-cursor-agent.sh`
- `scripts/macos/install-goose.sh`
- `scripts/macos/install-junie.sh`
- `scripts/macos/install-kiro-cli.sh`
- `scripts/macos/upgrade-cli-tools.sh`
- `scripts/macos/check-installation.sh`

These helpers cover the same first-pass self-hosted provider baseline that
`environment-bootstrap` previously owned on Unix:

- host substrate installers for Node.js LTS (via nvm) and GitHub CLI (via
  Homebrew or a user-local tarball)
- native installers for Claude Code, Antigravity, Cursor Agent, Goose, Junie, and Kiro
- npm global-prefix setup for user-scoped installs
- per-CLI npm-global installers for Codex, Copilot, OpenCode, Kilo,
  Auggie, and Pi
- one-shot audit and bulk-upgrade wrappers

Representative usage:

```bash
./scripts/linux/install-node.sh
./scripts/linux/setup-node-global-prefix.sh
./scripts/linux/install-codex.sh
./scripts/linux/install-claude-code.sh
./scripts/linux/upgrade-cli-tools.sh
./scripts/linux/check-installation.sh --strict
```

```bash
./scripts/macos/install-node.sh
./scripts/macos/setup-node-global-prefix.sh
./scripts/macos/install-codex.sh
./scripts/macos/install-cursor-agent.sh
./scripts/macos/upgrade-cli-tools.sh
./scripts/macos/check-installation.sh --json
```

These are self-hosted operational helpers only. They are intentionally not yet
wired into the packaged bootstrap/setup wizard flow.

The Unix `--json` audit output and Windows `-Json` aggregate output now share
the same top-level audit core:

- `helper`
- `platform`
- `status`
- `ready`
- `present`
- `missing`
- `checks`
- `phases`
- `warnings`

### Manual Provider Matrix

- **Linux host**
  - Install: `./scripts/linux/install-node.sh` (when Node is missing) followed by per-CLI helpers like `./scripts/linux/install-codex.sh`, `./scripts/linux/install-claude-code.sh`, etc.
  - Check: `./scripts/linux/check-installation.sh --json`
  - Upgrade: `./scripts/linux/upgrade-cli-tools.sh`
- **macOS host**
  - Install: `./scripts/macos/install-node.sh` (when Node is missing) followed by per-CLI helpers like `./scripts/macos/install-codex.sh`, `./scripts/macos/install-claude-code.sh`, etc.
  - Check: `./scripts/macos/check-installation.sh --json`
  - Upgrade: `./scripts/macos/upgrade-cli-tools.sh`
- **Windows native host**
  - Install: `.\scripts\windows\Install-Node.ps1 -Apply` (when Node is missing) followed by per-CLI helpers like `.\scripts\windows\Install-Codex.ps1 -Apply`, `.\scripts\windows\Install-ClaudeCode.ps1 -Apply`, etc.
  - Check: `.\scripts\windows\Check-WindowsSetupReadiness.ps1 -Json`
  - Upgrade: invoke each per-CLI helper with `-Upgrade`

Representative usage:

```powershell
.\scripts\windows\Install-Node.ps1 -CheckOnly -Json
.\scripts\windows\Install-Codex.ps1 -CheckOnly -Json
.\scripts\windows\Install-Codex.ps1 -Apply
.\scripts\windows\Install-Codex.ps1 -Upgrade
.\scripts\windows\Check-WindowsSetupReadiness.ps1 -Json
```

These are operational helper surfaces only. They are intentionally separate
from the packaged setup wizard/bootstrap flow for now.

Pass `--include-local-models` to the Unix `check-installation.sh` helpers when
you also want the optional Ollama local-model check in the audit output.
Pass `--serial` when you need those Unix audits to avoid background fan-out.

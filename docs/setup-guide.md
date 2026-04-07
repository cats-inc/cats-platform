# Setup Guide

> Environment setup and installation instructions for `Cats` and the local
> host workspace that targets public packaging as `cats-platform`.

## Prerequisites

- Node.js 22+
- npm 11+
- `cats-runtime` running on `http://127.0.0.1:3110`

## Installation

### 1. Prepare the project

```bash
cd cats-platform
cp .env.example .env
```

The local monorepo folder is now `cats-platform/`, matching the intended
public host repo/package target.

### 2. Install dependencies

```bash
npm install
```

### 3. Verify installation

```bash
npm test
```

## Running the Project

### Development

```bash
npm run dev:server
# in a second terminal
npm run dev:web
```

Open:

- Renderer: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:8181/health`

### Optional: auto-start local cats with Tailscale Funnel or ngrok for webhook mode

For self-hosted Telegram webhook development, `cats` now includes helper
scripts that can:

- build the project
- create a login auto-start runner
- start the built local `cats` server
- ensure a public ingress provider is available

They still do **not** register Telegram webhooks. Webhook lifecycle stays in
`Settings > Cats`.

Current reality:

- the shipped Telegram MVP is still webhook-based
- the accepted follow-on direction is to add polling-first setup so Telegram
  can work without any public URL
- until that polling slice lands, these helpers remain the local path for
  webhook-mode Telegram development

Choose the helper for your platform and ingress provider:

```powershell
# Windows
.\scripts\windows\Setup-TailscaleFunnel.ps1 -Install
.\scripts\windows\Setup-TailscaleFunnel.ps1 -Verify
.\scripts\windows\Setup-TailscaleFunnel.ps1 -Remove

.\scripts\windows\Setup-NgrokTunnel.ps1 -Install
.\scripts\windows\Setup-NgrokTunnel.ps1 -Verify
.\scripts\windows\Setup-NgrokTunnel.ps1 -Remove
```

```bash
# Linux
./scripts/linux/setup-tailscale-funnel.sh install
./scripts/linux/setup-tailscale-funnel.sh verify
./scripts/linux/setup-tailscale-funnel.sh remove

./scripts/linux/setup-ngrok-tunnel.sh install
./scripts/linux/setup-ngrok-tunnel.sh verify
./scripts/linux/setup-ngrok-tunnel.sh remove

# macOS
./scripts/macos/setup-tailscale-funnel.sh install
./scripts/macos/setup-tailscale-funnel.sh verify
./scripts/macos/setup-tailscale-funnel.sh remove

./scripts/macos/setup-ngrok-tunnel.sh install
./scripts/macos/setup-ngrok-tunnel.sh verify
./scripts/macos/setup-ngrok-tunnel.sh remove
```

Requirements:

- Node.js and npm installed
- local cats port configured through `CATS_PORT` or `CATS_INC_PORT`
- for Tailscale:
  - Tailscale installed
  - `tailscale up` already completed
  - optional `TAILSCALE_HTTPS_PORT` in `.env`
- for ngrok:
  - ngrok installed
  - optional `CATS_NGROK_AUTHTOKEN` / `CATS_NGROK_DOMAIN` in `.env`

Recommended webhook-mode flow:

1. Run the helper for your platform and provider
2. Let the helper register login auto-start for built `cats` + ingress
3. Use `Settings > Cats` to manage Telegram bot bindings
4. Let the product own webhook registration and diagnostics

### Built Run

```bash
npm run build
npm start
```

The built Node server serves the static UI from `build/renderer/`.
By default local chat state is stored in `~/.cats/platform/state/chat-state.local.json`.
That file now holds channels, cats, execution targets, execution lease
metadata, memory checkpoints, and transcripts.
The checked-in starter state is empty, so the renderer does not open with any
default or mock chats.

### Desktop Host Run

The first Electron host slice now wraps the same local `cats-platform` +
`cats-runtime`
process topology:

```bash
npm run desktop:start
```

Platform wrappers:

```powershell
.\scripts\windows\Start-DesktopHost.ps1
```

```bash
./scripts/linux/start-desktop-host.sh
./scripts/macos/start-desktop-host.sh
```

What this does:

- builds `cats-platform` server, web bundle, and Electron host assets
- starts `cats-runtime` in `app-managed` mode
- starts `cats-platform` in `app-managed` mode
- waits for both `/health` readiness contracts
- runs a lightweight prerequisite scan before opening chat or setup

The host bootstrap page is intentionally separate from the React setup wizard.
It is the desktop-owned seam for:

- local service supervision
- prerequisite and provider remediation messaging
- structured packaged setup helper discovery and execution

The desktop host now also keeps a host-readable state file at
`<CATS_DESKTOP_DIR>/state.json` (default:
`~/.cats/desktop/state.json`). That JSON snapshot includes:

- bootstrap phase and summary
- structured prerequisite issues plus remediation actions
- progress steps for service start, prerequisite scan, setup handoff, and chat entry
- tray/background lifecycle state
- update-channel status
- packaging-plan metadata
- the last packaged setup helper action/result for resume-oriented host flows
- cross-layer bootstrap diagnostics metadata:
  - active `bootstrapAttemptId`
  - bounded host-owned event history
  - bounded runtime-observation event history
  - one aggregated chronology plus per-layer summaries
  - per-service log pointers and the latest stdout/stderr line for `cats-runtime`
    and `cats`

For packaged bootstrap or onboarding failures, collect these files first:

- `%USERPROFILE%\\.cats\\desktop\\state.json`
- `%USERPROFILE%\\.cats\\desktop\\logs\\cats-runtime.log`
- `%USERPROFILE%\\.cats\\desktop\\logs\\cats.log`
- `%USERPROFILE%\\.cats\\platform\\state\\platform-onboarding-history.json`
  - this file may be absent if `cats` never reached the product-owned setup flow

The host-side bootstrap bridge now stays inside a sandboxed Electron renderer
and only exposes the narrow desktop action/snapshot IPC surface through a
preload bridge. The bootstrap page also shows a setup recovery panel with the
bundled helper count, capability-pack helper coverage, the current local
provider rollout, the last
packaged setup action summary, and the current
recommended resume step when a helper reports a resumable interruption. When a
packaged setup step blocks on a restart or other recovery action, the bootstrap
issue panel also reports that state as an install-category issue instead of
showing only provider remediation.
On packaged Windows/macOS/Linux hosts, the desktop host now also auto-runs the
repo-owned platform-specific readiness audit during bootstrap whenever no more
specific packaged setup recovery action is active, so the first-run provider
scan is no longer just a manifest promise. On Windows, that bootstrap-time
audit also carries optional local-model follow-through for the current
`local_model_pack`, but the host keeps those findings non-blocking for the API
baseline and first chat. That state is now persisted explicitly in the host
setup record instead of being inferred only from helper planned-action
strings, and the bootstrap UI now names the pack directly when it surfaces
that follow-through.
If the API baseline is already ready and chat can open, the bootstrap action
bar still keeps a non-blocking setup shortcut for that optional local-model
pack instead of hiding it behind chat-only actions.
When a helper reports only manual follow-through, the host now prefers a
verification-first resume step instead of recommending another install/apply
mutation by default.

Current interruption truth in the packaged host:

- relaunch, restart, elevation/UAC, first WSL boot, and auth-required
  follow-through are now explicit host-owned setup states
- the setup recovery panel and bootstrap action bar can surface
  `Resume Packaged Setup` when the last helper run is resumable
- the Windows readiness audit now also audits native Claude/Cursor
  auth-required follow-through plus WSL first-boot readiness
- the same Windows readiness audit can now optionally surface
  `docker_warm_up_required` for Docker-requiring packaged paths when Docker
  Desktop is installed but its engine is not ready yet
- the same Windows readiness audit can now also optionally surface Ollama
  local-model follow-through when the runtime is installed but its local API is
  not ready

### Self-Hosted npm Package Smoke

To build a local npm tarball and optionally install it globally:

```powershell
.\scripts\windows\Pack-Install.ps1
```

```bash
./scripts/linux/pack-install.sh
./scripts/macos/pack-install.sh
```

This is the self-hosted host-package smoke path, not the Electron installer
path. It validates the `@cats-inc/cats-platform` package contract and the
current executable name `cats-platform`. The separate one-shot bootstrap
package target is `cats-can`.

After install, verify the executable contract with:

```bash
cats-platform --help
```

Running `cats-platform` still expects a reachable `cats-runtime`, using
`CATS_RUNTIME_BASE_URL` or the default `http://127.0.0.1:3110`.

### Self-Hosted Provider Helpers

`cats-platform` now also ships repo-owned Unix helper scripts for the
self-hosted provider baseline that used to live only in
`environment-bootstrap`.

Linux:

```bash
./scripts/linux/setup-node-global-prefix.sh
./scripts/linux/install-node-cli-tools.sh
./scripts/linux/install-claude-code.sh
./scripts/linux/install-cursor-agent.sh
./scripts/linux/install-goose.sh
./scripts/linux/install-junie.sh
./scripts/linux/install-kiro-cli.sh
./scripts/linux/upgrade-cli-tools.sh
./scripts/linux/check-installation.sh --strict
```

macOS:

```bash
./scripts/macos/setup-node-global-prefix.sh
./scripts/macos/install-node-cli-tools.sh
./scripts/macos/install-claude-code.sh
./scripts/macos/install-cursor-agent.sh
./scripts/macos/install-goose.sh
./scripts/macos/install-junie.sh
./scripts/macos/install-kiro-cli.sh
./scripts/macos/upgrade-cli-tools.sh
./scripts/macos/check-installation.sh --json
```

Coverage in this slice:

- native CLI install and upgrade for Claude Code, Cursor Agent, Goose, Junie,
  and Kiro
- npm global-prefix/PATH repair for user-scoped installs
- npm CLI pack install and upgrade for Codex, Gemini, Copilot, OpenCode,
  Kilo, Auggie, and Pi
- self-hosted audit output for the same provider baseline

These helpers are shipped as part of the npm package so self-hosted operators
can use them after `npm install` or `npx`. They are not yet consumed by the
desktop bootstrap/setup wizard.

Cross-platform JSON audit core:

- Unix `check-installation.sh --json` and Windows `Check-CLITools.ps1 -Json`
  now share `helper`, `platform`, `status`, `ready`, `present`, `missing`,
  `checks`, `phases`, and `warnings`
- Windows keeps additional nested detail such as `distro`,
  `dockerContainer`, WSL readiness, and Docker/Desktop follow-through payloads

### Windows Operational Aggregates

Windows now also ships the repo-owned aggregate helpers that used to live only
in `environment-bootstrap` for non-wizard operational use:

```powershell
.\scripts\windows\Install-WSLCLITools.ps1 -CheckOnly -Json
.\scripts\windows\Install-WSLCLITools.ps1 -Apply -Distro Ubuntu
.\scripts\windows\Install-DockerCLITools.ps1 -CheckOnly -Container cats-cli-test -Json
.\scripts\windows\Check-CLITools.ps1 -IncludeWsl -IncludeDocker -DockerContainer cats-cli-test -Json
.\scripts\windows\Install-DockerCLITools.ps1 -Upgrade -Container cats-cli-test
.\scripts\windows\Upgrade-CLITools.ps1 -Distro Ubuntu -DockerContainer cats-cli-test
```

Coverage in this slice:

- WSL-target install and upgrade for all 12 CLI providers
- Docker-container install and upgrade for all 12 CLI providers
- aggregate host/WSL/Docker detection for the same provider baseline
- Windows host bulk-upgrade orchestration across native, WSL, and Docker paths

These helpers are intentionally repo-owned script surfaces only. They are not
yet wired into the packaged setup wizard/bootstrap flow.

### Manual Operator Matrix

| Path | Install | Check | Upgrade |
|------|---------|-------|---------|
| Linux host | `./scripts/linux/install-node-cli-tools.sh` plus the native `install-*.sh` helpers you need | `./scripts/linux/check-installation.sh --json` | `./scripts/linux/upgrade-cli-tools.sh` |
| macOS host | `./scripts/macos/install-node-cli-tools.sh` plus the native `install-*.sh` helpers you need | `./scripts/macos/check-installation.sh --json` | `./scripts/macos/upgrade-cli-tools.sh` |
| Windows native host | `.\scripts\windows\Install-NodeCliPack.ps1 -Apply` plus the native provider helpers you need | `.\scripts\windows\Check-CLITools.ps1 -Json` | `.\scripts\windows\Upgrade-CLITools.ps1` |
| Windows WSL target | `.\scripts\windows\Install-WSLCLITools.ps1 -Apply -Distro Ubuntu` | `.\scripts\windows\Check-CLITools.ps1 -IncludeWsl -Distro Ubuntu -Json` | `.\scripts\windows\Install-WSLCLITools.ps1 -Upgrade -Distro Ubuntu` |
| Windows Docker target | `.\scripts\windows\Install-DockerCLITools.ps1 -Apply -Container cats-cli-test` | `.\scripts\windows\Check-CLITools.ps1 -IncludeDocker -DockerContainer cats-cli-test -Json` | `.\scripts\windows\Install-DockerCLITools.ps1 -Upgrade -Container cats-cli-test` |

### Desktop Packaging Stage

To generate staged packaging outputs without changing the visible renderer UI:

```bash
npm run desktop:stage
```

Platform wrappers:

```powershell
.\scripts\windows\Build-DesktopPackage.ps1 -Platform windows
```

```bash
./scripts/linux/build-desktop-package.sh linux
./scripts/macos/build-desktop-package.sh macos
```

The current substrate writes:

- `build/desktop-packaging/desktop-package-plan.json`
- `build/desktop-packaging/shared/*`
- `build/desktop-packaging/shared/setup-assets/windows/*`
  - npm prefix helper, native CLI pack installer, native provider installers,
    WSL helpers, Docker/Ollama helpers, Windows readiness audit, and the shared
    `_HiddenProcess.ps1` support script
- `build/desktop-packaging/shared/setup-assets/linux/*`
  - npm prefix helper, node CLI pack installer, Claude/Cursor/Goose/Junie/Kiro
    native installers, and the Linux readiness audit
- `build/desktop-packaging/shared/setup-assets/macos/*`
  - npm prefix helper, node CLI pack installer, Claude/Cursor/Goose/Junie/Kiro
    native installers, and the macOS readiness audit
- `build/desktop-packaging/shared/setup-assets/linux/provider-cli-common.sh`
- `build/desktop-packaging/shared/setup-assets/linux/node-cli-common.sh`
- `build/desktop-packaging/shared/setup-assets/macos/provider-cli-common.sh`
- `build/desktop-packaging/shared/setup-assets/macos/node-cli-common.sh`
- `build/desktop-packaging/shared/setup-assets/manifest.json`
- `build/desktop-packaging/targets/<target>/installer-manifest.json`

The staged `desktop-package-plan.json` now also carries
`installer.providerSetup.helperCatalog`, which is the machine-readable catalog
of bundled setup helpers, supported operations, packaged relative paths, and
elevation expectations consumed by the desktop host bridge. Target installer
manifests now scope that catalog down to the assets for the current target
platform.

The same staged contract now also carries
`installer.providerSetup.localProviders`, which freezes the current packaged
local-provider rollout:

- current packaged path: Claude Code, Cursor Agent, Goose, Junie, and the
  repo-owned Kiro path across Windows/macOS/Linux
- Windows keeps the WSL-backed Kiro helper and the bundled Ollama local-model
  runtime helper

This is intentionally a staging layer, not the final signed-installer
publication step.

### Windows Installer Build

For an actual Windows installer that can be test-installed:

```bash
npm run desktop:package:windows
```

```powershell
.\scripts\windows\Build-WindowsInstaller.ps1
```

This currently uses `electron-builder` with the `NSIS` target and writes:

- `release/Cats-0.1.0-setup-x64.exe` style installer output
- `release/win-unpacked/` for unpacked verification

### macOS / Linux Installer Builds

Unsigned or test-package builds for the Unix desktop targets now use the same
staged desktop packaging substrate:

```bash
npm run desktop:package:macos
npm run desktop:package:linux
```

Platform wrappers:

```bash
./scripts/macos/build-macos-installer.sh
./scripts/linux/build-linux-installer.sh
```

Current intent:

- macOS uses `electron-builder` targets configured for `dmg`, `pkg`, and `zip`
- Linux uses `electron-builder` targets configured for `AppImage`, `deb`, and
  `tar.gz`
- these are unsigned/test-package paths for now
- Windows remains the only platform with a repo-owned post-install smoke check
  in this slice

Unix smoke-check entrypoints:

```bash
./scripts/macos/test-macos-package-smoke.sh
./scripts/linux/test-linux-package-smoke.sh
```

Those validate the unpacked `electron-builder` outputs:

- macOS default: `release/mac-universal/Cats.app`
- Linux default: `release/linux-unpacked/`
- bundled sidecars, packaged setup assets, and platform-scoped installer
  contract truth

### Windows Post-Install Smoke Check

After running the installer on a Windows machine, validate the installed app
with:

```powershell
.\scripts\windows\Test-WindowsInstallerSmoke.ps1
```

Default assumptions:

- install root: `%LOCALAPPDATA%\Programs\Cats`
- host state path: `%USERPROFILE%\.cats\desktop\state.json`

If you installed to a different directory, pass overrides:

```powershell
.\scripts\windows\Test-WindowsInstallerSmoke.ps1 -InstallRoot 'C:\Program Files\Cats'
```

What the smoke-check confirms:

- `Cats.exe` exists
- bundled `cats` and `cats-runtime` sidecar assets exist under `resources/`
- the bundled Windows npm prefix helper exists under `resources/desktop/setup-assets/`
- the bundled Windows native CLI pack helper exists under `resources/desktop/setup-assets/`
- the bundled Windows native Claude Code installer exists under `resources/desktop/setup-assets/`
- the bundled Windows native Cursor installer exists under `resources/desktop/setup-assets/`
- the bundled Windows native Goose installer exists under `resources/desktop/setup-assets/`
- the bundled Windows native Junie installer exists under `resources/desktop/setup-assets/`
- the bundled Windows WSL prerequisite preflight helper exists under `resources/desktop/setup-assets/`
- the bundled Windows Docker Desktop installer exists under `resources/desktop/setup-assets/`
- the bundled Windows setup readiness audit helper exists under `resources/desktop/setup-assets/`
- the packaged `desktop-package-plan.json` still advertises the Windows NSIS
  target
- launching the installed app refreshes the persisted desktop-host state file
  and reaches a stable bootstrap phase

If startup still fails after install, capture these artifacts before retrying:

- `%USERPROFILE%\\.cats\\desktop\\state.json`
- `%USERPROFILE%\\.cats\\desktop\\logs\\cats-runtime.log`
- `%USERPROFILE%\\.cats\\desktop\\logs\\cats.log`
- `%USERPROFILE%\\.cats\\platform\\state\\platform-onboarding-history.json`

Use `-SkipLaunch` if you only want file/layout verification.

Current limitations of the first real installer slice:

- unsigned build
- icon set is generated from `assets/app-icon-silhouette.svg`; refresh it with `npm run desktop:icons`
- update install/apply remains manual
- update manifests must be HTTPS, and any `downloadUrl` must stay on the
  manifest host or a host listed in `CATS_DESKTOP_UPDATE_ALLOWED_HOSTS`
- full elevation/relaunch resume across installer interruptions is still a
  follow-on beyond the current bounded host bridge

## Common Issues

### Issue 1: `/health` returns `503`

**Solution**: Confirm `cats-runtime` is running and `CATS_RUNTIME_BASE_URL` is
correct.

### Issue 2: Runtime still unavailable even though `cats-runtime` is up

**Solution**: Verify the chosen provider CLI is installed and reachable from
the `cats-runtime` process, and confirm any required local session directories
or databases are accessible.

### Issue 3: Renderer cannot load app-shell data

**Solution**: Ensure `npm run dev:server` is running. Vite proxies `/api` to the
Node server on port `8181`.

### Issue 4: Channel selection or creation does not persist

**Solution**: Check whether `CATS_PLATFORM_DIR` points to a writable directory.
The app writes product state to `<CATS_PLATFORM_DIR>/state/chat-state.local.json`
and defaults to `~/.cats/platform/state/chat-state.local.json`.

### Issue 5: Channel activation fails immediately

**Solution**: Confirm `cats-runtime` is reachable, then verify the chosen
provider/model execution target is supported by the runtime backend. Activation
errors are also persisted into the channel transcript.

### Issue 6: Telegram needs a public webhook URL during local development

**Solution**: The current Telegram MVP is webhook-based, so run one of the
startup helpers from `scripts/windows/`, `scripts/linux/`, or
`scripts/macos/` if you want local webhook development. Tailscale Funnel is
the cheaper default; ngrok is also supported. The helper can keep the local
built `cats` server and public ingress alive at login. Webhook registration is
still product-owned and should be managed from `Settings > Cats`.

Longer-term direction: polling-first Telegram setup should remove this public
URL requirement for the default onboarding path, while keeping these helpers as
an optional advanced mode.

### Issue 7: Desktop host fails before showing the bootstrap page

**Solution**: Confirm these built assets exist:

- `build/server/index.js`
- `build/renderer/index.html`
- `build/desktop/main.js`
- sibling `../cats-runtime/build/runtime/index.js`

If you changed any desktop-host paths, re-check the corresponding
`CATS_DESKTOP_*` overrides.

### Issue 8: Closing the desktop window does not stop local services

**Solution**: This is now controlled by the host lifecycle contract. By
default the host minimizes to tray and keeps `cats-runtime` + `cats` alive in
the background. Set `CATS_DESKTOP_CLOSE_BEHAVIOR=quit` or
`CATS_DESKTOP_KEEP_SERVICES_RUNNING=false` if you need the older quit-on-close
behavior while testing.

---

*Last updated: 2026-03-29*

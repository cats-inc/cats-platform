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

The built Node server serves the static UI from `dist/`.
By default local chat state is stored in `config/chat-state.local.json`.
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
`CATS_DESKTOP_HOST_STATE_PATH` (default:
`<userData>/desktop-host/state.json`). That JSON snapshot includes:

- bootstrap phase and summary
- structured prerequisite issues plus remediation actions
- progress steps for service start, prerequisite scan, setup handoff, and chat entry
- tray/background lifecycle state
- update-channel status
- packaging-plan metadata
- the last packaged setup helper action/result for resume-oriented host flows

The host-side bootstrap bridge now stays inside a sandboxed Electron renderer
and only exposes the narrow desktop action/snapshot IPC surface through a
preload bridge. The bootstrap page also shows a setup recovery panel with the
bundled helper count, the current local provider rollout, the last
packaged setup action summary, and the current
recommended resume step when a helper reports a resumable interruption. When a
packaged setup step blocks on a restart or other recovery action, the bootstrap
issue panel also reports that state as an install-category issue instead of
showing only provider remediation.

Current interruption truth in the packaged host:

- relaunch, restart, elevation/UAC, first WSL boot, and auth-required
  follow-through are now explicit host-owned setup states
- the setup recovery panel and bootstrap action bar can surface
  `Resume Packaged Setup` when the last helper run is resumable
- `scripts/windows/Check-WindowsSetupReadiness.ps1` now also audits native
  Claude/Cursor auth-required follow-through plus WSL first-boot readiness
- the same readiness audit can now optionally surface
  `docker_warm_up_required` for Docker-requiring packaged paths when Docker
  Desktop is installed but its engine is not ready yet

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
path. It validates the future `@cats-inc/cats-platform` package contract while
keeping the installed executable name as `cats`. The separate one-shot
bootstrap package target is `cats-can`.

After install, verify the executable contract with:

```bash
cats-platform --help
```

Running `cats` still expects a reachable `cats-runtime`, using
`CATS_RUNTIME_BASE_URL` or the default `http://127.0.0.1:3110`.

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
- `build/desktop-packaging/shared/setup-assets/windows/Setup-NodeGlobalPrefix.ps1`
- `build/desktop-packaging/shared/setup-assets/windows/Install-NodeCliPack.ps1`
- `build/desktop-packaging/shared/setup-assets/windows/Install-ClaudeCode.ps1`
- `build/desktop-packaging/shared/setup-assets/windows/Install-CursorAgent.ps1`
- `build/desktop-packaging/shared/setup-assets/windows/Install-Goose.ps1`
- `build/desktop-packaging/shared/setup-assets/windows/Install-Junie.ps1`
- `build/desktop-packaging/shared/setup-assets/windows/Check-WslPrerequisites.ps1`
- `build/desktop-packaging/shared/setup-assets/windows/Install-WslUbuntuEnvironment.ps1`
- `build/desktop-packaging/shared/setup-assets/windows/Install-KiroWslCli.ps1`
- `build/desktop-packaging/shared/setup-assets/windows/Check-WindowsSetupReadiness.ps1`
- `build/desktop-packaging/shared/setup-assets/manifest.json`
- `build/desktop-packaging/targets/<target>/installer-manifest.json`

The staged `desktop-package-plan.json` now also carries
`installer.providerSetup.helperCatalog`, which is the machine-readable catalog
of bundled setup helpers, supported operations, packaged relative paths, and
elevation expectations consumed by the desktop host bridge.

The same staged contract now also carries
`installer.providerSetup.localProviders`, which freezes the current packaged
local-provider rollout:

- current packaged path: Claude Code, Cursor Agent, Goose, Junie, and the
  WSL-backed Kiro helper

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

### Windows Post-Install Smoke Check

After running the installer on a Windows machine, validate the installed app
with:

```powershell
.\scripts\windows\Test-WindowsInstallerSmoke.ps1
```

Default assumptions:

- install root: `%LOCALAPPDATA%\Programs\Cats`
- host state path: `%APPDATA%\Cats\desktop-host\state.json`

If you installed to a different directory, pass overrides:

```powershell
.\scripts\windows\Test-WindowsInstallerSmoke.ps1 -InstallRoot 'C:\Program Files\Cats'
```

What the smoke-check confirms:

- `Cats.exe` exists
- bundled `cats` and `cats-runtime` sidecar assets exist under `resources/`
- the bundled Windows npm prefix helper exists under `resources/desktop-host/setup-assets/`
- the bundled Windows native CLI pack helper exists under `resources/desktop-host/setup-assets/`
- the bundled Windows native Claude Code installer exists under `resources/desktop-host/setup-assets/`
- the bundled Windows native Cursor installer exists under `resources/desktop-host/setup-assets/`
- the bundled Windows native Goose installer exists under `resources/desktop-host/setup-assets/`
- the bundled Windows native Junie installer exists under `resources/desktop-host/setup-assets/`
- the bundled Windows WSL prerequisite preflight helper exists under `resources/desktop-host/setup-assets/`
- the bundled Windows setup readiness audit helper exists under `resources/desktop-host/setup-assets/`
- the packaged `desktop-package-plan.json` still advertises the Windows NSIS
  target
- launching the installed app refreshes the persisted desktop-host state file
  and reaches a stable bootstrap phase

Use `-SkipLaunch` if you only want file/layout verification.

Current limitations of the first real installer slice:

- unsigned build
- no branded icon yet
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

**Solution**: Check whether `CATS_STATE_PATH` points to a writable file
location. `CATS_INC_STATE_PATH` is still accepted as a compatibility alias. If
unset, the app uses `config/chat-state.local.json`.

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

- `dist-server/index.js`
- `dist/index.html`
- `dist-electron/main.js`
- sibling `../cats-runtime/dist/index.js`

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

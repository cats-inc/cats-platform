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

### Platform auth configuration

PLAN-089 auth is in rollout. Set a long `CATS_AUTH_SESSION_SECRET` before using
the first-admin local login or Cats Mobile bearer-session paths:

```bash
CATS_AUTH_SESSION_SECRET=<long-random-secret>
```

`CATS_AUTH_ENABLED=false` is an unsafe dev/test escape hatch only. It is rejected
after setup is complete and should not be used for LAN-facing workspaces.

If the renderer is served from a non-default origin, add it to:

```bash
CATS_AUTH_ALLOWED_BROWSER_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

Forgotten-credential and repair behavior:

- Browser session state is stored separately from product data at
  `<platform-state-dir>/auth-state.local.json`. In dev and packaged desktop,
  the default path is `~/.cats/platform/state/auth-state.local.json` unless
  `CATS_PLATFORM_DIR` points to a different platform root.
- Deleting `auth-state.local.json` discards accounts, identities, memberships,
  and sessions. It leaves owner profile, Guide Cat state, conversations, Work,
  Code, and other product data untouched.
- If setup was already completed and the auth state file is missing or corrupt,
  startup enters auth repair mode and writes a one-time token to
  `<platform-state-dir>/auth-recovery-token.local.txt`.
- Repair first-admin creation is accepted only from loopback or with that
  recovery token, and still requires an allowlisted browser `Origin`.
  Structured logs include the token file path, never the raw token.
- Bounded aggregate login cooldowns can be cleared without deleting auth
  state by using the authenticated admin+CSRF throttle-clear route, loopback,
  or the one-time recovery token.
- For LAN-bound deployments, rebind Cats to loopback or use the recovery token
  before allowing LAN browsers to reach the host during repair.

Account and role boundary:

- First setup creates one local admin account and maps only that first admin to
  the existing Core owner actor (`actor-owner`).
- Additional account creation, invitations, password reset, role editing, and
  Core actor mapping UI are follow-up work. Do not hand-edit auth state to add
  shared-user accounts unless you also understand that memberships without
  `coreActorId` intentionally fail actor-attributed writes closed.
- Non-admin roles exist in the auth state model for forward compatibility, but
  this rollout does not yet expose product-specific non-admin authorization
  policy.

### 2. Install dependencies

```bash
npm install
```

### 3. Verify installation

```bash
npm test
```

### Mobile bundle build

Cats Mobile is an independent Expo package under `mobile/`, with its own
`package-lock.json` and `node_modules/`. A clean desktop build installs those
dependencies automatically:

```bash
npm run mobile:install
npm run build:mobile
```

`npm run build` also invokes `build:mobile`, so a release build from a clean
checkout produces `build/mobile/` without a manual `cd mobile && npm install`
step. For CI or SDK-bump validation, run:

```bash
npm run build:mobile:check
```

That command installs mobile dependencies, runs the mobile boundary/typecheck
validation, exports both iOS and Android bundles, and verifies that
`build/mobile/metadata.json` plus Expo static bundle files exist. Expo SDK 54
currently emits Hermes `.hbc` bundle files under `_expo/static/js/<platform>/`.
When bumping `expo` in `mobile/package.json`, re-run `npm run build:mobile:check`
and then run the real-device Mobile pairing smoke from PLAN-088 before shipping
the desktop artifact.

### Mobile pairing (desktop)

Mobile pairing is opt-in and LAN-scoped. Enable it only on a trusted network:

```bash
CATS_DESKTOP_MOBILE_PAIRING_ENABLED=true
```

For packaged desktop, the app sidecar must be reachable from the phone:

```bash
CATS_DESKTOP_APP_HOST=0.0.0.0
```

For a built Node run without Electron, use the app-server bind instead:

```bash
CATS_HOST=0.0.0.0
```

Restart Cats after changing the bind host. Then open
`Settings -> Desktop -> Mobile pairing`. The card reports the effective bind
host, selected LAN IPv4 candidate, and a recovery action when the server is
still loopback-only.

Current implementation status:

- `CATS_DESKTOP_MOBILE_PAIRING_ENABLED=true` exposes the gated
  `/api/mobile/*` bundle-serving routes.
- the card shows the LAN-facing diagnostic manifest URL when a LAN candidate is
  available.
- the card renders an Expo Go QR (`exp://<LAN-IP>:8181`) when a LAN candidate
  is available.
- Expo Go requests the desktop root manifest, downloads the bundled Cats Mobile
  export from `/api/mobile/bundle/*`, and receives the desktop LAN base URL in
  the manifest so Cats Mobile can connect without manual URL entry.
- The QR and manifest are not authorization. Cats Mobile must call
  `/api/mobile/auth/status` and complete local or Google mobile login before it
  can fetch product data. The server-side mobile bearer auth routes exist, but
  the full product-data route gate and SecureStore-backed client persistence
  are still landing under PLAN-089.

If the card reports no LAN address while the bind host is already
LAN-visible, verify the machine has a non-loopback IPv4 address on the trusted
network. Common virtual adapters such as WSL, Docker, Hyper-V, VirtualBox, and
VMware are filtered out intentionally.

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

### Optional: local-IP browser access on the same LAN

For trusted LAN testing from another device such as an iPad, keep
`cats-runtime` on loopback and expose the browser entrypoint from
`cats-platform` only.

Recommended dev setup:

```bash
# Keep the app server local unless you need the built server itself on LAN.
CATS_HOST=127.0.0.1
CATS_PORT=8181

# Expose the Vite dev host on the LAN.
CATS_WEB_HOST=0.0.0.0
```

If you want the built Node server itself to bind on the LAN instead of the
Vite dev host, set:

```bash
CATS_HOST=0.0.0.0
```

Notes:

- Vite now proxies `/runtime/*` to the app server, so runtime setup/dashboard
  routes stay on the Cats origin during dev.
- Packaged Electron should keep using `CATS_DESKTOP_APP_HOST=127.0.0.1` and
  `CATS_DESKTOP_RUNTIME_HOST=127.0.0.1`. Do not reuse the LAN host settings for
  the packaged desktop app.
- This is a trusted-LAN workflow only. It is not equivalent to a public
  internet deployment.
- `GET /api/platform/ingress` returns a machine-readable summary of the current
  bind mode plus the candidate local, LAN, and trusted-overlay URLs for this
  machine. Common virtual adapters such as WSL/Docker are intentionally
  filtered out of those browser-entry suggestions.
- `npm run ingress:smoke -- --base-url http://<LAN-IP>:8181` is the quick
  same-origin ingress probe for LAN or tunnel verification. It checks
  `/api/platform/ingress`, `/runtime`, `/runtime/setup`, and `/runtime/api/health`
  through the Cats origin.

Current first-run behavior:

- `/setup` is a 2-step flow: owner name, then optional Guide Cat
- Guide Cat provider/model selectors only show truthful runtime-backed usable
  targets from `cats-runtime`
- if no usable provider target is currently available, the Guide Cat step
  shows recovery messaging plus a deep-link to Cats Runtime setup instead of
  static fallback catalog choices
- finishing setup lands on `/lobby`
- if runtime/provider health regresses later, Cats stays in recovery instead
  of sending the user back through onboarding

### Optional: auto-start local cats with Tailscale Funnel or ngrok for trusted browser / webhook mode

For self-hosted Telegram webhook development, `cats` now includes helper
scripts that can:

- build the project
- create a login auto-start runner
- start the built local `cats` server
- ensure a public ingress provider is available

Ingress boundary:

- the tunnel or overlay points at the local `cats-platform` host only
- `cats-runtime` stays behind the platform host and should remain loopback-only
- browser access to runtime setup/dashboard/playground stays under the Cats
  origin via `/runtime/*` and `/runtime/api/*`
- the packaged Electron app does not use these helpers and should keep its
  desktop-specific loopback defaults

They still do **not** register Telegram webhooks. Webhook lifecycle stays in
`Settings > Cats`.

Current reality:

- the shipped Telegram MVP is still webhook-based
- the accepted follow-on direction is to add polling-first setup so Telegram
  can work without any public URL
- until that polling slice lands, these helpers remain the local path for
  webhook-mode Telegram development
- the same helpers can also be used for trusted browser access through a
  Tailscale or ngrok URL, as long as the operator treats that URL as a trusted
  private entrypoint rather than a public deployment

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
- runs a lightweight prerequisite scan before opening setup or the main app

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
Once setup is complete, the desktop host keeps runtime/provider regressions in
recovery: it opens Cats or runtime diagnostics instead of routing the user
back into onboarding.
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
- the Windows readiness audit now also audits native Claude/Cursor/Goose/Junie
  auth-required follow-through plus native Kiro install readiness
- the same Windows readiness audit can now optionally surface
  `docker_warm_up_required` for Docker-requiring packaged paths when Docker
  Desktop is installed but its engine is not ready yet
- the same Windows readiness audit can now also optionally surface Ollama
  local-model follow-through when the runtime is installed but its local API is
  not ready
- set `CATS_DESKTOP_SETUP_AUDIT_PARALLEL=false` when you need startup audits
  to collect serially for debugging instead of using background fan-out

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
./scripts/linux/install-node.sh
./scripts/linux/setup-node-global-prefix.sh
./scripts/linux/install-codex.sh
./scripts/linux/install-gemini.sh
./scripts/linux/install-copilot.sh
./scripts/linux/install-opencode.sh
./scripts/linux/install-kilo.sh
./scripts/linux/install-auggie.sh
./scripts/linux/install-pi.sh
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
./scripts/macos/install-node.sh
./scripts/macos/setup-node-global-prefix.sh
./scripts/macos/install-codex.sh
./scripts/macos/install-gemini.sh
./scripts/macos/install-copilot.sh
./scripts/macos/install-opencode.sh
./scripts/macos/install-kilo.sh
./scripts/macos/install-auggie.sh
./scripts/macos/install-pi.sh
./scripts/macos/install-claude-code.sh
./scripts/macos/install-cursor-agent.sh
./scripts/macos/install-goose.sh
./scripts/macos/install-junie.sh
./scripts/macos/install-kiro-cli.sh
./scripts/macos/upgrade-cli-tools.sh
./scripts/macos/check-installation.sh --json
```

Coverage in this slice:

- host substrate install and upgrade for Node.js LTS (via nvm) and GitHub
  CLI (via Homebrew or a user-local tarball)
- native CLI install and upgrade for Claude Code, Cursor Agent, Goose, Junie,
  and Kiro
- npm global-prefix/PATH repair for user-scoped installs
- per-CLI npm-global install and upgrade for Codex, Gemini, Copilot,
  OpenCode, Kilo, Auggie, and Pi (one script per CLI, no bulk install)
- self-hosted audit output for the same provider baseline, plus optional
  Ollama coverage when you pass `--include-local-models`, or serial collection
  when you pass `--serial`
- OpenClaw is not part of this local host audit because the catalog treats it
  as an `agent/gateway` backend rather than a host-local CLI/local-model target

These helpers are shipped as part of the npm package so self-hosted operators
can use them after `npm install` or `npx`. They are not yet consumed by the
desktop bootstrap/setup wizard.

Cross-platform JSON audit core:

- Unix `check-installation.sh --json` and Windows
  `Check-WindowsSetupReadiness.ps1 -Json` now share `helper`, `status`,
  `plannedActions`, `warnings`, and `interruptions`
- Windows additionally surfaces nested per-CLI detail under `nativeCliPack`
  and the host-installer probes under `nodeHost` and `githubCli`

### Windows Host Substrate Helpers

Windows ships repo-owned host substrate installers and per-CLI helpers for
non-wizard operational use:

```powershell
.\scripts\windows\Install-Node.ps1 -CheckOnly -Json
.\scripts\windows\Install-Node.ps1 -Apply        # self-elevates through UAC
.\scripts\windows\Install-GitHubCli.ps1 -Apply   # self-elevates through UAC
.\scripts\windows\Install-Codex.ps1 -Apply
.\scripts\windows\Install-Codex.ps1 -Upgrade
.\scripts\windows\Install-ClaudeCode.ps1 -Apply
.\scripts\windows\Check-WindowsSetupReadiness.ps1 -Json
```

Coverage in this slice:

- Node.js LTS and GitHub CLI host installers (winget primary, MSI fallback)
- per-CLI npm-global helpers for Codex, Gemini, Copilot, OpenCode, Kilo,
  Auggie, and Pi (one script per CLI, no bulk install/uninstall)
- aggregate readiness audit composing the host installer, prefix helper,
  per-CLI helpers, and native provider helpers

These helpers are intentionally repo-owned script surfaces only. They are not
yet wired into the packaged setup wizard/bootstrap flow.

### Manual Operator Matrix

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
  - Node.js LTS host installer (`Install-Node.ps1`), GitHub CLI host
    installer (`Install-GitHubCli.ps1`), npm prefix helper, the shared
    `_NpmCliInstaller.ps1` and per-CLI npm installers (Codex, Gemini,
    Copilot, OpenCode, Kilo, Auggie, Pi), the native provider installers
    (Claude Code, Cursor Agent, Goose, Junie, Kiro), the Ollama
    local-model installer, the Windows readiness audit, and the shared
    `_HiddenProcess.ps1` / `_PackagedUninstall.ps1` support scripts
- `build/desktop-packaging/shared/setup-assets/linux/*`
  - Node.js LTS host installer (`install-node.sh`), GitHub CLI host
    installer (`install-github-cli.sh`), npm prefix helper, per-CLI npm
    installers (Codex, Gemini, Copilot, OpenCode, Kilo, Auggie, Pi),
    Claude/Cursor/Goose/Junie/Kiro native installers, and the Linux
    readiness audit
- `build/desktop-packaging/shared/setup-assets/macos/*`
  - Node.js LTS host installer (`install-node.sh`), GitHub CLI host
    installer (`install-github-cli.sh`), npm prefix helper, per-CLI npm
    installers (Codex, Gemini, Copilot, OpenCode, Kilo, Auggie, Pi),
    Claude/Cursor/Goose/Junie/Kiro native installers, and the macOS
    readiness audit
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
- Windows keeps the bundled Ollama local-model runtime helper

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

### Composer Voice Input Permissions

The packaged desktop composer microphone button uses platform-native speech
recognition where Cats has a host-owned helper:

- macOS uses the bundled Swift helper under `resources/native/macos-stt/`.
  The helper requests Speech Recognition and Microphone permission, enforces
  on-device recognition, and fails closed when the requested locale does not
  support on-device recognition. If dictation does not start, check System
  Settings > Privacy & Security > Speech Recognition and Microphone for Cats.
  Fresh-profile validation must confirm whether macOS TCC attributes those
  prompts to the app bundle or the spawned helper binary before release.
- Windows uses the bundled WinRT helper under `resources/native/windows-stt/`.
  The installer publishes this helper self-contained, so users do not need to
  install the .NET 8 runtime separately.
  Windows decides whether free-form dictation uses an installed local speech
  pack or Microsoft online speech based on Settings > Privacy & Security >
  Speech > Online speech recognition and the installed language speech pack.
  Cats reports this as `mode: 'unknown'` and shows the conservative in-app
  privacy badge because the WinRT API does not expose the active route.
- Linux has no v1 native STT helper. The Electron renderer keeps the existing
  Web Speech fallback reachable so the microphone button can show the existing
  unavailable/error toast instead of silently disappearing.

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
- icon set is generated from `assets/app-icon-silhouette.svg`; refresh it with `npm run desktop:icons` for the default circular avatar-style outputs, or use `npm run desktop:icons -- --shape square` to switch back to square outputs. Packaging consumes whatever files are already present and does not regenerate icons during build.
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
default Cats Desktop keeps tray mode enabled, so closing the window hides the
app and keeps `cats-runtime` + `cats` alive in the background. You can change
this in `Settings -> Desktop Startup` by turning off the system tray option; in
that mode closing the window quits the app. The tray menu and recovery surface
still expose an explicit `Quit Cats` action when tray mode is enabled. For CI
or managed deployments that must always quit on close, set
`CATS_DESKTOP_FORCE_QUIT_ON_CLOSE=true`.

---

*Last updated: 2026-04-30*

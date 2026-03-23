# Deployment Guide

> Deployment procedures and infrastructure documentation for the current
> The current `Cats` suite app and the planned packaged Cats suite topology.

## Environments

| Environment | URL | Purpose |
|-------------|-----|---------|
| Development | `http://127.0.0.1:8181` | Local development |
| Built local | `http://127.0.0.1:8181` | Local production-style run after `npm run build` |
| Containerized local | `http://127.0.0.1:8181` | Scaffold exists, but container assets need refresh before being treated as current |
| Staging | TBD | Pre-production testing |
| Production | TBD | Live environment |
| Desktop distributable | Windows NSIS path landed | Electron host starts local `cats-runtime` + `cats`, waits for readiness, persists bootstrap/remediation state, stages Windows/macOS/Linux packaging outputs, and can now emit a Windows NSIS installer for test installs |

## Deployment Methods

### Manual Deployment

```bash
npm install
npm run build
npm start
```

### Docker

```bash
docker compose up --build
```

Container assets were inherited from bootstrap and have not yet been refreshed
for the current `dist-server/` plus Vite output layout. Treat them as a future
follow-up, not a validated deployment path.

### Desktop Host First Slice

The first desktop-host slice is now in-tree:

- Electron `main` owns tray, windows, startup, and process supervision
- `cats-runtime` runs as a managed local sidecar in `app-managed` mode
- `cats` runs as a managed local sidecar in `app-managed` mode
- the host waits on each service's `/health` readiness contract before
  leaving the bootstrap surface
- a host-owned bootstrap page performs the first prerequisite scan against
  `cats-runtime` diagnostics and then:
  - continues into `/setup` for first-run flows
  - or opens `/new` when setup and provider readiness are already satisfied
- The renderer does not talk to provider CLIs or spawn local runtimes directly
- the packaged experience still keeps setup and provider remediation in the
  host rather than pushing shell work into the renderer
- current launch command:

```bash
npm run desktop:start
```

- staged packaging command:

```bash
npm run desktop:stage
```

- current packaging substrate output root:
  - `build/desktop-packaging/desktop-package-plan.json`
  - `build/desktop-packaging/shared/*`
  - `build/desktop-packaging/targets/<target>/installer-manifest.json`
- current platform wrappers:

```powershell
.\scripts\windows\Build-DesktopPackage.ps1 -Platform windows
```

```bash
./scripts/linux/build-desktop-package.sh linux
./scripts/macos/build-desktop-package.sh macos
```

- actual Windows installer command:

```bash
npm run desktop:package:windows
```

```powershell
.\scripts\windows\Build-WindowsInstaller.ps1
```

- current Windows installer output:
  - `release/Cats-<version>-setup-x64.exe`
  - `release/Cats-<version>-setup-x64.exe.blockmap`
  - `release/win-unpacked/*`
- post-install smoke-check command:

```powershell
.\scripts\windows\Test-WindowsInstallerSmoke.ps1
```

- smoke-check defaults:
  - install root: `%LOCALAPPDATA%\Programs\Cats`
  - host state path: `%APPDATA%\Cats\desktop-host\state.json`
- smoke-check contract:
  - verify installed `Cats.exe`
  - verify bundled `cats` and `cats-runtime` sidecar assets
  - verify packaged `desktop-package-plan.json` keeps the Windows NSIS target
  - launch the installed app and wait for the desktop-host state file to reach
    `ready_for_setup`, `ready_for_chat`, or `needs_prerequisites`
- packaging strategy in this slice:
  - keep Electron as the thin host around bundled `cats` + `cats-runtime`
    sidecars
  - stage deterministic target manifests for Windows, macOS, and Linux while
    shipping a real Windows NSIS installer first
  - preserve the self-hosted npm path rather than replacing it
- installer/remediation contract in this slice:
  - verify bundled app assets
  - verify bundled `cats-runtime` sidecar slot
  - run host-owned first-run provider scan
  - map failures onto structured host state plus resumable remediation actions
- update-channel contract in this slice:
  - manual-check skeleton only
  - optional HTTPS manifest URL via env
  - download URLs must stay on the manifest host or an explicit allow-list
  - no auto-download or silent apply yet
- Windows packaging mode in this slice:
  - `electron-builder`
  - target: `nsis`
  - `oneClick: false`
  - installation directory selection enabled
  - executable signing/editing intentionally disabled for the current
    unsigned test-install path

- platform wrappers:

```powershell
.\scripts\windows\Start-DesktopHost.ps1
```

```bash
./scripts/linux/start-desktop-host.sh
./scripts/macos/start-desktop-host.sh
```

- still intentionally out of scope for this slice:
  - full installer matrix
  - auto-update
  - privileged provider-install execution
- Tauri is not the current path because the desktop package still needs to
  supervise Node-based `cats` and `cats-runtime` sidecars
- Mobile is not part of the first packaged primary product surface; if added
  later, treat it as companion scope

See
[ADR-003](./decisions/003-electron-host-manages-local-services.md)
for the planned desktop host model.

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CATS_HOST` | Yes | Host interface to bind (`CATS_INC_HOST` remains a compatibility alias) |
| `CATS_PORT` | Yes | Service port (`CATS_INC_PORT` remains a compatibility alias) |
| `CATS_STATE_PATH` | No | Chat-state file path (`CATS_INC_STATE_PATH` remains a compatibility alias) |
| `CATS_RUNTIME_BASE_URL` | Yes | Upstream runtime URL |
| `CATS_RUNTIME_API_KEY` | No | Optional bearer token for `cats-runtime` |

Desktop-host specific overrides:

| Variable | Required | Description |
|----------|----------|-------------|
| `CATS_DESKTOP_APP_ENTRY` | No | Override built `cats` server entrypoint for the host |
| `CATS_DESKTOP_RUNTIME_ENTRY` | No | Override built `cats-runtime` entrypoint for the host |
| `CATS_DESKTOP_RUNTIME_ROOT` | No | Override sibling `cats-runtime/` root discovery |
| `CATS_DESKTOP_APP_PORT` | No | Override host-managed `cats` port |
| `CATS_DESKTOP_RUNTIME_PORT` | No | Override host-managed `cats-runtime` port |
| `CATS_DESKTOP_STATE_PATH` | No | Override host-managed chat-state path |
| `CATS_DESKTOP_RUNTIME_DATA_DIR` | No | Override host-managed runtime data dir |
| `CATS_DESKTOP_RUNTIME_SESSION_BASE_DIR` | No | Override host-managed runtime session dir |
| `CATS_DESKTOP_RUNTIME_CONFIG_PATH` | No | Override host-managed runtime provider config path |
| `CATS_DESKTOP_HOST_STATE_PATH` | No | Override the persisted desktop-host state file |
| `CATS_DESKTOP_PACKAGING_OUTPUT_ROOT` | No | Override staged packaging output root |
| `CATS_DESKTOP_TRAY_ENABLED` | No | Toggle tray/background lifecycle support |
| `CATS_DESKTOP_KEEP_SERVICES_RUNNING` | No | Keep sidecars alive after the window hides |
| `CATS_DESKTOP_CLOSE_BEHAVIOR` | No | `quit` or `minimize_to_tray` |
| `CATS_DESKTOP_UPDATE_CHANNEL` | No | `stable`, `beta`, or `alpha` |
| `CATS_DESKTOP_UPDATE_MANIFEST_URL` | No | Optional HTTPS update-manifest URL for manual checks |
| `CATS_DESKTOP_UPDATE_ALLOWED_HOSTS` | No | Optional comma-separated host allow-list for update download URLs beyond the manifest host |
| `CATS_DESKTOP_UPDATE_CHECK_ON_STARTUP` | No | Run the manual-check skeleton during startup |
| `CATS_DESKTOP_UPDATE_AUTO_DOWNLOAD` | No | Reserved toggle; remains `false` in this slice |

### Secrets Management

- Keep `.env` local and uncommitted
- Never hardcode runtime API keys in source or docs

## Monitoring

- **Logs**: stdout from the Node process
- **Health**: `GET /health`
- **Renderer**: served by the Node server after `npm run build`
- **Desktop host**: Electron bootstrap page plus child-process supervision
- **Desktop host state**: JSON snapshot at `CATS_DESKTOP_HOST_STATE_PATH`
  containing bootstrap phase, issues, remediation actions, progress steps,
  tray/background state, update status, and packaging metadata
- **Desktop security posture**: sandboxed preload bridge, validated host env
  overrides, validated host action ids, and HTTP/HTTPS-only host-controlled
  external URLs

## Troubleshooting

### Issue 1: Runtime dependency unavailable

**Symptoms**: `/health` returns `503`
**Solution**: Check `cats-runtime` first, then verify the required local CLI
providers and session directories are available to the runtime process.

### Issue 2: Container build does not match the current output layout

**Symptoms**: The Docker image fails to start or cannot find the built server
entrypoint.
**Solution**: Refresh the inherited container assets before using Docker as an
official deployment path.

### Issue 3: Desktop host stays on the bootstrap page instead of opening chat

**Symptoms**: The Electron host starts, but the window keeps showing
prerequisite guidance or provider issues.
**Solution**: Check the bootstrap actions first:

- `Open Runtime Diagnostics` shows the current `cats-runtime`
  diagnostics summary
- `Continue to Setup` opens `/setup` so an API baseline or local CLI path can
  be configured
- `Retry Scan` re-runs readiness and prerequisite checks after remediation

### Issue 4: Windows installer build succeeds but the app is unsigned

**Symptoms**: `npm run desktop:package:windows` produces a working NSIS
installer, but Windows still treats it as unsigned.
**Solution**: This is expected in the current slice. The installer is now real
and testable, but signing/editing is still disabled so the build can run
without the `winCodeSign` symlink issue and without release certificates.

### Issue 5: Desktop update checks fail even though the manifest URL exists

**Symptoms**: The host reports update-check failure after fetching the manifest.
**Solution**: The current desktop host only accepts HTTPS update manifests, and
any `downloadUrl` returned by that manifest must stay on the manifest host or a
host listed in `CATS_DESKTOP_UPDATE_ALLOWED_HOSTS`.

### Issue 5: The installer finishes, but you need a quick post-install verification

**Symptoms**: The NSIS installer completes, but you still need to confirm the
bundled sidecars and desktop-host bootstrap state are present on the installed
machine.
**Solution**: Run `.\scripts\windows\Test-WindowsInstallerSmoke.ps1`. Override
`-InstallRoot` or `-HostStatePath` if the app was installed outside the default
per-user path.

---

*Last updated: 2026-03-24*

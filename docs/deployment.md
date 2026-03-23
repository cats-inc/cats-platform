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
| Desktop distributable | Local slice landed | Electron host starts local `cats-runtime` + `cats`, waits for readiness, and gates into setup/chat |

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

### Secrets Management

- Keep `.env` local and uncommitted
- Never hardcode runtime API keys in source or docs

## Monitoring

- **Logs**: stdout from the Node process
- **Health**: `GET /health`
- **Renderer**: served by the Node server after `npm run build`
- **Desktop host**: Electron bootstrap page plus child-process supervision

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

---

*Last updated: 2026-03-23*

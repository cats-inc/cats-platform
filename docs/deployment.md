# Deployment Guide

> Deployment procedures and infrastructure documentation for the current
> `cats-inc` slice and the planned packaged Cats suite topology.

## Environments

| Environment | URL | Purpose |
|-------------|-----|---------|
| Development | `http://127.0.0.1:8181` | Local development |
| Built local | `http://127.0.0.1:8181` | Local production-style run after `npm run build` |
| Containerized local | `http://127.0.0.1:8181` | Scaffold exists, but container assets need refresh before being treated as current |
| Staging | TBD | Pre-production testing |
| Production | TBD | Live environment |
| Desktop distributable | Planned | Preferred first public distribution path for `Cats Chat` and `Cats Work` |

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

### Planned Desktop Packaging

Desktop packaging is not implemented yet, but the intended topology is now
documented:

- Electron `main` owns tray, windows, startup, and process supervision
- `cats-runtime` runs as a managed local process
- `cats-inc` runs as a managed local process and hosts the first `Cats Core v1`
  APIs or modules
- The BrowserWindow loads local `Cats Chat` and `Cats Work` URLs from
  `cats-inc`
- The renderer does not talk to provider CLIs or spawn local runtimes directly
- The packaged experience should guide owner profile, model credentials, and
  optional bot-binding setup rather than requiring terminal steps
- Tauri is not the current path because the desktop package still needs to
  supervise Node-based `cats-inc` and `cats-runtime` sidecars
- Mobile is not part of the first packaged primary product surface; if added
  later, treat it as companion scope

See
[ADR-003](./decisions/003-electron-host-manages-local-services.md)
for the planned desktop host model.

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CATS_INC_HOST` | Yes | Host interface to bind |
| `CATS_INC_PORT` | Yes | Service port |
| `CATS_RUNTIME_BASE_URL` | Yes | Upstream runtime URL |
| `CATS_RUNTIME_API_KEY` | No | Optional bearer token for `cats-runtime` |

### Secrets Management

- Keep `.env` local and uncommitted
- Never hardcode runtime API keys in source or docs

## Monitoring

- **Logs**: stdout from the Node process
- **Health**: `GET /health`
- **Renderer**: served by the Node server after `npm run build`
- **Desktop host**: planned to supervise local services and onboarding

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

### Issue 3: Packaged desktop onboarding does not exist yet

**Symptoms**: Non-technical users still need to edit `.env` files or start
multiple local services manually.
**Solution**: Treat packaged desktop onboarding as a product requirement, not as
an optional polish item. The intended first-run flow should capture model
credentials, owner profile, and optional transport bindings.

---

*Last updated: 2026-03-16*

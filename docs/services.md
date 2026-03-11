# Service Registry

> This file documents all services in this project that listen on network ports.
> Keeping this up to date helps avoid port conflicts and makes onboarding easier.

## Services

| Service Name | Port | Protocol | Description | Start Command |
|--------------|------|----------|-------------|---------------|
| `cats-inc` HTTP app | 8181 | TCP | Product-facing app shell and health endpoints | `npm start` |
| `cats-inc` Vite dev server | 5173 | TCP | Renderer development server with `/api` proxy | `npm run dev:web` |

## Environment Variables

Port numbers should be configurable via environment variables so developers can override defaults when needed.

| Variable | Default | Service | Notes |
|----------|---------|---------|-------|
| `CATS_INC_HOST` | `127.0.0.1` | `cats-inc` HTTP app | Use `0.0.0.0` in containers |
| `CATS_INC_PORT` | `8181` | `cats-inc` HTTP app | Main local app port |
| `CATS_INC_STATE_PATH` | empty | Workspace store | Defaults to `config/workspace-state.local.json` for channels, members, sessions, and transcripts |
| `CATS_RUNTIME_BASE_URL` | `http://127.0.0.1:3110` | Runtime client | Points to `cats-runtime` |
| `CATS_RUNTIME_API_KEY` | empty | Runtime client | Optional bearer token for `cats-runtime` |

## Cross-Project Port Coordination

This project was created from **project-bootstrap**, which maintains a central port registry at:

```
<bootstrap-project>/docs/port-registry.md
```

**For AI agents**: When adding or changing a service port in this project:

1. **MUST** update the **Services** table above
2. **SHOULD** check the bootstrap project's `docs/port-registry.md` for conflicts with other projects
3. **SHOULD** register the new port in the bootstrap project's `docs/port-registry.md`
4. **MUST** warn the user if a port conflict is detected

---

*Last updated: 2026-03-11*

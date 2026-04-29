# Service Registry

> This file documents all services in this project that listen on network ports.
> Keeping this up to date helps avoid port conflicts and makes onboarding easier.

## Services

| Service Name | Port | Protocol | Description | Start Command |
|--------------|------|----------|-------------|---------------|
| `cats` HTTP app | 8181 | TCP | Product-facing app shell and health endpoints | `npm start` |
| `cats` Vite dev server | 5173 | TCP | Renderer development server with `/api` proxy | `npm run dev:web` |

The host repo/package target is now `cats-platform`, but the running local app
service names remain `cats` for product-facing and operational continuity.

## Planned Shared Service Boundaries

- `Cats Core v1` is a required shared contract for `Cats Chat` and
  `Cats Work`, but it does not have a dedicated network port yet. The current
  planning assumption is that it starts co-hosted inside the current local
  `cats-platform/` workspace until a stronger boundary is needed.
- `cats-runtime` remains the upstream runtime dependency for this project. Its
  direct API remains the primary app-facing boundary, while a future MCP facade
  is intended for orchestrator-style tool use rather than for general app
  routing.
- Do not assign a standalone `Cats Core` port until the implementation proves
  that co-hosting inside `cats` blocks team parallelism or packaging.

## Environment Variables

Port numbers should be configurable via environment variables so developers can override defaults when needed.

| Variable | Default | Service | Notes |
|----------|---------|---------|-------|
| `CATS_HOST` | `127.0.0.1` | `cats` HTTP app | Use `0.0.0.0` in containers; `CATS_INC_HOST` remains accepted temporarily |
| `CATS_PORT` | `8181` | `cats` HTTP app | Main local app port; `CATS_INC_PORT` remains accepted temporarily |
| `CATS_PLATFORM_DIR` | `~/.cats/platform` | Chat store | Base directory for product-owned platform storage under `state/` and `config/` |
| `CATS_DESKTOP_DIR` | `~/.cats/desktop` | Desktop host | Base directory for desktop host state and logs |
| `CATS_RUNTIME_DIR` | `~/.cats/runtime` | Runtime client | Base directory for runtime config, data, and sessions |
| `CATS_RUNTIME_BASE_URL` | `http://127.0.0.1:3110` | Runtime client | Points to `cats-runtime` |
| `CATS_RUNTIME_API_KEY` | empty | Runtime client | Optional bearer token for `cats-runtime` |
| `CATS_RUNTIME_SESSION_CREATE_TIMEOUT_MS` | `60000` | Runtime client | Timeout budget for runtime session creation and provider/workspace startup |
| `CATS_RUNTIME_MESSAGE_IDLE_TIMEOUT_MS` | `120000` | Runtime client | Idle timeout for NDJSON message streams; reset whenever the runtime emits another chunk |

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

*Last updated: 2026-03-16*

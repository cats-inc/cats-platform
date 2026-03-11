# Deployment Guide

> Deployment procedures and infrastructure documentation for the current
> `cats-inc` slice.

## Environments

| Environment | URL | Purpose |
|-------------|-----|---------|
| Development | `http://127.0.0.1:8181` | Local development |
| Containerized local | `http://127.0.0.1:8181` | Docker-based local run |
| Staging | TBD | Pre-production testing |
| Production | TBD | Live environment |

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

## Troubleshooting

### Issue 1: Runtime dependency unavailable

**Symptoms**: `/health` returns `503`
**Solution**: Check `cats-runtime` first, then verify `agent-fleet` during
phase 1.

---

*Last updated: 2026-03-11*

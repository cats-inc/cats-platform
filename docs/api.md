# API Specification

> Public HTTP surface for the initial `cats-inc` shell.

## Overview

The phase 1 API is intentionally small. It provides:

- service and runtime reachability health
- an explicit bootstrap payload for the future workspace shell

## Base URL

```text
Development: http://127.0.0.1:8181
```

## Authentication

No inbound auth is implemented yet.

## Endpoints

### Health

```text
GET /health
```

Returns local service state plus current `cats-runtime` reachability.

Example response:

```json
{
  "service": "cats-inc",
  "status": "ok",
  "timestamp": "2026-03-11T12:34:56.000Z",
  "runtime": {
    "baseUrl": "http://127.0.0.1:3110",
    "reachable": true,
    "status": "ok",
    "service": "cats-runtime"
  }
}
```

### App Shell

```text
GET /api/app-shell
```

Returns the initial product bootstrap contract.

Example response:

```json
{
  "app": {
    "name": "cats-inc",
    "stage": "phase-1",
    "runtimeBoundary": "cats-runtime"
  },
  "workspace": {
    "id": "default",
    "channels": [],
    "globalOrchestrator": {
      "mode": "planned"
    }
  },
  "runtime": {
    "baseUrl": "http://127.0.0.1:3110",
    "reachable": true
  }
}
```

## Error Responses

Errors use a minimal payload:

```json
{
  "error": "Human-readable message"
}
```

### Common Status Codes

| Status | Meaning |
|--------|---------|
| `200` | Request handled successfully |
| `404` | Unknown route |
| `405` | Unsupported method |
| `503` | Runtime dependency unavailable for health checks |

## Notes

- `cats-inc` does not talk to `agent-fleet` directly
- Future session and channel APIs should extend this contract without leaking
  backend-specific transport details

---

*Last updated: 2026-03-11*

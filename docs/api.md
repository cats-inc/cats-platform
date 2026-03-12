# API Specification

> Public HTTP surface for the current `cats-inc` workspace shell.

## Overview

The current Phase 2 API provides:

- service and runtime reachability health
- an explicit bootstrap payload for the workspace renderer shell
- a file-backed workspace mutation surface
- runtime-backed channel activation and message routing
- transcript export for later ingestion

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

### Persist Selected Channel

```text
POST /api/workspace/selection
```

Request body:

```json
{
  "selectedChannelId": "lobby"
}
```

Returns the updated app-shell payload on success.

### Create Workspace Channel

```text
POST /api/workspace/channels
```

Request body:

```json
{
  "title": "Ops Radar",
  "topic": "Track runtime regressions before the desktop host arrives.",
  "repoPath": "C:/Users/kenne/Source/SK2/one-man-digital-company",
  "language": "TypeScript",
  "responseLanguage": "zh-TW",
  "formationMode": "manual",
  "members": [
    {
      "name": "Agent-1",
      "provider": "claude",
      "model": "sonnet",
      "roles": ["coder", "reviewer"]
    }
  ]
}
```

Behavior:

- trims title and topic before persistence
- creates a new persisted channel in the local workspace store
- selects the new channel immediately
- returns the updated app-shell payload

### Add Channel Member

```text
POST /api/workspace/channels/{id}/members
```

Adds a persisted channel member with an execution target
(`provider`/`model`) plus role metadata.

### Remove Channel Member

```text
DELETE /api/workspace/channels/{id}/members/{memberId}
```

Marks the member as removed and best-effort closes its active execution lease.

### Activate Channel

```text
POST /api/workspace/channels/{id}/activate
```

Creates channel-scoped runtime sessions for the global orchestrator and active
members, recording them as execution leases, then returns:

```json
{
  "appShell": { "...": "updated shell payload" },
  "results": [
    {
      "targetKind": "member",
      "targetId": "member-id",
      "targetName": "Agent-1",
      "status": "started",
      "sessionId": "session-2"
    }
  ]
}
```

### Send Channel Message

```text
POST /api/workspace/channels/{id}/messages
```

Request body:

```json
{
  "body": "Please review this fix with @Agent-1"
}
```

Behavior:

- persists the user message to the transcript
- resolves `@mentions` against the orchestrator and active members
- routes the prompt through `cats-runtime` sessions
- persists runtime responses and token usage back into the channel transcript

### Update Global Orchestrator

```text
PUT /api/orchestrator
```

Persists the default execution target plus prompt metadata for the global
orchestrator surface.

### Export Channel

```text
GET /api/workspace/channels/{id}/export
```

Returns a JSON attachment containing the current orchestrator settings and full
channel transcript.

### App Shell

```text
GET /api/app-shell
```

Returns the current product shell contract.

Abbreviated example response:

```json
{
  "app": {
    "name": "cats-inc",
    "stage": "phase-2-shell",
    "runtimeBoundary": "cats-runtime"
  },
  "workspace": {
    "id": "default",
    "name": "Chat",
    "selectedChannelId": "lobby",
    "selectedChannel": {
      "orchestratorLease": {
        "sessionId": "session-1",
        "status": "ready",
        "provider": "claude",
        "model": "claude-opus-4-6"
      },
      "members": [
        {
          "name": "Agent-1",
          "execution": {
            "target": {
              "provider": "claude",
              "model": "sonnet"
            },
            "lease": {
              "sessionId": "session-2",
              "status": "ready",
              "provider": "claude",
              "model": "sonnet"
            }
          },
          "memory": {
            "summary": null,
            "facts": [],
            "openLoops": []
          }
        }
      ]
    },
    "channels": [
      {
        "id": "lobby",
        "title": "Lobby",
        "topic": "A casual room for the team to coordinate, ask for help, and keep things moving.",
        "status": "active",
        "unreadCount": 2,
        "memberCount": 4,
        "activeMemberCount": 4,
        "repoPath": null,
        "workspaceCwd": null,
        "lastMessageAt": "2026-03-11T12:00:00.000Z",
        "lastActivatedAt": "2026-03-11T11:59:00.000Z"
      }
    ],
    "globalOrchestrator": {
      "mode": "global",
      "status": "ready",
      "executionTarget": {
        "provider": "claude",
        "model": "claude-opus-4-6"
      }
    },
    "capabilities": {
      "multiChannel": true,
      "persistence": "file-backed",
      "mentions": "basic",
      "splitView": "planned",
      "transcriptExport": true,
      "participantManagement": "basic",
      "runtimeSessions": true
    }
  },
  "runtime": {
    "baseUrl": "http://127.0.0.1:3110",
    "reachable": true
  },
  "metadata": {
    "generatedAt": "2026-03-11T12:34:56.000Z",
    "host": "127.0.0.1",
    "port": 8181
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
- The renderer consumes this endpoint over a Vite proxy during development
- Workspace shell state is currently persisted to a local JSON file
- Persisted pal state now separates execution targets, execution leases, and
  provider-agnostic memory checkpoints
- Workspace mutations now cover selection, channel setup, membership, activation,
  messaging, orchestrator editing, and export
- Runtime responses are currently delivered as request/response completions; the
  API does not expose live push or WebSocket streaming yet
- Future session and channel APIs should extend this contract without leaking
  backend-specific transport details

---

*Last updated: 2026-03-13*

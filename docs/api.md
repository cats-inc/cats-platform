# API Specification

> Public HTTP surface for the current `cats-inc` chat shell.

## Overview

The current Phase 2 API provides:

- service and runtime reachability health
- an explicit bootstrap payload for the chat renderer shell
- a derived `Cats Core v1` read surface for shared suite contracts
- a file-backed workspace mutation surface
- a workspace-level pal registry plus channel-scoped pal assignment
- runtime-backed channel activation and message routing
- transcript export for later ingestion

The current server now exposes the first read-only `Cats Core v1` routes so
parallel Chat and Work workstreams can consume the same actor, conversation,
task, and owner-profile contract. Write-side approval, escalation, and
transport APIs remain future work.

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

### Core State

```text
GET /api/core
```

Returns the full derived `Cats Core v1` state currently backed by the workspace
store. The payload includes:

- `version`
- `ownerProfile`
- `actors`
- `conversations`
- `tasks`
- `botBindings`
- `archives`
- `workspace`

### List Core Actors

```text
GET /api/core/actors
```

Returns:

```json
{
  "actors": []
}
```

### List Core Conversations

```text
GET /api/core/conversations
```

Returns:

```json
{
  "conversations": []
}
```

### List Core Tasks

```text
GET /api/core/tasks
```

Returns:

```json
{
  "tasks": []
}
```

### Get Owner Profile

```text
GET /api/core/owner-profile
```

Returns:

```json
{
  "ownerProfile": {
    "actorId": "actor-owner",
    "displayName": "Owner"
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
  "selectedChannelId": "ops-radar"
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
  "pals": [
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
- promotes any draft `pals` into the workspace-level pal registry
- creates channel assignments for those pals in the new chat
- selects the new channel immediately
- returns the updated app-shell payload

### Delete Workspace Channel

```text
DELETE /api/workspace/channels/{id}
```

Behavior:

- removes the selected chat from the local workspace store
- best-effort closes any orchestrator and pal runtime sessions still attached to
  that chat
- falls back to the next most recent remaining chat, or clears selection if no
  chats remain
- returns the updated app-shell payload

### Create Workspace Pal

```text
POST /api/workspace/pals
```

Request body:

```json
{
  "name": "Agent-2",
  "provider": "gemini",
  "model": "gemini-2.5-pro",
  "roles": ["reviewer"]
}
```

Creates a reusable workspace-level pal and returns the updated app-shell
payload.

### Assign Workspace Pal to a Channel

```text
POST /api/workspace/channels/{id}/pals
```

Request body:

```json
{
  "palId": "pal-agent-2",
  "provider": "gemini",
  "model": "gemini-2.5-pro",
  "roles": ["reviewer"]
}
```

Behavior:

- creates or updates the channel-scoped pal assignment
- keeps the workspace pal identity and memory checkpoint intact
- stores the channel-specific execution target on the assignment
- if the assignment already had an active lease and the target changes, the
  server best-effort closes the prior runtime session before returning

### Remove Workspace Pal from a Channel

```text
DELETE /api/workspace/channels/{id}/pals/{palId}
```

Marks the channel assignment as removed and best-effort closes its active
execution lease.

### Legacy Compatibility Aliases

```text
POST /api/workspace/channels/{id}/members
DELETE /api/workspace/channels/{id}/members/{memberId}
```

These aliases still work for older clients and stored state. They now route
through the workspace-pal model internally.

### Activate Channel

```text
POST /api/workspace/channels/{id}/activate
```

Creates channel-scoped runtime sessions for the global orchestrator and active
assigned pals, records execution leases, then returns:

```json
{
  "appShell": { "...": "updated shell payload" },
  "results": [
    {
      "targetKind": "pal",
      "targetId": "pal-agent-1",
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
- resolves `@mentions` against the orchestrator and active assigned pals
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

Returns a JSON attachment containing the current orchestrator settings, raw
channel state, hydrated `assignedPals`, and full channel transcript.

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
    "selectedChannelId": "",
    "pals": [],
    "selectedChannel": null,
    "channels": [],
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

## Planned Shared-Core API Families

The following families are planned but not implemented today. They are listed
here so Chat and Work planning can converge on one surface instead of diverging
into separate private schemas.

- `/api/core/actors`
  - shared human, orchestrator, worker, stakeholder, and virtual-friend
    records
- `/api/core/conversations`
  - chat threads, work threads, transport-linked threads, and private
    escalation channels
- `/api/core/bot-bindings`
  - one external bot or transport identity mapped to one orchestrator
- `/api/core/tasks`
  - product-owned task, run, approval, escalation, and takeover state
- `/api/core/owner-profile`
  - structured owner preferences and collaboration rules
- `/api/core/archive`
  - archive eligibility and downstream RAG handoff metadata

## Planned Runtime Access Split

- Product services continue to call `cats-runtime` through direct APIs for
  health, session lifecycle, routing, and operational control.
- Orchestrator-style agents are expected to gain a planned MCP tool surface
  exposed by `cats-runtime`.
- MCP is therefore an additional runtime access mode, not a replacement for the
  app-facing API described in this document.

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
| `404` | Unknown route or workspace entity |
| `405` | Unsupported method |
| `503` | Runtime dependency unavailable for health checks |

## Notes

- `cats-inc` does not talk to `agent-fleet` directly
- The renderer consumes this endpoint over a Vite proxy during development
- Workspace shell state is currently persisted to a local JSON file
- Persisted pal state separates workspace identity, channel assignment,
  execution targets, execution leases, and provider-agnostic memory checkpoints
- Workspace mutations now cover selection, chat setup, global pal registry,
  channel deletion, channel assignment, activation, messaging, orchestrator
  editing, and export
- Legacy `/members` routes remain available as compatibility aliases during
  migration
- Runtime responses are currently delivered as request/response completions; the
  API does not expose live push or WebSocket streaming yet
- Future session and channel APIs should extend this contract without leaking
  backend-specific transport details
- Planned shared-core APIs should be added as new route families rather than
  overloading the current phase-2 workspace routes with unrelated concerns

---

*Last updated: 2026-03-17*

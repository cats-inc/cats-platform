# API Specification

> Public HTTP surface for the current `Cats` suite app shell.

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
task, approval, and owner-profile contract. Write-side approval, escalation, and
transport APIs now have first seam routes for provider catalog consumption and a
Telegram relay skeleton, while full transport delivery remains future work.

Current route ownership:

- `src/app/server/index.ts` is the suite-level assembler only.
- `src/core/api.ts` owns `/api/core/*`.
- `src/products/chat/api/*` owns Chat setup, legacy compatibility routes,
  workspace-prefixed REST routes, and canonical Chat routes.

## Migration Status

The public naming refresh (SPEC-009 / PLAN-009) is now implemented. The
canonical public API uses `/api/cats`, `/api/channels`, `/api/preferences`,
and `/api/orchestrator` routes without workspace prefixes.

- **Canonical**: public routes at `/api/cats`, `/api/channels/*`,
  `/api/preferences`, `/api/orchestrator`
- **Compatibility (workspace-prefixed)**: `/api/workspaces/default/*` and
  `/api/pals` routes remain active as aliases
- **Compatibility (legacy)**: `/api/workspace/*` routes still work and return
  `AppShellPayload`
- **Read model**: `GET /api/app-shell` and `GET /api/views/app-shell` remain
  available for renderer bootstrap

New client code should target the canonical public routes. Workspace-prefixed
and legacy routes will be deprecated once migration is confirmed complete.

References:

- [ADR-010](./decisions/010-separate-read-model-app-shell-from-restful-resource-apis.md)
- [SPEC-008](./specs/SPEC-008-restful-product-api-refactor.md)
- [PLAN-008](./plans/PLAN-008-restful-product-api-refactor.md)
- [SPEC-009](./specs/SPEC-009-public-surface-naming-refresh.md)
- [PLAN-009](./plans/PLAN-009-public-surface-naming-refresh.md)

## Base URL

```text
Development: http://127.0.0.1:8181
```

## Authentication

No inbound auth is implemented yet.

## Canonical Public API (SPEC-009)

### Cats

```text
GET  /api/cats
POST /api/cats
GET  /api/cats/{catId}
```

- `GET` collection returns `{ cats: [...] }`.
- `POST` returns `201` with `{ cat: { ...created } }`.
- `GET` detail returns `{ cat: { ... } }`.

### Channels

```text
GET    /api/channels
POST   /api/channels
GET    /api/channels/{channelId}
DELETE /api/channels/{channelId}
```

- `GET` collection returns `{ channels: [...summaries] }`.
- `POST` returns `201` with `{ channel: { ...view } }`.
- `GET` detail returns `{ channel: { ...view with messages and assignedPals } }`.
- `DELETE` returns `{ deleted: true, channelId }`.

### Channel Messages

```text
GET  /api/channels/{channelId}/messages
POST /api/channels/{channelId}/messages
```

- `GET` returns `{ messages: [...] }`.
- `POST` accepts `{ body, senderName? }` and returns
  `{ message: { ...userMessage }, dispatch: { channelId, results } }`.

### Channel Cats

```text
GET    /api/channels/{channelId}/cats
PUT    /api/channels/{channelId}/cats/{catId}
DELETE /api/channels/{channelId}/cats/{catId}
```

- `GET` returns `{ cats: [...hydrated] }` with `catId` keys instead of `palId`.
- `PUT` is idempotent: creates (`201`) or updates (`200`) an assignment.
  Returns `{ cat: { catId, ...hydrated } }`.
- `DELETE` returns `{ removed: true, channelId, catId }`.

### Channel Activations

```text
POST /api/channels/{channelId}/activations
```

Returns `{ activation: { channelId, startedAt, results } }`.

### Channel Export

```text
GET /api/channels/{channelId}/exports/latest
```

Returns the export payload as a JSON attachment.

### Preferences

```text
GET  /api/preferences
PATCH /api/preferences
```

- `GET` returns `{ preferences: { selectedChannelId } }`.
- `PATCH` accepts `{ selectedChannelId }` and returns the updated preferences.

### Providers

```text
GET /api/providers
GET /api/providers/{provider}/models
```

- `GET /api/providers` returns the product-supported provider families used by
  setup and cat-creation UI.
- `GET /api/providers/{provider}/models` returns a product-level provider model
  catalog. The server prefers `cats-runtime` as the source of truth and may
  fall back to curated static data with warnings when runtime lookup is
  unavailable.

### Transport Relays

```text
GET  /api/transports/telegram
POST /api/transports/telegram/webhook
```

- `GET /api/transports/telegram` returns Telegram relay status for the current
  `Boss Cat` binding.
- `POST /api/transports/telegram/webhook` is the Telegram ingress seam used by
  the future Boss Cat bridge. The current slice returns transport receipts; it
  does not yet deliver full Telegram-to-chat behavior.

### Orchestrator

```text
GET   /api/orchestrator
PATCH /api/orchestrator
PUT   /api/orchestrator
```

- `GET` returns `{ orchestrator: { ...state } }`.
- `PATCH` accepts `{ provider, model?, systemPrompt?, ... }` and returns
  `{ orchestrator: { ...updated } }`.
- `PUT` is a legacy alias that returns `AppShellPayload`.

### Error Shape (Canonical Routes)

Canonical routes use structured errors:

```json
{
  "error": {
    "code": "cat_not_found",
    "message": "Cat not found: ops-reviewer"
  }
}
```

Codes: `cat_not_found`, `channel_not_found`, `workspace_not_found`,
`bad_request`.

---

## Compatibility Endpoints (Workspace-Prefixed)

> The routes below are the workspace-prefixed REST API. They still work and
> will be maintained as aliases. New client code should use the canonical
> public routes above.

### Workspace

```text
GET /api/workspaces/{workspaceId}
```

Returns a workspace summary (id, name, selectedChannelId, channelCount,
palCount, capabilities). Currently only `workspaceId = "default"` is supported.

### Workspace Preferences

```text
GET  /api/workspaces/{workspaceId}/preferences
PATCH /api/workspaces/{workspaceId}/preferences
```

`GET` returns `{ preferences: { selectedChannelId } }`.

`PATCH` accepts `{ selectedChannelId }` and returns the updated preferences.

### Channels

```text
GET  /api/workspaces/{workspaceId}/channels
POST /api/workspaces/{workspaceId}/channels
GET  /api/workspaces/{workspaceId}/channels/{channelId}
DELETE /api/workspaces/{workspaceId}/channels/{channelId}
```

- `GET` collection returns `{ channels: [...summaries] }`.
- `POST` returns `201` with `{ channel: { ...view } }`. No `AppShellPayload`.
- `GET` detail returns `{ channel: { ...view with messages and assignedPals } }`.
- `DELETE` returns `{ deleted: true, channelId }`. No `AppShellPayload`.

### Channel Messages

```text
GET  /api/workspaces/{workspaceId}/channels/{channelId}/messages
POST /api/workspaces/{workspaceId}/channels/{channelId}/messages
```

- `GET` returns `{ messages: [...] }`.
- `POST` accepts `{ body, senderName? }` and returns
  `{ message: { ...userMessage }, dispatch: { channelId, results } }`.
  No `AppShellPayload`.

### Channel Pal Assignments

```text
GET    /api/workspaces/{workspaceId}/channels/{channelId}/pal-assignments
PUT    /api/workspaces/{workspaceId}/channels/{channelId}/pal-assignments/{palId}
DELETE /api/workspaces/{workspaceId}/channels/{channelId}/pal-assignments/{palId}
```

- `GET` returns `{ palAssignments: [...hydrated] }`.
- `PUT` is idempotent: creates (`201`) or updates (`200`) an assignment.
  Returns `{ palAssignment: { ...hydrated } }`.
- `DELETE` returns `{ removed: true, channelId, palId }`.

### Channel Activations

```text
POST /api/workspaces/{workspaceId}/channels/{channelId}/activations
```

Returns `{ activation: { channelId, startedAt, results } }`.
No `AppShellPayload`.

### Channel Export

```text
GET /api/workspaces/{workspaceId}/channels/{channelId}/exports/latest
```

Returns the export payload as a JSON attachment.

### Orchestrator

```text
GET   /api/workspaces/{workspaceId}/orchestrator
PATCH /api/workspaces/{workspaceId}/orchestrator
```

- `GET` returns `{ orchestrator: { ...state } }`.
- `PATCH` accepts `{ provider, model?, systemPrompt?, ... }` and returns
  `{ orchestrator: { ...updated } }`.

### Pals

```text
GET  /api/pals
POST /api/pals
GET  /api/pals/{palId}
```

- `GET` collection returns `{ pals: [...] }`.
- `POST` returns `201` with `{ pal: { ...created } }`.
- `GET` detail returns `{ pal: { ... } }`.

### View Read Model (Compatibility)

```text
GET /api/views/app-shell
```

Alias for `GET /api/app-shell`. Returns the full renderer bootstrap payload.

### Error Shape (REST Routes)

REST routes use structured errors:

```json
{
  "error": {
    "code": "channel_not_found",
    "message": "Channel not found: 550e8400-e29b-41d4-a716-446655440000"
  }
}
```

Codes: `workspace_not_found`, `channel_not_found`, `pal_not_found`,
`assignment_not_found`, `cat_not_found`, `bad_request`.

Channel ids are opaque identifiers. Clients should not derive meaning from the
id or assume it matches the chat title.

---

## Legacy Compatibility Endpoints

> The routes below are the phase-2 compatibility API. They still work and
> return `AppShellPayload` for mutations. New client code should use the
> canonical REST endpoints above.

### Health

```text
GET /health
```

Returns local service state plus current `cats-runtime` reachability.

Example response:

```json
{
  "service": "cats",
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

### List Core Approvals

```text
GET /api/core/approvals
```

Returns a product-owned approval queue seam derived from current core tasks:

```json
{
  "approvals": [
    {
      "id": "approval-task-channel-123",
      "kind": "dispatch_plan",
      "taskId": "task-channel-123",
      "status": "not_requested",
      "requestedForActorId": "actor-owner",
      "requestedByActorId": "actor-orchestrator-global",
      "requiresOwnerDecision": false,
      "decisionOptions": [
        { "action": "approve", "label": "Approve" }
      ]
    }
  ]
}
```

The current slice is intentionally read-only. It defines the approval data
shape and retrieval seam without implementing a full approval loop UI.

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
  "selectedChannelId": "550e8400-e29b-41d4-a716-446655440000"
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
    "name": "cats",
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
- `/api/core/approvals`
  - approval queue projection derived from shared core tasks
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

- the `cats` app does not talk to `agent-fleet` directly
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

*Last updated: 2026-03-21*

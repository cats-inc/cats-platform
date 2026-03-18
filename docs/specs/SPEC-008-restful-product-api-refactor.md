# SPEC-008: RESTful Product API Refactor

Status: Draft (Pending Review)

## Summary

`cats-inc` already has a functioning Node HTTP server, a chat-first React
renderer, a file-backed workspace store, and the first read-only `Cats Core v1`
routes. What it does not have yet is a fully product-facing REST contract.

Today, the API is still centered on `AppShellPayload` and controller-style
workspace actions. This spec defines the next contract shape: resource-oriented
routes for workspaces, channels, messages, pals, assignments, preferences,
orchestrator state, and operation resources, while keeping the current app
shell as a read-only compatibility view during migration.

## Current State

As of 2026-03-18:

- latest `cats-inc` commit on `main` is `d575ebd`
- `npm test` passes locally with 11 passing tests and 0 failures
- the server exposes `/health`, `/api/app-shell`, `/api/core/*`, and multiple
  `/api/workspace/*` mutation routes
- most mutations return the full updated `AppShellPayload`
- the renderer depends on that full-shell mutation pattern in
  `src/renderer/api.ts` and `src/renderer/App.tsx`
- `selectedChannelId` is currently persisted through a server-side workspace
  action route

This is good enough for the current shell, but it is not yet the right contract
for `Cats Chat`, `Cats Work`, or future Telegram/LINE transport relays.

## Goals

- Make resource nouns the primary product API contract.
- Separate renderer read models from authoritative write/read resources.
- Keep `cats-runtime` behind the `cats-inc` product boundary.
- Preserve incremental migration without breaking the current renderer.
- Reuse one API shape across Chat, Work, and external transport entrypoints.
- Keep the API aligned with the existing `Cats Core v1` direction.

## Non-Goals

- Adding authentication or authorization in this slice
- Replacing file-backed storage with a database in this slice
- Introducing live streaming, SSE, or WebSocket push in this slice
- Replacing `cats-runtime` or bypassing the runtime boundary
- Redesigning the Chat UI itself beyond the API work required for migration

## Requirements

### Functional Requirements

- The product server shall expose authoritative resource routes for:
  - workspaces
  - workspace preferences
  - channels
  - channel messages
  - channel pal assignments
  - workspace/global orchestrator state
  - reusable pals
  - channel activation operations
  - export/read-only archive payloads
- The product server shall keep `GET /api/app-shell` available during migration
  as a compatibility read model.
- The product server shall stop treating `AppShellPayload` as the authoritative
  mutation response contract for new or migrated endpoints.
- Every legacy mutation route shall map to either:
  - a new resource route
  - a new operation resource
  - an explicit decision that the behavior should move client-side
- The renderer migration path shall be incremental: new REST endpoints land
  before legacy action endpoints are removed.
- `Cats Core v1` read routes shall remain aligned with the same underlying
  workspace/core store so Chat and Work do not fork schemas.
- Errors shall use a structured payload with a machine-readable code and a
  human-readable message.

### Non-Functional Requirements

- The migration shall be additive first and low-risk.
- The refactor shall preserve current behavior around runtime activation,
  message routing, transcript persistence, and export.
- The API shall not leak raw provider-bound runtime internals beyond the
  product-owned execution-target and execution-lease model.
- The implementation shall be test-covered at route and store level.
- Response payloads shall be smaller and more targeted than the current
  full-shell mutation pattern.

## Target API Shape

### Resource Families

The target API should be organized around these families:

- `GET /api/workspaces/{workspaceId}`
- `GET /api/workspaces/{workspaceId}/preferences`
- `PATCH /api/workspaces/{workspaceId}/preferences`
- `GET /api/workspaces/{workspaceId}/channels`
- `POST /api/workspaces/{workspaceId}/channels`
- `GET /api/workspaces/{workspaceId}/channels/{channelId}`
- `PATCH /api/workspaces/{workspaceId}/channels/{channelId}`
- `DELETE /api/workspaces/{workspaceId}/channels/{channelId}`
- `GET /api/workspaces/{workspaceId}/channels/{channelId}/messages`
- `POST /api/workspaces/{workspaceId}/channels/{channelId}/messages`
- `GET /api/workspaces/{workspaceId}/channels/{channelId}/pal-assignments`
- `PUT /api/workspaces/{workspaceId}/channels/{channelId}/pal-assignments/{palId}`
- `DELETE /api/workspaces/{workspaceId}/channels/{channelId}/pal-assignments/{palId}`
- `GET /api/workspaces/{workspaceId}/orchestrator`
- `PATCH /api/workspaces/{workspaceId}/orchestrator`
- `GET /api/pals`
- `POST /api/pals`
- `GET /api/pals/{palId}`
- `PATCH /api/pals/{palId}`
- `POST /api/workspaces/{workspaceId}/channels/{channelId}/activations`
- `GET /api/workspaces/{workspaceId}/channels/{channelId}/exports/latest`
- existing `GET /api/core/*` routes remain in place

### Legacy-to-Target Mapping

| Current Route | Current Problem | Target Direction |
|---------------|-----------------|------------------|
| `GET /api/app-shell` | renderer aggregate used as primary contract | keep as compatibility read model; introduce `GET /api/views/app-shell` alias when migration starts |
| `POST /api/workspace/selection` | UI action, not resource-oriented | move to `PATCH /api/workspaces/{workspaceId}/preferences` or local renderer state |
| `POST /api/workspace/channels` | missing workspace resource context | `POST /api/workspaces/{workspaceId}/channels` |
| `DELETE /api/workspace/channels/{id}` | missing workspace context | `DELETE /api/workspaces/{workspaceId}/channels/{channelId}` |
| `POST /api/workspace/pals` | registry resource hidden behind workspace action naming | `POST /api/pals` |
| `POST /api/workspace/channels/{id}/pals` | create/update assignment is not idempotent | `PUT /api/workspaces/{workspaceId}/channels/{channelId}/pal-assignments/{palId}` |
| `DELETE /api/workspace/channels/{id}/pals/{palId}` | legacy naming | `DELETE /api/workspaces/{workspaceId}/channels/{channelId}/pal-assignments/{palId}` |
| `POST /api/workspace/channels/{id}/members` | compatibility alias | deprecate after assignment routes are live |
| `DELETE /api/workspace/channels/{id}/members/{memberId}` | compatibility alias | deprecate after assignment routes are live |
| `POST /api/workspace/channels/{id}/activate` | root action verb | `POST /api/workspaces/{workspaceId}/channels/{channelId}/activations` |
| `POST /api/workspace/channels/{id}/messages` | close to RESTful, but missing workspace context and response shape | `POST /api/workspaces/{workspaceId}/channels/{channelId}/messages` |
| `PUT /api/orchestrator` | root singleton without workspace context | `PATCH /api/workspaces/{workspaceId}/orchestrator` |
| `GET /api/workspace/channels/{id}/export` | ad hoc export route | `GET /api/workspaces/{workspaceId}/channels/{channelId}/exports/latest` |

### Response Conventions

- Collection reads should return collection-scoped payloads such as
  `{ "channels": [...] }`.
- Detail reads should return the addressed resource such as
  `{ "channel": { ... } }`.
- Resource creation should return `201` plus the created resource.
- Operation resources may return `200` or `201` with the operation summary and
  any created side effects.
- Mutations should return the affected resource or operation result only.
- No new REST mutation route should return a full `AppShellPayload`.

### Error Shape

Target error payload:

```json
{
  "error": {
    "code": "channel_not_found",
    "message": "Channel not found: ops-radar",
    "details": {
      "channelId": "ops-radar"
    }
  }
}
```

`details` may be omitted when not useful.

### Operation Resource Examples

Activation remains operational, so the endpoint should return an operation
summary instead of pretending activation is a normal field update.

Example:

```json
{
  "activation": {
    "channelId": "ops-radar",
    "startedAt": "2026-03-18T08:00:00.000Z",
    "results": [
      {
        "targetKind": "orchestrator",
        "targetId": "global",
        "status": "started",
        "sessionId": "session-1"
      }
    ]
  }
}
```

Message creation may remain synchronous for now, but the response should focus
on the created user message and resulting routed messages, not the full shell.

## Design Notes

### Read Model vs Resource Contract

The renderer still benefits from a bootstrapped shell payload. That is allowed,
but it should be explicit that:

- app-shell is a read model
- resource endpoints are the source of truth
- renderer convenience does not define the product contract

### Workspace Preferences

`selectedChannelId` is the main ambiguous case today.

Accepted direction:

- if selection must stay server-persisted, treat it as a workspace preference
- if persistence is not valuable enough, move it into local renderer state and
  remove the server mutation entirely

### Cats Core Alignment

The REST refactor should not create a second parallel schema. Resource payloads
for channels, pals, tasks, actors, and owner profile should continue to map
cleanly into the current `Cats Core v1` state and store.

## Migration Strategy

1. Add canonical resource DTOs and new server routes without deleting legacy
   endpoints.
2. Keep legacy routes as compatibility adapters over the same underlying store
   logic.
3. Refactor renderer API code to fetch and mutate through resource clients.
4. Keep `GET /api/app-shell` as a compatibility read model while the renderer
   is still using it.
5. Mark legacy action routes deprecated once the renderer no longer depends on
   them.
6. Remove legacy routes only after tests cover the REST surface and the
   renderer cutover is complete.

## Acceptance Criteria

- Planning docs define a concrete target route family for every current
  workspace mutation route.
- The approved direction clearly separates read models from resource contracts.
- The plan preserves `cats-runtime` as the only runtime boundary.
- The migration can be implemented incrementally without a big-bang rewrite.
- Another agent can implement the refactor directly from the spec and plan.

## Open Questions

- Should `selectedChannelId` remain server-persisted, or should it move fully
  client-side?
- Should activation eventually return `202 Accepted` plus polling/state lookup,
  or is a synchronous `200/201` operation resource sufficient for the next
  slice?
- Should `GET /api/app-shell` be renamed immediately to `GET /api/views/app-shell`,
  or should that alias be introduced first and the old path removed later?
- Do we want resource DTOs to live under one new shared module, or stay close
  to existing `app-shell` and `core` types during the first migration step?

## References

- [ADR-010](../decisions/010-separate-read-model-app-shell-from-restful-resource-apis.md)
- [PLAN-008](../plans/PLAN-008-restful-product-api-refactor.md)
- [API](../api.md)
- [Architecture](../architecture.md)

---

*Last updated: 2026-03-18*

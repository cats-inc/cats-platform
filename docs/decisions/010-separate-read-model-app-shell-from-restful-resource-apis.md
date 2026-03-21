# ADR-010: Separate Read-Model App Shell from RESTful Resource APIs

> Make `cats`'s HTTP surface resource-oriented while keeping the current
> phase-2 shell available as a compatibility read model during migration.

## Status

Accepted

## Context

As of 2026-03-18, `cats` already exposes a useful HTTP surface:

- `GET /health`
- `GET /api/app-shell`
- `GET /api/core/*`
- multiple `/api/workspace/*` mutation routes
- `PUT /api/orchestrator`

That surface works for the current renderer, but it is still shaped around
renderer convenience instead of stable product resources.

Current issues:

- many mutations return the full `AppShellPayload`
- the renderer treats `AppShellPayload` as the authoritative mutation result
- UI concerns like selected-chat persistence are mixed into the same surface as
  domain resources
- route naming mixes resource nouns, action verbs, and compatibility aliases
- future `Cats Chat`, `Cats Work`, and transport relays would need to reuse a
  renderer-shaped shell payload instead of a product-facing resource contract

At the same time, several constraints must stay intact:

- `cats-runtime` remains the only runtime boundary
- current file-backed and core-backed storage should keep working during
  migration
- `Cats Core v1` remains the shared domain layer for Chat and Work
- the current renderer cannot be broken by a big-bang API rewrite

## Decision

`cats` will adopt a two-lane HTTP model.

### 1. Resource APIs become the authoritative contract

New and migrated product behavior should be expressed through resource-oriented
families such as:

- `/api/workspaces/{workspaceId}`
- `/api/workspaces/{workspaceId}/channels`
- `/api/workspaces/{workspaceId}/channels/{channelId}`
- `/api/workspaces/{workspaceId}/channels/{channelId}/messages`
- `/api/workspaces/{workspaceId}/channels/{channelId}/pal-assignments/{palId}`
- `/api/workspaces/{workspaceId}/orchestrator`
- `/api/workspaces/{workspaceId}/preferences`
- `/api/pals`
- `/api/pals/{palId}`
- `/api/workspaces/{workspaceId}/channels/{channelId}/activations`
- `/api/workspaces/{workspaceId}/channels/{channelId}/exports/latest`
- `/api/core/*`

Rules:

- `GET` reads collections or details by stable resource identifiers
- `POST` creates a resource or an operation resource
- `PUT` or `PATCH` updates the addressed resource or subresource
- `DELETE` removes or archives the addressed resource or subresource
- mutations return the affected resource or operation result, not the full
  `AppShellPayload`

### 2. View APIs become read-only aggregates

The current shell payload remains useful for bootstrapping the renderer, but it
is a read model, not the authoritative mutation contract.

Direction:

- `GET /api/app-shell` remains available during migration as a compatibility
  endpoint
- a view-oriented alias such as `GET /api/views/app-shell` should be introduced
  when the refactor starts landing
- no new mutation work should depend on full-shell round trips

### 3. Command-like workflows are modeled as operation resources

Some actions are inherently operational rather than CRUD-only, especially
runtime activation and export.

Those workflows should be represented as subordinate operation resources rather
than root-level controller verbs. Examples:

- `POST /api/workspaces/{workspaceId}/channels/{channelId}/activations`
- `GET /api/workspaces/{workspaceId}/channels/{channelId}/exports/latest`

### 4. UI-only state is separated from core resources

UI selection should no longer live behind ad hoc action routes like
`POST /api/workspace/selection`.

If server persistence is still required, it should move under a dedicated
preference resource such as:

- `PATCH /api/workspaces/{workspaceId}/preferences`

If server persistence is not required, the renderer may own that state locally.

### 5. Migration is additive first, removal later

`cats` should add the RESTful resource surface before removing legacy
workspace-action endpoints. Legacy routes may stay as compatibility adapters
until the renderer and tests are fully cut over.

## Consequences

### Positive

- Chat, Work, and future transport clients can share the same product-facing
  API without inheriting a renderer-specific shell contract.
- Mutations become smaller and easier to test because they return resource- or
  operation-scoped payloads.
- The current app shell can remain as a read model without forcing every client
  to use it as the source of truth.
- The design stays compatible with `Cats Core v1` and the current
  `cats -> cats-runtime` boundary.

### Negative

- The server will temporarily support both legacy action endpoints and new
  resource endpoints.
- The renderer will need to compose page state from multiple reads or from a
  dedicated read model instead of assuming every mutation returns a full shell.
- Some workflows, especially activation, require explicit operation-resource
  design instead of a simple CRUD mapping.

### Neutral

- This decision does not require a database migration by itself.
- This decision does not introduce authentication, streaming, or WebSocket work
  by itself.
- Existing `Cats Core v1` read routes may stay in place while their write-side
  peers are added later.

## Alternatives Considered

### Alternative 1: Keep extending the current action-style workspace API

- **Pros**: Lowest immediate implementation effort.
- **Cons**: Keeps the API coupled to the current renderer and encourages more
  full-shell mutation responses.
- **Why rejected**: It makes future Chat, Work, and transport clients harder to
  build and keeps UI state mixed with product resources.

### Alternative 2: Replace everything with a new `/api/v2` in one pass

- **Pros**: Very clean end state.
- **Cons**: High migration risk and unnecessary breakage for the current
  renderer.
- **Why rejected**: The current codebase is small enough for additive migration,
  and additive migration is safer.

### Alternative 3: Keep only read models and avoid explicit resource routes

- **Pros**: Simpler renderer bootstrapping.
- **Cons**: Poor fit for future multi-surface clients and weak semantics for
  ownership, partial updates, and testing.
- **Why rejected**: `cats` is now a product server, not just a renderer
  bootstrap endpoint.

## References

- [API](../api.md)
- [Architecture](../architecture.md)
- [ADR-007](./007-establish-cats-core-v1-for-chat-and-work.md)
- [ADR-008](./008-expose-cats-runtime-via-direct-api-and-mcp-facade.md)
- [SPEC-008](../specs/SPEC-008-restful-product-api-refactor.md)
- [PLAN-008](../plans/PLAN-008-restful-product-api-refactor.md)

---

*Accepted: 2026-03-18*
*Accepted by: user direction captured through Codex*

# ADR-036: Unify API Contract and Namespace Endpoints by Product

> Establish a single, consistent API contract across all endpoints — error
> handling, response envelopes, request bodies, status codes, pagination —
> and namespace endpoints so that shared resources live at `/api/*` and
> product-specific resources live under `/api/{product}/*`, while runtime
> tooling lives under `/runtime/*`.

## Status

Proposed

## Date

2026-03-24

## Context

### Endpoint namespace problem

All Chat-specific endpoints currently occupy the top-level `/api/*` namespace
without a product prefix. When Work and Code surfaces ship, they will collide:

- `/api/cats` — is this the Chat cat roster or a shared actor list?
- `/api/orchestrator` — Chat's orchestrator or a shared one?
- `/api/preferences` — Chat sidebar preference or platform-wide settings?

Meanwhile, shared resources use an artificial `/api/core/*` prefix that
leaks an internal module name into the URL. No major API (GitHub, Slack,
Stripe) exposes internal architecture in its URL scheme.

### API contract inconsistencies

The codebase has grown organically and now contains three different error
handling strategies, four response envelope formats, two request body
conventions, and inconsistent status codes.

#### Error handling — three separate implementations

**Core API** uses a structured `CoreApiError` class hierarchy
(`core/errors.ts`):

```typescript
throw new CoreValidationError('title is required');   // → 400
throw new CoreNotFoundError('actor not found');        // → 404
throw new CoreConflictError('id already exists');      // → 409
```

**Chat API** uses string-prefix matching on error messages
(`products/chat/api/routeSupport.ts`):

```typescript
function handleRestError(context, error) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  if (message.startsWith('Channel not found:')) → sendRestError(404, ...)
  if (message.startsWith('Cat not found:'))     → sendRestError(404, ...)
  // ... five more string checks ...
  else → sendRestError(400, 'bad_request', message)
}
```

This is fragile: changing an error message text silently changes the HTTP
status code from 404 to 400. There is also a near-duplicate function
`handleCanonicalCatError()` in the same file that repeats three of the same
checks.

**Server-level** routes inline their own error handling with no shared
pattern.

#### Response envelope — four formats coexist

```
Collection:     { actors: [...] }                    (key = resource name)
Single create:  { project: {...}, created: true }    (key + meta flag)
Single create:  { channel: {...} }                   (key, no meta flag)
Delete:         { deleted: true, bindingId: "x" }    (ad hoc)
Orchestrator:   OrchestratorDispatchResponse          (raw domain object)
Error:          { error: { code, message } }         (consistent)
```

#### Request body — two conventions

```
Core:    { project: { title: "..." } }     (wrapped in resource key)
Chat:    { selectedChannelId: "..." }      (flat body)
Chat:    { title: "...", mode: "..." }     (flat body)
```

#### Status codes — inconsistencies

- `DELETE` returns `200 { deleted: true }` instead of `204 No Content`
- Some mutation handlers return the full resource (good), others return
  partial or ad hoc shapes

#### No pagination or filtering

All list endpoints return the entire collection. `traces` and `activities`
grow unboundedly. Work's kanban board will need `?status=in_progress`
filtering on tasks.

### Comparison with cats-runtime

`cats-runtime` has a thin, consistent HTTP layer (`src/http/routes/`) that
delegates to core services. The runtime does not mix domain logic into
route handlers. `cats` should match this standard.

## Decision

### 1. Remove `/api/core/` prefix — shared resources live at `/api/*`

Shared resources that all products consume move to the top-level namespace:

| Before | After |
|---|---|
| `/api/core` | `/api/state` (full core state, debug/admin only) |
| `/api/core/actors` | `/api/actors` |
| `/api/core/conversations` | `/api/conversations` |
| `/api/core/projects` | `/api/projects` |
| `/api/core/work-items` | `/api/work-items` |
| `/api/core/tasks` | `/api/tasks` |
| `/api/core/runs` | `/api/runs` |
| `/api/core/traces` | `/api/traces` |
| `/api/core/checkpoints` | `/api/checkpoints` |
| `/api/core/outcomes` | `/api/outcomes` |
| `/api/core/artifacts` | `/api/artifacts` |
| `/api/core/activities` | `/api/activities` |
| `/api/core/approval-bindings` | `/api/approval-bindings` |
| `/api/core/approvals` | `/api/approvals` |
| `/api/core/operator-actions` | `/api/operator-actions` |
| `/api/core/owner-profile` | `/api/owner-profile` |

### 2. Add `/api/chat/` prefix to Chat-specific resources

| Before | After |
|---|---|
| `/api/app-shell` | `/api/chat/app-shell` |
| `/api/views/app-shell` | `/api/chat/views/app-shell` |
| `/api/channels` | `/api/chat/channels` |
| `/api/channels/:id/messages` | `/api/chat/channels/:id/messages` |
| `/api/channels/:id/activations` | `/api/chat/channels/:id/activations` |
| `/api/channels/:id/exports/latest` | `/api/chat/channels/:id/exports/latest` |
| `/api/channels/:id/attachments` | `/api/chat/channels/:id/attachments` |
| `/api/channels/:id/companion-box/*` | `/api/chat/channels/:id/companion-box/*` |
| `/api/cats` (Chat roster) | `/api/chat/cats` |
| `/api/cats/:id` | `/api/chat/cats/:id` |
| `/api/orchestrator/*` | `/api/chat/orchestrator/*` |
| `/api/bot-bindings` | `/api/chat/bot-bindings` |
| `/api/bot-bindings/:id` | `/api/chat/bot-bindings/:id` |
| `/api/setup/*` | `/api/chat/setup/*` |
| `/api/preferences` | `/api/chat/preferences` |
| `/api/owner/memory/*` | `/api/chat/memory/*` |
| `/api/runtime/mcp` | `/api/chat/runtime/mcp` |

Platform-level infrastructure endpoints keep their current paths:

- `/health` — unchanged
- `/api/providers` — unchanged
- `/api/providers/:name/models` — unchanged
- `/api/transports/telegram/*` — unchanged (transport layer, not product)
- `/api/shell/browse` — unchanged (host utility)
- `/api/shell/open-folder` — unchanged (host utility)
- `/runtime/dashboard` — platform-hosted runtime dashboard HTML
- `/runtime/playground` — platform-hosted runtime playground HTML
- `/runtime/api/*` — platform-hosted runtime JSON seam

Runtime tooling is intentionally kept out of `/api/*` because `/api/*` is
reserved for platform and product JSON APIs. Runtime HTML and runtime JSON live
under their own `/runtime/*` tree, as defined by ADR-037.

### 3. Backward compatibility via compatibility handlers

During migration, old paths stay registered as compatibility handlers that
dispatch to the same logic as the final routes. This allows the renderer and
other in-repo callers to migrate incrementally without changing HTTP semantics.

```typescript
// Example compatibility alias
if (url.pathname === '/api/core/actors') {
  url.pathname = '/api/actors';
  routeSharedApi(request, response, url);
  return;
}
```

Do not use `301 Moved Permanently` for mutation routes. If an actual redirect is
ever used for a safe read-only route, it must preserve method semantics.
Compatibility handlers are removed after all consumers have migrated.

### 4. Unify error handling — one error class hierarchy for all products

Retire Chat's string-matching error detection. All route handlers across
the entire app use the same error classes.

#### Error class hierarchy (`shared/errors.ts`, moved from `core/errors.ts`)

```typescript
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, code = 'bad_request') {
    super(message, code, 400);
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string, code = 'not_found') {
    super(message, code, 404);
  }
}

export class ConflictError extends ApiError {
  constructor(message: string, code = 'conflict') {
    super(message, code, 409);
  }
}
```

#### Model layer throws typed errors

Before (Chat model functions):
```typescript
// products/chat/state/model.ts
function requireChannel(state, channelId) {
  const channel = state.channels.find(c => c.id === channelId);
  if (!channel) throw new Error(`Channel not found: ${channelId}`);
  //            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //            Generic Error — caller must string-match to determine 404
  return channel;
}
```

After:
```typescript
import { NotFoundError } from '../../../shared/errors.js';

function requireChannel(state, channelId) {
  const channel = state.channels.find(c => c.id === channelId);
  if (!channel) throw new NotFoundError(
    `Channel not found: ${channelId}`,
    'channel_not_found',
  );
  return channel;
}
```

#### Single error handler for all routes (`shared/http.ts`)

```typescript
export function handleApiError(response: ServerResponse, error: unknown): void {
  if (error instanceof ApiError) {
    sendJson(response, error.statusCode, {
      error: { code: error.code, message: error.message },
    });
    return;
  }

  if (error instanceof SyntaxError) {
    sendJson(response, 400, {
      error: { code: 'invalid_json', message: 'Request body must be valid JSON' },
    });
    return;
  }

  sendJson(response, 500, {
    error: { code: 'internal_error', message: 'Internal server error' },
  });
}
```

Delete `handleRestError()`, `handleCanonicalCatError()`, `errorStatusCode()`,
`sendRestError()`, `sendCoreError()`, and `handleCoreError()`.

### 5. Standardize response envelope

#### Collection responses

```json
{
  "data": [ ... ],
  "meta": {
    "total": 42
  }
}
```

- `data` always contains the array
- `meta.total` is the total count (before pagination, if applicable)
- When pagination is active, `meta` also includes cursor/offset fields
  (see section 7)

#### Single resource responses

```json
{
  "data": { ... }
}
```

- `data` contains the single resource object
- Create responses additionally include `"created": true` at the top level

Example create response:

```json
{
  "data": { "id": "proj_1", "title": "..." },
  "created": true
}
```

#### Delete responses

Return `204 No Content` with an empty body. No JSON payload.

#### Error responses (unchanged — already consistent)

```json
{
  "error": {
    "code": "not_found",
    "message": "Channel not found: ch_1"
  }
}
```

#### Orchestrator / complex operation responses

Orchestrator dispatch and plan responses are operation results, not simple
CRUD. They use the `data` wrapper but may include additional top-level
metadata:

```json
{
  "data": { ... orchestrator result ... },
  "meta": {
    "contractVersion": 1,
    "surface": "direct_product_api"
  }
}
```

### 6. Standardize request body

All mutation requests use a **flat body** — the resource fields are
top-level properties of the JSON body:

```json
POST /api/projects
{
  "title": "My Project",
  "status": "active",
  "ownerActorId": "actor_owner"
}
```

Not:

```json
{
  "project": {
    "title": "My Project",
    ...
  }
}
```

Rationale: flat bodies are simpler to construct, validate, and document.
The URL already identifies the resource type — wrapping it in a key
is redundant. This matches the convention of GitHub, Stripe, and Slack APIs.

The existing Core API wrapped body pattern (`readWrappedBody(context, 'project')`)
will be replaced with `readObjectBody(context)`.

### 7. Add pagination to unbounded collections

Endpoints that can grow unboundedly add optional pagination:

- `/api/traces` — grows with every orchestration event
- `/api/activities` — grows with every state change
- `/api/checkpoints` — grows over time
- `/api/chat/channels/:id/messages` — grows per conversation

#### Pagination contract

Cursor-based pagination with `limit` and `cursor` query parameters:

```
GET /api/traces?limit=50
GET /api/traces?limit=50&cursor=eyJ0IjoiMjAyNi0wMy0yNFQxMDowMDowMFoifQ
```

Response:

```json
{
  "data": [ ... ],
  "meta": {
    "total": 1250,
    "limit": 50,
    "cursor": "eyJ0IjoiMjAyNi0wMy0yNFQxMDowMDowMFoifQ",
    "hasMore": true
  }
}
```

Default `limit` is 100. Maximum `limit` is 500.

Bounded collections (`/api/actors`, `/api/projects`) do not need pagination
in the current scale but return the same `meta` shape for consistency:

```json
{
  "data": [ ... ],
  "meta": {
    "total": 5
  }
}
```

### 8. Add basic filtering to list endpoints

Endpoints that Work/Code will need to filter:

```
GET /api/tasks?status=in_progress
GET /api/tasks?assignedActorId=actor_cat_1
GET /api/tasks?status=in_progress&assignedActorId=actor_cat_1
GET /api/actors?kind=worker
GET /api/work-items?projectId=proj_1&status=ready
GET /api/traces?runId=run_1
GET /api/activities?projectId=proj_1
```

Filter parameters are optional. When omitted, all records are returned
(subject to pagination). Multiple filters are ANDed.

Invalid filter values return `400`:

```json
{
  "error": {
    "code": "bad_request",
    "message": "Invalid status filter: 'foo'. Allowed: draft, planned, ready, in_progress, blocked, completed, cancelled, archived"
  }
}
```

## Consequences

### Positive

- Every endpoint follows the same contract — new contributors can learn
  one pattern and apply it everywhere
- Error handling is type-safe — no silent status code changes from
  editing error message strings
- Shared resources have clean, intuitive URLs — `/api/tasks` not
  `/api/core/tasks`
- Product namespacing prevents collisions when Work and Code ship
- Pagination prevents unbounded response sizes as data grows
- Filtering enables server-side queries that Work's kanban needs
- The unified `data` / `meta` envelope makes client-side API utilities
  trivial to implement

### Negative

- Every `fetch()` URL in the renderer must be updated
- Compatibility handlers add temporary routing complexity
- Pagination adds implementation work for endpoints that currently just
  return arrays
- Request body convention change (wrapped → flat) touches every Core
  write handler and its tests

### Neutral

- Error class rename (`CoreApiError` → `ApiError`) is mechanical
- The compatibility handler layer is temporary and self-documenting
- This ADR does not change the data model or storage format
- This ADR does not introduce authentication or rate limiting

## Alternatives Considered

### Alternative 1: Keep `/api/core/` prefix and add `/api/chat/` alongside

- **Pros**: smaller diff — only Chat routes move
- **Cons**: "core" is still an implementation leak; API consumers must
  learn that "core" means "shared" — unintuitive
- **Why rejected**: if we're already moving Chat routes, removing the
  unnecessary prefix at the same time costs almost nothing extra

### Alternative 2: Use API versioning (`/api/v2/`) instead of compatibility handlers

- **Pros**: clean break; old clients continue to work on `/api/v1/`
- **Cons**: premature — there is currently one client (the renderer);
  maintaining two API versions doubles the surface area
- **Why rejected**: compatibility handlers achieve backward compatibility without
  version proliferation; versioning can be introduced later when
  there are external consumers

### Alternative 3: Use GraphQL instead of REST for the unified API

- **Pros**: flexible querying; automatic filtering/pagination via schema
- **Cons**: massive migration; adds query language complexity; the current
  resource model maps naturally to REST
- **Why rejected**: the problems are in consistency and convention, not in
  the REST paradigm itself

### Alternative 4: Fix only error handling and leave everything else

- **Pros**: smallest scope
- **Cons**: inconsistent envelopes and missing pagination remain; endpoint
  namespacing problem is unchanged
- **Why rejected**: partial fixes leave the API in an inconsistent state
  that's harder to document and maintain than either the current state
  or a fully unified contract

## Migration Ordering

This work should be sequenced inside
[PLAN-024](../plans/PLAN-024-platform-dependency-inversion-and-design-extraction.md)
Phase 6 and Phase 7, after the earlier phases have inverted platform
dependencies, extracted shared contracts, and decomposed the largest core and
Chat hotspots.

Recommended order:

1. PLAN-024 Phase 1 (dependency inversion)
2. PLAN-024 Phase 2 (shared contract extraction)
3. PLAN-024 Phase 3 and Phase 4 (core/chat decomposition)
4. PLAN-024 Phase 5 (renderer/shell/design extraction)
5. **This ADR in PLAN-024 Phase 6** — unify contract behavior on current paths
6. **This ADR in PLAN-024 Phase 7** — migrate to final namespaces and align the
   runtime subtree

## References

- [ADR-010](./010-separate-read-model-app-shell-from-restful-resource-apis.md) — resource-oriented API direction
- [ADR-025](./025-make-cats-inc-a-platform-host-with-core-owned-product-projections.md) — platform host structure
- [ADR-035](./035-invert-platform-dependency-and-extract-shared-design-layer.md) — platform dependency inversion
- [PLAN-024](../plans/PLAN-024-platform-dependency-inversion-and-design-extraction.md) — implementation plan for ADR-035

---

*Proposed: 2026-03-24*
*Decision makers: user + Claude*

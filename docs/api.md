# API Specification

> Public HTTP surface for the current `Cats` suite app shell.

## Overview

The current Phase 2 API provides:

- service and runtime reachability health
- an explicit bootstrap payload for the chat renderer shell
- a derived `Cats Core v1` read and write surface for shared suite contracts
- a file-backed chat mutation surface
- a chat-global cat registry plus channel-scoped cat assignment
- runtime-backed channel activation and message routing
- a Cats-owned canonical memory and retrieval substrate for companion, owner,
  and channel scopes
- transcript export for later ingestion

The current server now exposes the first neutral `Cats Core v1` write-side
substrate so parallel Chat and Work workstreams can persist the same actor,
conversation, project, work-item, task, approval-binding, owner-profile, run,
trace, checkpoint, orchestration-outcome, artifact, and activity records. This
slice is intentionally minimal: it favors durable system records and stable
write seams over a full live orchestration or approval UX.

Current route ownership:

- `src/app/server/index.ts` is the suite-level assembler only.
- `src/core/api.ts` owns `/api/core/*`.
- `src/products/chat/api/*` owns Chat setup and canonical Chat routes.

## Migration Status

The public naming refresh (SPEC-009 / PLAN-009) is now implemented. The
canonical public API uses `/api/cats`, `/api/channels`, `/api/preferences`,
and `/api/orchestrator` routes.

- **Canonical**: public routes at `/api/cats`, `/api/channels/*`,
  `/api/preferences`, `/api/orchestrator`
- **Bootstrap read model**: `GET /api/app-shell` and `GET /api/views/app-shell`
  remain available for renderer bootstrap
- **Read model**: `GET /api/app-shell` and `GET /api/views/app-shell` remain
  available for renderer bootstrap

New client code should target the canonical public routes.

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

No general inbound auth is implemented yet.

Telegram webhook ingress may optionally enforce the standard
`x-telegram-bot-api-secret-token` header when
`CATS_TELEGRAM_WEBHOOK_SECRET` is configured.

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

### Companion Boxes

```text
GET   /api/cats/{catId}/companion-box
GET   /api/cats/{catId}/companion-box/sources
POST  /api/cats/{catId}/companion-box/sources
PUT   /api/cats/{catId}/companion-box/sources/{sourceId}
DELETE /api/cats/{catId}/companion-box/sources/{sourceId}
GET   /api/cats/{catId}/companion-box/derived
GET   /api/cats/{catId}/companion-box/memory
POST  /api/cats/{catId}/companion-box/memory
GET   /api/cats/{catId}/companion-box/response-profile
PATCH /api/cats/{catId}/companion-box/response-profile
GET   /api/cats/{catId}/companion-box/session-context
```

The companion-box slice is product-owned and Cat-scoped. It does not extend
shared core and does not move Cat-local storage into `cats-runtime`.

- `GET /api/cats/{catId}/companion-box` returns a summary read model with:
  - the current `box`
  - `sourceCount`, `derivedCount`, and `memoryCount`
  - a storage-layout summary (`snapshotKey`, `boxDirectoryKey`,
    `sourcesDirectoryKey`)
  - `hasHydrationContext`
- `POST /api/cats/{catId}/companion-box/sources` ingests one source and returns:
  - `{ box, source, derivedRecords, canonicalSync }`
- `PUT /api/cats/{catId}/companion-box/sources/{sourceId}` updates mutable
  source fields, regenerates source-owned derived records, and returns:
  - `{ box, source, derivedRecords, canonicalSync }`
- `DELETE /api/cats/{catId}/companion-box/sources/{sourceId}` removes the raw
  source, prunes source-owned derived records, removes stale source refs from
  companion memory, and returns:
  - `{ deleted, sourceId, removedDerivedIds, prunedMemoryIds, canonicalSync }`
- `GET /api/cats/{catId}/companion-box/sources` returns `{ sources: [...] }`
- `GET /api/cats/{catId}/companion-box/derived` returns `{ derived: [...] }`
- `GET /api/cats/{catId}/companion-box/memory` returns `{ memory: [...] }`
- `POST /api/cats/{catId}/companion-box/memory` accepts curated memory writes
  and returns `{ memory: { ...created }, canonicalSync }`
- `GET /api/cats/{catId}/companion-box/response-profile` returns
  `{ responseProfile }`
- `PATCH /api/cats/{catId}/companion-box/response-profile` updates product-owned
  response settings and returns `{ responseProfile, canonicalSync }`
- `GET /api/cats/{catId}/companion-box/session-context` returns the normalized
  product-owned hydration payload for direct companion sessions

Supported source kinds:

- `note`
- `conversation_log`
- `article`
- `image`
- `video`
- `audio`
- `path_ref`

Supported storage modes:

- `uploaded_copy`
- `imported_copy`
- `linked_path`

The first slice ingests text/log/article/path/media metadata through JSON
bodies. For copied/imported sources, the sidecar store also materializes a
per-source JSON payload under the Cat's storage layout.

`CompanionSessionContext` is now additive and includes a Cats-owned
`retrieval` block assembled from canonical memory, live companion records,
owner-profile hints, and room working memory. That retrieval payload now also
exposes `policy`, `selectedMemories`, `supportingEvidence`,
`excludedMemories`, and `ownerProfile` so companion and orchestrator callers
can consume a machine-readable scope/exclusion contract instead of one flat hit
list. This keeps retrieval product-owned even when runtime/provider continuity
changes underneath it.

### Canonical Memory and Retrieval

```text
GET    /api/cats/{catId}/memory
POST   /api/cats/{catId}/memory
PUT    /api/cats/{catId}/memory/{memoryId}
DELETE /api/cats/{catId}/memory/{memoryId}
GET    /api/cats/{catId}/memory/canonical
POST   /api/cats/{catId}/memory/flush
GET    /api/cats/{catId}/memory/retrieval-context

GET    /api/owner/memory
POST   /api/owner/memory
GET    /api/owner/memory/canonical
POST   /api/owner/memory/flush

POST   /api/channels/{channelId}/memory/flush
GET    /api/channels/{channelId}/memory/retrieval-context
```

This slice deliberately separates three related surfaces:

- `/api/cats/{catId}/memory` and `/api/owner/memory` remain the existing
  durable-memory CRUD surface for curated product records, and those writes now
  auto-refresh the matching canonical projection
- `/memory/canonical` reads the Cats-owned canonical-memory projection derived
  from companion data, curated cat/owner notes, owner profile, and channel
  working memory
- `/memory/flush` materializes or refreshes that canonical projection on demand
  using source-scoped replacement so deleted/updated notes do not linger as
  stale retrieval hits
- `/memory/retrieval-context` assembles a runtime-facing retrieval preview from
  canonical records plus live companion records, with explicit policy-aware
  exclusions for shared-room and transport contexts

Supported flush reasons:

- `manual`
- `session_hydration`
- `pre_reset`
- `pre_compaction`
- `channel_handoff`
- `owner_profile_sync`

Canonical-memory records include:

- stable Cats-owned ids
- subject scope (`cat`, `owner`, `channel`; `relationship` / `project`
  reserved in the canonical contract)
- durable-memory category
- normalized content, summary, tags, keywords, and source refs
- `visibility`
- `promotionRule`
- `lineage` with `sourceScopeKeys`, `derivedFromIds`, and
  `replacementGroup`
- origin metadata describing how the record was extracted and why it was
  flushed, including curated durable-memory notes synced from the product CRUD
  layer

Flush responses return `{ flush }`, where `flush` also includes:

- `removedRecordIds`
- `payload.version`
- `payload.subject`
- `payload.sourceScopeKeys`
- `payload.persistedRecords[*].promotionRule`
- `payload.persistedRecords[*].replacementGroup`

`removedRecordIds` is computed from the same subject-replace transaction that
persists the new canonical projection, so pre-reset / pre-compaction callers can
treat it as the authoritative removal set. Array-backed channel and owner
records also emit entry-scoped `replacementGroup` values instead of a shared
bucket so downstream consumers do not collapse distinct facts, open loops, or
preferences into one semantic slot.

Retrieval-context responses return `{ retrieval }`, where `retrieval` includes:

- `scope` with `catId`, `channelId`, and `includeOwnerProfile`
- `policy`
- `query`
- ranked `hits`
- `selectedMemories`
- `supportingEvidence`
- `excludedMemories`
- `summary`
- `facts`
- `ownerProfileHints`
- `ownerProfile`
- `openLoops`

### Setup

```text
POST /api/setup/complete
POST /api/setup/reset
```

- `POST /api/setup/complete` finishes first-run onboarding by:
  - creating the current default `Boss Cat`
  - persisting owner display-name updates
  - persisting `setupCompleteAt`
  - returning the refreshed `AppShellPayload`
- `POST /api/setup/reset` clears chat/core state back to the uninitialized
  first-run baseline and returns the refreshed `AppShellPayload`.

### Channels

```text
GET    /api/channels
POST   /api/channels
GET    /api/channels/{channelId}
DELETE /api/channels/{channelId}
```

- `GET` collection returns `{ channels: [...summaries] }`.
- `POST` returns `201` with `{ channel: { ...view } }`.
- `GET` detail returns
  `{ channel: { ...view with messages, assignedCats, and roomRouting } }`.
- `DELETE` returns `{ deleted: true, channelId }`.

Each channel now exposes a `roomRouting` read model with:

- `mode` and `leadParticipantId` for default-target resolution
- guard limits such as `maxContinuations` and `maxDispatchesPerTurn`
- `lastOutcome` for the most recent routed turn, including:
  - `resolution` with stable machine-readable routing semantics
    (`routingMode`, `selectionKind`, default-target reason, and any blocked
    reason)
  - resolved targets, unresolved mentions, dispatch records, guard reason, and
    checkpoint events
- `lastCheckpoint` for the latest room-level routing event
- `lastWakeRequest` for the most recent room-entry or route-before-dispatch wake
  decision
- `wakeHistory` for recent wake requests with `trigger`, `reason`, `status`,
  `completedAt` when a wake actually finished, and any error text
- `workflow` for room-level system state, including:
  - `activeTurn` while a room turn is still in flight
  - `turnHistory` with completed/blocked/failed workflow turns
  - `eventHistory` with first-class system events such as
    `target_pending`, `target_running`, `target_completed`,
    `guard_blocked`, `checkpoint`, and `outcome`
  - `targetStatuses[].wakeRequestId` so wake decisions can be correlated back
    to `wakeHistory`
  - `lastCheckpointEvent` and `lastOutcomeEvent` for quick renderer access

### Channel Messages

```text
GET  /api/channels/{channelId}/messages
POST /api/channels/{channelId}/messages
```

- `GET` returns `{ messages: [...] }`.
- `POST` accepts `{ body, senderName? }` and returns
  `{ message: { ...userMessage }, dispatch: { channelId, results } }`.
- `dispatch.results` now covers the whole live routing loop for that user turn,
  not just the first target. A single `POST` may therefore include:
  - the default Boss Cat dispatch
  - explicit multi-target fan-out dispatches
  - continuation dispatches triggered by later agent `@mentions`

Assistant transcript messages created by the routing engine carry structured
metadata such as `turnId`, `sourceMessageId`, `routingTrigger`, and
`dispatchDepth` so clients can correlate visible replies with room-level
`roomRouting.lastOutcome` state.

For direct companion sessions, runtime session create/send calls now also carry
product-owned `companionSession` metadata. That payload includes:

- requested runtime skill ids
- selected source, derived, and memory ids
- the current `CompanionResponseProfile`
- owner notes and direct-session constraints
- retrieval context assembled inside `cats`
- channel/transport context for the current direct lane

This hydration seam is additive and product-owned. `cats-runtime` still remains
the execution boundary rather than the long-lived companion-box store.

Each `dispatch.results[]` item may also include:

- `turnId`
- `dispatchId`
- `targetStatus`

Those fields let the renderer correlate dispatch receipts with
`roomRouting.workflow.targetStatuses` and `roomRouting.workflow.eventHistory`.
The richer route-resolution and wake-request contract lives in the persisted
`roomRouting` read model rather than only in the transient dispatch response.

### Channel Cats

```text
GET    /api/channels/{channelId}/cats
PUT    /api/channels/{channelId}/cats/{catId}
DELETE /api/channels/{channelId}/cats/{catId}
```

- `GET` returns `{ cats: [...hydrated] }` with `catId` keys instead of `catId`.
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
- Updating `selectedChannelId` also wakes the selected room's visible entry
  participant when that room is currently sleeping:
  - `boss_chat` wakes `Boss Cat`
  - `direct_cat_chat` wakes the room's lead Cat
- If a `direct_cat_chat` no longer has an active lead Cat, the selection write
  stays explicit and records a failed `roomRouting.lastWakeRequest` instead of
  silently falling back to `Boss Cat`.
- Renderer room-entry wake now goes through this explicit selection mutation so
  persisted-room wake keeps a write seam instead of piggybacking on app-shell
  reads.

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

### Shell Helpers

```text
GET  /api/shell/browse
POST /api/shell/open-folder
```

- `GET /api/shell/browse` powers the in-app working-directory picker. It
  returns `{ current, parent, entries, error? }`, where `entries` contains
  subdirectories only.
- `POST /api/shell/open-folder` asks the local host OS to reveal a validated
  directory path in the native file explorer.

### Transport Relays

```text
GET  /api/transports/telegram
GET  /api/transports/telegram/diagnostics
POST /api/transports/telegram/webhook
POST /api/transports/telegram/webhook/:bindingId
```

- `GET /api/transports/telegram` returns Telegram relay status for the current
  Telegram transport bridge.
  The payload includes:
  - `publicIdentityMode: "multi_cat_bindings_single_boss"`
  - durable mapping counts
  - `diagnosticsPath`
  - the last processed Telegram update id
  - ingress summaries (`secretTokenConfigured`, `maxBodyBytes`,
    accepted/ignored counters, last receipt)
  - delivery summaries (`status`, supported operations, counters, last receipt)
  - a `roomRouting` object whose `roomRoutingStatus` is `placeholder` before
    an inbox is linked and `linked_room` once the current inbox is attached to
    a canonical `Cats Chat` room
- `GET /api/transports/telegram/diagnostics` returns the transport-owned
  diagnostics model.
  The payload includes dedupe window stats, durable chat-to-conversation
  bindings, linked room ids, last ingress/delivery receipts, and other
  transport-only state that intentionally stays outside the main chat
  transcript.
- `POST /api/transports/telegram/webhook` is the Telegram ingress seam used by
  the Boss Cat inbox bridge. `POST /api/transports/telegram/webhook/:bindingId`
  scopes ingress to a specific Telegram bot binding when multiple public bots
  exist.
  The current slice:
  - requires JSON payloads
  - optionally enforces `x-telegram-bot-api-secret-token`
  - rejects oversized bodies using the transport-owned byte limit
  - returns 4xx transport errors for malformed payloads, binding lookup
    failures, invalid secrets, or oversized bodies
  - returns 500 transport errors such as `telegram_room_dispatch_failed` when
    an accepted Telegram turn cannot be completed into an internal room turn
  - returns transport receipts with normalized message summaries
  - persists dedupe and inbox-to-conversation mapping state outside chat core
  - ignores unsupported, bot-authored, or non-private updates with explicit
    transport reasons
  - creates or reuses a canonical `Cats Chat` room for accepted Telegram inbox
    traffic and stores the active `linkedRoomId` in the transport relay state
  - routes the accepted Telegram message through the existing internal chat
    runtime flow, then relays a concise reply back through Telegram delivery
  - keeps room creation conservative by opening a new room when no room is
    linked yet or when the inbound text begins with `/new`, `new room:`, or
    `new topic:`

The outbound transport seam lives under `src/platform/transports/telegram/*`
and supports transport-level `send`, `reply`, `edit`, and `delete` operations.
When `CATS_TELEGRAM_BOT_TOKEN` is configured, the default server wiring enables
the Telegram Bot API delivery client; otherwise the seam stays visible in
status/diagnostics as `not_configured` and delivery attempts fail with
`delivery_client_not_configured`. If an accepted webhook fails before the room
turn finishes, diagnostics record a failed delivery receipt with
`runtime_dispatch_failed`.

### Orchestrator

```text
GET   /api/orchestrator
PATCH /api/orchestrator
PUT   /api/orchestrator
POST  /api/orchestrator/plan
POST  /api/orchestrator/dispatch
GET   /api/orchestrator/channels/{channelId}/execution-loop
```

- `GET` returns `{ orchestrator: { ...state } }`.
- `PATCH` accepts `{ provider, model?, systemPrompt?, ... }` and returns
  `{ orchestrator: { ...updated } }`.
- `PUT` is a legacy alias that returns `AppShellPayload`.
- `POST /api/orchestrator/plan` accepts `{ channelId, body, senderName?, transport? }`
  and returns a contract-first room-turn plan:
  - room-routing resolution and unresolved mentions
  - initial dispatch targets
  - resolved runtime skill manifests
  - product-owned MCP/tool intent manifests
  - frozen runtime MCP tool-plane metadata aligned to `POST /api/runtime/mcp`
  - execution-loop guardrails and operator seam paths
  - a pre-dispatch `execution` skeleton with:
    - initial dispatch stage
    - checkpoint-driven handoff loop
    - outcome-report stage
    - approval request / decision payload templates
- `POST /api/orchestrator/dispatch` accepts the same request body, reuses the
  existing `routeChannelMessage()` execution path, and returns:
  - the pre-dispatch plan
    - `plan.snapshot` is always `"pre_dispatch"` so consumers do not treat it as post-dispatch truth
    - `plan.execution.nextActions` now reflects whether dispatch is still ready
      or paused by owner approval
  - additive dispatch receipts
    - `dispatch.status` is `dispatched` or `blocked`
    - `dispatch.blockedReason` is currently `approval_pending` when a task is
      still waiting on `/api/core/approvals`
  - `sourceMessageId`
  - a post-dispatch execution-loop snapshot that includes:
    - `runtimeToolPlane`
    - `execution.state`
    - executed multi-step `execution.steps`
    - checkpoint summaries
    - `nextActions` for approval, retry, acknowledge, or completion
- `GET /api/orchestrator/channels/{channelId}/execution-loop` returns the
  conversation-scoped operator/run-inspector contract for that room. `?runId=`
  may be supplied when a caller wants a specific run instead of the latest run.
  The payload now also includes a product-owned `execution` read model derived
  from the room workflow turn, plus approval/recovery action templates that
  point back to `/api/core/approvals` and `/api/core/operator-actions`.

### Runtime Bridge

```text
GET  /api/runtime/sessions/{sessionId}/observe
POST /api/runtime/sessions/{sessionId}/memory-flush
POST /api/runtime/mcp
```

- `GET /api/runtime/sessions/{sessionId}/observe` proxies the runtime-owned
  `/sessions/{id}/observe` payload so product-side clients can read the same
  machine-readable inspection contract without talking to `cats-runtime`
  directly.
- `POST /api/runtime/sessions/{sessionId}/memory-flush` is the first Team 4 ↔
  Team 6 bridge. It inspects pending `memory_flush` maintenance hooks from the
  runtime session, resolves Cats-owned `channelId` / `companionSession.catId`
  metadata from the runtime invocation context, and executes the matching
  product-owned flushes with reason `pre_reset` or `pre_compaction`.
- Each returned flush now carries a machine-readable `payload` with:
  - `subject`
  - `sourceScopeKeys`
  - `removedRecordIds`
  - `persistedRecords[*].promotionRule`
  - `persistedRecords[*].replacementGroup`
  This is the Team 5-ready pre-reset / pre-compaction memory contract.
- `POST /api/runtime/mcp` proxies raw MCP JSON-RPC requests to the runtime MCP
  facade. This keeps direct product APIs and MCP access available side by side:
  product routes can stay HTTP-native while orchestrator-style agents still use
  the same runtime MCP tool surface.

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

Codes: `chat_not_found`, `channel_not_found`, `cat_not_found`,
`assignment_not_found`, `memory_not_found`, `bad_request`.

---

## Removed Compatibility Routes

The previously documented phase-2 compatibility routes have been removed. The
supported public surface is now:

- `/api/cats`
- `/api/channels/*`
- `/api/preferences`
- `/api/orchestrator`
- `/api/app-shell`
- `/api/views/app-shell`
- `/health`

Clients should not target older compatibility aliases.

`GET /health` is now the app-managed readiness contract for self-hosted
launchers and the Electron desktop host.

Example response:

```json
{
  "service": "cats",
  "status": "ok",
  "summary": "Cats app server is ready to accept requests.",
  "timestamp": "2026-03-11T12:34:56.000Z",
  "version": "0.1.0",
  "contract": {
    "startup": 1,
    "supportedModes": ["standalone", "app-managed"],
    "readinessPath": "/health",
    "lifecycleEvents": [
      "app.ready",
      "app.startup_error",
      "app.stopping",
      "app.stopped"
    ],
    "shutdownSignals": ["SIGINT", "SIGTERM"],
    "shutdownReasons": ["sigint", "sigterm", "stdin_closed"]
  },
  "readiness": {
    "endpoint": "/health",
    "authoritative": true,
    "readySignal": "http",
    "phase": "ready",
    "ready": true
  },
  "startup": {
    "contractVersion": 1,
    "mode": "app-managed",
    "managedBy": "cats-electron",
    "phase": "ready",
    "readySignal": "http",
    "ready": true,
    "pid": 12345,
    "startedAt": "2026-03-11T12:34:00.000Z",
    "address": {
      "host": "127.0.0.1",
      "port": 8181,
      "healthUrl": "http://127.0.0.1:8181/health"
    }
  },
  "shutdown": {
    "signals": ["SIGINT", "SIGTERM"],
    "reasons": ["sigint", "sigterm", "stdin_closed"],
    "stdinCloseEnabled": true
  },
  "runtime": {
    "baseUrl": "http://127.0.0.1:3110",
    "reachable": true,
    "status": "ok",
    "service": "cats-runtime"
  }
}
```

`readiness.ready` is the authoritative machine-readable startup bit. Hosts
should not infer readiness from process creation alone. `startup.phase` is one
of `starting`, `ready`, `stopping`, or `stopped`, while top-level `status`
stays lifecycle-aware and degrades if `cats-runtime` is unreachable even after
the app listener is live.

### Core State

```text
GET /api/core
```

Returns the full derived `Cats Core v1` state currently backed by the chat
store. The payload includes:

- `version`
- `ownerProfile`
- `actors`
- `conversations`
- `projects`
- `workItems`
- `tasks`
- `runs`
- `traces`
- `checkpoints`
- `outcomes`
- `artifacts`
- `activities`
- `approvalBindings`
- `botBindings`
- `archives`

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

### List Core Projects

```text
GET /api/core/projects
POST /api/core/projects
```

`POST` upserts reusable suite-level project records.

### List Core Work Items

```text
GET /api/core/work-items
POST /api/core/work-items
```

`POST` upserts reusable work-item records linked to projects, conversations, or
tasks without depending on chat-local state shapes.

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

### Create or Upsert Core Task

```text
POST /api/core/tasks
```

Request body:

```json
{
  "task": {
    "id": "task-system-1",
    "title": "Approve orchestrator dispatch",
    "conversationId": "conversation-system-1",
    "summary": "Product-owned task for the system layer.",
    "metadata": {
      "effectiveDeliveryMode": "commit_only",
      "effectiveDeliveryGates": ["owner_approval_required"]
    }
  }
}
```

Response:

```json
{
  "task": {
    "id": "task-system-1",
    "status": "draft"
  },
  "created": true
}
```

Semantics:

- caller-supplied `id` makes the write idempotent
- a missing `id` creates a new generated task id
- `task.metadata` is the shared place for product-owned workflow/governance
  read-model fields such as effective delivery mode, gates, budget alert level,
  and operator-action annotations
- channel-derived task metadata now also carries nested machine-readable
  summaries alongside the legacy flat fields:
  - `effectiveDeliveryPolicy`
  - `effectiveBudgetPolicy`
  - `runtimeDeliveryManifest`
  - `workflowSummary`
  - `governanceSummary`
- channel-derived `task-channel-*` records remain chat-owned projections;
  Team 2 should use distinct ids for system-owned tasks

### List Core Approvals

```text
GET /api/core/approvals
```

Returns a product-owned approval queue seam for tasks that are actually pending
owner approval:

```json
{
  "approvals": [
    {
      "id": "approval-task-channel-123",
      "kind": "dispatch_plan",
      "taskId": "task-channel-123",
      "status": "pending",
      "requestedForActorId": "actor-owner",
      "requestedByActorId": "actor-orchestrator-global",
      "requiresOwnerDecision": true,
      "decisionOptions": [
        { "action": "approve", "label": "Approve" },
        { "action": "reroute", "label": "Reroute" },
        { "action": "reject", "label": "Reject" }
      ]
    }
  ]
}
```

### Write Approval Decision

```text
POST /api/core/approvals
```

Request body:

```json
{
  "taskId": "task-system-1",
  "status": "rejected",
  "action": "reroute",
  "decidedByActorId": "actor-owner",
  "notes": "Try a different handoff path."
}
```

Response:

```json
{
  "task": {
    "id": "task-system-1"
  },
  "approval": {
    "status": "rejected",
    "decisionAction": "reroute"
  },
  "queueItem": {
    "taskId": "task-system-1"
  },
  "activity": {
    "kind": "approval_decided"
  },
  "governanceSummary": {
    "approval": {
      "pending": false,
      "latestDecisionAction": "reroute"
    }
  }
}
```

Semantics:

- `pending` defaults the task status to `pending_approval`
- `approved` defaults the task status to `approved`
- `rejected` preserves the current task status unless the caller overrides it
- `action` is optional but product-owned; supported values are:
  - `approve`
  - `reroute`
  - `reject`
- `reroute` is the product-owned "reject this plan and send it back" contract;
  when the caller omits `taskStatus`, the task falls back to `draft`
- callers may override the task status explicitly with `taskStatus`
- the first write may go directly from `not_requested` to `approved` or
  `rejected` when the caller is persisting an already-made owner decision and
  does not need a separate pending request step
- `approved` and `rejected` are terminal in this first slice; callers may
  repeat the same terminal decision idempotently, but may not move that task
  back to `pending`
- in the current Phase 1 contract, `approval.status` is the source of truth for
  the owner decision state; if a caller rejects a task and also wants the task
  lifecycle to move somewhere explicit such as `draft` or `archived`, it should
  send `taskStatus` in the same request rather than relying on an implicit
  fallback
- each approval write appends a shared core activity record so operator rails
  can show pending requests and final decisions without relying on transcript
  bubbles alone
- approval writes now also return `governanceSummary` so operator loops or
  automation can read back the effective approval/delivery state without
  refetching the full core snapshot

### Write Core Operator Action

```text
POST /api/core/operator-actions
```

Request body:

```json
{
  "action": "retry",
  "actorId": "actor-owner",
  "taskId": "task-system-1",
  "runId": "run-system-1",
  "checkpointId": "checkpoint-system-1",
  "outcomeId": "outcome-system-1"
}
```

Response:

```json
{
  "action": "retry",
  "task": {
    "id": "task-system-1"
  },
  "run": {
    "id": "run-system-1"
  },
  "activity": {
    "kind": "operator_action"
  },
  "governanceSummary": {
    "latestOperatorAction": {
      "kind": "retry"
    }
  }
}
```

Semantics:

- this is the minimal product-owned write seam for operator incident actions
- supported actions are:
  - `retry`
  - `acknowledge`
- the route annotates the addressed task/run/checkpoint/outcome metadata with
  operator action timestamps and actor ids
- `retry` writes `operatorRetryRequestedAt`, `operatorRetryRequestedBy`, and
  `operatorRetryNotes`
- `acknowledge` writes `operatorAcknowledgedAt`,
  `operatorAcknowledgedBy`, and `operatorAcknowledgedNotes`
- the route also appends a shared activity record so Chat can surface the
  action in transcript-adjacent operator rails without inventing a second
  transcript channel
- the write response now returns the updated `task` / `run` / `checkpoint` /
  `outcome` subjects when present, plus `governanceSummary`

### List Core Runs

```text
GET /api/core/runs
POST /api/core/runs
```

`POST` upserts durable orchestration run records. Caller-supplied `run.id`
keeps the write idempotent.

Chat-projected room-workflow runs/checkpoints/outcomes now also carry nested
`workflowSummary` metadata alongside the legacy flat workflow fields. The
summary includes:

- `runStatus`
- `stageId`
- `shape`
- `reviewRequired`
- `lastCheckpointId`
- `convergeTargetId`
- `continuationCount`
- `dispatchCount`
- `targetCount`
- `branchStatusCounts`

### List Core Traces

```text
GET /api/core/traces
POST /api/core/traces
```

`POST` appends or upserts provider-agnostic system trace events. This is the
first minimal `trace append` seam intended for Team 2. The current Chat system
layer also projects room-workflow events into these core trace records through
the chat store, so transcript bubbles are no longer the only durable system
record.

### List Core Checkpoints

```text
GET /api/core/checkpoints
POST /api/core/checkpoints
```

`POST` writes durable checkpoint records. This is the first minimal
`checkpoint write` seam intended for Team 2. Chat room-workflow checkpoint
events are also projected into this core collection when chat state is
persisted.

### List Core Outcomes

```text
GET /api/core/outcomes
POST /api/core/outcomes
```

`POST` writes durable orchestration outcome records for blocked, succeeded,
failed, or cancelled system work. Chat room-turn outcomes are likewise
projected into this collection during chat-state persistence.

### List Core Artifacts

```text
GET /api/core/artifacts
POST /api/core/artifacts
```

`POST` writes headless artifact references that Chat, Work, and Code can all
reuse without leaking runtime/provider details into core.

### List Core Activities

```text
GET /api/core/activities
POST /api/core/activities
```

`POST` appends shared activity records for status changes, approval events,
artifact writes, and other product-owned system events. Activity ids are
append-only in this first slice: reusing an existing `activity.id` returns a
conflict instead of mutating the old record.

### List Core Approval Bindings

```text
GET /api/core/approval-bindings
POST /api/core/approval-bindings
```

`POST` binds a task-backed approval record to a reusable subject such as a
project, work item, task, run, artifact, or conversation. The referenced
`approvalTaskId` must already exist in `/api/core/tasks`.

### Get Owner Profile

```text
GET /api/core/owner-profile
PATCH /api/core/owner-profile
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

`PATCH` persists owner preference updates. Supported fields are:

- `displayName`
- `avatarColor`
- `summary`
- `communicationPreferences`
- `decisionPreferences`
- `escalationPreferences`

### Update Preferences

```text
PATCH /api/preferences
```

Request body:

```json
{
  "selectedChannelId": "550e8400-e29b-41d4-a716-446655440000"
}
```

Returns the updated preferences payload on success.

### Create Channel

```text
POST /api/channels
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
  "cats": [
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
- creates a new persisted channel in the local chat store
- promotes any draft `cats` into the chat-global cat registry
- creates channel assignments for those cats in the new chat
- selects the new channel immediately
- returns the updated app-shell payload

### Delete Channel

```text
DELETE /api/channels/{id}
```

Behavior:

- removes the selected chat from the local chat store
- best-effort closes any orchestrator and cat runtime sessions still attached to
  that chat
- falls back to the next most recent remaining chat, or clears selection if no
  chats remain
- returns the updated app-shell payload

### Create Cat

```text
POST /api/cats
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

Creates a reusable chat-global cat and returns the updated app-shell
payload.

### Assign Cat to a Channel

```text
POST /api/channels/{id}/cats
```

Request body:

```json
{
  "catId": "cat-agent-2",
  "provider": "gemini",
  "model": "gemini-2.5-pro",
  "roles": ["reviewer"]
}
```

Behavior:

- creates or updates the channel-scoped cat assignment
- keeps the chat-global cat identity and memory checkpoint intact
- stores the channel-specific execution target on the assignment
- if the assignment already had an active lease and the target changes, the
  server best-effort closes the prior runtime session before returning

### Remove Cat from a Channel

```text
DELETE /api/channels/{id}/cats/{catId}
```

Marks the channel assignment as removed and best-effort closes its active
execution lease.

### Activate Channel

```text
POST /api/channels/{id}/activate
```

Creates channel-scoped runtime sessions for the global orchestrator and active
assigned cats, records execution leases, then returns:

```json
{
  "appShell": { "...": "updated shell payload" },
  "results": [
    {
      "targetKind": "cat",
      "targetId": "cat-agent-1",
      "targetName": "Agent-1",
      "status": "started",
      "sessionId": "session-2"
    }
  ]
}
```

### Send Channel Message

```text
POST /api/channels/{id}/messages
```

Request body:

```json
{
  "body": "Please review this fix with @Agent-1"
}
```

Behavior:

- persists the user message to the transcript
- resolves `@mentions` against the orchestrator and active assigned cats
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
GET /api/channels/{id}/export
```

Returns a JSON attachment containing the current orchestrator settings, raw
channel state, hydrated `assignedCats`, and full channel transcript.

### App Shell

```text
GET /api/app-shell
```

Returns the current product shell contract.

`GET /api/app-shell` is read-only. Renderer boot may still follow it with
`PATCH /api/preferences` when a persisted room route needs to select or wake its
visible entry participant.

Abbreviated example response:

```json
{
  "app": {
    "name": "cats",
    "stage": "phase-2-shell",
    "runtimeBoundary": "cats-runtime"
  },
  "chat": {
    "id": "default",
    "name": "Chat",
    "selectedChannelId": "",
    "cats": [],
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

## Shared-Core API Families

The first neutral core families now exist as in-tree product APIs. Additional
read models such as explicit bot-binding and archive endpoints can layer on top
of these seams later without inventing a second schema.

- `/api/core/actors`
  - shared human, orchestrator, worker, stakeholder, and virtual-friend
    records
- `/api/core/conversations`
  - chat threads, work threads, transport-linked threads, and private
    escalation channels
- `/api/core/projects`
  - shared project containers above chat-local channels
- `/api/core/work-items`
  - reusable work records that can point at conversations, tasks, or projects
- `/api/core/bot-bindings`
  - one external bot or transport identity mapped to one orchestrator
- `/api/core/tasks`
  - durable task records plus the first task write seam
- `/api/core/runs`
  - durable orchestration run records
- `/api/core/traces`
  - append-only system trace records
- `/api/core/checkpoints`
  - durable checkpoint write seam
- `/api/core/outcomes`
  - durable orchestration outcome records
- `/api/core/artifacts`
  - durable references to outputs, previews, datasets, reports, or exports
- `/api/core/activities`
  - product-owned status and audit-style events above raw transcript logs
- `/api/core/approval-bindings`
  - shared approval-to-subject bindings for owner decisions or future gates
- `/api/core/approvals`
  - approval queue projection plus approve/reroute/reject decision seam
- `/api/core/operator-actions`
  - minimal product-owned retry/acknowledge incident seam for blocked or failed runs
- `/api/core/owner-profile`
  - structured owner preferences and collaboration rules, including persistence
- `/api/core/archive`
  - archive eligibility and downstream RAG handoff metadata

## Shared Fixture Module

`src/shared/coreFixtures.ts` now publishes a small reusable example bundle for
`project`, `workItem`, `task`, `run`, `trace`, `checkpoint`, `outcome`,
`artifact`, `activity`, `approvalBinding`, and `ownerProfilePatch` payloads.
Team 2 and future Work/Code slices can import the same examples through
`src/shared/core.ts` instead of inventing product-specific DTOs.

## Planned Runtime Access Split

- Product services continue to call `cats-runtime` through direct APIs for
  health, session lifecycle, routing, and operational control.
- Orchestrator-style agents can now also use the first `cats-runtime`
  MCP facade at `POST /mcp`.
- MCP is therefore an additional runtime access mode, not a replacement for the
  app-facing API described in this document.

## Error Responses

Errors use a minimal payload:

```json
{
  "error": {
    "code": "bad_request",
    "message": "Human-readable message"
  }
}
```

### Common Status Codes

| Status | Meaning |
|--------|---------|
| `200` | Request handled successfully |
| `404` | Unknown route or chat entity |
| `405` | Unsupported method |
| `503` | Runtime dependency unavailable for health checks |

## Notes

- the `cats` app does not talk to `agent-fleet` directly
- The renderer consumes this endpoint over a Vite proxy during development
- Chat shell state is currently persisted to a local JSON file
- Persisted cat state separates chat-global identity, channel assignment,
  execution targets, execution leases, and provider-agnostic memory checkpoints
- Chat mutations now cover selection, chat setup, global cat registry,
  channel deletion, channel assignment, activation, messaging, orchestrator
  editing, and export
- `My Cats` private-lane entry is a renderer behavior layered on top of the
  canonical chat/channel APIs; it should not be treated as a normal persisted
  `Recents` thread, and the public API no longer models a separate
  `transport_inbox` room mode
- Runtime responses are currently delivered as request/response completions; the
  API does not expose live push or WebSocket streaming yet
- Future session and channel APIs should extend this contract without leaking
  backend-specific transport details
- Planned shared-core APIs should be added as new route families rather than
  overloading the current chat routes with unrelated concerns

---

*Last updated: 2026-03-24*

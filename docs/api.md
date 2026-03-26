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
- `src/products/work/api/*` owns Work dashboard and task-detail projections.

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
PUT    /api/owner/memory/{memoryId}
DELETE /api/owner/memory/{memoryId}
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

Flush responses now return `{ flush, summary }`, where `flush` also includes:

- `removedRecordIds`
- `payload.version`
- `payload.subject`
- `payload.sourceScopeKeys`
- `payload.persistedRecords[*].promotionRule`
- `payload.persistedRecords[*].replacementGroup`

`summary` is an additive aggregate for downstream callers that do not want to
re-parse every persisted record. It includes:

- `subjects`
- `flushCount`
- `persistedCount`
- `removedCount`
- `removedRecordIds`
- `sourceScopeKeys`
- `replacementGroups`

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

### Cats Work

```text
GET /api/work
GET /api/work/projects
GET /api/work/projects/{projectId}
GET /api/work/work-items
GET /api/work/work-items/{workItemId}
GET /api/work/tasks/{taskId}
```

- `GET /api/work` returns the first Work dashboard projection above shared
  core task/operator reads. The payload includes:
  - product metadata
  - top-level task/operator/recovery summary counts
  - a `projects` section projected from shared-core project/work-item state
  - a `workItems` section projected from shared-core work-item/task state
  - an `operatorInbox` section projected from the core-owned operator inbox
  - a `controlPlane` section projected from the core-owned task control-plane
    read model
  - a `recovery` section projected from the core-owned recovery read model
  - `selection.defaultProjectId`, `selection.defaultWorkItemId`, and
    `selection.defaultTaskId` hints for the renderer detail pane
- `GET /api/work/projects` returns the full shared-core project list projection
  that Work consumes for project navigation, including linked work-item/task
  counts plus owner and conversation summaries.
- `GET /api/work/projects/{projectId}` returns a project-scoped detail
  projection that joins:
  - the shared `project` record
  - linked work-item summary rows
  - linked task summary rows
  - artifact counts
  - recent activity messages
- `GET /api/work/work-items` returns the full shared-core work-item list
  projection that Work consumes for work-item navigation, including linked
  project/task summaries and assigned actor names.
- `GET /api/work/work-items/{workItemId}` returns a work-item-scoped detail
  projection that joins:
  - the shared `workItem` record
  - the linked project summary
  - the linked conversation
  - assigned actor summaries
  - the linked task detail projection when one exists
  - artifact counts
  - recent activity messages
- `GET /api/work/tasks/{taskId}` returns a task-scoped detail projection that
  joins:
  - the shared `task` record
  - the derived `inspection` view
  - the task-scoped `controlPlane` view
  - the task-scoped `recovery` view
  - a normalized timeline preview

This first slice intentionally reuses `Cats Core v1` instead of inventing a
separate Work schema. Broader team-operating-model surfaces and later Work
boards still remain future product slices.

### Cats Code

```text
GET /api/code
GET /api/code/tasks
GET /api/code/tasks/:taskId
GET /api/code/artifacts
GET /api/code/artifacts/:artifactId
GET /api/code/builds
GET /api/code/previews
```

- `GET /api/code` now returns the first Code dashboard projection above shared
  core task and artifact reads. The payload includes:
  - product metadata
  - top-level code-task and artifact summary counts
  - a `tasks` section built from tasks whose product resolution points at
    `code`, including conversation context, linked work-item labels, and the
    effective execution strategy for the task
  - an `artifacts` section built from `build` / `preview` artifacts plus other
    artifacts linked to those code tasks
  - `selection.defaultTaskId` and `selection.defaultArtifactId` hints for later
    Code-side detail panes
- `GET /api/code/tasks` returns the code-task list read model plus summary
  counts.
- `GET /api/code/tasks/:taskId` joins:
  - the shared `task` record
  - the derived `inspection` view
  - a normalized timeline preview
  - linked build/preview artifacts
- `GET /api/code/artifacts` returns the code-output list read model above all
  code-linked artifacts.
- `GET /api/code/artifacts/:artifactId` returns the focused code-output detail
  view, including linked task/work-item/project references plus related output
  siblings.
- `GET /api/code/builds` and `GET /api/code/previews` provide dedicated filtered
  output read models for later builder-loop surfaces.
- This slice intentionally keeps `Cats Code` above `Cats Core v1` rather than
  creating a second code-specific task or artifact schema. Richer project and
  live preview/build workspaces remain future Code slices.

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
    - when approval blocks dispatch, Cats also persists that pending request on
      the channel task metadata so a later owner decision can replay it without
      requiring the caller to post the same dispatch body a second time
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
- The route now also returns additive `summary` metadata with aggregate
  `subjects`, `removedRecordIds`, and `replacementGroups` so downstream
  maintenance or recovery callers can inspect the flush result without
  re-walking every payload entry.
- When runtime-hook maintenance actually executes, or when the runtime asks for
  a memory flush but Cats cannot resolve channel/companion context, Cats now
  appends a core activity record with `metadata.category = "memory_maintenance"`
  for later operator or recovery inspection.
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

### Desktop Host Bootstrap Snapshot

The Electron host now keeps a host-readable JSON snapshot at
`CATS_DESKTOP_HOST_STATE_PATH` (default:
`<userData>/desktop-host/state.json`). This is not a public HTTP route, but it
is part of the packaged host contract. The bootstrap renderer itself now stays
behind a sandboxed preload bridge, and the host only exposes snapshot reads
plus a validated action seam.

The persisted snapshot mirrors the Electron bootstrap bridge payload and
includes:

- `phase`, `status`, `summary`, `lastError`
- `services[]` with process/readiness state for `cats-runtime` and `cats`
- `issues[]` with machine-readable remediation metadata:
  - `category`
  - `resumeKey`
  - `remediation.kind`
  - `remediation.resumable`
  - `remediation.requiresRestart`
- `progress`:
  - `currentStepId`
  - ordered `steps[]` for runtime start, app start, prerequisite scan, setup
    handoff, and chat entry
- `background`:
  - `trayEnabled`
  - `keepServicesRunning`
  - `mode`
  - `closeBehavior`
  - `windowVisible`
- `updates`:
  - `channel`
  - `status`
  - `currentVersion`
  - `latestVersion`
  - `manifestUrl`
    - HTTPS only
  - `downloadUrl`
    - HTTPS only
    - must stay on the manifest host or an explicit allow-list
- `packaging`:
  - packaging `strategy`
  - staged target matrix for Windows/macOS/Linux
  - installer prerequisite/remediation contract
  - update-channel skeleton metadata

This lets host-side tooling, packaged installers, or future background helpers
inspect desktop startup state without scraping the visible bootstrap page.

The current packaged host contract now has two build layers:

- `npm run desktop:stage`
  - stages deterministic packaging inputs and manifests only
- `npm run desktop:package:windows`
  - builds a real Windows `NSIS` installer through `electron-builder`
  - bundles the Electron host inside `app.asar`
  - bundles `cats` and `cats-runtime` sidecars through `extraResources`

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

### Core Project Memory

```text
GET    /api/core/projects/{projectId}/memory
POST   /api/core/projects/{projectId}/memory
PUT    /api/core/projects/{projectId}/memory/{memoryId}
DELETE /api/core/projects/{projectId}/memory/{memoryId}
GET    /api/core/projects/{projectId}/memory/canonical
POST   /api/core/projects/{projectId}/memory/flush
GET    /api/core/projects/{projectId}/memory/retrieval-context
```

Semantics:

- these routes manage project-scoped durable memory inside `Cats Core v1`
- `POST`/`PUT`/`DELETE` mutate durable-memory records with `subjectType:
  "project"` and then trigger a best-effort canonical-memory sync through the
  Cats-owned memory substrate
- mutation responses include additive `canonicalSync` metadata:
  - `status`
    - `synced`
    - `deferred`
  - `flush` when a canonical flush succeeded
  - `summary` when a canonical flush succeeded
  - `error` when canonical sync had to defer
- `/memory/canonical` returns the current canonical records for that project
- `/memory/flush` forces a canonical refresh from project durable memory and
  accepts the same optional flush `reason` values as other Cats-owned memory
  maintenance hooks
- `/memory/retrieval-context` returns a machine-readable retrieval payload for
  that project scope; callers may add:
  - optional `catId`
  - optional `channelId`
  - repeated `relationshipId`
  - repeated `queryHint`
  - optional `transport`
  - optional `includeOwnerProfile=false`

### Core Relationship Memory

```text
GET    /api/core/relationships/{relationshipId}/memory
POST   /api/core/relationships/{relationshipId}/memory
PUT    /api/core/relationships/{relationshipId}/memory/{memoryId}
DELETE /api/core/relationships/{relationshipId}/memory/{memoryId}
GET    /api/core/relationships/{relationshipId}/memory/canonical
POST   /api/core/relationships/{relationshipId}/memory/flush
GET    /api/core/relationships/{relationshipId}/memory/retrieval-context
```

Semantics:

- these routes manage opaque relationship-scoped durable memory without
  requiring a visible Chat route or UI surface
- they behave like the project-scoped memory routes, but the path id itself is
  the relationship scope key
- `/memory/retrieval-context` may also take repeated `projectId` and
  `queryHint` parameters so callers can assemble a cross-scope retrieval view
  without scraping transcripts or companion-box state

### Inspect Core Memory Maintenance

```text
GET /api/core/memory-maintenance
POST /api/core/memory-maintenance
```

Returns a normalized summary of product-owned memory-maintenance activity:

```json
{
  "maintenance": {
    "totals": {
      "recentCount": 2,
      "executed": 1,
      "deferred": 1,
      "missingContext": 0,
      "error": 0
    },
    "latestByTrigger": {
      "runtimeHook": {
        "id": "activity-memory-route-runtime"
      },
      "companionSync": {
        "id": "activity-memory-route-companion"
      },
      "ownerSync": null,
      "projectSync": null,
      "relationshipSync": null
    },
    "facets": {
      "sourceScopeKeyCounts": {
        "channel:channel-memory-route": 1
      },
      "replacementGroupCounts": {
        "channel:channel-memory-route:summary": 1
      },
      "removedRecordIdCounts": {
        "cats-memory-old-1": 1
      },
      "withRemovedRecordsCount": 1
    },
    "recent": [
      {
        "id": "activity-memory-route-runtime",
        "trigger": "runtime_hook",
        "status": "executed",
        "subjectKeys": ["channel:channel-memory-route"]
      }
    ]
  },
  "summary": {
    "totalAvailable": 2,
    "matching": 2,
    "returned": 2
  }
}
```

Semantics:

- this route is a core-owned inspectability seam over `memory_maintenance`
  activities already persisted in `Cats Core`
- repeated `trigger`, `status`, `phase`, and `subjectKey` query parameters plus
  repeated `sourceScopeKey`, `replacementGroup`, and `removedRecordId`
  query parameters plus an additive `limit` let operator or recovery tooling
  facet the same maintenance queue without scraping raw activities
- `totals` gives a lightweight rollup by normalized maintenance status
- `latestByTrigger` exposes the most recent runtime-hook, companion-sync,
  owner-sync, project-sync, and relationship-sync entries without requiring
  callers to re-scan the full activity log
- `facets` lifts stable downstream impact counts for `sourceScopeKeys`,
  entry-scoped `replacementGroups`, and concrete `removedRecordIds`, plus
  `withRemovedRecordsCount`, so later automation can page or group maintenance
  impact without reparsing each activity payload
- route-level `summary.totalAvailable`, `summary.matching`, and
  `summary.returned` make filtered queue views inspectable without changing the
  underlying `maintenance` contract
- `recent[*].summary` reuses the additive flush-summary contract already
  emitted by Cats-owned canonical-memory maintenance, including
  `removedRecordIds`, `sourceScopeKeys`, and `replacementGroups`
- `subjectKeys` prefers explicit flush-summary subjects and otherwise falls
  back to stable `cat:*`, `channel:*`, `project:*`, `relationship:*`, or owner
  scope keys so downstream recovery or operator tooling can group maintenance
  events consistently

`POST /api/core/memory-maintenance` triggers a core-owned manual maintenance
action without going through a product UI route:

```json
{
  "action": "sync_companion",
  "catId": "cat-123",
  "reason": "manual"
}
```

or

```json
{
  "action": "sync_owner",
  "reason": "owner_profile_sync"
}
```

or

```json
{
  "action": "sync_project",
  "projectId": "project-launch",
  "reason": "manual"
}
```

or

```json
{
  "action": "sync_relationship",
  "relationshipId": "relationship-owner-inline-agent",
  "reason": "manual"
}
```

Response:

```json
{
  "maintenanceAction": {
    "action": "sync_companion",
    "trigger": "companion_sync",
    "status": "executed",
    "subject": {
      "kind": "cat",
      "id": "cat-123"
    },
    "reason": "manual",
    "flush": {
      "scope": "cat",
      "subjectId": "cat-123"
    },
    "summary": {
      "persistedCount": 1
    },
    "error": null
  }
}
```

Semantics:

- `sync_companion` requires `catId` and reuses the Cats-owned canonical
  companion flush seam behind the core route
- `sync_owner` reuses the Cats-owned owner-profile flush seam behind the same
  core route
- `sync_project` and `sync_relationship` reuse the same Cats-owned canonical
  durable-memory flush substrate already used by the scoped core memory routes
- `status` is `executed` when canonical flush succeeds and `deferred` when the
  maintenance request is captured but the canonical sync failed
- both actions append normalized `memory_maintenance` activity into Cats Core,
  so `GET /api/core/memory-maintenance` becomes the stable inspection surface
  for the outcome

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
GET /api/core/tasks/{taskId}
GET /api/core/tasks/{taskId}/records
GET /api/core/tasks/{taskId}/timeline
GET /api/core/tasks/{taskId}/control-plane
```

Returns:

```json
{
  "tasks": []
}
```

`GET /api/core/tasks/{taskId}` returns the raw task plus a derived inspection
view:

```json
{
  "task": {
    "id": "task-system-1",
    "status": "blocked"
  },
  "inspection": {
    "approvalQueueItem": {
      "taskId": "task-system-1"
    },
    "latestRun": {
      "id": "run-system-1"
    },
    "latestOutcome": {
      "id": "outcome-system-1"
    },
    "latestCheckpoint": {
      "id": "checkpoint-system-1"
    },
    "latestTimelineItem": {
      "kind": "activity",
      "category": "recovery",
      "recordId": "activity-system-1"
    },
    "governanceSummary": {
      "approval": {
        "pending": true
      }
    },
    "workflowSummary": {
      "dispatchCount": 1
    },
    "planning": {
      "strategyHint": "tree_of_thoughts",
      "acceptanceCriteria": "Summarize the blocked rollout before retrying.",
      "strategyContext": {
        "phase": "review",
        "strict": true
      },
      "dependsOnTaskIds": ["task-system-parent"],
      "productHint": "code",
      "transfer": {
        "suggestedProduct": "code"
      },
      "effectiveProduct": "code",
      "effectiveStrategy": "tree_of_thoughts"
    },
    "runtimeBridge": {
      "product": "code",
      "request": {
        "requestedStrategy": "tree_of_thoughts",
        "acceptanceCriteria": "Summarize the blocked rollout before retrying.",
        "correlation": {
          "taskId": "task-system-1",
          "conversationId": "conversation-system-1",
          "product": "code"
        }
      }
    },
    "recovery": {
      "canRetry": true
    },
    "family": {
      "rootTaskId": "task-system-parent",
      "depth": 1,
      "parent": {
        "taskId": "task-system-parent"
      },
      "children": [
        {
          "taskId": "task-system-child-2",
          "status": "blocked"
        },
        {
          "taskId": "task-system-child-1",
          "status": "completed"
        }
      ],
      "siblingCount": 1,
      "childCount": 2,
      "terminalChildCount": 2,
      "allChildrenTerminal": true,
      "childStatusCounts": {
        "completed": 1,
        "blocked": 1
      },
      "convergenceStatus": null,
      "convergedAt": null
    },
    "counts": {
      "runs": 1,
      "outcomes": 1,
      "checkpoints": 1,
      "traces": 0,
      "activities": 2
    }
  }
}
```

Semantics:

- this route is a core-owned inspectability seam for product/control-plane
  consumers that need more than the raw task row
- `inspection.governanceSummary` and `inspection.workflowSummary` reuse the
  same derived contracts already embedded into product-owned task/run metadata
- `inspection.planning` lifts the normalized product-owned
  `task.metadata.planning` block, including effective product/strategy
  resolution, so later consumers do not need to re-parse raw metadata blobs
- `inspection.runtimeBridge` lifts the normalized task-to-runtime execution
  request that `cats` would send across the runtime boundary for this task, so
  Work/Code or operator consumers can inspect bridge intent without rebuilding
  the same resolution logic client-side
- `inspection.recovery` reuses the normalized replay view exposed by
  `/api/core/tasks/{taskId}/recovery`
- `inspection.latestTimelineItem` lifts the newest normalized timeline row
  from `/api/core/tasks/{taskId}/timeline`, so inspection consumers can answer
  "what just happened?" without issuing a second route call
- `inspection.family` exposes immediate parent/child topology plus stable
  child status counts, so operator/recovery consumers can inspect task-family
  convergence without hydrating the full core snapshot or rebuilding the graph
  client-side
- `inspection.counts` gives lightweight related-record cardinality without
  forcing callers to fetch the full core snapshot just to know whether a task
  has runs, outcomes, checkpoints, traces, or activity history

`GET /api/core/tasks/{taskId}/records` returns the grouped task-scoped record
history without hydrating unrelated core entities:

```json
{
  "taskId": "task-system-1",
  "records": {
    "taskId": "task-system-1",
    "conversationId": "conversation-system-1",
    "approvalBindings": [
      {
        "id": "approval-binding-system-1"
      }
    ],
    "runs": [
      {
        "id": "run-system-1"
      }
    ],
    "traces": [
      {
        "id": "trace-system-1"
      }
    ],
    "checkpoints": [
      {
        "id": "checkpoint-system-1"
      }
    ],
    "outcomes": [
      {
        "id": "outcome-system-1"
      }
    ],
    "activities": [
      {
        "id": "activity-system-1"
      }
    ]
  }
}
```

Semantics:

- this route is a grouped record-inspection seam for operator/control-plane
  consumers that need the related task rows but do not need the full
  `/api/core` snapshot
- each record collection is filtered to the requested task id and sorted newest
  first using the same record timestamps already owned by `Cats Core`
- unlike `GET /api/core/tasks/{taskId}`, this route is intentionally record-
  heavy and summary-light, so later replay/recovery tooling can inspect the
  exact task-scoped rows without reassembling them client-side from global
  collections

`GET /api/core/tasks/{taskId}/timeline` returns a normalized chronological
task narrative assembled from the task row plus task-scoped approval bindings,
runs, traces, checkpoints, outcomes, and activities:

```json
{
  "taskId": "task-system-1",
  "summary": {
    "totalAvailable": 9,
    "matching": 9,
    "returned": 9
  },
  "timeline": {
    "taskId": "task-system-1",
    "conversationId": "conversation-system-1",
    "latestTimestamp": "2026-03-21T01:02:00.000Z",
    "counts": {
      "total": 9,
      "taskLifecycle": 1,
      "governance": 2,
      "execution": 2,
      "workflow": 2,
      "recovery": 1,
      "operator": 1
    },
    "items": [
      {
        "timelineId": "activity:activity-system-recovery",
        "kind": "activity",
        "category": "recovery",
        "recordId": "activity-system-recovery",
        "timestamp": "2026-03-21T01:02:00.000Z",
        "title": "Note",
        "summary": "Dispatch replay failed during startup recovery."
      }
    ]
  }
}
```

Semantics:

- this route is a summary-heavy, record-normalized complement to
  `GET /api/core/tasks/{taskId}/records`
- `GET /api/core/tasks/{taskId}/timeline` supports additive filters for:
  - `category`
  - `kind`
  - `actorId`
  - `runId`
  - `limit`
- the response now includes a lightweight `summary` block with:
  - `totalAvailable`
  - `matching`
  - `returned`
- timeline ordering uses the natural record timestamp for each family:
  - `createdAt` for append-only task, trace, and activity rows
  - `updatedAt` for mutable approval-binding, run, checkpoint, and outcome rows
- `category` normalizes mixed record families into operator-relevant buckets:
  `task_lifecycle`, `governance`, `execution`, `workflow`, `recovery`, and
  `operator`
- recovery and operator activities stay visible in the same narrative without
  forcing consumers to separately join recovery, control-plane, and record
  routes client-side

### Inspect Core Task Control Plane

```text
GET /api/core/control-plane/tasks
GET /api/core/tasks/{taskId}/control-plane
```

`GET /api/core/control-plane/tasks` returns the current task-scoped
control-plane items that already have meaningful governance, workflow,
recovery, or operator-attention signals:

```json
{
  "summary": {
    "totalAvailable": 2,
    "matching": 1,
    "returned": 1
  },
  "tasks": [
    {
      "taskId": "task-system-1",
      "latestTimelineItem": {
        "kind": "checkpoint",
        "category": "workflow",
        "recordId": "checkpoint-system-1"
      },
      "attention": {
        "severity": "attention",
        "reasons": ["approval_pending", "retry_available"],
        "needsOperatorAttention": true
      },
      "family": {
        "rootTaskId": "task-system-parent",
        "childCount": 2,
        "terminalChildCount": 1,
        "allChildrenTerminal": false
      }
    }
  ]
}
```

`GET /api/core/tasks/{taskId}/control-plane` returns the full core-owned
control-plane view for one task:

```json
{
  "taskId": "task-system-1",
  "controlPlane": {
    "taskId": "task-system-1",
    "latestRunId": "run-system-1",
    "latestTimelineItem": {
      "kind": "checkpoint",
      "category": "workflow",
      "recordId": "checkpoint-system-1"
    },
    "governanceSummary": {
      "approval": {
        "pending": true
      }
    },
    "workflowSummary": {
      "stageId": "continuation_handoff"
    },
    "family": {
      "rootTaskId": "task-system-parent",
      "childCount": 2,
      "terminalChildCount": 1,
      "allChildrenTerminal": false
    },
    "latestWorkflowRecommendation": {
      "workflowShape": "converge",
      "reviewRequired": true
    },
    "workflowContinuation": {
      "checkpointId": "checkpoint-system-1",
      "stageId": "continuation_handoff",
      "workflowShape": "converge",
      "continuationSource": "workflow_recommendation",
      "reviewRequired": true,
      "blockedReason": "anti_ping_pong",
      "targetCount": 1,
      "targetNames": ["Reviewer"],
      "unresolvedTargets": ["Reviewer"],
      "replayState": "failed",
      "replayTrigger": "retry",
      "retryAvailable": true
    },
    "runtimeDeliveryIntent": {
      "mode": "commit_only",
      "source": "task_override",
      "gates": ["owner_approval_required"],
      "requestedActions": ["create_commit"],
      "strict": true,
      "requiresOwnerDecision": true,
      "approvalPending": true,
      "channelId": "channel-system-1",
      "conversationId": "conversation-system-1",
      "taskId": "task-system-1",
      "roomMode": "boss_chat",
      "transport": "web",
      "workflowStageId": "continuation_handoff",
      "workflowShape": "converge"
    },
    "approvalActions": [
      {
        "kind": "approve"
      }
    ],
    "incidentActions": [
      {
        "kind": "retry"
      }
    ],
    "nextActions": [
      {
        "kind": "approve"
      },
      {
        "kind": "retry"
      }
    ],
    "recovery": {
      "canRetry": true
    }
  }
}
```

Semantics:

- these routes are core-owned control-plane read models for later operator,
  recovery, or orchestration consumers that should not scrape `/api/core`,
- `workflowContinuation` is the normalized continuation contract for operator
  automation; it lifts the latest checkpoint recommendation, workflow summary,
  and stored workflow-continuation replay state into one task-scoped view so
  callers do not have to stitch them together themselves, including the
  normalized replay `blockedReason` when the continuation was persisted from a
  guard-blocked room step,
- `runtimeDeliveryIntent` is the normalized delivery-policy contract for
  operator automation; it lifts the effective delivery policy and runtime
  delivery manifest into one task-scoped view so callers do not have to join
  `governanceSummary.delivery` with `governanceSummary.runtimeDeliveryManifest`
  themselves,
- `latestTimelineItem` lifts the newest normalized timeline row into the same
  task-scoped control-plane payload, so attention/recovery consumers do not
  have to separately fetch `/api/core/tasks/{taskId}/timeline` just to explain
  the latest operator/recovery/workflow context,
  Chat operator rails, or raw task metadata blobs
- `GET /api/core/control-plane/tasks` now also supports additive list filters:
  - `conversationId`
  - `taskStatus`
  - `severity`
  - `reason`
  - `needsOperatorAttention`
  - `nextAction`
  - `deliveryMode`
  - `deliveryAction`
  - `workflowStageId`
  - `workflowShape`
  - `workflowReviewRequired`
  - `workflowConvergeTargetId`
  - `workflowContinuationSource`
  - `workflowUnresolvedTarget`
  - `hasUnresolvedWorkflowTargets`
  - `workflowContinuationBlockedReason`
  - `latestReplaySource`
  - `latestReplayTrigger`
  - `latestReplayPhase`
  - `latestReplayResumeReason`
  - `latestTimelineCategory`
  - `latestTimelineKind`
  - `rootTaskId`
  - `parentTaskId`
  - `hasChildren`
  - `hasActiveChildren`
  - `limit`
- repeated and comma-separated values are both accepted for enum filters such
  as `taskStatus`, `severity`, `reason`, `nextAction`, `deliveryMode`, and
  `deliveryAction`, plus `workflowShape`,
  `workflowContinuationSource`, `workflowContinuationBlockedReason`,
  `latestReplaySource`, `latestReplayTrigger`, `latestReplayPhase`,
  `latestReplayResumeReason`,
  `latestTimelineCategory`, and `latestTimelineKind`
- list responses now include a `summary` block with:
  - `totalAvailable`
  - `matching`
  - `returned`
  - `conversationCount`
  - `needsOperatorAttentionCount`
  - `taskStatusCounts`
  - `attentionSeverityCounts`
  - `reasonCounts`
  - `nextActionCounts`
  - `deliveryModeCounts`
  - `deliveryActionCounts`
  - `workflowStageCounts`
  - `workflowShapeCounts`
  - `workflowReviewRequiredCount`
  - `workflowConvergeTargetCount`
  - `workflowContinuationSourceCounts`
  - `withUnresolvedWorkflowTargetsCount`
  - `workflowContinuationBlockedReasonCounts`
  - `latestReplaySourceCounts`
  - `latestReplayTriggerCounts`
  - `latestReplayPhaseCounts`
  - `latestReplayResumeReasonCounts`
  - `latestTimelineCategoryCounts`
  - `latestTimelineKindCounts`
  - `withChildrenCount`
  - `withActiveChildrenCount`
- `approvalActions` and `incidentActions` already point at the existing
  `/api/core/approvals` and `/api/core/operator-actions` write seams through
  additive action envelopes; this route does not invent a second mutation bus
- `latestWorkflowRecommendation` lifts the newest structured continuation hint
  out of checkpoint/outcome/run/trace metadata into a stable task-scoped read
  model
- `workflowContinuation.convergeTargetId` exposes the current single-target
  converge reviewer when that workflow stage has already resolved one, so
  operator automation can target review queues without re-reading raw branch
  state
- `workflowUnresolvedTarget` / `hasUnresolvedWorkflowTargets` plus
  `withUnresolvedWorkflowTargetsCount` let control-plane consumers facet the
  queue by which continuation targets are still missing, without scraping raw
  checkpoint metadata or replay blobs
- `workflowContinuationSource` / `workflowContinuationSourceCounts` let
  control-plane consumers distinguish explicit-mention continuations from
  workflow-recommendation replays without reopening raw continuation metadata
- `latestReplaySource`, `latestReplayTrigger`, `latestReplayPhase`, and
  `latestReplayResumeReason` plus their summary counts let control-plane
  consumers facet retry/recovery queues by the newest normalized replay
  lifecycle signal without redirecting that automation through the recovery
  route first
- `family` reuses the same task-family summary exposed by
  `GET /api/core/tasks/{taskId}`, so control-plane consumers can see whether a
  task is a parent, child, or root plus how many immediate child tasks are
  still active
- `attention` classifies whether a task is in progress, completed, muted, or
  needs operator attention because of pending approval, blocked runs, retryable
  recovery, workflow review requirements, or active child-task execution
- `reason=child_tasks_in_progress` plus `nextAction=wait` now let callers find
  parent tasks that are waiting for immediate child tasks to finish without
  treating that state as an operator incident

### Inspect Core Operator Inbox

```text
GET /api/core/operator-inbox
```

Returns actionable task summaries curated for operator-facing inbox consumers:

```json
{
  "summary": {
    "totalAvailable": 3,
    "matching": 2,
    "returned": 2
  },
  "tasks": [
    {
      "taskId": "task-operator-inbox",
      "taskTitle": "Operator inbox task",
      "taskStatus": "pending_approval",
      "attention": {
        "severity": "attention",
        "reasons": ["approval_pending", "retry_available"],
        "needsOperatorAttention": true
      },
      "family": {
        "rootTaskId": "task-operator-inbox",
        "childCount": 0
      },
      "latestTimelineItem": {
        "kind": "activity",
        "category": "recovery",
        "recordId": "activity-operator-inbox-recovery"
      }
    }
  ]
}
```

Semantics:

- this route is a control-plane list view built on top of the existing
  task-scoped `control-plane` and `recovery` read models, with the latest
  normalized timeline item already lifted into the control-plane contract
- it accepts the same additive query filters as
  `GET /api/core/control-plane/tasks`:
  - `conversationId`
  - `taskStatus`
  - `severity`
  - `reason`
  - `needsOperatorAttention`
  - `nextAction`
  - `deliveryMode`
  - `deliveryAction`
  - `workflowStageId`
  - `workflowShape`
  - `workflowReviewRequired`
  - `workflowConvergeTargetId`
  - `workflowContinuationSource`
  - `workflowUnresolvedTarget`
  - `hasUnresolvedWorkflowTargets`
  - `workflowContinuationBlockedReason`
  - `latestReplaySource`
  - `latestReplayTrigger`
  - `latestReplayPhase`
  - `latestReplayResumeReason`
  - `latestTimelineCategory`
  - `latestTimelineKind`
  - `rootTaskId`
  - `parentTaskId`
  - `hasChildren`
  - `hasActiveChildren`
  - `limit`
- the response now includes the same shape of list `summary` counts so later
  operator automation or non-UI inbox consumers can page or facet the inbox
  without hydrating the full core snapshot client-side, including
  `deliveryModeCounts`, `deliveryActionCounts`, `workflowStageCounts`,
  `workflowShapeCounts`, `workflowReviewRequiredCount`,
  `workflowConvergeTargetCount`, `workflowContinuationSourceCounts`,
  `withUnresolvedWorkflowTargetsCount`, `workflowContinuationBlockedReasonCounts`,
  `latestReplaySourceCounts`, `latestReplayTriggerCounts`,
  `latestReplayPhaseCounts`,
  `latestReplayResumeReasonCounts`,
  `latestTimelineCategoryCounts`, and `latestTimelineKindCounts`, plus
  `withChildrenCount` and `withActiveChildrenCount`
- `latestReplaySource`, `latestReplayTrigger`, `latestReplayPhase`, and
  `latestReplayResumeReason` give the inbox the same replay-lifecycle queue
  faceting as recovery, while staying on the operator-facing shortlist surface
- each entry keeps the stable task-scoped action shortlist in `nextActions`
  while also surfacing the latest normalized timeline item, so consumers do not
  have to join those surfaces client-side to answer "what needs attention and
  what just happened?"
- `family` reuses the same immediate task-family topology summary exposed by
  `GET /api/core/tasks/{taskId}`, so inbox consumers can facet parent/child
  work without hydrating the full task-detail route first
- passive or fully muted tasks are excluded; this inbox is intentionally biased
  toward actionable operator attention rather than exhaustive task listings

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

### Inspect Core Task Recovery

```text
GET /api/core/recovery/tasks
GET /api/core/tasks/{taskId}/recovery
```

`GET /api/core/recovery/tasks` returns a filtered collection of tasks that
currently carry product-owned orchestrator recovery state:

```json
{
  "summary": {
    "totalAvailable": 2,
    "matching": 1,
    "returned": 1
  },
  "recoveries": [
    {
      "taskId": "task-system-1",
      "taskStatus": "blocked",
      "canResumeViaApproval": true,
      "canRetry": true,
      "family": {
        "rootTaskId": "task-system-root",
        "childCount": 0
      },
      "approvalActions": [
        {
          "kind": "approve"
        },
        {
          "kind": "reroute"
        },
        {
          "kind": "reject"
        }
      ],
      "incidentActions": [
        {
          "kind": "retry"
        }
      ]
    }
  ]
}
```

`GET /api/core/tasks/{taskId}/recovery` returns the normalized recovery view
for one task:

```json
{
    "recovery": {
      "family": {
        "rootTaskId": "task-system-root",
        "childCount": 0
      },
      "context": {
        "deliveryMode": "commit_only",
        "deliveryActions": ["create_commit"],
        "workflowStageId": "continuation_handoff",
        "workflowShape": "sequential",
        "channelId": "channel-123",
        "transport": "web",
        "roomMode": "boss_chat"
      },
      "taskId": "task-system-1",
      "pendingDispatch": {
        "channelId": "channel-123",
        "blockedReason": "approval_pending",
      "replayState": "failed"
    },
    "dispatchReplay": {
      "sourceMessageId": "message-123",
      "replayState": "ready"
    },
    "workflowContinuationReplay": {
      "checkpointId": "checkpoint-123",
      "workflowShape": "sequential",
      "blockedReason": "max_dispatches",
      "replayState": "failed"
    },
    "latestActivity": {
      "phase": "replay_failed",
      "source": "workflow-continuation-replay",
      "resumeReason": "target_recovered"
    },
    "approvalActions": [
      {
        "kind": "approve",
        "action": {
          "path": "/api/core/approvals"
        }
      }
    ],
    "incidentActions": [
      {
        "kind": "retry",
        "action": {
          "path": "/api/core/operator-actions"
        }
      }
    ]
  }
}
```

Semantics:

- these routes stay recovery-owned read models; they do not replace the
  existing `/api/core/approvals` or `/api/core/operator-actions` write seams
- `GET /api/core/recovery/tasks` supports additive filters for:
  - `conversationId`
  - `taskStatus`
  - `canRetry`
  - `canResumeViaApproval`
  - `hasPendingDispatch`
  - `hasDispatchReplay`
  - `hasWorkflowContinuationReplay`
  - `pendingDispatchReplayState`
  - `dispatchReplayState`
  - `workflowContinuationReplayState`
  - `workflowContinuationBlockedReason`
  - `actionKind`
  - `deliveryMode`
  - `deliveryAction`
  - `workflowStageId`
  - `workflowShape`
  - `workflowReviewRequired`
  - `workflowConvergeTargetId`
  - `workflowContinuationSource`
  - `workflowUnresolvedTarget`
  - `hasUnresolvedWorkflowTargets`
  - `latestReplaySource`
  - `latestReplayTrigger`
  - `latestReplayPhase`
  - `latestReplayResumeReason`
  - `rootTaskId`
  - `parentTaskId`
  - `hasChildren`
  - `hasActiveChildren`
  - `limit`
- the collection response now includes a `summary` block with:
  - `totalAvailable`
  - `matching`
  - `returned`
  - `conversationCount`
  - `taskStatusCounts`
  - `canRetryCount`
  - `canResumeViaApprovalCount`
  - `withPendingDispatchCount`
  - `withDispatchReplayCount`
  - `withWorkflowContinuationReplayCount`
  - `pendingDispatchReplayStateCounts`
  - `dispatchReplayStateCounts`
  - `workflowContinuationReplayStateCounts`
  - `workflowContinuationBlockedReasonCounts`
  - `actionKindCounts`
  - `deliveryModeCounts`
  - `deliveryActionCounts`
  - `workflowStageCounts`
  - `workflowShapeCounts`
  - `latestReplaySourceCounts`
  - `latestReplayTriggerCounts`
  - `latestReplayPhaseCounts`
  - `latestReplayResumeReasonCounts`
  - `workflowReviewRequiredCount`
  - `workflowConvergeTargetCount`
  - `workflowContinuationSourceCounts`
  - `withUnresolvedWorkflowTargetsCount`
  - `withChildrenCount`
  - `withActiveChildrenCount`
- the payload normalizes three product-owned recovery records when present:
  - approval-blocked pending dispatch metadata
  - stored orchestrator dispatch replay metadata
  - stored workflow-continuation replay metadata
- `context` lifts delivery policy, runtime delivery actions, and workflow-stage
  routing context into the recovery view so recovery automation can filter and
  facet by delivery/workflow intent without re-reading raw task metadata; this
  now also includes `workflowReviewRequired` plus
  `workflowConvergeTargetId` when the stored continuation is already in a
  single-target converge review stage
- `workflowContinuationReplay.blockedReason` exposes the normalized workflow
  guard that persisted the retryable continuation snapshot, so recovery
  consumers can distinguish different continuation failure modes without
  scraping raw checkpoint metadata; this now also includes
  recommendation-only `no_valid_targets` blocks when a structured
  `workflowRecommendation` exists but no active participant currently matches
  it
- `workflowContinuationBlockedReason` /
  `workflowContinuationBlockedReasonCounts` let recovery and operator
  automation facet retryable continuation work by which guard persisted the
  replay snapshot without reopening raw checkpoint metadata
- `workflowContinuationSource` / `workflowContinuationSourceCounts` let
  recovery automation separate explicit-mention retries from
  workflow-recommendation replays without scraping the raw continuation blob
- `workflowUnresolvedTarget` / `hasUnresolvedWorkflowTargets` plus
  `withUnresolvedWorkflowTargetsCount` let recovery or operator automation
  facet queues by the specific continuation targets that are still unresolved
  instead of treating every `no_valid_targets` replay as one undifferentiated
  bucket
- `workflowShape` / `workflowShapeCounts` let recovery automation distinguish
  sequential, parallel, or converge replay topology without inferring it from
  stage ids alone
- `latestActivity.resumeReason` now exposes additive replay-resume context when
  the latest replay lifecycle note came from a normalized recovery path such as
  `target_recovered`
- `latestReplaySource` / `latestReplaySourceCounts` let recovery automation
  distinguish general orchestrator replay, startup recovery cleanup, and
  workflow-continuation replay notes without scraping raw activity metadata
- `latestReplayTrigger` / `latestReplayTriggerCounts` let recovery automation
  distinguish dispatch-, approval-, reroute-, or retry-driven replay notes
  without scraping raw activity metadata
- `latestReplayPhase` / `latestReplayPhaseCounts` let recovery automation facet
  `startup_recovered`, `replay_blocked`, or `replay_failed` queues without
  scraping raw activity metadata
- `latestReplayResumeReason` / `latestReplayResumeReasonCounts` let recovery
  automation facet queues by the latest normalized replay-resume reason without
  scraping raw activity metadata
- `family` reuses the same immediate task-family topology summary exposed by
  `GET /api/core/tasks/{taskId}`, so recovery automation can target parent/
  child work without rebuilding the task graph outside `cats`
- `approvalActions` and `incidentActions` now expose machine-readable action
  envelopes that point back to those existing write seams, so recovery-aware
  automation does not have to reconstruct POST bodies from raw booleans
- `actionKind` matches those same recovery action envelopes (`approve`,
  `reroute`, `reject`, `retry`), and `actionKindCounts` summarizes how many of
  the returned recovery items expose each available action
- replay-state filters let operator or recovery tooling distinguish between
  approval-blocked `pending` dispatches versus `ready`, `in_progress`, or
  `failed` replay records without reopening raw task metadata parsing
- message payloads are summarized as `bodyPreview` plus `bodyLength` instead of
  echoing the full stored body back into every consumer
- `latestActivity` projects the newest replay lifecycle note (`replay_started`,
  `replay_dispatched`, `replay_failed`, `startup_recovered`, etc.) so callers
  can inspect recovery progress without scraping the raw task metadata or
  replay-activity feed
- `canResumeViaApproval` is true when the task still has an
  `approval_pending` dispatch waiting on an owner decision
- `canRetry` is true when a stored dispatch replay or workflow-continuation
  replay exists and is not currently `in_progress`

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
  },
  "autoResume": {
    "trigger": "reroute",
    "status": "dispatched",
    "blockedReason": null,
    "sourceMessageId": "message-123",
    "resultCount": 1,
    "executionState": "completed"
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
- when a channel-scoped orchestrator dispatch was previously blocked by
  `approval_pending`, `approve` and `reroute` decisions now attempt an additive
  auto-resume of that stored dispatch request
- successful or blocked auto-resume attempts return an `autoResume` summary with:
  - `trigger`
  - `status`
    - `dispatched`
    - `blocked`
    - `failed`
  - `blockedReason`
  - `sourceMessageId`
  - `resultCount`
  - `executionState`
  - optional `error` when the replay attempt fails
- retrying stored workflow-continuation replay may legitimately return
  `status: "blocked"` with `blockedReason: "no_valid_targets"` when the
  persisted handoff recommendation still has no active matching participant;
  in that case the replay stays ready for a later retry instead of being
  downgraded to a failed replay attempt
- the stored pending dispatch request is cleared only after a successful
  replay; failed attempts leave the request in task metadata so later recovery
  or deeper follow-through slices can retry it

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

*Last updated: 2026-03-26*

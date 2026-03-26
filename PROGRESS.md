# Progress

> Implementation status and work package tracking for `Cats`.

## Current Status

| Component | Status | Description |
|-----------|--------|-------------|
| Bootstrap | Completed | Subproject created from `project-bootstrap` with Node.js preset |
| Runtime Boundary | Completed | `cats-runtime` is the only runtime dependency exposed to app code |
| HTTP App Shell | Completed | Node server exposes `/health` as the app-managed readiness contract plus `/api/app-shell` |
| Renderer Shell | Completed | React/Vite now runs as a route-driven suite shell above the Node server, with Chat as the active product surface plus dedicated Work/Code placeholder routes and top-level suite ownership split under `src/app/*` and `src/products/*` |
| Chat Product Features | Completed | Runtime-backed setup, global cat registry, first-run `/setup` onboarding, solo-composer `/new` entry, sleep/wake-aware room entry, direct-cat draft lanes from `My Cats`, stable room-routing / wake-request contracts, live mention continuation routing, transcript export, execution-aware state, product-owned companion-box sidecar ingestion/hydration seams, and Cats-owned canonical memory / retrieval seams with curated durable-memory sync, owner durable-memory CRUD, relationship/project durable-memory scope support, source-update convergence, Team 5-ready flush payloads, additive flush summaries, and background-safe memory-maintenance activity logging landed |
| Suite Foundation Planning | In Progress | The suite-host split and shared Cats Core v1 write substrate are now in-tree, including durable project/work-item/artifact/activity/approval-binding records plus a product-owned orchestrator plan/dispatch/execution-loop seam aligned with the runtime MCP facade; product-side runtime bridge routes now proxy runtime MCP and session-observe contracts, task lifecycle watchers now settle additive runtime strategy metadata from initial observe snapshots before full stream teardown where possible and synchronously converge parent tasks once all child tasks reach terminal state, task/runtime execution request normalization now flows through one reusable bridge helper path, and orchestrator replay lifecycle events now land as additive core activities for blocked dispatch persistence, approval/reroute/retry auto-resume, blocked workflow-continuation replay attempts, replay outcomes, restart recovery, stranded room-workflow active-turn recovery after restart, a new core-owned recovery read surface with action envelopes plus `actionKind` filtering back to the existing approval/retry seams, a derived core task inspection detail route with parent/child family summaries, a grouped task-record inspection route, a normalized core task timeline route, a core-owned operator inbox route, a core-owned task control-plane read model with family-aware `wait for child tasks` semantics, and additive filterable summary contracts for the operator inbox / control-plane / recovery list APIs, while host compatibility-shim cleanup and later control-plane slices remain |
| Documentation | In Progress | Top-level docs now reflect the three-step setup wizard, Cat-private in-place lane entry, Telegram inbox MVP, runtime skill/guardrail seams, shared-core projection boundaries, the operator-loop chat surfaces, the companion-box sidecar/session-hydration contract, the Cats-owned canonical memory/retrieval substrate with promotion rules, relationship/project durable-memory scope support plus new core project/relationship memory routes, source convergence, curated durable-memory sync, Team 5 flush payloads plus additive summary/activity follow-through plus core-owned memory-maintenance inspection and action routes, the orchestrator execution-loop/MCP seam plus additive approval, retry, blocked workflow-continuation auto-resume, new core recovery inspection routes with machine-readable action envelopes and action-kind filters, grouped task inspection/record/timeline routes, task-family summaries on the core task detail inspection route, a core-owned operator inbox route, the new core task control-plane routes plus family-aware wait-state filtering, additive list filters/summaries for those operator inspection surfaces, the Electron desktop host packaging substrate plus sandboxed bootstrap bridge and host/update URL hardening, and the polling-first Telegram follow-on direction; broader launch-track docs still remain |
| Cats Chat Launch Track | In Progress | First-slice onboarding now lands on `/setup`, normal `Recents` threads can stay in solo-composer mode until a Cat is added, `My Cats` opens Cat-scoped in-place direct lanes rather than creating `Recents` threads, Telegram Boss Cat inbox MVP now includes polling-first setup plus durable room routing and outbound replies, per-Cat companion-box sidecar ingestion/hydration plus Cats-owned canonical memory/retrieval seams now exist without visible UI changes, curated cat/owner durable notes plus companion source mutations now sync into canonical retrieval and replace stale hits after update/delete, direct `MemoryAwareCompanionBoxStore` mutations now hit the same canonical sync boundary without route-only double flushes, relationship/project durable-memory scopes can now flush into canonical memory, participate in retrieval, and be managed through core-owned non-UI routes, retrieval previews now expose policy/selection/exclusion metadata, Chat now surfaces operator-facing approvals, reroute/retry/acknowledge seams, progress, activity, traces, run inspection, machine-readable governance/workflow summaries, a product-side runtime bridge for session observe + pre-reset/pre-compaction memory flush, core-owned recovery routes for normalized replay inspection plus direct action envelopes and action-kind filtering, a core task detail inspection route for derived governance/workflow/recovery summaries plus parent/child family topology, a grouped task-record inspection route for exact task history, a core task control-plane route for stable next actions, family-aware wait-state classification, and attention state, additive filter/summarize support on the non-UI operator inbox / control-plane / recovery APIs, and a checkpoint-driven orchestrator plan/dispatch/execution-loop seam with approval pause, stored approval-blocked dispatch replay on approve/reroute, operator retry replay on the latest product-owned dispatch snapshot, blocked `max_continuations` workflow-continuation replay on retry, recommendation-only `no_valid_targets` continuation replay that persists retryable handoff state until targets become active again, workflow-recommendation-based re-resolution when stored continuation targets go stale, automatic continuation replay resume when a matching cat assignment becomes active again, startup recovery that reopens stranded replay metadata and finalizes stranded room-workflow active turns after restart, recovery actions, and in-flight room-workflow snapshot persistence before full route completion, while the Electron host now supervises local `cats-runtime` + `cats` with readiness-gated bootstrap, stages packaging manifests, can emit a Windows NSIS installer for test installs, persists structured bootstrap/remediation state, keeps a tray/background + update skeleton plus sandboxed bootstrap bridge in place, and now validates host/update URLs; broader group replan auto-resume, provider-install flows, escalation/takeover, signed-release hardening, and broader packaging/install flows remain ahead |
| Cats Work Launch Track | Not Started | Work still has only backend/API/renderer placeholders under `src/products/work/*`; no substantive Work dashboard, inbox, or shared-core workflows are shipped yet |

**Legend**: Not Started | In Progress | Completed | Blocked

## Work Packages

### WP-1: Bootstrap and Runtime Boundary

**Status**: Completed
**Assigned**: Codex
**Priority**: P0

#### Tasks

| Task | Status | Notes |
|------|--------|-------|
| Create `cats/` with bootstrap preset | [x] | Used external `project-bootstrap` source |
| Replace template metadata and docs | [x] | README, AGENTS, API, architecture, services |
| Add minimal `cats-runtime` client and server | [x] | No extra runtime dependencies |
| Add smoke tests for the app shell | [x] | Uses `node:test` against built output |

#### Acceptance Criteria

- [x] New subproject exists in the monorepo
- [x] App code depends on `cats-runtime`, not `agent-fleet`
- [x] Project has at least one executable entrypoint and one test

---

### WP-2: Chat Shell Delivery

**Status**: Completed
**Assigned**: Codex
**Priority**: P1
**Depends on**: WP-1

#### Tasks

| Task | Status | Notes |
|------|--------|-------|
| Choose renderer approach | [x] | React/Vite first, Electron deferred |
| Add initial multi-channel chat UI shell | [x] | Sidebar, channel cards, orchestrator and runtime panels |
| Add persistent chat-shell storage | [x] | File-backed chat state now includes selected and created channels |
| Implement orchestrator and channel setup UX | [x] | Channel setup, global orchestrator editing, and runtime activation all landed |
| Add runtime-backed message, cat, and export flows | [x] | Global cat registry, channel assignment, continuation loop routing, fan-out, guards, room-workflow state, stable route-resolution metadata, core-projected system records, and transcript export now exist |
| Land chat lifecycle and direct routing productization | [x] | Persisted room entry now background-wakes the visible participant, direct lanes default to the lead Cat, `My Cats` switches into Cat-scoped in-place direct lanes instead of creating `Recents` threads, sleeping targets auto-wake on route, and wake requests now carry machine-readable reason metadata |

#### Acceptance Criteria

- [x] Users can switch among persisted chat channels
- [x] Selected channel survives reloads through local state persistence
- [x] Users can create planned channels and keep them across reloads
- [x] Product shell can bootstrap runtime-backed sessions through `cats-runtime`
- [x] Channel state is persisted beyond in-memory process lifetime
- [x] Global cats can be assigned into persisted channels and reached through basic mentions
- [x] Channels can export their transcript and configuration as JSON

Known follow-ups:

- Routing-engine deferred items remain tracked in
  `docs/plans/PLAN-016-dynamic-room-workflow-orchestration.md`, including
  sequential fan-out wake semantics, richer branch/converge behavior, and
  longer-cycle detection beyond direct anti-ping-pong.

---

### WP-3: Suite Foundation Planning

**Status**: In Progress
**Assigned**: Codex
**Priority**: P2
**Depends on**: WP-2

#### Tasks

| Task | Status | Notes |
|------|--------|-------|
| Define `Cats Core v1` shared scope | [x] | Shared actors/resources, permissions, conversations, approvals, owner profile, and archive metadata are now the accepted planning baseline |
| Document `Cats Chat` and `Cats Work` as parallel product tracks | [x] | Roadmap and architecture now assume a shared-core split instead of one future control-plane jump |
| Document `cats-runtime` direct API and MCP facade responsibilities | [x] | Runtime boundary planning now distinguishes app APIs from orchestrator tool use |
| Freeze the suite desktop stance | [x] | Electron plus React/TypeScript remains the current path; Tauri and Flutter are not on the active route |
| Annotate exploratory Paperclip control-plane documents | [ ] | Existing research remains in-tree but needs explicit exploratory labels everywhere it appears |
| Land the first implementation slices for shared storage and contracts | [x] | `src/shared/core.ts`, `src/core/model.ts`, the core-backed chat-state store, and `/api/core/*` read/write routes are now in-tree |
| Land the suite-host first slice through Work/Code placeholders | [x] | `src/app/*`, `src/core/*`, `src/products/*`, route ownership, and placeholder Work/Code surfaces are now in place |
| Finish validation-only Phase 8A passes | [x] | Server route coverage, suite route-map coverage, and architecture/progress doc sync are now in place |

#### Acceptance Criteria

- [x] The suite foundation is documented in roadmap, requirements, architecture, and ADR/spec/plan form
- [x] `Cats Core v1` scope is explicit enough for Chat and Work teams to share a contract
- [x] The runtime boundary is documented as direct product API plus planned MCP facade
- [x] The first implementation slices for shared storage and shared-core APIs are landed and covered by tests
- [x] Work and Code now have dedicated placeholder slices that can accept parallel development without modifying Chat modules

---

### WP-4: Cats Chat Launch Track

**Status**: In Progress
**Assigned**: Codex
**Priority**: P2
**Depends on**: WP-3

#### Tasks

| Task | Status | Notes |
|------|--------|-------|
| Add operator-grade chat activity and split-view surfaces | [x] | Chat now exposes transcript-adjacent approvals, progress, activity, traces, and run inspection on top of the shared core read model |
| Add contract-first orchestrator plan/dispatch seam and runtime MCP alignment | [x] | `src/platform/orchestration/*` plus `/api/orchestrator/plan`, `/api/orchestrator/dispatch`, and `/api/orchestrator/channels/{id}/execution-loop` now expose machine-readable planning/tool-intent/operator seams, frozen runtime MCP tool-plane metadata, and a checkpoint-driven execution contract while keeping direct runtime API dispatch as the execution path |
| Bridge product APIs to runtime MCP + maintenance hooks | [x] | `/api/runtime/mcp`, `/api/runtime/sessions/{id}/observe`, and `/api/runtime/sessions/{id}/memory-flush` now connect the runtime MCP facade plus Team 4/6 memory-flush seam back into `cats`, and runtime-hook flushes now emit additive summary metadata plus inspectable core activities |
| Land product-owned companion boxes and hydration seams | [x] | Cat-scoped sidecar storage, ingest/read routes, response profiles, direct-session hydration metadata, and retrieval-context hydration now exist without visible UI changes |
| Land Cats-owned memory extraction and retrieval substrate | [x] | `src/platform/memory/*` now owns canonical memory records, local file-backed storage, companion/owner/channel/project/relationship flush seams, generic retrieval-context assembly, and core-owned non-UI project/relationship memory routes without an external RAG dependency |
| Keep ordinary `Recents` entry compatible with solo-composer mode | [x] | Normal `/new` chats no longer have to materialize as visible Boss-led threads before the operator decides to add a Cat |
| Rework cat information architecture around current-chat `Add cat` | [ ] | Registry stays global, but the main entry should move into chat context |
| Add interactive delegation and owner approval loop | [ ] | Pre-dispatch approve/reject/reroute now land through `/api/core/approvals`, retry/acknowledge incident hooks land through `/api/core/operator-actions`, `/api/orchestrator/dispatch` now pauses when owner approval is still pending, approval writes now auto-resume stored approval-blocked dispatches on `approve` or `reroute`, retry writes now auto-resume both the latest stored product-owned dispatch replay and blocked `max_continuations` workflow-continuation replay, core recovery routes now normalize those replay records plus latest replay activity for inspectability, expose machine-readable action envelopes plus replay-state filters/counts, execution-loop payloads expose recovery/next-action templates, structured workflow recommendations can now normalize into product-owned continuation routing when explicit handoff mentions are absent, and cross-scope canonical memory can now include project/relationship durable records; deeper replan/group planning loops still remain |
| Add Telegram and LINE orchestrator entrypoints | [ ] | Telegram Boss Cat inbox MVP plus polling-first onboarding landed (SPEC-017/SPEC-028, ADR-016/ADR-029) with durable inbox-to-room mapping, room creation or continuation, transport diagnostics, outbound replies, polling-default bindings, token uniqueness, and PollingSupervisor health or reconnect seams; LINE and richer room-rotation or takeover policy remain pending |
| Add escalation and takeover support | [ ] | HITL flows are defined in planning only |
| Complete owner durable-memory CRUD | [x] | `/api/owner/memory/{memoryId}` now supports `PUT/DELETE`, keeps canonical owner retrieval converged, and preserves the existing "writes survive sync failure" discipline |
| Add non-route companion/source memory sync boundary | [x] | `MemoryAwareCompanionBoxStore` now auto-syncs mutation callers and companion routes consume the same pending canonical-sync result instead of re-flushing |
| Ship desktop-safe packaging and onboarding | [ ] | The Electron host now stages Windows/macOS/Linux packaging manifests, persists host-readable bootstrap/remediation state, supports tray/background lifecycle, carries a manual-check update skeleton, can build a Windows NSIS installer for test installs, includes a reusable Windows post-install smoke-check script for installed binaries, bundled sidecars, and host-state validation, and now hardens the desktop host with a sandboxed preload bridge plus validated host/update URLs; signed releases, privileged provider-install execution, and polished remediation flows still remain |
| Revisit limited mobile companion scope | [ ] | Mobile is not a full primary shell in the current plan |

#### Acceptance Criteria

- [x] Operators can inspect pending approvals, progress, traces, and run state from the active chat
- [x] Operators can approve or redirect orchestrator plans before dispatch
- [x] Companion boxes can flush Cats-owned canonical memory and assemble
      retrieval context without depending on `personal-rag-system`
- [ ] Operators can add an existing or new cat from the active chat without
      going through a first-level registry page
- [ ] External transport channels can route through a single orchestrator bot end to end; Telegram Boss Cat inbox MVP is landed, while LINE and richer multi-room policy still remain
- [x] Desktop packaging can start local services with guided setup

---

### WP-5: Cats Work Launch Track

**Status**: Not Started
**Assigned**: Codex
**Priority**: P2
**Depends on**: WP-3

#### Tasks

| Task | Status | Notes |
|------|--------|-------|
| Add work dashboard and inbox surfaces | [ ] | Only placeholder Work route and renderer modules exist today |
| Add project/work-item views on top of shared contracts | [ ] | Shared-core project/work-item records exist, but Work does not yet consume them with product-specific views |
| Reuse Chat actors/resources, permissions, and archive metadata | [ ] | Shared core must land before Work diverges |
| Keep Work surfaces decoupled from runtime internals | [ ] | `cats-runtime` remains below the product layer; current placeholder APIs do not yet exercise that contract meaningfully |

#### Acceptance Criteria

- [ ] `Cats Work` can render useful work views without inventing a separate schema
- [ ] Chat and Work share the same actor, conversation, approval, and owner-profile contracts
- [ ] Work surfaces stay above the same runtime boundary used by Chat

---

## Completion Notes

### WP-1: Bootstrap and Runtime Boundary

**Completed**: 2026-03-11

#### Key Decisions

- `Cats` is treated as the flagship product shell, not a direct port target
- `cats-runtime` is the stable runtime boundary for this app
- Phase 1 uses only built-in Node APIs to keep the first slice dependency-light

#### Remaining Items

- [x] Decide the concrete frontend rendering approach for the product UI
- [x] Replace the placeholder app shell with the real chat model
- [x] Add persistence and transcript export paths
- [ ] Suite-foundation and launch-track follow-up work continues in WP-3 through WP-5

### WP-2: Workspace Shell Delivery

**Completed**: 2026-03-11

#### Key Decisions

- Use `React/Vite` for the renderer while keeping Electron deferred
- The suite desktop direction is now Electron plus React/TypeScript; Flutter and
  Tauri are outside the current execution path
- Keep the Node server as the API and future desktop-safe integration boundary
- Serve built static assets from the Node server after `npm run build`
- Keep chat-state persistence local and inspectable while runtime work stays behind `cats-runtime`
- Keep cat identity and memory separate from provider execution leases

#### Remaining Items

- [x] Replace static shell selection with persisted chat state
- [x] Add a local channel setup flow with persisted chat-state updates
- [x] Add runtime-backed channel actions and composer flows
- [x] Add a basic mention model, global cat registry, and transcript export
- [ ] Suite-foundation and launch-track follow-up work continues in WP-3 through WP-5

### WP-3: Suite Foundation Planning

**Most recent progress**: 2026-03-23

#### Landed in the current refactor slice

- `src/app/server/index.ts` now owns the app-level HTTP assembly
- `src/products/chat/api/*` now owns Chat setup, legacy compatibility,
  chat-prefixed REST compatibility, and canonical Chat route handling
- `src/app/renderer/*` now owns the suite-level renderer entry and routing
- `src/core/*` is now the shared core seam rather than a Chat-derived contract
- `src/core/api.ts` now owns the shared-core HTTP seam, including durable
  owner-profile, project, work-item, task, approval, approval-binding, run,
  trace, checkpoint, outcome, artifact, and activity writes
- `src/products/chat/shared/operatorLoop.ts` now assembles conversation-scoped
  operator snapshots from the shared core so Chat can render approvals,
  activity, trace, and run-inspector surfaces without extending app-shell
- `src/platform/orchestration/*` now resolves product-owned room-turn plans,
  frozen runtime MCP tool-plane metadata, approval/recovery action templates,
  and post-dispatch multi-step execution-loop snapshots without replacing the
  existing chat runtime loop
- `src/shared/coreFixtures.ts` now publishes reusable example payloads for Chat,
  Work, and Code follow-up teams through `src/shared/core.ts`
- `src/products/chat/state/store.ts` now preserves core-owned system
  records across file-backed reloads and later chat-state syncs
- `src/products/chat/state/coreProjection.ts` now preserves core-owned actors,
  conversations, projects, work items, artifacts, activities, approval
  bindings, and archive metadata while still deriving chat-owned projections
- `src/products/chat/renderer/components/ChatView.tsx` now renders a
  transcript-adjacent operator rail for pending approvals, progress, activity,
  and run inspection while keeping the transcript readable
- `src/products/chat/*` now owns the current Chat implementation
- `src/products/work/*` and `src/products/code/*` now own dedicated placeholder
  API and renderer surfaces
- `src/shared/app-shell.ts` is now a compatibility shim over shared suite
  envelope types and Chat-specific contracts

### WP-4: Cats Chat Launch Track

**Most recent progress**: 2026-03-26

#### Landed in the current execution-loop slice

- `src/platform/memory/*` now owns Cats-managed canonical memory contracts,
  extraction, retrieval assembly, and file-backed persistence derived from the
  chat-state path
- companion-derived, companion-memory, response-profile, owner-profile, and
  channel working-memory records can now be flushed into canonical Cats-owned
  memory without depending on `personal-rag-system`
- companion source update/delete now regenerates source-owned derived records,
  prunes stale source lineage, and keeps canonical retrieval converged without
  leaving raw-sidecar drift behind
- `src/platform/memory/companionStore.ts` now auto-syncs direct
  `MemoryAwareCompanionBoxStore` mutation callers into canonical memory and lets
  route handlers consume the same pending sync result without double-flushing
- `src/products/chat/api/memoryRoutes.ts` now exposes additive canonical-memory,
  flush, retrieval-context, and owner durable-memory `PUT/DELETE` routes for
  cat, channel, and owner scopes
- direct companion-session hydration now includes an additive retrieval context
  assembled from canonical memory, live companion records, owner hints, room
  working memory, and explicit policy/selection/exclusion metadata
- runtime-facing flush results now include machine-readable payloads with
  `promotionRule`, `replacementGroup`, and `sourceScopeKeys` so Team 5 can
  consume pre-reset / pre-compaction memory output directly
- memory-maintenance follow-through now adds aggregate flush summaries,
  reusable best-effort companion/owner/scoped sync helpers, core activity
  logging for runtime-hook or deferred maintenance, and core-owned
  `GET` / `POST /api/core/memory-maintenance` inspection/action seams so
  recovery or operator tooling can inspect or manually replay the same
  product-owned contract outside route-local code paths
- the core memory-maintenance inspection seam now supports additive
  `trigger` / `status` / `phase` / `subjectKey` / `limit` query filters plus
  route-level queue summaries for operator and recovery faceting
- the new memory substrate deliberately treats runtime sandboxes and provider
  continuity as inputs, not long-lived product truth
- orchestrator plan/dispatch/execution-loop payloads now expose a
  checkpoint-driven execution contract derived from the real room workflow turn
- pending owner approval now pauses `/api/orchestrator/dispatch` until
  `/api/core/approvals` resolves the gate
- approval writes now auto-resume stored approval-blocked dispatch requests on
  `approve` and `reroute`, returning additive replay summaries without forcing
  the caller to re-post the original dispatch body
- operator retry writes now auto-resume the latest stored product-owned
  dispatch replay, persist replay state on the owning task metadata, and keep
  failed retry attempts visible as retryable operator-read-model state instead
  of write-only markers
- workflow-continuation replay metadata now persists not only
  `max_continuations`, but also continuation-stage `max_dispatches`,
  `max_target_visits`, and `anti_ping_pong` guard blocks when the blocked room
  step already had a concrete continuation source plus target set, so the same
  operator `retry` seam can auto-resume a broader set of deeper continuation
  failures without inventing a second replay substrate
- that same retry path can now also re-resolve stale stored continuation
  targets from the persisted `workflowRecommendation` payload when the original
  concrete participant ids are no longer active, so operator retry is no
  longer hard-bound to the exact target identities that existed when the guard
  first fired
- recommendation-only continuation blocks now also persist retryable
  `no_valid_targets` replay snapshots when a structured
  `workflowRecommendation` exists but no active participants currently satisfy
  it, so the same operator `retry` seam can resume that handoff after the
  recommended target becomes active instead of leaving a write-only
  `no_targets` marker
- that same recommendation-only replay path now stays `blocked` rather than
  degrading to `failed` when operators retry before a matching participant is
  active again, so the replay remains ready for a later retry once the target
  comes back
- that same recommendation-only replay path now also auto-resumes when a
  matching channel cat assignment becomes active again, so simple target
  recovery does not always require a separate operator `retry`
- that same workflow-continuation replay contract now also carries a normalized
  `blockedReason` into recovery and control-plane read models, so operator
  automation can tell which guard persisted the replay snapshot without
  scraping raw checkpoint metadata
- recovery, control-plane, and operator-inbox list routes now also support
  `workflowContinuationBlockedReason` filtering plus
  `workflowContinuationBlockedReasonCounts`, so queue automation can facet
  retryable continuation work by the exact guard that persisted the replay
  snapshot without reopening raw checkpoint metadata
- server startup now downgrades stranded `pendingOrchestratorDispatch` /
  `orchestratorDispatchReplay` `in_progress` markers to failed so crash or
  cleanup-failure cases remain operator-recoverable after restart
- server startup now also finalizes stranded room-workflow `activeTurn`
  snapshots into blocked terminal turns, so the shared read model no longer
  reports phantom in-flight work after restart
- blocked dispatch persistence plus approve/reroute/retry replay start/result
  now emit additive core replay activities, so operator feeds can inspect
  replay lifecycle without scraping raw task metadata
- direct `ChatStore`-backed routing paths now persist intermediate room
  workflow snapshots before the full route completes, so long-running fan-out
  and continuation loops are durable and inspectable while still in flight
- execution-loop payloads now expose next-action templates for approve,
  reroute, reject, retry, acknowledge, and completion handling without
  inventing a second core schema
- Chat operator/read-model assembly now lifts the latest normalized workflow
  recommendation out of checkpoint metadata into a first-class inspectable
  view, so continuation source, candidate targets, branch strategy, and
  rationale no longer require raw metadata scraping
- `src/core/taskRecords.ts` plus `GET /api/core/tasks/{taskId}/records` now
  expose grouped task-scoped approval bindings, runs, traces, checkpoints,
  outcomes, and activity rows so later recovery/control-plane consumers can
  inspect exact task history without hydrating the full core snapshot
- `src/core/taskTimeline.ts` plus `GET /api/core/tasks/{taskId}/timeline` now
  expose a normalized chronological task narrative across those same record
  families, so later operator/recovery tooling can consume one task-scoped
  history seam instead of stitching raw records into timeline order and
  category buckets client-side
- `src/core/operatorInbox.ts` plus `GET /api/core/operator-inbox` now expose an
  actionable task list built on top of the existing task-scoped control-plane,
  timeline, and recovery read models, so later operator tooling can answer
  "what needs attention and what just happened?" without joining those routes
  client-side
- `src/core/taskControlPlane.ts` plus `GET /api/core/control-plane/tasks` and
  `GET /api/core/tasks/{taskId}/control-plane` now expose stable approval/
  incident action envelopes, workflow recommendation summaries, runtime-
  delivery intent, normalized workflow continuation state, normalized
  runtime-delivery intent, and operator-attention classification on top of
  existing core write seams, so future operator inbox or recovery tooling can
  consume a single task-level control-plane view instead of reassembling
  recovery, inspection, and records responses client-side
- those same non-UI operator inspection routes now also support additive
  query filters plus summary counts, including delivery-aware and workflow-
  stage-aware filtering on the shared control-plane/operator-inbox seam, so
  automation and later product surfaces can page/facet inbox, control-plane,
  and recovery lists without hydrating the full core snapshot and re-
  filtering client-side
- control-plane and operator-inbox summaries now expose delivery/workflow
  facet counts alongside severity/action counts, so later operator automation
  can drive queue slices without rescanning full task lists client-side
- those same control-plane/operator-inbox list routes now also support
  `workflowShape` filtering plus `workflowShapeCounts`, so sequential /
  parallel / converge topology becomes a first-class operator facet instead of
  something consumers must infer from stage ids or raw metadata
- that same workflow continuation seam now also propagates a resolved
  `convergeTargetId` for single-target review stages and lets
  control-plane/operator-inbox queries filter by `workflowReviewRequired` plus
  `workflowConvergeTargetId`, so review queues can target the active reviewer
  without scraping raw branch state
- the recovery list route now also supports the same reviewer-targeting seam,
  carrying `workflowReviewRequired` plus `workflowConvergeTargetId` in its
  normalized context view and accepting the same filters alongside
  `workflowShape`, so retry/resume automation can facet review-stage replay
  work without re-reading raw task metadata
- task inspection and control-plane views now also lift `latestTimelineItem`
  into the same payload, so operator/recovery consumers can answer "what just
  happened?" without joining the separate timeline route client-side
- control-plane and operator-inbox list routes now also support
  `latestTimelineCategory` / `latestTimelineKind` filtering plus
  `latestTimelineCategoryCounts` / `latestTimelineKindCounts`, so automation
  can facet queues by the newest normalized narrative signal without
  rescanning every task client-side
- those same operator/control-plane list routes now also support family-aware
  filters (`rootTaskId`, `parentTaskId`, `hasChildren`, `hasActiveChildren`)
  plus `withChildrenCount` / `withActiveChildrenCount`, so queue automation can
  target parent/child work without rebuilding the task graph outside `cats`
- the recovery read model now also carries the same family topology plus
  family-aware filters and child-activity summary counts, so replay/retry
  automation no longer needs a separate task-detail join just to scope parent/
  child recovery work
- the task-timeline route now also supports server-side `category` / `kind` /
  `actorId` / `runId` filtering plus a lightweight query summary, so operator
  tooling can slice a task narrative without hydrating and re-filtering the
  whole timeline client-side
- `src/core/recovery.ts` now also lifts delivery/workflow context into the
  recovery read model itself, so recovery filters and summary counts can facet
  by `deliveryMode`, `deliveryAction`, and `workflowStageId` without forcing
  later automation to join task metadata back onto replay rows
- task lifecycle watchers now reconcile initial observe payloads before waiting
  on live stream teardown, so running `effectiveStrategy` / `strategyState`
  metadata lands in task/run read models earlier and terminal observe snapshots
  can short-circuit stream attachment when they already carry final state
- the same task lifecycle completion path now also checks `parentTaskId`
  synchronously and converges parent tasks once all child tasks are terminal,
  recording additive `task-convergence` activity plus convergence metadata
  entirely inside `cats` Core
- shared task/runtime execution-request helpers now normalize trim/drop-empty
  semantics once and feed lifecycle persistence plus runtime-client outbound
  payloads through the same reusable bridge path
- routed wake paths now precompute one channel-task execution context and
  reuse it across runtime session creation plus auto-checkout, reducing
  duplicate `Cats Core` reads inside the same task-aware room dispatch
- validation coverage now includes `/api/work`, `/api/code`, and the current
  suite route map
- `electron/*` now also stages cross-platform packaging manifests under
  `build/desktop-packaging`, persists a host-readable bootstrap snapshot to the
  desktop user-data dir, keeps `cats-runtime` + `cats` alive behind a
  tray/background lifecycle, exposes a manual-check update-channel skeleton,
  and now builds a Windows NSIS installer through `electron-builder` without
  requiring renderer changes

#### Remaining Items

- [ ] Remove temporary shims in `src/server.ts`, `src/renderer/*`, and `src/chat/*` when ownership boundaries stabilize
- [ ] Decide when the `src/shared/app-shell.ts` compatibility shim can be removed after downstream imports migrate

---

*Last updated: 2026-03-26*

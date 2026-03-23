# Progress

> Implementation status and work package tracking for `Cats`.

## Current Status

| Component | Status | Description |
|-----------|--------|-------------|
| Bootstrap | Completed | Subproject created from `project-bootstrap` with Node.js preset |
| Runtime Boundary | Completed | `cats-runtime` is the only runtime dependency exposed to app code |
| HTTP App Shell | Completed | Node server exposes `/health` as the app-managed readiness contract plus `/api/app-shell` |
| Renderer Shell | Completed | React/Vite shell consumes app-shell and now exposes chat setup, global cats, assignments, transcript, and orchestrator surfaces |
| Chat Product Features | Completed | Runtime-backed setup, global cat registry, first-run `/setup` onboarding, sleep/wake-aware room entry, direct-cat draft lanes from `My Cats`, stable room-routing / wake-request contracts, live mention continuation routing, transcript export, execution-aware state, product-owned companion-box sidecar ingestion/hydration seams, and Cats-owned canonical memory / retrieval seams with curated durable-memory sync, source-update convergence, and Team 5-ready flush payloads landed |
| Suite Foundation Planning | In Progress | The suite-host split and shared Cats Core v1 write substrate are now in-tree, including durable project/work-item/artifact/activity/approval-binding records plus a product-owned orchestrator plan/dispatch/execution-loop seam aligned with the runtime MCP facade; product-side runtime bridge routes now proxy runtime MCP and session-observe contracts while host compatibility-shim cleanup and later control-plane slices remain |
| Documentation | In Progress | Top-level docs now reflect the three-step setup wizard, Cat-private in-place lane entry, Telegram inbox MVP, runtime skill/guardrail seams, shared-core projection boundaries, the operator-loop chat surfaces, the companion-box sidecar/session-hydration contract, the Cats-owned canonical memory/retrieval substrate with promotion rules, source convergence, curated durable-memory sync, and Team 5 flush payloads, the orchestrator execution-loop/MCP seam, the Electron desktop host packaging and security substrate, and the polling-first Telegram follow-on direction; broader launch-track docs still remain |
| Cats Chat Launch Track | In Progress | First-slice onboarding now lands on `/setup`, `My Cats` opens Cat-scoped in-place direct lanes rather than creating `Recents` threads, Telegram Boss Cat inbox MVP currently bridges webhook ingress into durable room routing and outbound replies, per-Cat companion-box sidecar ingestion/hydration plus Cats-owned canonical memory/retrieval seams now exist without visible UI changes, curated cat/owner durable notes plus companion source mutations now sync into canonical retrieval and replace stale hits after update/delete, retrieval previews now expose policy/selection/exclusion metadata, Chat now surfaces operator-facing approvals, reroute/retry/acknowledge seams, progress, activity, traces, run inspection, machine-readable governance/workflow summaries, a product-side runtime bridge for session observe + pre-reset/pre-compaction memory flush, and a checkpoint-driven orchestrator plan/dispatch/execution-loop seam with approval pause and recovery actions, while the Electron host now supervises local `cats-runtime` + `cats` with readiness-gated bootstrap, stages packaging manifests, can emit a Windows NSIS installer for test installs, persists structured bootstrap/remediation state, keeps a tray/background + update skeleton plus sandboxed bootstrap bridge in place, and now validates host/update URLs; fuller polling-first onboarding, provider-install, escalation, takeover, signed-release, and broader packaging/install flows remain ahead |
| Cats Work Launch Track | Not Started | Work dashboard and operational surfaces are planned on top of the shared core |

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
| Bridge product APIs to runtime MCP + maintenance hooks | [x] | `/api/runtime/mcp`, `/api/runtime/sessions/{id}/observe`, and `/api/runtime/sessions/{id}/memory-flush` now connect the runtime MCP facade plus Team 4/6 memory-flush seam back into `cats` |
| Land product-owned companion boxes and hydration seams | [x] | Cat-scoped sidecar storage, ingest/read routes, response profiles, and direct-session hydration metadata now exist without visible UI changes |
| Land Cats-owned memory extraction and retrieval substrate | [x] | `src/platform/memory/*` now owns canonical memory records, local file-backed storage, companion/owner/channel flush seams, curated durable-memory sync, and retrieval-context assembly without an external RAG dependency |
| Land product-owned companion boxes and hydration seams | [x] | Cat-scoped sidecar storage, ingest/read routes, response profiles, direct-session hydration metadata, and retrieval-context hydration now exist without visible UI changes |
| Rework cat information architecture around current-chat `Add cat` | [ ] | Registry stays global, but the main entry should move into chat context |
| Add interactive delegation and owner approval loop | [ ] | Pre-dispatch approve/reject/reroute now land through `/api/core/approvals`, retry/acknowledge incident hooks land through `/api/core/operator-actions`, `/api/orchestrator/dispatch` now pauses when owner approval is still pending, and execution-loop payloads now expose recovery/next-action templates; automatic resume and deeper converge/group planning loops still remain |
| Add Telegram and LINE orchestrator entrypoints | [ ] | Telegram Boss Cat inbox MVP now lands webhook ingress, durable inbox-to-room mapping, room creation/continuation, transport diagnostics UI, and outbound replies; polling-first Telegram onboarding also landed (SPEC-028/ADR-029) with polling-default bindings, token uniqueness, PollingSupervisor health/reconnect seams, and Settings mode selection; LINE and richer room-rotation policy remain pending |
| Add escalation and takeover support | [ ] | HITL flows are defined in planning only |
| Ship desktop-safe packaging and onboarding | [ ] | The Electron host now stages Windows/macOS/Linux packaging manifests, persists host-readable bootstrap/remediation state, supports tray/background lifecycle, carries a manual-check update skeleton, can build a Windows NSIS installer for test installs, and includes a reusable Windows post-install smoke-check script for installed binaries, bundled sidecars, and host-state validation; signed releases, privileged provider-install execution, and polished remediation flows still remain |
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
| Add work dashboard and inbox surfaces | [ ] | No Work-specific UI exists yet |
| Add project/work-item views on top of shared contracts | [ ] | Current model stops at channels and transcripts |
| Reuse Chat actors/resources, permissions, and archive metadata | [ ] | Shared core must land before Work diverges |
| Keep Work surfaces decoupled from runtime internals | [ ] | `cats-runtime` remains below the product layer |

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

**Most recent progress**: 2026-03-24

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
- `src/products/chat/api/memoryRoutes.ts` now exposes additive canonical-memory,
  flush, and retrieval-context routes for cat, channel, and owner scopes
- direct companion-session hydration now includes an additive retrieval context
  assembled from canonical memory, live companion records, owner hints, room
  working memory, and explicit policy/selection/exclusion metadata
- runtime-facing flush results now include machine-readable payloads with
  `promotionRule`, `replacementGroup`, and `sourceScopeKeys` so Team 5 can
  consume pre-reset / pre-compaction memory output directly
- the new memory substrate deliberately treats runtime sandboxes and provider
  continuity as inputs, not long-lived product truth
- orchestrator plan/dispatch/execution-loop payloads now expose a
  checkpoint-driven execution contract derived from the real room workflow turn
- pending owner approval now pauses `/api/orchestrator/dispatch` until
  `/api/core/approvals` resolves the gate
- execution-loop payloads now expose next-action templates for approve,
  reroute, reject, retry, acknowledge, and completion handling without
  inventing a second core schema
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

*Last updated: 2026-03-24*

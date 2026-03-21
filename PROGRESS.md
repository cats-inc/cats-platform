# Progress

> Implementation status and work package tracking for `Cats`.

## Current Status

| Component | Status | Description |
|-----------|--------|-------------|
| Bootstrap | Completed | Subproject created from `project-bootstrap` with Node.js preset |
| Runtime Boundary | Completed | `cats-runtime` is the only runtime dependency exposed to app code |
| HTTP App Shell | Completed | Node server exposes `/health` and `/api/app-shell` |
| Renderer Shell | Completed | React/Vite shell consumes app-shell and now exposes chat setup, global pals, assignments, transcript, and orchestrator surfaces |
| Workspace Product Features | Completed | Runtime-backed setup, global pal registry, channel assignment, live mention continuation routing, transcript export, and execution-aware state landed |
| Suite Foundation Planning | In Progress | The suite-host refactor now has core-owned state direction, app-level server/renderer assembly, and dedicated Work/Code placeholder slices, but Chat API extraction and cleanup remain |
| Documentation | In Progress | Architecture, progress, and plan docs now reflect the suite-host layout and compatibility seams, but API/cleanup follow-up remains |
| Cats Chat Launch Track | Not Started | Chat launch features such as approvals, escalation, takeover, and desktop packaging remain ahead |
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

### WP-2: Workspace Shell Delivery

**Status**: Completed
**Assigned**: Codex
**Priority**: P1
**Depends on**: WP-1

#### Tasks

| Task | Status | Notes |
|------|--------|-------|
| Choose renderer approach | [x] | React/Vite first, Electron deferred |
| Add initial multi-channel workspace UI shell | [x] | Sidebar, channel cards, orchestrator and runtime panels |
| Add persistent workspace shell storage | [x] | File-backed shell state now includes selected and created channels |
| Implement orchestrator and channel setup UX | [x] | Channel setup, global orchestrator editing, and runtime activation all landed |
| Add runtime-backed message, pal, and export flows | [x] | Global pal registry, channel assignment, continuation loop routing, fan-out, guards, and transcript export now exist |

#### Acceptance Criteria

- [x] Users can switch among persisted workspace channels
- [x] Selected channel survives reloads through local state persistence
- [x] Users can create planned channels and keep them across reloads
- [x] Product shell can bootstrap runtime-backed sessions through `cats-runtime`
- [x] Channel state is persisted beyond in-memory process lifetime
- [x] Workspace pals can be assigned into persisted channels and reached through basic mentions
- [x] Channels can export their transcript and configuration as JSON

Known follow-ups:

- Routing-engine deferred items remain tracked in
  `docs/plans/PLAN-016-dynamic-room-workflow-orchestration.md`, including
  sequential fan-out wake semantics, the optional shared `roomRouting`
  compatibility seam, and longer-cycle detection beyond direct anti-ping-pong.

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
| Land the first implementation slices for shared storage and contracts | [x] | `src/shared/core.ts`, `src/core/model.ts`, the core-backed workspace store, and `/api/core/*` read/write routes are now in-tree |
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

**Status**: Not Started
**Assigned**: Codex
**Priority**: P2
**Depends on**: WP-3

#### Tasks

| Task | Status | Notes |
|------|--------|-------|
| Add operator-grade chat activity and split-view surfaces | [ ] | Current renderer remains phase-2 shell quality |
| Rework pal information architecture around current-chat `Add pal` | [ ] | Registry stays global, but the main entry should move into chat context |
| Add interactive delegation and owner approval loop | [ ] | Dispatch planning before worker execution is not implemented yet |
| Add Telegram and LINE orchestrator entrypoints | [ ] | Telegram status/webhook seam, durable dedupe, and placeholder inbox mapping are now landed; outbound delivery, LINE, and room-routing policy remain pending |
| Add escalation and takeover support | [ ] | HITL flows are defined in planning only |
| Ship desktop-safe packaging and onboarding | [ ] | Electron host exists only as an ADR today |
| Revisit limited mobile companion scope | [ ] | Mobile is not a full primary shell in the current plan |

#### Acceptance Criteria

- [ ] Operators can approve or redirect orchestrator plans before dispatch
- [ ] Operators can add an existing or new pal from the active chat without
      going through a first-level registry page
- [ ] External transport channels can route through a single orchestrator bot end to end; Telegram ingress seam is landed but outbound and room policy are still pending
- [ ] Desktop packaging can start local services with guided setup

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
- [x] Replace the placeholder app shell with the real workspace model
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
- Keep workspace persistence local and inspectable while runtime work stays behind `cats-runtime`
- Keep pal identity and memory separate from provider execution leases

#### Remaining Items

- [x] Replace static shell selection with persisted workspace state
- [x] Add a local channel setup flow with persisted workspace updates
- [x] Add runtime-backed channel actions and composer flows
- [x] Add a basic mention model, global pal registry, and transcript export
- [ ] Suite-foundation and launch-track follow-up work continues in WP-3 through WP-5

### WP-3: Suite Foundation Planning

**Most recent progress**: 2026-03-21

#### Landed in the current refactor slice

- `src/app/server/index.ts` now owns the app-level HTTP assembly
- `src/products/chat/api/*` now owns Chat setup, legacy compatibility,
  workspace-prefixed REST, and canonical Chat route handling
- `src/app/renderer/*` now owns the suite-level renderer entry and routing
- `src/core/*` is now the shared core seam rather than a Chat-derived contract
- `src/core/api.ts` now owns the shared-core HTTP seam, including durable
  owner-profile, task, approval, run, trace, checkpoint, and outcome writes
- `src/products/chat/workspace/store.ts` now preserves core-owned system
  records across file-backed reloads and later workspace syncs
- `src/products/chat/*` now owns the current Chat implementation
- `src/products/work/*` and `src/products/code/*` now own dedicated placeholder
  API and renderer surfaces
- `src/shared/app-shell.ts` is now a compatibility shim over shared suite
  envelope types and Chat-specific contracts
- validation coverage now includes `/api/work`, `/api/code`, and the current
  suite route map

#### Remaining Items

- [ ] Remove temporary shims in `src/server.ts`, `src/renderer/*`, and `src/workspace/*` when ownership boundaries stabilize
- [ ] Decide when the `src/shared/app-shell.ts` compatibility shim can be removed after downstream imports migrate

---

*Last updated: 2026-03-21*

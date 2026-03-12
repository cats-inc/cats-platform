# Progress

> Implementation status and work package tracking for `cats-inc`.

## Current Status

| Component | Status | Description |
|-----------|--------|-------------|
| Bootstrap | Completed | Subproject created from `project-bootstrap` with Node.js preset |
| Runtime Boundary | Completed | `cats-runtime` is the only runtime dependency exposed to app code |
| HTTP App Shell | Completed | Node server exposes `/health` and `/api/app-shell` |
| Renderer Shell | Completed | React/Vite shell consumes app-shell and now exposes channel setup, transcript, members, and orchestrator surfaces |
| Workspace Product Features | Completed | Basic runtime-backed setup, messaging, member management, mention routing, and transcript export landed |
| Documentation | In Progress | Core status and product docs are aligned; bootstrap template docs still need project-specific follow-up |
| Productization Backlog | Not Started | Split-view, richer orchestration, desktop host, and alternate entrypoints remain |

**Legend**: Not Started | In Progress | Completed | Blocked

## Work Packages

### WP-1: Bootstrap and Runtime Boundary

**Status**: Completed
**Assigned**: Codex
**Priority**: P0

#### Tasks

| Task | Status | Notes |
|------|--------|-------|
| Create `cats-inc/` with bootstrap preset | [x] | Used external `project-bootstrap` source |
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
| Add runtime-backed message, member, and export flows | [x] | Basic participant management, mention routing, and transcript export now exist |

#### Acceptance Criteria

- [x] Users can switch among persisted workspace channels
- [x] Selected channel survives reloads through local state persistence
- [x] Users can create planned channels and keep them across reloads
- [x] Product shell can bootstrap runtime-backed sessions through `cats-runtime`
- [x] Channel state is persisted beyond in-memory process lifetime
- [x] Basic participant management and mention routing work against persisted channels
- [x] Channels can export their transcript and configuration as JSON

---

### WP-3: Productization Backlog

**Status**: Not Started
**Assigned**: Codex
**Priority**: P2
**Depends on**: WP-2

#### Tasks

| Task | Status | Notes |
|------|--------|-------|
| Add transcript normalization and ingestion handoff hooks | [ ] | Export exists; post-export normalization does not |
| Add split-view workspace surfaces | [ ] | The current renderer is still chat-first |
| Add operator-grade activity indicators and richer runtime state | [ ] | Current UI is request/response, not live-streamed |
| Add alternate entrypoints and desktop-safe packaging seams | [ ] | Electron/tray and Telegram remain deferred; desktop topology is documented in ADR-003 |
| Refresh deployment assets inherited from bootstrap | [ ] | Docker and desktop packaging need a dedicated follow-up pass |

#### Acceptance Criteria

- [ ] Exported transcripts can be normalized for downstream ingestion without manual edits
- [ ] The workspace can show chat alongside at least one secondary pane
- [ ] Operators can see richer session/activity state than the current request result banners
- [ ] Desktop-host and alternate-entrypoint decisions are documented and implemented behind stable seams

---

## Completion Notes

### WP-1: Bootstrap and Runtime Boundary

**Completed**: 2026-03-11

#### Key Decisions

- `cats-inc` is treated as the flagship product shell, not a direct port target
- `cats-runtime` is the stable runtime boundary for this app
- Phase 1 uses only built-in Node APIs to keep the first slice dependency-light

#### Remaining Items

- [x] Decide the concrete frontend rendering approach for the product UI
- [x] Replace the placeholder app shell with the real workspace model
- [x] Add persistence and transcript export paths
- [ ] Productization follow-up work continues in WP-3

### WP-2: Workspace Shell Delivery

**Completed**: 2026-03-11

#### Key Decisions

- Use `React/Vite` for the renderer while keeping Electron deferred
- Keep the Node server as the API and future desktop-safe integration boundary
- Serve built static assets from the Node server after `npm run build`
- Keep workspace persistence local and inspectable while runtime work stays behind `cats-runtime`

#### Remaining Items

- [x] Replace static shell selection with persisted workspace state
- [x] Add a local channel setup flow with persisted workspace updates
- [x] Add runtime-backed channel actions and composer flows
- [x] Add a basic mention model, member management, and transcript export
- [ ] Productization follow-up work continues in WP-3

---

*Last updated: 2026-03-13*

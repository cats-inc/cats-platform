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
| Documentation | In Progress | Core docs aligned; deeper product docs still needed |

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

- [x] Users can switch among initial workspace shell channels
- [x] Selected channel survives reloads through local state persistence
- [x] Users can create planned channels and keep them across reloads
- [x] Product shell can bootstrap runtime-backed sessions through `cats-runtime`
- [x] Channel state is persisted beyond in-memory process lifetime
- [x] Basic participant management and mention routing work against persisted channels
- [x] Channels can export their transcript and configuration as JSON

---

## Completion Notes

### WP-1: Bootstrap and Runtime Boundary

**Completed**: 2026-03-11

#### Key Decisions

- `cats-inc` is treated as the flagship product shell, not a direct port target
- `cats-runtime` is the stable runtime boundary for this app
- Phase 1 uses only built-in Node APIs to keep the first slice dependency-light

#### Remaining Items

- [ ] Replace the placeholder app shell with the real workspace model
- [x] Decide the concrete frontend rendering approach for the product UI
- [ ] Add persistence and transcript export paths

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

---

*Last updated: 2026-03-11*

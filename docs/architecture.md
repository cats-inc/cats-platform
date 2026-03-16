# System Architecture

> Technical architecture and design decisions for `cats-inc`.

## Overview

`cats-inc` is now both the current product-facing application layer and the
planning home for the shared Cats suite contracts. The current implementation
is still a split architecture: a Node server owns product and runtime-facing
APIs, and a React/Vite renderer owns the operator-facing shell. The accepted
next step is to add `Cats Core v1` so `Cats Chat` and `Cats Work` can launch on
the same shared domain model.

## Architecture Diagram

```text
┌───────────────────────────┐   ┌───────────────────────────┐
│       Cats Chat UI        │   │       Cats Work UI        │
│   chat-first operator     │   │ work views and inboxes    │
└──────────────┬────────────┘   └──────────────┬────────────┘
               │ HTTP / desktop host            │ HTTP / desktop host
               └──────────────┬─────────────────┘
                              ▼
┌────────────────────────────────────────────────────────────┐
│                    cats-inc product server                 │
│  product APIs + suite orchestration + shared app services  │
└──────────────┬───────────────────────────────┬─────────────┘
               │                               │
               │ shared domain                  │ runtime access
               ▼                               ▼
┌───────────────────────────┐        ┌───────────────────────────┐
│       Cats Core v1        │        │       cats-runtime        │
│ actors + channels + tasks │        │ direct API + MCP facade   │
│ approvals + owner profile │        │ stable runtime boundary   │
└──────────────┬────────────┘        └──────────────┬────────────┘
               │                                    │
               │ operational / archive data         │ subprocess / local files / local APIs
               ▼                                    ▼
┌───────────────────────────┐        ┌───────────────────────────┐
│ DB + operational search   │        │ Claude / Codex / Gemini   │
│ archive metadata + RAG    │        │ Cursor / Kiro / OpenCode  │
└───────────────────────────┘        └───────────────────────────┘

Third-party transports such as Telegram and LINE route through the product
server and a single orchestrator-facing bot binding rather than talking
directly to individual workers.
```

## Components

### Configuration Layer

- **Purpose**: Centralize environment parsing and defaults
- **Technology**: TypeScript + `process.env`
- **Responsibilities**: Resolve app port, host, and `cats-runtime` settings

### Presentation Surfaces

- **Purpose**: Expose product behavior through dedicated Chat, Work, and
  external transport experiences
- **Technology**: Shared React/Vite desktop renderer inside Electron; transport
  relays for Telegram and LINE; optional mobile companion later if needed
- **Responsibilities**: Render chat and work views, surface approvals,
  ownership, activity, and allow external transport messages to reach the
  orchestrator safely

### Cats Core v1

- **Purpose**: Provide the shared domain model used by both `Cats Chat` and
  `Cats Work`
- **Technology**: Shared TypeScript contracts first, with room to grow into a
  co-hosted service if parallel teams need a stronger boundary
- **Responsibilities**:
  - identity and actor/resource records
  - conversation and channel records
  - bot bindings for Telegram or LINE entrypoints
  - task, run, approval, and escalation records
  - owner profile and preference memory
  - artifact and archive metadata

### Runtime Client and Runtime Boundary

- **Purpose**: Keep `cats-runtime` as the only execution boundary while
  supporting both product-controlled APIs and orchestrator-controlled tools
- **Technology**: Native `fetch` today; planned MCP facade exposed by
  `cats-runtime`
- **Responsibilities**:
  - direct product API calls for health, session lifecycle, routing, and
    operational control
  - planned MCP tool surface for orchestrator-style agents that need runtime
    capabilities without direct provider coupling
  - keep backend details out of higher layers

### HTTP Server

- **Purpose**: Publish the product API, host shared suite services, and serve
  built static assets
- **Technology**: Native `node:http`
- **Responsibilities**: Serve `/health`, `/api/app-shell`, shared-core product
  routes, runtime-facing routes, and built renderer files

### Workspace Store and Future Shared Storage

- **Purpose**: Persist the current workspace shell while preparing for a
  stronger operational store
- **Technology**: JSON file inside `config/` today; operational DB plus
  archive/RAG pipelines planned
- **Responsibilities**: Load defaults, persist channels, workspace pals, channel
  assignments, transcript messages, execution targets, execution leases, pal
  memory checkpoints, and later shared-core records

### Workspace Runtime Actions

- **Purpose**: Translate workspace-level channel actions into `cats-runtime`
  session calls
- **Technology**: Native `fetch` through the runtime client
- **Responsibilities**: Activate channel sessions, route mention-driven
  messages, and persist runtime outcomes back into local transcripts

### Renderer Shell

- **Purpose**: Present the first operator-facing shell that will later branch
  into dedicated Chat and Work experiences
- **Technology**: React + Vite
- **Responsibilities**: Render channels, runtime status, transcript composer,
  a preview-ready artifact pane, global pal management, channel assignment,
  channel setup, and global orchestrator editing

### Workspace Shell Model

- **Purpose**: Describe the current product contract shared by server and
  renderer while a stronger suite-wide contract is designed
- **Technology**: Plain TypeScript data structures
- **Responsibilities**: Expose workspace, pal registry, pal assignment, message,
  session, and capability state

## Pal Identity and Execution

`cats-inc` now treats teammate identity and runtime execution as separate
concerns.

- `Workspace pal registry` covers reusable teammate identity, default execution
  settings, and long-lived memory
- `Channel pal assignment` covers whether a pal is active in one chat plus any
  channel-specific role or provider override
- `Execution target` covers which provider/model should be used in a given
  channel assignment
- `Execution lease` covers the currently active runtime session and its status
- `Memory checkpoint` covers product-owned summary data that should survive
  session restarts or provider changes

This boundary matters because the same pal may need different providers in
different channels, and cross-session continuity must belong to `cats-inc`
rather than to any one provider's native thread model. See
[ADR-004](./decisions/004-separate-pal-identity-from-provider-execution.md)
and
[ADR-005](./decisions/005-use-workspace-pal-registry-and-channel-assignments.md).

Under the accepted suite direction, this existing pal model is expected to
evolve into the broader `Cats Core v1` actor/resource model rather than being
discarded outright.

## Cats Core v1 Shared Scope

The current accepted planning scope for `Cats Core v1` is intentionally small
and product-facing:

- identity
- actor/resource definitions
- permissions and policy
- conversation and channel records
- bot bindings for transport entrypoints
- task, run, approval, escalation, and takeover state
- owner profile and preference memory
- artifact and archive metadata

`Cats Core v1` is not the place for provider adapters, CLI process ownership,
or a full RAG engine implementation. Those stay behind `cats-runtime` or
adjacent archive services.

## Data Flow

1. In development, Vite serves the renderer and proxies `/api` to the Node
   server.
2. The product server asks the runtime client for current `cats-runtime`
   health.
3. The product server merges runtime health with persisted workspace or
   shared-core state.
4. `Cats Chat`, `Cats Work`, or a transport relay requests product actions
   through the same product server boundary.
5. If work needs execution, the product server can call `cats-runtime`
   directly, or an orchestrator can use the planned MCP facade for runtime
   tools.
6. The product server persists operational transcript, approval, actor, and
   artifact state to product-owned storage.
7. Archived data later flows into archive/RAG pipelines without replacing the
   operational DB or approval state.
8. In built mode, the server also serves the static renderer bundle.

## Planned Desktop Topology

The future desktop shape is now decided even though it is not implemented yet:

```text
Electron main
  ├─ tray + window lifecycle
  ├─ starts cats-runtime
  ├─ starts cats-inc
  ├─ manages local onboarding and settings
  └─ loads Chat and Work windows from cats-inc

BrowserWindow renderer
  └─ React/Vite Chat and Work UIs

cats-inc
  ├─ product HTTP boundary over cats-runtime
  └─ co-hosted Cats Core v1 APIs or modules

cats-runtime
  ├─ direct runtime APIs
  └─ MCP facade for orchestrator tool use
```

This keeps subprocess-backed runtime work out of the renderer and preserves the
existing `cats-inc -> cats-runtime` boundary for desktop packaging. See
[ADR-003](./decisions/003-electron-host-manages-local-services.md),
[ADR-007](./decisions/007-establish-cats-core-v1-for-chat-and-work.md), and
[ADR-008](./decisions/008-expose-cats-runtime-via-direct-api-and-mcp-facade.md).

## Current Implementation vs Planned Evolution

- Current implementation is still a phase-2 chat shell with file-backed state,
  global orchestrator settings, pal assignments, mention routing, and transcript
  export.
- `Cats Core v1` is an accepted planning direction, not an implemented module
  yet.
- `Cats Work` is a planned sibling surface, not a shipped UI in the current
  codebase.
- The current execution path keeps full Chat and Work desktop surfaces on the
  same React/TypeScript renderer stack under Electron.
- Flutter and Tauri are not part of the active implementation route.
- Paperclip-derived control-plane documents remain exploratory and are not the
  active implementation plan.

## Current Gaps

The main `agent-workspace-poc` parity gaps are now closed, but these areas are
still intentionally deferred:

- live streaming or push-based renderer updates
- split-view workspace panes beyond the current chat-first layout
- richer orchestrator automation than explicit runtime activation plus basic
  `@mention` routing
- shared-core storage and approval models
- Telegram/LINE transport relays, escalation, and takeover behavior
- desktop host lifecycle management and tray-driven UX implementation
- `Cats Work` product surfaces above the shared core
- any limited mobile companion scope, which is intentionally secondary to the
  desktop suite

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Renderer | React + Vite | Current Chat shell and future Chat/Work product UIs |
| Product app | Node.js + TypeScript | Product-facing backend shell and shared suite services |
| Shared contracts | TypeScript modules today | `Cats Core v1` actors, channels, approvals, owner profile, archive metadata |
| Runtime boundary | `cats-runtime` | Direct runtime APIs plus planned MCP facade |
| Testing | `node:test` | Lightweight smoke and integration tests |

## Design Patterns

- Hexagonal boundary at the runtime edge: `cats-inc` depends on a runtime client
  interface, not `agent-fleet`
- Shared domain contracts before product-surface specialization
- Direct product APIs plus MCP tool access for orchestrators
- Dependency injection by constructor or factory parameter
- Explicit shell payloads over hidden process state
- Product-owned memory over provider-owned session continuity
- Operational DB plus archive/RAG split rather than using vector memory for
  every live workflow

## API Design

- See [api.md](./api.md)

## Key Decisions

- [ADR-001](./decisions/001-use-cats-runtime-boundary.md): use `cats-runtime`
  as the only runtime boundary
- [ADR-002](./decisions/002-react-vite-renderer-before-electron.md): use
  React/Vite before adding a desktop shell
- [ADR-004](./decisions/004-separate-pal-identity-from-provider-execution.md):
  keep pal identity separate from provider execution and memory leases
- [ADR-005](./decisions/005-use-workspace-pal-registry-and-channel-assignments.md):
  keep reusable pals at workspace scope and channel-specific overrides in assignments
- [ADR-007](./decisions/007-establish-cats-core-v1-for-chat-and-work.md):
  introduce `Cats Core v1` as the shared contract layer for `Cats Chat` and
  `Cats Work`
- [ADR-008](./decisions/008-expose-cats-runtime-via-direct-api-and-mcp-facade.md):
  keep direct product APIs while adding an MCP facade for orchestrators

---

*Last updated: 2026-03-16*

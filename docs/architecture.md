# System Architecture

> Technical architecture and design decisions for `cats-inc`.

## Overview

`cats-inc` is the product-facing application layer for the cats initiative. The
current shape is a split architecture: a Node server owns runtime-facing APIs,
and a React/Vite renderer owns the operator-facing workspace shell.

## Architecture Diagram

```text
┌───────────────────────────┐
│     React/Vite shell      │
│  sidebar + workspace UI   │
└──────────────┬────────────┘
               │ HTTP
               ▼
┌───────────────────────────┐
│     cats-inc server       │
│ app-shell + runtime API   │
└──────────────┬────────────┘
               │ HTTP
               ▼
┌───────────────────────────┐
│       cats-runtime        │
│ stable runtime boundary   │
│ + embedded CLI backend    │
└──────────────┬────────────┘
               │ subprocess / local files / local APIs
               ▼
┌───────────────────────────┐
│ Claude / Codex / Gemini   │
│ Cursor / Kiro / OpenCode  │
└───────────────────────────┘
```

## Components

### Configuration Layer

- **Purpose**: Centralize environment parsing and defaults
- **Technology**: TypeScript + `process.env`
- **Responsibilities**: Resolve app port, host, and `cats-runtime` settings

### Runtime Client

- **Purpose**: Talk to `cats-runtime` over HTTP
- **Technology**: Native `fetch`
- **Responsibilities**: Retrieve runtime health, create and close sessions,
  send routed messages, and keep backend details out of higher layers

### HTTP Server

- **Purpose**: Publish the app-shell API and serve built static assets
- **Technology**: Native `node:http`
- **Responsibilities**: Serve `/health`, `/api/app-shell`, workspace mutation
  routes, and built renderer files

### Workspace Store

- **Purpose**: Persist full local workspace state
- **Technology**: JSON file inside `config/`
- **Responsibilities**: Load defaults, persist channels, workspace pals, channel
  pal assignments, transcript messages, execution targets, execution lease
  metadata, pal memory checkpoints, and exportable workspace state

### Workspace Runtime Actions

- **Purpose**: Translate workspace-level channel actions into `cats-runtime`
  session calls
- **Technology**: Native `fetch` through the runtime client
- **Responsibilities**: Activate channel sessions, route mention-driven
  messages, and persist runtime outcomes back into local transcripts

### Renderer Shell

- **Purpose**: Present the first operator-facing multi-channel workspace UI
- **Technology**: React + Vite
- **Responsibilities**: Render channels, runtime status, transcript composer,
  a preview-ready artifact pane, global pal management, channel assignment,
  channel setup, and global orchestrator editing

### Workspace Shell Model

- **Purpose**: Describe the current product contract shared by server and renderer
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

## Data Flow

1. In development, Vite serves the renderer and proxies `/api` to the Node server.
2. The server asks the runtime client for current `cats-runtime` health.
3. The server merges runtime health with persisted workspace state.
4. The renderer can create channels, define workspace pals, assign or remove
   pals per chat, activate sessions, send mention-routed messages, edit the
   orchestrator, and export transcripts.
5. Runtime-facing work still flows only through `cats-runtime`.
6. In built mode, the server also serves the static renderer bundle.
7. Future phases will expand this into richer orchestration automation and
   alternate entrypoints.

## Planned Desktop Topology

The future desktop shape is now decided even though it is not implemented yet:

```text
Electron main
  ├─ tray + window lifecycle
  ├─ starts cats-runtime
  ├─ starts cats-inc
  └─ loads BrowserWindow from cats-inc

BrowserWindow renderer
  └─ React/Vite workspace UI

cats-inc
  └─ product HTTP boundary over cats-runtime

cats-runtime
  └─ CLI spawning, native discovery, and runtime state
```

This keeps subprocess-backed runtime work out of the renderer and preserves the
existing `cats-inc -> cats-runtime` boundary for desktop packaging. See
[ADR-003](./decisions/003-electron-host-manages-local-services.md).

## Current Gaps

The main `agent-workspace-poc` parity gaps are now closed, but these areas are
still intentionally deferred:

- live streaming or push-based renderer updates
- split-view workspace panes beyond the current chat-first layout
- richer orchestrator automation than explicit runtime activation plus basic
  `@mention` routing
- desktop host lifecycle management and tray-driven UX implementation

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Renderer | React + Vite | Operator-facing workspace UI |
| Product app | Node.js + TypeScript | Product-facing backend shell |
| Runtime boundary | `cats-runtime` | Stable runtime contract and embedded CLI runtime |
| Testing | `node:test` | Lightweight smoke and integration tests |

## Design Patterns

- Hexagonal boundary at the runtime edge: `cats-inc` depends on a runtime client
  interface, not `agent-fleet`
- Dependency injection by constructor or factory parameter
- Explicit shell payloads over hidden process state
- Product-owned memory over provider-owned session continuity
- Renderer-first UI iteration with desktop packaging deferred

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

---

*Last updated: 2026-03-13*

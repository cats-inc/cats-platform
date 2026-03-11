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
└──────────────┬────────────┘
               │ HTTP
               ▼
┌───────────────────────────┐
│       agent-fleet         │
│ phase 1 backend adapter   │
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
- **Responsibilities**: Retrieve runtime health and keep backend details out of
  higher layers

### HTTP Server

- **Purpose**: Publish the app-shell API and serve built static assets
- **Technology**: Native `node:http`
- **Responsibilities**: Serve `/health`, `/api/app-shell`, and built renderer files

### Workspace Store

- **Purpose**: Persist minimal local workspace state
- **Technology**: JSON file inside `config/`
- **Responsibilities**: Load defaults, validate channel selections, and save
  selected-channel updates

### Renderer Shell

- **Purpose**: Present the first operator-facing multi-channel workspace UI
- **Technology**: React + Vite
- **Responsibilities**: Render channels, runtime status, orchestrator notes, and
  the initial workspace shell

### Workspace Shell Model

- **Purpose**: Describe the initial product contract for the future workspace UI
- **Technology**: Plain TypeScript data structures
- **Responsibilities**: Expose workspace, orchestrator, and capability state

## Data Flow

1. In development, Vite serves the renderer and proxies `/api` to the Node server.
2. The server asks the runtime client for current `cats-runtime` health.
3. The server merges runtime health with persisted workspace state.
4. The renderer can write selected-channel changes back through a narrow API.
5. In built mode, the server also serves the static renderer bundle.
6. Future phases will expand this beyond shell persistence into real transcript
   and channel storage.

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Renderer | React + Vite | Operator-facing workspace UI |
| Product app | Node.js + TypeScript | Product-facing backend shell |
| Runtime boundary | `cats-runtime` | Stable runtime contract |
| Runtime backend | `agent-fleet` | Phase 1 execution backend |
| Testing | `node:test` | Lightweight smoke and integration tests |

## Design Patterns

- Hexagonal boundary at the runtime edge: `cats-inc` depends on a runtime client
  interface, not `agent-fleet`
- Dependency injection by constructor or factory parameter
- Explicit shell payloads over hidden process state
- Renderer-first UI iteration with desktop packaging deferred

## API Design

- See [api.md](./api.md)

## Key Decisions

- [ADR-001](./decisions/001-use-cats-runtime-boundary.md): use `cats-runtime`
  as the only runtime boundary
- [ADR-002](./decisions/002-react-vite-renderer-before-electron.md): use
  React/Vite before adding a desktop shell

---

*Last updated: 2026-03-11*

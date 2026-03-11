# System Architecture

> Technical architecture and design decisions for `cats-inc`.

## Overview

`cats-inc` is the product-facing application layer for the cats initiative. In
phase 1 it exposes a minimal HTTP shell, reaches runtime state through
`cats-runtime`, and keeps the future workspace model explicit in its payloads.

## Architecture Diagram

```text
┌───────────────────────────┐
│     cats-inc clients      │
│   (future web product)    │
└──────────────┬────────────┘
               │ HTTP
               ▼
┌───────────────────────────┐
│         cats-inc          │
│  config + server + shell  │
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

- **Purpose**: Publish the first product-facing HTTP contract
- **Technology**: Native `node:http`
- **Responsibilities**: Serve `/health` and `/api/app-shell`

### Workspace Shell Model

- **Purpose**: Describe the initial product contract for the future workspace UI
- **Technology**: Plain TypeScript data structures
- **Responsibilities**: Expose workspace, orchestrator, and capability state

## Data Flow

1. A client calls `cats-inc` over HTTP.
2. The server asks the runtime client for current `cats-runtime` health.
3. The server returns either a service health payload or a bootstrap app-shell
   payload.
4. Future phases will replace the bootstrap shell with persistent channel data.

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Product app | Node.js + TypeScript | Product-facing backend shell |
| Runtime boundary | `cats-runtime` | Stable runtime contract |
| Runtime backend | `agent-fleet` | Phase 1 execution backend |
| Testing | `node:test` | Lightweight smoke and integration tests |

## Design Patterns

- Hexagonal boundary at the runtime edge: `cats-inc` depends on a runtime client
  interface, not `agent-fleet`
- Dependency injection by constructor or factory parameter
- Explicit shell payloads over hidden process state

## API Design

- See [api.md](./api.md)

## Key Decisions

- [ADR-001](./decisions/001-use-cats-runtime-boundary.md): use `cats-runtime`
  as the only runtime boundary

---

*Last updated: 2026-03-11*

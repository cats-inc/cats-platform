# Cats

> The flagship suite app from Cats Inc.

## Overview

`Cats` is the long-term Node.js/TypeScript flagship suite application for the
Cats suite. It talks to `cats-runtime` as its execution boundary and keeps the
product model in this repo rather than inheriting it from earlier prototypes.

`Cats Inc` remains the umbrella brand. `Cats` is the suite product name, and
`cats-runtime` remains the runtime boundary.

The current slices are:

- a Node app/runtime core on `CATS_PORT` (default `8181`, with `CATS_INC_PORT`
  kept as a compatibility alias)
- a `cats-runtime` health and app-shell API
- a chat-first `React/Vite` renderer with a route-gated setup wizard, settings
  surfaces, and a preview-ready side pane
- file-backed chat state, cat execution, and transcript persistence
- runtime-backed channel activation, mode-aware sleep/wake entry, and routed messaging through `cats-runtime`
- a global orchestrator surface, direct-cat routing, deterministic `@mention`
  handling, transcript export, visible presence states, and machine-readable
  room-routing / wake-request state
- `My Cats` private-lane entry that reopens an existing direct room or opens a
  direct draft lane when needed
- a transcript-adjacent operator loop with pending approvals, progress,
  activity, trace, and run inspection surfaces
- a Telegram Boss Cat inbox bridge with durable inbox-to-room links, webhook diagnostics, and transport-owned reply delivery
- provider-agnostic cat memory checkpoints plus channel-scoped execution leases

## Current Status

- [x] Bootstrap `cats/` from `project-bootstrap`
- [x] Establish `cats-runtime` as the only runtime boundary
- [x] Add a minimal Node/TypeScript HTTP entrypoint and smoke tests
- [x] Choose `React/Vite` as the initial renderer approach
- [x] Add the first multi-channel chat UI shell
- [x] Add initial file-backed chat-state persistence
- [x] Add local channel setup and persistence
- [x] Add basic runtime-backed channel operations
- [x] Add a global cat registry, chat assignment, mention routing, and transcript export
- [x] Separate cat identity and memory from provider-specific execution state
- [x] Add first-run `/setup` onboarding with default Boss Cat bootstrap and
      chat-first entry routing
- [x] Land chat session sleep/wake lifecycle, direct Cat chat defaults, stable
      room-routing / wake semantics, and room-header presence indicators
- [x] Land Cat-private room entry from `My Cats` plus Telegram binding markers
      without auto-persisting new direct rooms
- [x] Land transcript-adjacent operator approvals, progress, activity, and run
      inspection surfaces
- [ ] Add productization layers beyond the current Phase 2 chat core

## Still Open

The current implementation has closed the main phase-2 product gaps, but
several Phase 3 items remain:

- richer orchestrator automation beyond explicit `@mention` routing
- split-view chat surfaces for preview/debug context
- deeper owner approval semantics, acknowledge/retry hooks, automatic resume
  after decisions, and richer live runtime state
- richer first-run remediation and packaged onboarding beyond the current
  three-screen setup flow
- offline transcript normalization and ingestion handoff hooks
- desktop host, LINE entrypoints, and richer Telegram room-rotation policy

## Quick Start

```bash
cd cats
cp .env.example .env
npm install
npm run dev:server
# in a second terminal
npm run dev:web
```

Default endpoints:

- App API: `http://127.0.0.1:8181`
- Renderer dev server: `http://127.0.0.1:5173`
- Runtime dependency: `http://127.0.0.1:3110`

The chat shell persists local state, including created channels,
global cats, channel cat assignments, execution targets, execution
lease metadata, memory checkpoints, and transcripts, to
`config/chat-state.local.json` unless `CATS_STATE_PATH` overrides it.
`CATS_INC_STATE_PATH` is still accepted as a temporary compatibility alias.

For a built run:

```bash
npm run build
npm start
```

The Node server will serve the built web UI from `dist/` when available.

## Documentation

See [docs/](./docs/) for project details:

- [Requirements](./docs/requirements.md)
- [Architecture](./docs/architecture.md)
- [API](./docs/api.md)
- [Setup Guide](./docs/setup-guide.md)
- [Testing](./docs/testing.md)
- [Contributing](./CONTRIBUTING.md)

## Project Structure

```text
cats/
├── src/app/       # Suite-level server and renderer assembly
├── src/products/  # Product slices such as Cats Chat
├── src/shared/    # Types shared by server and renderer
├── tests/         # Node built-in test runner coverage
├── docs/          # Product, API, architecture, and delivery docs
├── scripts/       # Cross-platform project automation scripts
├── config/        # Future app and orchestration config
└── assets/        # Future product assets
```

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE).

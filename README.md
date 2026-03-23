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
  activity, trace, run inspection, approve/reroute/retry/acknowledge action
  seams, and machine-readable delivery/budget/workflow governance summaries
- contract-first orchestrator planning, approval-gated dispatch, and
  execution-loop routes that now expose checkpoint-driven multi-step execution
  plans, recovery actions, and Team 6 MCP tool-plane metadata while staying
  above the existing direct `cats-runtime` API path
- an Electron desktop host that now supervises local `cats-runtime` + `cats`,
  can produce a real Windows NSIS installer, stages cross-platform packaging
  outputs, persists host-readable bootstrap state, keeps the bootstrap bridge
  sandboxed, supports tray/background lifecycle, and owns the packaged
  bootstrap/remediation seam plus a manual-check update skeleton
- a Telegram Boss Cat inbox bridge with durable inbox-to-room links, webhook diagnostics, and transport-owned reply delivery
- product-owned per-Cat companion box sidecar storage, Cat-scoped ingestion APIs,
  direct companion-session hydration metadata, and Cats-owned retrieval context
- Cats-owned canonical memory extraction, source-scoped promotion rules,
  companion source update/delete convergence, policy-aware retrieval assembly,
  auto-synced companion mutations plus curated cat/owner durable notes, and
  pre-reset / pre-compaction flush payloads for companion, owner, and channel
  memory
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
- [x] Land machine-readable governance/workflow summaries for approval,
      delivery, budget, reroute, retry, and workflow continuation contracts
- [x] Land product-owned companion box storage, Cat-scoped ingest/read routes,
      and direct companion-session hydration contracts without visible UI
      changes
- [x] Land the first Electron desktop-host slice with app-managed readiness,
      local sidecar supervision, and bootstrap prerequisite checks
- [x] Land Cats-owned canonical memory records, retrieval context assembly, and
      memory flush seams without adding an external RAG dependency; curated
      cat/owner notes plus companion source mutations now sync into canonical
      retrieval, carry lineage-aware flush payloads, and replace stale hits
- [ ] Add productization layers beyond the current Phase 2 chat core

## Still Open

The current implementation has closed the main phase-2 product gaps, but
several Phase 3 items remain:

- richer orchestrator automation beyond explicit `@mention` routing
- split-view chat surfaces for preview/debug context
- polling-first Telegram onboarding so bot-token setup does not require public
  ingress by default
- automatic resume after owner or incident decisions, richer live runtime
  state, and deeper converge/group planning beyond the current execution-loop
  and action seams
- richer first-run remediation polish, branded/signed release assets, and
  host-managed provider install/resume flows beyond the current Windows
  NSIS-first packaging substrate
- offline transcript normalization and ingestion handoff hooks
- richer semantic indexing and archive export beyond the current local
  canonical-memory and retrieval substrate
- LINE entrypoints, richer Telegram room-rotation policy, and fuller desktop
  packaging beyond the current host slice

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

For the desktop-host slice:

```bash
npm run desktop:start
```

That command builds `dist-server/`, `dist/`, and `dist-electron/`, then starts
the Electron host that supervises local `cats-runtime` and `cats` sidecars.

For staged packaging outputs:

```bash
npm run desktop:stage
```

That command keeps the self-hosted npm path intact while generating
cross-platform packaging manifests under `build/desktop-packaging/`.

For a real Windows installer:

```bash
npm run desktop:package:windows
```

That command builds `cats-runtime`, builds `cats`, stages bundled sidecars, and
produces an NSIS installer under `release/`.

For a post-install validation pass on Windows:

```powershell
.\scripts\windows\Test-WindowsInstallerSmoke.ps1
```

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
├── electron/      # Electron desktop host bootstrap and supervision
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

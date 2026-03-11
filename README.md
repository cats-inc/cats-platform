# cats-inc

> Next-generation chat and workspace product shell for the cats initiative.

## Overview

`cats-inc` is the long-term Node.js/TypeScript product application that will
replace `agent-workspace-poc` as the main product shell. It keeps
`agent-workspace-poc` as a behavior reference, but it talks to `cats-runtime`
instead of binding directly to `agent-fleet`.

The current slices are:

- a Node app/runtime core on `CATS_INC_PORT` (default `8181`)
- a `cats-runtime` health and app-shell API
- a `React/Vite` renderer that consumes the workspace shell
- file-backed workspace, member, and transcript persistence
- runtime-backed channel activation and routed messaging through `cats-runtime`
- a global orchestrator surface, basic `@mention` routing, and transcript export

## Current Status

- [x] Bootstrap `cats-inc/` from `project-bootstrap`
- [x] Establish `cats-runtime` as the only runtime boundary
- [x] Add a minimal Node/TypeScript HTTP entrypoint and smoke tests
- [x] Choose `React/Vite` as the initial renderer approach
- [x] Add the first multi-channel workspace UI shell
- [x] Add initial file-backed workspace state persistence
- [x] Add local channel setup and persistence
- [x] Add basic runtime-backed channel operations
- [x] Add participant management, mention routing, and transcript export
- [ ] Add richer orchestrator automation and productization layers

## Quick Start

```bash
cd cats-inc
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

The workspace shell persists local state, including created channels, members,
session metadata, and transcripts, to
`config/workspace-state.local.json` unless `CATS_INC_STATE_PATH` overrides it.

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
cats-inc/
├── src/server*    # Node/TS app core and runtime-facing API
├── src/renderer/  # React/Vite workspace shell
├── src/shared/    # Types shared by server and renderer
├── tests/         # Node built-in test runner coverage
├── docs/          # Product, API, architecture, and delivery docs
├── scripts/       # Cross-platform project automation scripts
├── config/        # Future app and orchestration config
└── assets/        # Future product assets
```

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE).

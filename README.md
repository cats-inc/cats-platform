# cats-inc

> Next-generation chat and workspace product shell for the cats initiative.

## Overview

`cats-inc` is the long-term Node.js/TypeScript product application that will
replace `agent-workspace-poc` as the main product shell. It keeps
`agent-workspace-poc` as a behavior reference, but it talks to `cats-runtime`
instead of binding directly to `agent-fleet`.

The first slice in this subproject is intentionally small:

- a minimal HTTP service on `CATS_INC_PORT` (default `8181`)
- a `cats-runtime` health adapter
- an initial app-shell endpoint that describes the future workspace contract

## Current Status

- [x] Bootstrap `cats-inc/` from `project-bootstrap`
- [x] Establish `cats-runtime` as the only runtime boundary
- [x] Add a minimal Node/TypeScript HTTP entrypoint and smoke tests
- [ ] Build the real multi-channel workspace UI and persistence model
- [ ] Recreate `agent-workspace-poc` product behaviors on this new stack

## Quick Start

```bash
cd cats-inc
cp .env.example .env
npm install
npm run build
npm start
```

Default endpoints:

- App: `http://127.0.0.1:8181`
- Runtime dependency: `http://127.0.0.1:3110`

The app assumes `cats-runtime` is already running. In phase 1,
`cats-runtime` still depends on `agent-fleet`.

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
├── src/           # Node/TS entrypoint, runtime client, workspace shell
├── tests/         # Node built-in test runner coverage
├── docs/          # Product, API, architecture, and delivery docs
├── scripts/       # Cross-platform project automation scripts
├── config/        # Future app and orchestration config
└── assets/        # Future product assets
```

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE).

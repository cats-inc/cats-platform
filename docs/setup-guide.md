# Setup Guide

> Environment setup and installation instructions for `Cats`.

## Prerequisites

- Node.js 22+
- npm 11+
- `cats-runtime` running on `http://127.0.0.1:3110`

## Installation

### 1. Prepare the project

```bash
cd cats
cp .env.example .env
```

### 2. Install dependencies

```bash
npm install
```

### 3. Verify installation

```bash
npm test
```

## Running the Project

### Development

```bash
npm run dev:server
# in a second terminal
npm run dev:web
```

Open:

- Renderer: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:8181/health`

### Built Run

```bash
npm run build
npm start
```

The built Node server serves the static UI from `dist/`.
By default local chat state is stored in `config/chat-state.local.json`.
That file now holds channels, cats, execution targets, execution lease
metadata, memory checkpoints, and transcripts.
The checked-in starter state is empty, so the renderer does not open with any
default or mock chats.

## Common Issues

### Issue 1: `/health` returns `503`

**Solution**: Confirm `cats-runtime` is running and `CATS_RUNTIME_BASE_URL` is
correct.

### Issue 2: Runtime still unavailable even though `cats-runtime` is up

**Solution**: Verify the chosen provider CLI is installed and reachable from
the `cats-runtime` process, and confirm any required local session directories
or databases are accessible.

### Issue 3: Renderer cannot load app-shell data

**Solution**: Ensure `npm run dev:server` is running. Vite proxies `/api` to the
Node server on port `8181`.

### Issue 4: Channel selection or creation does not persist

**Solution**: Check whether `CATS_STATE_PATH` points to a writable file
location. `CATS_INC_STATE_PATH` is still accepted as a compatibility alias. If
unset, the app uses `config/chat-state.local.json`.

### Issue 5: Channel activation fails immediately

**Solution**: Confirm `cats-runtime` is reachable, then verify the chosen
provider/model execution target is supported by the runtime backend. Activation
errors are also persisted into the channel transcript.

---

*Last updated: 2026-03-13*


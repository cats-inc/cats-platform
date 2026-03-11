# Setup Guide

> Environment setup and installation instructions for `cats-inc`.

## Prerequisites

- Node.js 22+
- npm 11+
- `cats-runtime` running on `http://127.0.0.1:3110`

## Installation

### 1. Prepare the project

```bash
cd cats-inc
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
By default local workspace state is stored in `config/workspace-state.local.json`.
That file now holds channels, members, runtime session metadata, and transcripts.

## Common Issues

### Issue 1: `/health` returns `503`

**Solution**: Confirm `cats-runtime` is running and `CATS_RUNTIME_BASE_URL` is
correct.

### Issue 2: Runtime still unavailable even though `cats-runtime` is up

**Solution**: In phase 1, `cats-runtime` still depends on `agent-fleet`. Check
that both services are available.

### Issue 3: Renderer cannot load app-shell data

**Solution**: Ensure `npm run dev:server` is running. Vite proxies `/api` to the
Node server on port `8181`.

### Issue 4: Channel selection or creation does not persist

**Solution**: Check whether `CATS_INC_STATE_PATH` points to a writable file
location. If unset, the app uses `config/workspace-state.local.json`.

### Issue 5: Channel activation fails immediately

**Solution**: Confirm `cats-runtime` is reachable, then verify the chosen
provider/model pair is supported by the runtime backend. Activation errors are
also persisted into the channel transcript.

---

*Last updated: 2026-03-11*

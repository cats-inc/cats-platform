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

### Optional: auto-start local cats with Tailscale Funnel or ngrok for webhook mode

For self-hosted Telegram webhook development, `cats` now includes helper
scripts that can:

- build the project
- create a login auto-start runner
- start the built local `cats` server
- ensure a public ingress provider is available

They still do **not** register Telegram webhooks. Webhook lifecycle stays in
`Settings > Cats`.

Current reality:

- the shipped Telegram MVP is still webhook-based
- the accepted follow-on direction is to add polling-first setup so Telegram
  can work without any public URL
- until that polling slice lands, these helpers remain the local path for
  webhook-mode Telegram development

Choose the helper for your platform and ingress provider:

```powershell
# Windows
.\scripts\windows\Setup-TailscaleFunnel.ps1 -Install
.\scripts\windows\Setup-TailscaleFunnel.ps1 -Verify
.\scripts\windows\Setup-TailscaleFunnel.ps1 -Remove

.\scripts\windows\Setup-NgrokTunnel.ps1 -Install
.\scripts\windows\Setup-NgrokTunnel.ps1 -Verify
.\scripts\windows\Setup-NgrokTunnel.ps1 -Remove
```

```bash
# Linux
./scripts/linux/setup-tailscale-funnel.sh install
./scripts/linux/setup-tailscale-funnel.sh verify
./scripts/linux/setup-tailscale-funnel.sh remove

./scripts/linux/setup-ngrok-tunnel.sh install
./scripts/linux/setup-ngrok-tunnel.sh verify
./scripts/linux/setup-ngrok-tunnel.sh remove

# macOS
./scripts/macos/setup-tailscale-funnel.sh install
./scripts/macos/setup-tailscale-funnel.sh verify
./scripts/macos/setup-tailscale-funnel.sh remove

./scripts/macos/setup-ngrok-tunnel.sh install
./scripts/macos/setup-ngrok-tunnel.sh verify
./scripts/macos/setup-ngrok-tunnel.sh remove
```

Requirements:

- Node.js and npm installed
- local cats port configured through `CATS_PORT` or `CATS_INC_PORT`
- for Tailscale:
  - Tailscale installed
  - `tailscale up` already completed
  - optional `TAILSCALE_HTTPS_PORT` in `.env`
- for ngrok:
  - ngrok installed
  - optional `CATS_NGROK_AUTHTOKEN` / `CATS_NGROK_DOMAIN` in `.env`

Recommended webhook-mode flow:

1. Run the helper for your platform and provider
2. Let the helper register login auto-start for built `cats` + ingress
3. Use `Settings > Cats` to manage Telegram bot bindings
4. Let the product own webhook registration and diagnostics

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

### Desktop Host Run

The first Electron host slice now wraps the same local `cats` + `cats-runtime`
process topology:

```bash
npm run desktop:start
```

Platform wrappers:

```powershell
.\scripts\windows\Start-DesktopHost.ps1
```

```bash
./scripts/linux/start-desktop-host.sh
./scripts/macos/start-desktop-host.sh
```

What this does:

- builds `cats` server, web bundle, and Electron host assets
- starts `cats-runtime` in `app-managed` mode
- starts `cats` in `app-managed` mode
- waits for both `/health` readiness contracts
- runs a lightweight prerequisite scan before opening chat or setup

The host bootstrap page is intentionally separate from the React setup wizard.
It is the desktop-owned seam for:

- local service supervision
- prerequisite and provider remediation messaging
- later packaged install/resume flows

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

### Issue 6: Telegram needs a public webhook URL during local development

**Solution**: The current Telegram MVP is webhook-based, so run one of the
startup helpers from `scripts/windows/`, `scripts/linux/`, or
`scripts/macos/` if you want local webhook development. Tailscale Funnel is
the cheaper default; ngrok is also supported. The helper can keep the local
built `cats` server and public ingress alive at login. Webhook registration is
still product-owned and should be managed from `Settings > Cats`.

Longer-term direction: polling-first Telegram setup should remove this public
URL requirement for the default onboarding path, while keeping these helpers as
an optional advanced mode.

### Issue 7: Desktop host fails before showing the bootstrap page

**Solution**: Confirm these built assets exist:

- `dist-server/index.js`
- `dist/index.html`
- `dist-electron/main.js`
- sibling `../cats-runtime/dist/index.js`

If you changed any desktop-host paths, re-check the corresponding
`CATS_DESKTOP_*` overrides.

---

*Last updated: 2026-03-23*

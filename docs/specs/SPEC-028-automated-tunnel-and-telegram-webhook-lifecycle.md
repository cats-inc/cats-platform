# SPEC-028: Automated Tunnel and Telegram Webhook Lifecycle

> Automate public URL tunnel management and Telegram webhook registration
> so operators can set up Telegram by entering a bot token in the UI
> without touching a terminal.

## Status

Draft (Pending Review)

## Related

- [ADR-029](../decisions/029-automate-tunnel-and-telegram-webhook-registration.md)
- [ADR-016](../decisions/016-treat-telegram-as-boss-cat-inbox-not-room-mirror.md)
- [ADR-028](../decisions/028-allow-multiple-public-bot-bindings-with-one-boss-cat.md)
- [SPEC-014](./SPEC-014-telegram-boss-cat-relay-mvp.md)
- [SPEC-017](./SPEC-017-telegram-inbox-and-room-routing.md)

## Problem

The current Telegram setup requires the operator to:

1. Run `ngrok` or `cloudflared` manually in a separate terminal
2. Copy the generated public URL
3. Run a `curl` command to call Telegram's `setWebhook` API
4. Paste the URL, bot token, and secret into the correct format

This is unacceptable for non-technical users and violates the product's
deployment goal of "simple install + guided setup = ready to use."

## Goals

- Operator enters a Telegram bot token in the Settings UI and clicks one
  button — tunnel starts, webhook registers, messages start flowing
- Server startup with existing bindings re-establishes the tunnel and
  re-registers webhooks automatically
- Clear status feedback in the UI at every step
- Graceful degradation when tunnel or registration fails

## Non-Goals

- Production reverse proxy configuration (handled by deployment, not
  this spec)
- Alternative tunnel providers beyond ngrok in the first slice
- Telegram long polling mode
- LINE or other transport tunnels (same pattern, future spec)

## User Stories

- As an operator, I want to set up Telegram by pasting my bot token into
  Settings so I do not need to use a terminal or understand webhooks.
- As an operator, I want the product to reconnect Telegram automatically
  when I restart the server so I do not need to re-register anything.
- As an operator, I want to see whether Telegram is connected, degraded,
  or failed in the UI so I know if something is wrong.

## Requirements

### Functional Requirements

#### Tunnel Management

1. When `CATS_TUNNEL_ENABLED=true` and `CATS_TUNNEL_AUTHTOKEN` is set,
   the server shall start an ngrok tunnel on startup.
2. The tunnel shall expose the cats HTTP server port to a public HTTPS
   URL.
3. The public URL shall be stored in runtime state and available to
   transport bindings.
4. If `CATS_TUNNEL_DOMAIN` is set (paid ngrok), the tunnel shall use
   that fixed domain.
5. If `CATS_PUBLIC_URL` is set (cloud/production deployment), the
   product shall use that URL directly and skip tunnel creation.
6. The tunnel shall stop when the server shuts down.
7. If the tunnel fails to start, the server shall still run but mark
   transport bindings as degraded.
8. The tunnel URL shall be visible in the Settings UI and in the
   sidebar footer runtime status tooltip.

#### Webhook Auto-Registration

9. When a Telegram bot binding is created with a valid bot token and a
   public URL is available (tunnel or `CATS_PUBLIC_URL`), the product
   shall automatically call Telegram's `setWebhook` API.
10. The webhook URL shall be:
    `<public_url>/api/transports/telegram/webhook/<bindingId>`
11. The `secret_token` parameter shall be the binding's webhook secret.
    If no secret was provided during creation, the product shall
    auto-generate one.
12. On server startup, the product shall re-register webhooks for all
    active Telegram bindings that have bot tokens.
13. When a Telegram binding is disabled or deleted, the product shall
    call Telegram's `deleteWebhook` API.
14. When the tunnel URL changes (e.g., ngrok free tier restart), the
    product shall re-register all active webhooks with the new URL.
15. Webhook registration success or failure shall be recorded per
    binding and visible in the Settings UI.

#### Environment Configuration

16. Required env vars for development Telegram:
    - `CATS_TUNNEL_ENABLED=true`
    - `CATS_TUNNEL_AUTHTOKEN=<ngrok authtoken>`
17. Optional env vars:
    - `CATS_TUNNEL_DOMAIN=<fixed ngrok domain>` (paid plans)
    - `CATS_PUBLIC_URL=<url>` (production, skips tunnel)
18. Bot tokens are stored per-binding in the app state, not in `.env`.

#### UI Feedback

19. Settings > Cats > Telegram section shall show:
    - Tunnel status (active / inactive / failed)
    - Current public URL when tunnel is active
    - Webhook registration status per binding (registered / failed /
      pending)
    - A "Reconnect" button to manually retry tunnel + webhook
20. The sidebar footer runtime status tooltip shall include tunnel
    status when transport bindings exist.
21. When tunnel authtoken is missing but a Telegram binding exists, the
    UI shall show a clear message explaining what to add to `.env`.

### Non-Functional Requirements

- **Startup latency**: tunnel connection should not block server
  readiness for local-only features. Tunnel and webhook registration
  should happen asynchronously after the HTTP server is listening.
- **Resilience**: tunnel disconnection should not crash the server.
  The product should attempt reconnection and update binding status.
- **Security**: bot tokens and webhook secrets must not be logged in
  plaintext. Tunnel authtoken must not be exposed to the renderer.
- **Dependency scope**: `@ngrok/ngrok` should be an optional dependency
  that is only loaded when `CATS_TUNNEL_ENABLED=true`.

## Proposed Architecture

```text
.env
  CATS_TUNNEL_ENABLED=true
  CATS_TUNNEL_AUTHTOKEN=xxx

Server startup
  |
  v
Start HTTP server (local)
  |
  v
TunnelService.start(port)
  |
  +--> @ngrok/ngrok connect
  |       |
  |       v
  |    Public URL available
  |       |
  |       v
  |    WebhookRegistrar.registerAll(bindings, publicUrl)
  |       |
  |       +--> POST api.telegram.org/bot<TOKEN>/setWebhook
  |       |       url=<publicUrl>/api/transports/telegram/webhook/<bindingId>
  |       |       secret_token=<secret>
  |       |
  |       +--> Update binding status: registered / failed
  |
  +--> Tunnel failed: log warning, mark transport degraded

Settings UI: "Add Telegram Bot"
  |
  v
POST /api/bot-bindings { botToken, ... }
  |
  v
Server creates binding + calls WebhookRegistrar.register(binding, publicUrl)
  |
  v
Returns binding with webhook registration status
```

## Proposed Components

### TunnelService (`src/platform/tunnel/`)

- `startTunnel(config)`: starts ngrok, returns public URL
- `stopTunnel()`: closes ngrok connection
- `getTunnelUrl()`: returns current public URL or null
- Emits events: `tunnel:connected`, `tunnel:disconnected`,
  `tunnel:error`

### WebhookRegistrar (`src/platform/transports/telegram/webhook.ts`)

- `registerWebhook(binding, publicUrl)`: calls Telegram setWebhook
- `deleteWebhook(binding)`: calls Telegram deleteWebhook
- `registerAll(bindings, publicUrl)`: batch register on startup
- Returns registration result with success/failure per binding

### Config Extension

```ts
interface TunnelConfig {
  enabled: boolean;
  authtoken: string | null;
  domain: string | null;
  publicUrl: string | null; // CATS_PUBLIC_URL override
}
```

## Open Questions

- Should the tunnel auto-start only when bindings exist, or always when
  `CATS_TUNNEL_ENABLED=true`?
- Should webhook re-registration on tunnel URL change be immediate or
  debounced?
- Should the product validate the bot token with Telegram's `getMe` API
  before attempting webhook registration?
- When Electron ships, should tunnel management move to the host process?

## Acceptance Criteria

- Operator can set up Telegram entirely through Settings UI (no terminal
  commands)
- Server startup with existing bindings re-establishes tunnel and
  webhooks automatically
- Tunnel failure does not crash the server
- Settings UI shows tunnel URL, webhook status, and actionable errors
- `.env.example` documents all tunnel-related env vars
- Bot tokens are not logged in plaintext
- Tests cover: tunnel start/stop, webhook register/delete/re-register,
  missing authtoken, tunnel failure, binding lifecycle

---

*Created: 2026-03-23*
*Author: Claude*

# ADR-029: Automate Tunnel and Telegram Webhook Registration

> The product should handle public URL exposure and Telegram webhook
> registration automatically so operators never need to run curl commands
> or manually configure external APIs.

## Status

Draft (Pending Review)

## Date

2026-03-23

## Context

The current Telegram integration requires operators to:

1. Manually run `ngrok` or `cloudflared` to expose the local server
2. Copy the public URL
3. Run a `curl` command against `https://api.telegram.org/bot<TOKEN>/setWebhook`
   to register the webhook

This violates the core product principle that non-technical users should be able
to install and use `cats` without developer tooling. The setup wizard and
Settings UI already collect the bot token — the product should use that token
to complete the webhook registration automatically.

Additionally, `cats` runs as a local server that is not publicly reachable by
default. Telegram requires a public HTTPS URL to deliver webhook updates.
The product must solve this without asking the operator to understand
networking, DNS, or reverse proxies.

## Decision

`cats` will automate both tunnel creation and Telegram webhook registration.

### 1. Tunnel Automation

The product will manage a public tunnel as part of server startup when
transport bindings require external reachability.

- Use `@ngrok/ngrok` Node.js SDK for the first implementation
- The operator provides an ngrok authtoken via `.env`
  (`CATS_TUNNEL_AUTHTOKEN`)
- The tunnel starts automatically when the server starts and at least one
  active transport binding exists (or when explicitly enabled)
- The tunnel URL is stored in runtime state and used for webhook
  registration
- The tunnel lifecycle is tied to the server process — it starts and stops
  with the server
- If the tunnel fails to start, the server still runs but transport
  bindings are marked as degraded
- Future slices may support alternative tunnel providers (Cloudflare,
  localhost.run) behind the same configuration seam

### 2. Webhook Auto-Registration

When a Telegram bot binding is created or updated with a valid bot token,
the product will automatically call the Telegram Bot API to register the
webhook.

- Call `POST https://api.telegram.org/bot<TOKEN>/setWebhook` with:
  - `url`: `<tunnel_public_url>/api/transports/telegram/webhook/<bindingId>`
  - `secret_token`: the binding's webhook secret (auto-generated if not
    provided)
- Registration happens:
  - When a bot binding is created via the Settings UI
  - When the server starts and an active binding exists with a tunnel URL
  - When the tunnel URL changes (ngrok may assign a new URL on restart
    with free tier)
- If registration fails, the binding status should reflect the failure
  and the Settings UI should show a clear error
- The product should call `deleteWebhook` when a binding is disabled or
  deleted

### 3. Environment Configuration

```env
# Tunnel (required for Telegram in development)
CATS_TUNNEL_ENABLED=true
CATS_TUNNEL_AUTHTOKEN=<ngrok authtoken>
# Optional: fixed domain for paid ngrok plans
CATS_TUNNEL_DOMAIN=

# Telegram bot tokens are stored per-binding in the UI,
# not in .env — no additional env vars needed for Telegram.
```

### 4. Server Startup Flow

```text
Server starts
    |
    v
Load active transport bindings from state
    |
    +--> No active bindings with bot tokens -> skip tunnel
    |
    +--> Active bindings exist + CATS_TUNNEL_ENABLED=true
            |
            v
         Start ngrok tunnel
            |
            +--> Success: store public URL in runtime state
            |       |
            |       v
            |    For each active Telegram binding:
            |       call setWebhook with tunnel URL
            |
            +--> Failure: log warning, mark transport as degraded
```

### 5. UI Integration

The Settings > Cats > Telegram section should:

- Show the current tunnel URL when active
- Show webhook registration status (registered / failed / pending)
- Allow manual re-registration if needed (a "Reconnect" button)
- Show a clear error if the tunnel is not running or authtoken is missing
- Not require the operator to touch any external tool or terminal

## Consequences

### Positive

- Non-technical operators can set up Telegram by entering a bot token in
  the UI — no curl, no ngrok CLI, no webhook URL copy-paste
- The product controls the full lifecycle: tunnel start → webhook register
  → message receive → reply deliver
- Tunnel URL changes on restart are handled automatically
- Same pattern extends to LINE and future transports

### Negative

- Adds `@ngrok/ngrok` as a runtime dependency
- Free ngrok tier assigns random URLs on each restart, causing brief
  downtime until re-registration completes
- Network failures in tunnel or webhook registration need graceful
  degradation and clear UI feedback
- Paid ngrok plans are needed for stable custom domains in production

### Neutral

- This ADR does not decide the production deployment model (where a real
  reverse proxy replaces ngrok)
- This ADR does not decide whether tunnel management should live in
  `cats` or in a future Electron host process
- The tunnel is a development/self-hosted convenience — cloud deployments
  would use a real public URL via `CATS_PUBLIC_URL` env var instead of
  a tunnel

## Alternatives Considered

### Alternative 1: Require operators to run ngrok manually

- **Pros**: no new dependency, no tunnel management code
- **Cons**: violates the "non-technical user" deployment goal; requires
  terminal, curl, and URL copy-paste
- **Why rejected**: unacceptable UX for the target audience

### Alternative 2: Use Telegram long polling instead of webhooks

- **Pros**: no public URL needed, no tunnel needed
- **Cons**: higher latency, more complex polling lifecycle, doesn't
  match the existing webhook-based relay architecture
- **Why rejected**: webhook is the standard approach and already
  implemented

### Alternative 3: Use cloudflared instead of ngrok

- **Pros**: free, no account needed for basic tunnels
- **Cons**: requires cloudflared binary installed, less mature Node.js
  SDK, harder to manage lifecycle programmatically
- **Why rejected for first slice**: ngrok has a mature Node.js SDK;
  cloudflared can be added as an alternative later

## References

- [ADR-016](./016-treat-telegram-as-boss-cat-inbox-not-room-mirror.md)
- [ADR-028](./028-allow-multiple-public-bot-bindings-with-one-boss-cat.md)
- [SPEC-014](../specs/SPEC-014-telegram-boss-cat-relay-mvp.md)
- [SPEC-017](../specs/SPEC-017-telegram-inbox-and-room-routing.md)
- [SPEC-028](../specs/SPEC-028-automated-tunnel-and-telegram-webhook-lifecycle.md)
- ngrok Node.js SDK: https://github.com/ngrok/ngrok-nodejs

---

*Draft: 2026-03-23*
*Author: Claude*

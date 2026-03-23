# ADR-029: Keep public ingress external while Cats owns Telegram webhook lifecycle

> The product should own Telegram webhook registration and diagnostics, while
> public HTTPS ingress may be prepared outside the server process.

## Status

Draft (Pending Review)

## Date

2026-03-23

## Context

The current Telegram experience still has two separate problems:

1. A local `cats` server is not publicly reachable by default, so Telegram
   cannot deliver webhook updates until the operator provides a public HTTPS
   URL.
2. Once a public URL exists, operators should not need to manually call
   Telegram `setWebhook` / `deleteWebhook` with curl or raw API requests.

These concerns do not need to live in the same implementation surface.
The product can keep webhook lifecycle in `cats`, while using an external
public ingress helper for the first slice.

This also aligns better with the current packaging boundary from ADR-021:
bootstrap/setup helpers may live outside the core server process, while the
product UI/API remains responsible for user-facing integration lifecycle.

## Decision

`cats` will treat public ingress as an external prerequisite and will own the
Telegram webhook lifecycle inside the product UI/API.

### 1. Public ingress stays outside the server process

The first slice will not start or stop tunnels from the `cats` server.
Instead, operators provide a public HTTPS base URL by one of these means:

- an operator-managed reverse proxy or cloud deployment URL
- an operator-run helper script such as:
  - `scripts/windows/Setup-TailscaleFunnel.ps1`
  - `scripts/windows/Setup-NgrokTunnel.ps1`
  - `scripts/linux/setup-tailscale-funnel.sh`
  - `scripts/linux/setup-ngrok-tunnel.sh`
  - `scripts/macos/setup-tailscale-funnel.sh`
  - `scripts/macos/setup-ngrok-tunnel.sh`
- a future packaged host-managed ingress helper

The helper scripts may prepare a public URL for local/self-hosted use, but they
remain intentionally separate from the Telegram webhook flow.

### 2. Webhook lifecycle is product-owned

When a Telegram bot binding is created or updated with a valid bot token and a
public HTTPS base URL is available, `cats` will register the webhook through
the product-owned Settings UI/API flow.

- Call `POST https://api.telegram.org/bot<TOKEN>/setWebhook` with:
  - `url`: `<public_url>/api/transports/telegram/webhook/<bindingId>`
  - `secret_token`: the binding's webhook secret
- Call `deleteWebhook` when a binding is deleted or disabled
- Record success/failure per binding and surface it in Settings
- Allow manual re-registration from Settings

### 3. Token uniqueness is required

Telegram only allows one active webhook per bot token. Therefore, the same
Telegram bot token must be unique per `cats` environment.

The first slice should reject duplicate bindings that reuse the same bot token
instead of letting bindings overwrite one another.

### 4. UI integration

Settings > Cats > Telegram should:

- show whether a usable public URL is currently known
- show the effective webhook base path when available
- show webhook registration status per binding
- offer an explicit reconnect / retry action
- explain when the operator still needs to run an external ingress helper

## Consequences

### Positive

- webhook lifecycle stays product-owned, visible, and retryable from the UI
- `cats` avoids adding a tunnel SDK/runtime dependency in the first slice
- self-hosted operators can use Tailscale Funnel or ngrok without embedding
  either provider directly into the cats server
- the same webhook flow can later work with helper scripts, packaged hosts, or
  real deployment URLs without changing binding semantics

### Negative

- operators still need a one-time ingress preparation step outside the app
- the UI must explain missing public ingress clearly or setup will feel broken
- URL changes still require re-registration logic in the product
- webhook registration failures still need careful degradation and diagnostics

### Neutral

- this ADR does not decide the final production deployment model
- this ADR allows a future packaged host to supervise public ingress, but does
  not require it for the first slice
- helper scripts are a local/self-hosted convenience, not the long-term cloud
  deployment model

## Alternatives Considered

### Alternative 1: Let the cats server start ngrok itself

- **Pros**: one-button story inside the app
- **Cons**: adds runtime dependency, couples tunnel lifecycle to server
  startup, makes host-vs-server ownership blurry
- **Why rejected for first slice**: too much coupling for the first
  implementation, especially when a helper-script path is good enough

### Alternative 2: Use Telegram long polling instead of webhooks

- **Pros**: no public URL needed
- **Cons**: higher latency, different lifecycle, diverges from the existing
  webhook relay model
- **Why rejected**: webhook remains the preferred transport model

### Alternative 3: Require operators to manage everything manually

- **Pros**: no product work
- **Cons**: bad UX, requires curl/webhook knowledge, easy to misconfigure
- **Why rejected**: webhook registration should still be product-owned even if
  ingress preparation is external

## References

- [ADR-016](./016-treat-telegram-as-boss-cat-inbox-not-room-mirror.md)
- [ADR-021](./021-keep-packaged-setup-and-provider-installation-in-the-host.md)
- [ADR-028](./028-allow-multiple-public-bot-bindings-with-one-boss-cat.md)
- [SPEC-014](../specs/SPEC-014-telegram-boss-cat-relay-mvp.md)
- [SPEC-017](../specs/SPEC-017-telegram-inbox-and-room-routing.md)
- [SPEC-028](../specs/SPEC-028-automated-tunnel-and-telegram-webhook-lifecycle.md)

---

*Draft: 2026-03-23*

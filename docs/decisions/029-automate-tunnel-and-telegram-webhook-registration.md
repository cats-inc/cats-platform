# ADR-029: Adopt polling-first Telegram setup with optional public ingress helpers

> `cats` should default to Telegram long polling for the first usable setup
> path, while keeping webhook registration and public ingress helpers as an
> optional advanced mode.

## Status

Draft (Pending Review)

## Date

2026-03-23

## Context

The current Telegram MVP in `cats` already ships a webhook ingress seam and
outbound reply flow, but that is not yet the right default onboarding path for
local or self-hosted operators.

For a self-hosted chat app, requiring a public HTTPS URL before Telegram can
work creates too much setup friction:

1. the operator must first expose the local `cats` server to the internet
2. the operator must keep that ingress alive across app restarts or login
3. the product must then register or re-register Telegram webhooks against that
   public URL

OpenClaw demonstrates a simpler first experience: Telegram can work with just a
bot token by using long polling (`getUpdates`) instead of webhook delivery.

The repo should still keep the recently added Tailscale/ngrok helper scripts,
because webhook mode remains useful for advanced self-hosted and future
deployment scenarios. But those helpers should not be treated as the primary
Telegram onboarding path.

This also aligns better with ADR-021: setup/bootstrap helpers may live outside
the core server process, while the product UI/API remains responsible for the
user-facing Telegram lifecycle.

## Decision

`cats` will support two Telegram inbound modes:

- `polling` as the default and preferred first-run path
- `webhook` as an optional advanced mode when a public HTTPS URL is available

The product UI/API will own Telegram mode selection, diagnostics, and lifecycle
inside `Settings > Cats`.

### 1. Polling is the default onboarding path

When an operator creates or updates a Telegram bot binding with a valid bot
token, `cats` should be able to start Telegram long polling without requiring a
public URL.

- the product may validate the token with Telegram `getMe`
- the product should clear any previously registered webhook before polling
- the product should start or reconcile a per-binding polling consumer
- the UI should show polling health, last update, and retry/reconnect actions

This is the preferred first slice for "fill in a bot token and it works."

### 2. Public ingress stays external for webhook mode

Webhook mode remains supported, but public ingress stays outside the `cats`
server process. Operators may provide a public HTTPS base URL by one of these
means:

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
remain intentionally separate from the Telegram transport lifecycle.

### 3. Webhook lifecycle is still product-owned

When an operator explicitly selects webhook mode and a public HTTPS base URL is
available, `cats` will register the webhook through the product-owned Settings
UI/API flow.

- Call `POST https://api.telegram.org/bot<TOKEN>/setWebhook` with:
  - `url`: `<public_url>/api/transports/telegram/webhook/<bindingId>`
  - `secret_token`: the binding's webhook secret
- Call `deleteWebhook` when a binding is deleted or disabled
- Record success/failure per binding and surface it in Settings
- Allow manual re-registration from Settings

### 4. Token uniqueness is required

Telegram only allows one active webhook per bot token. Therefore, the same
Telegram bot token must be unique per `cats` environment.

The first slice should reject duplicate bindings that reuse the same bot token
instead of letting bindings overwrite one another.

This uniqueness rule should apply regardless of whether the binding currently
uses polling or webhook mode, because mode switches should not allow token
ownership to flap between bindings.

### 5. UI integration

Settings > Cats > Telegram should:

- default new bindings toward polling mode
- show the current inbound mode per binding
- show polling health when a binding uses polling
- show whether a usable public URL is currently known when webhook mode is
  selected
- show the effective webhook base path when available
- show webhook registration status per binding when webhook mode is selected
- offer an explicit reconnect / retry action
- explain that helper scripts are only needed for webhook mode or deployment
  scenarios that prefer push delivery

## Consequences

### Positive

- Telegram can work with only a bot token in the preferred first-run path
- webhook lifecycle stays product-owned, visible, and retryable from the UI
- `cats` avoids adding a tunnel SDK/runtime dependency in the first slice
- self-hosted operators can still use Tailscale Funnel or ngrok without
  embedding either provider directly into the cats server
- the same webhook flow can later work with helper scripts, packaged hosts, or
  real deployment URLs without changing binding semantics

### Negative

- `cats` now needs two inbound transport lifecycles instead of just one
- polling requires stateful consumer management, offset persistence, and retry
  behavior
- the UI must distinguish polling health from webhook status cleanly
- webhook mode still requires a one-time ingress preparation step outside the
  app

### Neutral

- this ADR does not decide the final production deployment model
- this ADR allows a future packaged host to supervise public ingress, but does
  not require it for the first slice
- helper scripts are a local/self-hosted convenience, not the long-term cloud
  deployment model

## Alternatives Considered

### Alternative 1: Keep webhook as the only supported Telegram mode

- **Pros**: simpler transport model, reuses the current MVP directly
- **Cons**: requires public ingress even for local first-run use, creates avoidable
  operator friction, and compares poorly with products that allow token-only
  Telegram setup
- **Why rejected**: not the right default onboarding path

### Alternative 2: Let the cats server start ngrok itself

- **Pros**: one-button webhook story inside the app
- **Cons**: adds a runtime dependency, couples tunnel lifecycle to server
  startup, makes host-vs-server ownership blurry
- **Why rejected for first slice**: too much coupling when polling already
  solves the basic inbound setup problem

### Alternative 3: Require operators to manage everything manually

- **Pros**: no product work
- **Cons**: bad UX, requires curl/webhook knowledge, easy to misconfigure
- **Why rejected**: Telegram lifecycle should be product-owned whether the
  binding uses polling or webhook mode

## References

- [ADR-016](./016-treat-telegram-as-boss-cat-inbox-not-room-mirror.md)
- [ADR-021](./021-keep-packaged-setup-and-provider-installation-in-the-host.md)
- [ADR-028](./028-allow-multiple-public-bot-bindings-with-one-boss-cat.md)
- [SPEC-014](../specs/SPEC-014-telegram-boss-cat-relay-mvp.md)
- [SPEC-017](../specs/SPEC-017-telegram-inbox-and-room-routing.md)
- [SPEC-028](../specs/SPEC-028-automated-tunnel-and-telegram-webhook-lifecycle.md)

---

*Draft: 2026-03-23*

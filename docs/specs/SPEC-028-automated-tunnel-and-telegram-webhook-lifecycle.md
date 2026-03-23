# SPEC-028: Public URL Preparation and Telegram Webhook Lifecycle

> Prepare a public HTTPS URL outside the server process, then let `cats`
> own Telegram webhook registration and diagnostics through the product UI/API.

## Status

Draft (Pending Review)

## Related

- [ADR-029](../decisions/029-automate-tunnel-and-telegram-webhook-registration.md)
- [ADR-016](../decisions/016-treat-telegram-as-boss-cat-inbox-not-room-mirror.md)
- [ADR-028](../decisions/028-allow-multiple-public-bot-bindings-with-one-boss-cat.md)
- [SPEC-014](./SPEC-014-telegram-boss-cat-relay-mvp.md)
- [SPEC-017](./SPEC-017-telegram-inbox-and-room-routing.md)

## Problem

The current Telegram setup still expects too much manual work:

1. prepare a public HTTPS URL outside the product
2. copy the public URL
3. manually call Telegram `setWebhook`
4. diagnose failures without a product-owned status surface

The public ingress problem and the webhook lifecycle problem should be split.
The first slice can use helper scripts or an externally supplied URL for
ingress, while keeping webhook lifecycle inside `cats`.

## Goals

- operators can prepare a public URL once, then use Settings UI to register
  Telegram without curl
- public ingress bootstrap and Telegram webhook lifecycle stay as separate
  concerns
- the product explains clearly when public ingress is still missing
- webhook status is visible and retryable inside Settings

## Non-Goals

- fully automated tunnel startup inside the cats server process
- Telegram long polling mode
- LINE or other transport tunnels in this slice
- choosing the long-term production reverse proxy/deployment model

## User Stories

- As an operator, I want to use a helper script or an existing public URL so I
  do not need to hand-build webhook URLs.
- As an operator, I want to manage Telegram webhook registration from Settings
  so I never need curl or raw Telegram API calls.
- As an operator, I want the product to tell me whether public ingress is
  missing, healthy, or failed so I know what to fix.

## Requirements

### Functional Requirements

#### Public URL preparation

1. The first slice shall treat public ingress as an external prerequisite, not
   as a server-owned runtime dependency.
2. The repo shall provide helper scripts for local/self-hosted public ingress:
   - `scripts/windows/Setup-TailscaleFunnel.ps1`
   - `scripts/windows/Setup-NgrokTunnel.ps1`
   - `scripts/linux/setup-tailscale-funnel.sh`
   - `scripts/linux/setup-ngrok-tunnel.sh`
   - `scripts/macos/setup-tailscale-funnel.sh`
   - `scripts/macos/setup-ngrok-tunnel.sh`
3. Those helper scripts shall manage only the public HTTPS URL layer for the
   local cats server plus optional login auto-start and shall not register
   Telegram webhooks.
4. The helper scripts shall read `CATS_PORT` or compatibility alias
   `CATS_INC_PORT`.
5. The helper scripts may optionally read `TAILSCALE_HTTPS_PORT`.
6. Settings shall surface when no usable public URL is available yet.

#### Webhook lifecycle

7. When a Telegram bot binding is created or updated with a valid bot token and
   a public URL is available, the product shall call Telegram `setWebhook`.
8. The webhook URL shall be:
   `<public_url>/api/transports/telegram/webhook/<bindingId>`
9. The `secret_token` parameter shall be the binding's webhook secret. If no
   secret was provided during creation, the product shall auto-generate one.
10. When a Telegram binding is deleted or disabled, the product shall call
    Telegram `deleteWebhook`.
11. When the known public URL changes, the product shall re-register active
    Telegram bindings against the new URL.
12. When the app starts and already knows a valid public URL, the product may
    reconcile existing active Telegram bindings in the background.
13. Registration success or failure shall be recorded per binding and visible
    in the Settings UI.

#### Token uniqueness

14. The same Telegram bot token shall not be allowed on more than one binding
    in the same `cats` environment.
15. Duplicate token attempts shall fail with a product-visible error instead of
    allowing webhook ownership to flap between bindings.

#### Configuration and docs

16. `.env.example` shall document `TAILSCALE_HTTPS_PORT` for the helper
    scripts.
17. Bot tokens remain per-binding state, not global `.env` configuration.

#### UI feedback

18. Settings > Cats > Telegram shall show:
    - public URL status (`available`, `missing`, or `failed`)
    - current public URL when known
    - webhook registration status per binding
    - an explicit reconnect / retry action
    - guidance toward the helper scripts when public ingress is missing
19. The product shall not require the operator to call Telegram APIs or paste a
    raw webhook URL manually.

### Non-Functional Requirements

- **Startup latency**: local app startup should not be blocked by tunnel
  creation because ingress bootstrap is external.
- **Resilience**: missing or changed public ingress should not crash the
  server. Local-only features should remain usable.
- **Security**: bot tokens and webhook secrets must not be logged in plaintext.
- **Dependency scope**: the first slice should not add a tunnel SDK/runtime
  dependency to the cats server.

## Proposed Architecture

```text
scripts/windows|linux|macos/*
  |
  +--> prepare public URL for local cats server
  |
  v
cats starts normally
  |
  v
Settings UI: "Add Telegram Bot"
  |
  +--> if public URL missing
  |       |
  |       +--> show guidance to run helper script / provide ingress
  |
  +--> if public URL known
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

### PublicUrlStatus (`Settings > Cats`)

- show whether a usable public URL is currently known
- show guidance toward helper scripts when missing
- show the effective webhook base path when available

### WebhookRegistrar (`src/platform/transports/telegram/webhook.ts`)

- `registerWebhook(binding, publicUrl)`: call Telegram `setWebhook`
- `deleteWebhook(binding)`: call Telegram `deleteWebhook`
- `registerAll(bindings, publicUrl)`: reconcile when a valid public URL is known
- return machine-readable success/failure results per binding

### Validation rules

- reject duplicate Telegram bot tokens across bindings in the same environment
- keep webhook secret generation inside the product
- keep env-token fallback compatibility-only until removed; do not treat it as
  the desired long-term product contract

## Open Questions

- How should the UI learn the effective public URL in the first slice:
  manual entry, host-provided config, or helper-script-discovered state?
- Should webhook re-registration on public URL change be immediate or debounced?
- Should the product validate the bot token with Telegram `getMe` before
  attempting registration?
- When Electron ships, should the packaged host supervise public ingress?

## Acceptance Criteria

- operators can set up Telegram entirely through Settings UI without manual
  Telegram API calls
- helper scripts exist for Windows, Linux, and macOS to prepare local ingress
  through Tailscale Funnel or ngrok
- missing public URL does not crash the server
- Settings UI shows public URL status, webhook status, and actionable errors
- `.env.example` documents helper-script configuration
- duplicate token bindings are rejected
- bot tokens are not logged in plaintext

---

*Created: 2026-03-23*

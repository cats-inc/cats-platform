# SPEC-028: Telegram Polling-First Setup and Optional Webhook Ingress

> Make Telegram work with just a bot token by default, while keeping public
> ingress helpers and webhook registration as an optional advanced mode.

## Status

In Progress (Polling-first slice landed)

## Related

- [ADR-029](../decisions/029-automate-tunnel-and-telegram-webhook-registration.md)
- [ADR-016](../decisions/016-treat-telegram-as-boss-cat-inbox-not-room-mirror.md)
- [ADR-028](../decisions/028-allow-multiple-public-bot-bindings-with-one-boss-cat.md)
- [SPEC-014](./SPEC-014-telegram-boss-cat-relay-mvp.md)
- [SPEC-017](./SPEC-017-telegram-inbox-and-room-routing.md)

## Problem

The current Telegram MVP in `cats` is webhook-oriented. That works, but it
creates too much friction for the most common self-hosted setup path:

1. prepare a public HTTPS URL outside the product
2. keep that public ingress alive across app restarts or login
3. register the webhook against the correct URL
4. diagnose failures without a clean product-owned transport status surface

This is avoidable. Telegram can work without any public URL by using long
polling (`getUpdates`) with only the bot token.

The product should therefore prefer polling for first-run setup, while keeping
helper-script-managed public ingress and webhook mode available as an optional
transport path.

## Goals

- operators can make Telegram work with just a bot token in the default path
- public ingress bootstrap and Telegram webhook lifecycle remain available as a
  separate optional mode
- the product explains clearly whether a binding is using polling or webhook
- polling health and webhook status are visible and retryable inside Settings

## Non-Goals

- fully automated tunnel startup inside the cats server process
- LINE or other transport tunnels in this slice
- choosing the long-term production reverse proxy/deployment model

## User Stories

- As an operator, I want to add a Telegram bot with only a bot token and have
  it start working without extra networking setup.
- As an operator, I want webhook mode to remain available when I already have a
  public HTTPS URL or want push delivery semantics.
- As an operator, I want the product to tell me whether the binding is polling,
  healthy, degraded, webhook-registered, or blocked so I know what to fix.

## Requirements

### Functional Requirements

#### Inbound modes

1. `cats` shall support two Telegram inbound modes:
   - `polling`
   - `webhook`
2. The preferred default onboarding path shall be `polling`.
3. A new Telegram binding with a valid bot token and no explicit webhook-mode
   selection shall default to `polling`.
4. The UI shall allow operators to see and change the inbound mode per binding,
   subject to prerequisites such as a public URL for webhook mode.

#### Polling mode

5. When a Telegram binding runs in polling mode, the product shall consume
   updates through Telegram long polling rather than requiring webhook delivery.
6. Before starting or resuming polling, the product shall clear any existing
   Telegram webhook for that bot token.
7. Polling mode shall persist enough offset/consumer state to avoid obvious
   duplicate replay after restarts.
8. Polling mode shall expose machine-readable health/state in Settings,
   including at least:
   - current mode
   - last successful poll time
   - last processed update id or equivalent cursor
   - last error when polling is degraded or failed
9. Settings shall offer retry/reconnect controls for polling mode.

#### Webhook mode and public URL preparation

10. Webhook mode shall treat public ingress as an external prerequisite, not as
    a server-owned runtime dependency.
11. The repo shall provide helper scripts for local/self-hosted public ingress:
   - `scripts/windows/Setup-TailscaleFunnel.ps1`
   - `scripts/windows/Setup-NgrokTunnel.ps1`
   - `scripts/linux/setup-tailscale-funnel.sh`
   - `scripts/linux/setup-ngrok-tunnel.sh`
   - `scripts/macos/setup-tailscale-funnel.sh`
   - `scripts/macos/setup-ngrok-tunnel.sh`
12. Those helper scripts shall manage only the public HTTPS URL layer for the
    local cats server plus optional login auto-start and shall not register
    Telegram webhooks.
13. The helper scripts shall read `CATS_PORT` or compatibility alias
    `CATS_INC_PORT`.
14. The helper scripts may optionally read `TAILSCALE_HTTPS_PORT`.
15. Settings shall surface when no usable public URL is available yet when the
    operator selects webhook mode.

#### Webhook lifecycle

16. When a Telegram bot binding is created or updated in webhook mode with a
    valid bot token and a public URL is available, the product shall call
    Telegram `setWebhook`.
17. The webhook URL shall be:
   `<public_url>/api/transports/telegram/webhook/<bindingId>`
18. The `secret_token` parameter shall be the binding's webhook secret. If no
    secret was provided during creation, the product shall auto-generate one.
19. When a Telegram binding is deleted, disabled, or switched away from webhook
    mode, the product shall call `deleteWebhook`.
20. When the known public URL changes, the product shall re-register active
    webhook-mode bindings against the new URL.
21. When the app starts and already knows a valid public URL, the product may
    reconcile existing webhook-mode bindings in the background.
22. Registration success or failure shall be recorded per binding and visible
    in the Settings UI.

#### Token uniqueness

23. The same Telegram bot token shall not be allowed on more than one binding
    in the same `cats` environment.
24. Duplicate token attempts shall fail with a product-visible error instead of
    allowing ownership to flap between bindings or modes.

#### Configuration and docs

25. `.env.example` shall document `TAILSCALE_HTTPS_PORT` for the optional
    webhook-mode helper scripts.
26. Bot tokens remain per-binding state, not global `.env` configuration.

#### UI feedback

27. Settings > Cats > Telegram shall show:
    - inbound mode per binding (`polling` or `webhook`)
    - polling status (`healthy`, `degraded`, `failed`, or equivalent) when a
      binding uses polling
    - public URL status (`available`, `missing`, or `failed`) when a binding
      uses webhook
    - current public URL when known
    - webhook registration status per binding when a binding uses webhook
    - an explicit reconnect / retry action
    - guidance toward the helper scripts when webhook-mode public ingress is
      missing
28. The product shall not require the operator to call Telegram APIs or paste a
    raw webhook URL manually.

### Non-Functional Requirements

- **Startup latency**: local app startup should not be blocked by tunnel
  creation because ingress bootstrap remains external.
- **Resilience**: missing or changed public ingress should not crash the
  server, and polling mode should remain usable without public ingress.
- **Security**: bot tokens and webhook secrets must not be logged in plaintext.
- **Dependency scope**: the first slice should not add a tunnel SDK/runtime
  dependency to the cats server.

## Proposed Architecture

```text
Settings UI: "Add Telegram Bot"
  |
  v
POST /api/bot-bindings { botToken, mode?, ... }
  |
  +--> mode = polling (default)
  |       |
  |       +--> clear webhook if needed
  |       +--> start/reconcile polling consumer
  |       +--> return polling health/status
  |
  +--> mode = webhook
          |
          +--> require public URL
          +--> call WebhookRegistrar.register(binding, publicUrl)
          +--> return webhook registration status
```

## Proposed Components

### TelegramBindingStatus (`Settings > Cats`)

- show the current inbound mode per binding
- show polling health for polling-mode bindings
- show public URL and webhook state for webhook-mode bindings
- show guidance toward helper scripts when webhook-mode ingress is missing

### PollingSupervisor (`src/platform/transports/telegram/polling.ts`)

- `startPolling(binding)`: start or resume long polling for a binding
- `stopPolling(binding)`: stop polling cleanly
- `reconcilePolling(bindings)`: resume expected polling bindings on app start
- persist cursor/offset and expose machine-readable polling health

### WebhookRegistrar (`src/platform/transports/telegram/webhook.ts`)

- `registerWebhook(binding, publicUrl)`: call Telegram `setWebhook`
- `deleteWebhook(binding)`: call Telegram `deleteWebhook`
- `registerAll(bindings, publicUrl)`: reconcile when a valid public URL is known
- return machine-readable success/failure results per binding

### Validation rules

- reject duplicate Telegram bot tokens across bindings in the same environment
- keep webhook secret generation inside the product
- default to polling when mode is omitted
- keep env-token fallback compatibility-only until removed; do not treat it as
  the desired long-term product contract

## Open Questions

- How should polling cursor state be persisted: transport-side store,
  chat-state sidecar, or binding-local metadata?
- Should mode switching be automatic when a valid public URL is discovered, or
  always explicit?
- How should the UI learn the effective public URL in the first slice:
  manual entry, host-provided config, or helper-script-discovered state?
- Should webhook re-registration on public URL change be immediate or debounced?
- When Electron ships, should the packaged host supervise public ingress?

## Acceptance Criteria

- operators can set up Telegram entirely through Settings UI without manual
  Telegram API calls
- the default setup path works without any public URL by using polling
- helper scripts remain available for Windows, Linux, and macOS when webhook
  mode is desired
- missing public URL does not block polling-mode Telegram setup
- Settings UI shows mode-aware polling/webhook status and actionable errors
- `.env.example` documents optional helper-script configuration
- duplicate token bindings are rejected
- bot tokens are not logged in plaintext

---

*Created: 2026-03-23*

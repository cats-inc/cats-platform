# Scripts

> Project automation scripts live here.

## Layout

```
scripts/
├── windows/   # PowerShell (.ps1)
├── linux/     # Bash (.sh)
├── macos/     # Bash (.sh)
└── testing/   # Test helpers (shared)
```

## Standards

Follow `docs/SCRIPT-STANDARDS.md` for naming and documentation rules.

## Public Ingress Helpers

`cats` now ships local/self-hosted startup helpers for both Tailscale Funnel
and ngrok:

- `scripts/windows/Setup-TailscaleFunnel.ps1`
- `scripts/windows/Setup-NgrokTunnel.ps1`
- `scripts/linux/setup-tailscale-funnel.sh`
- `scripts/linux/setup-ngrok-tunnel.sh`
- `scripts/macos/setup-tailscale-funnel.sh`
- `scripts/macos/setup-ngrok-tunnel.sh`

These scripts can build the project, create a login auto-start runner, start
the local built `cats` server, and ensure a public ingress provider is up.
They still do **not** register Telegram webhooks.

They are intended for webhook-mode/self-hosted ingress scenarios. They are not
the only future Telegram setup path: the current planning direction is
polling-first Telegram onboarding, with these helpers remaining optional for
operators who prefer or require webhook delivery.

The intended flow is:

1. Run the helper for your platform and chosen ingress provider
2. Let the helper keep local `cats` + ingress available at login
3. Use `Settings > Cats` inside the product to manage Telegram bot bindings
   and webhook registration

Tailscale remains the cheaper default for self-hosted webhook use. ngrok is
supported as an alternative when you prefer or already depend on it.

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

## Desktop Host Helpers

The first Electron host slice now has simple wrappers for local packaged-style
startup:

- `scripts/windows/Start-DesktopHost.ps1`
- `scripts/linux/start-desktop-host.sh`
- `scripts/macos/start-desktop-host.sh`

These wrappers call `npm run desktop:start`, which builds:

- `dist-server/`
- `dist/`
- `dist-electron/`

and then launches the Electron host that supervises local `cats-runtime` and
`cats` child processes.

`cats` now also ships its first repo-owned packaged setup helper:

- `scripts/windows/Setup-NodeGlobalPrefix.ps1`

That helper rewrites the stable user-scoped npm prefix and PATH preparation
logic that previously lived only in `environment-bootstrap`. It is intended for
packaged-host setup flows and supports:

- `-CheckOnly`
- `-Apply`
- `-Json`

so the host can treat it as a structured setup asset instead of a raw bootstrap
dependency.

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
- `scripts/windows/Install-NodeCliPack.ps1`
- `scripts/windows/Install-CursorAgent.ps1`
- `scripts/windows/Check-WslPrerequisites.ps1`
- `scripts/windows/Check-WindowsSetupReadiness.ps1`

These helpers rewrite the stable Windows npm-prefix/PATH preparation and
npm-global AI CLI pack installation knowledge that previously lived only in
`environment-bootstrap`. They are intended for packaged-host setup flows and
support:

- `-CheckOnly`
- `-Apply`
- `-Json`

`Install-NodeCliPack.ps1` also supports:

- `-Upgrade`
- `-Force`

`Install-CursorAgent.ps1` supports the same structured packaged-host contract:

- `-CheckOnly`
- `-Apply`
- `-Upgrade`
- `-Force`
- `-Json`

It keeps Cursor on the Windows-native install path for packaged setup instead
of treating Cursor as a WSL-first provider.

`Check-WslPrerequisites.ps1` adds the first repo-owned WSL prerequisite
preflight contract so the host can tell whether Windows build, WSL presence,
and the target distro are ready before it attempts feature enablement or distro
installation.

`Check-WindowsSetupReadiness.ps1` composes the repo-owned packaged setup
helpers into one host-readable audit for native CLI pack readiness and WSL
prerequisite readiness.

Together these let the host treat packaged setup helpers as structured assets
instead of raw bootstrap dependencies.
